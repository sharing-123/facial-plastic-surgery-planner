import {
  BufferAttribute, CatmullRomCurve3, Color, DoubleSide, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry,
  TubeGeometry, Vector3, type BufferGeometry,
} from 'three';
import type { FaceMesh } from '../face/geometry';
import type { Heightfield } from '../face/heightfield';
import type { P2 } from '../clinical/rstl';
import { InkLines } from '../world/ink';
import { sutureGuide, zPlastySeries } from '../clinical/markings';
import type { StudioState } from './store';

export type SurgeryMode = 'closure' | 'z' | 'defect' | 'none';
export const STAGE_COUNT = 8;

const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Stage-synchronised surgery on the photo mesh. Stage i is the integer part of progress p; every visual (marks, opened
 * incision, lifted edges, removed skin, closure, buried and skin sutures, dressing) belongs to the stage whose text describes it.
 */
export class SurgeryAnim {
  readonly mode: SurgeryMode;
  readonly dressing: 'strips' | 'npwt' | 'silicone';
  progress = 0;
  private group = new Group();
  private base: Float32Array;
  private n: number;
  private geo?: BufferGeometry;
  private frontIdx: Uint32Array | number[] = [];
  private backIdx: number[] = [];
  private fat?: Mesh;
  private c: P2; private cosT: number; private sinT: number; private a: number; private b: number; private mmW: number;
  private flap: { c1: P2; c2: P2; tri1: P2[]; tri2: P2[] } | null = null;
  private marks: InkLines[] = []; private ticks?: InkLines; private strips?: InkLines; private foam?: Group; private buried?: Group;
  private lastExcised = false;
  private seam: P2[] = [];

  constructor(private root: Group, private mesh: FaceMesh, private hf: Heightfield, private s: StudioState, toWorld: (px: P2) => P2, toPx: (mm: P2) => P2) {
    const rep = s.report!, plan = s.plan!;
    const W = (mm: P2): P2 => toWorld(toPx(mm));
    const o = W([0, 0]), e1 = W([1, 0]);
    this.mmW = Math.hypot(e1[0] - o[0], e1[1] - o[1]);
    const first = plan.techniques[0]?.name.k ?? '';
    this.mode = ['t.ellipse', 't.ellipse_min', 't.primary', 't.w'].includes(first) ? 'closure' : first === 't.z' ? 'z' : ['t.reconstruct'].includes(first) ? 'defect' : 'none';
    this.dressing = this.mode === 'defect' ? 'npwt' : this.mode === 'none' ? 'silicone' : 'strips';
    this.c = W(rep.centre);
    const dir = W([rep.centre[0] + Math.cos((rep.axis * Math.PI) / 180), rep.centre[1] + Math.sin((rep.axis * Math.PI) / 180)]);
    const th = Math.atan2(dir[1] - this.c[1], dir[0] - this.c[0]);
    this.cosT = Math.cos(th); this.sinT = Math.sin(th);
    const ellipse = plan.marking.includes('ellipse') && this.mode === 'closure';
    this.a = (ellipse ? rep.ellipse.halfLengthMm : Math.max(rep.lengthMm / 2, 2)) * this.mmW;
    this.b = (ellipse ? rep.ellipse.halfWidthMm : 0.9) * this.mmW;
    if (this.mode === 'defect') { this.a = Math.max(s.lesion!.majorPx / s.frame!.scale / 2, 3) * this.mmW * 1.15; this.b = Math.max(s.lesion!.minorPx / s.frame!.scale / 2, 3) * this.mmW * 1.15; }
    this.n = mesh.pos.length / 3;
    this.base = new Float32Array(mesh.pos);
    // seam along the long axis of the excision (or the wound line when nothing is removed)
    this.seam = [[this.c[0] - this.cosT * this.a, this.c[1] - this.sinT * this.a], [this.c[0] + this.cosT * this.a, this.c[1] + this.sinT * this.a]];
    if (this.mode === 'z') {
      const zs = zPlastySeries(rep.Q, 60, Math.max(8, rep.lengthMm), 1)[0];
      const T = (q: P2[]) => q.map(p => W(p));
      const A = T([zs.central[0]])[0], B = T([zs.central[1]])[0], C = T([zs.arm1[1]])[0], D = T([zs.arm2[1]])[0];
      const cen = (p: P2[]): P2 => [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3];
      const t1 = [A, B, C], t2 = [B, A, D];
      this.flap = { c1: cen(t1), c2: cen(t2), tri1: t1, tri2: t2 };
    }
    this.buildOverlays(W);
    root.add(this.group);
  }

  private local(x: number, y: number): [number, number] {
    const dx = x - this.c[0], dy = y - this.c[1];
    return [dx * this.cosT + dy * this.sinT, -dx * this.sinT + dy * this.cosT];
  }

  private halfWidth(u: number): number {
    const t = u / this.a;
    return Math.abs(t) >= 1 ? 0 : this.b * Math.sqrt(1 - t * t);
  }

  private liftLines(pts: P2[]): Vector3[][] { return this.hf.liftPolyline(pts, 0.007); }

  private buildOverlays(W: (mm: P2) => P2): void {
    const rep = this.s.report!, plan = this.s.plan!;
    const mm2 = (pts: P2[]) => pts.map(p => W(p));
    const mk = (lines: P2[][], color: string, width = 0.0085, dash = 0): InkLines => {
      const ink = new InkLines(lines.flatMap(l => this.liftLines(mm2(l))), { width, color, glow: 1.5, dash });
      ink.progress = 0; this.group.add(ink); this.marks.push(ink); return ink;
    };
    if (plan.marking.includes('ellipse')) mk([rep.ellipsePts], '#ff8f6e');
    if (plan.marking.includes('z_plasty')) mk(zPlastySeries(rep.Q, 60, Math.max(8, rep.lengthMm), 1).flatMap(z => [z.central, z.arm1, z.arm2]), '#ff8f6e');
    if (!plan.marking.includes('ellipse') && !plan.marking.includes('z_plasty')) mk([rep.Q], '#dffff6', 0.008, 0.03);
    // thread across the seam
    const guide = sutureGuide(this.seam.map(p => [(p[0] - this.c[0]) / this.mmW, (p[1] - this.c[1]) / this.mmW] as P2), 4, 2.6);
    const tickLines: Vector3[][] = guide.flatMap(g => this.hf.liftPolyline([
      [this.c[0] + g.a[0] * this.mmW, this.c[1] + g.a[1] * this.mmW], [this.c[0] + g.b[0] * this.mmW, this.c[1] + g.b[1] * this.mmW]], 0.011));
    this.ticks = new InkLines(tickLines, { width: 0.006, color: '#e8e2da', glow: 1.0 });
    this.ticks.progress = 0; this.group.add(this.ticks);
    // buried knots under the lifted edges
    this.buried = new Group();
    const knotMat = new MeshStandardMaterial({ color: '#f3c0b0', roughness: 0.5, emissive: '#ff8f6e', emissiveIntensity: 0.5 });
    void knotMat;
    for (const g of sutureGuide(this.seam.map(p => [(p[0] - this.c[0]) / this.mmW, (p[1] - this.c[1]) / this.mmW] as P2), 7, 2)) {
      const q = this.hf.lift(this.c[0] + g.centre[0] * this.mmW, this.c[1] + g.centre[1] * this.mmW, -0.012);
      if (!q) continue;
      const k = new Mesh(new PlaneGeometry(0.02, 0.02), new MeshStandardMaterial({ color: '#f3c0b0', emissive: '#ff8f6e', emissiveIntensity: 0.7, side: DoubleSide }));
      k.position.copy(q); k.lookAt(q.x, q.y, q.z + 1); this.buried.add(k);
    }
    this.buried.visible = false; this.group.add(this.buried);
    // dressing
    if (this.dressing === 'strips') {
      const lines: Vector3[][] = [];
      const n = Math.max(2, Math.round((2 * this.a) / (6 * this.mmW)));
      for (let i = 0; i < n; i++) {
        const u = -this.a + ((i + 0.5) * 2 * this.a) / n;
        const p = (v: number): P2 => [this.c[0] + this.cosT * u - this.sinT * v, this.c[1] + this.sinT * u + this.cosT * v];
        lines.push(...this.hf.liftPolyline([p(-5 * this.mmW), p(5 * this.mmW)], 0.016));
      }
      this.strips = new InkLines(lines, { width: 0.018, color: '#f4efe8', glow: 1.0 });
      this.strips.progress = 0; this.group.add(this.strips);
    } else if (this.dressing === 'npwt') this.foam = this.buildNpwt(); else this.foam = this.buildSilicone();
    if (this.foam) { this.foam.visible = false; this.group.add(this.foam); }
  }

  /** Foam block, clear drape and a tube to a port: what negative-pressure therapy looks like on the wound. */
  private buildNpwt(): Group {
    const g = new Group();
    const grid = 14;
    const top = new PlaneGeometry(1, 1, grid, grid);
    const pos = top.attributes.position as BufferAttribute;
    const rx = this.a * 1.35, ry = this.b * 1.35;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i) * 2 * rx, gy = pos.getY(i) * 2 * ry;
      const x = this.c[0] + this.cosT * gx - this.sinT * gy, y = this.c[1] + this.sinT * gx + this.cosT * gy;
      const z = this.hf.zAt(x, y);
      const edge = Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getY(i))) * 2;
      pos.setXYZ(i, x, y, (Number.isNaN(z) ? 0.1 : z) + 0.03 + 0.03 * (1 - sm(0.7, 1, edge)));
    }
    top.computeVertexNormals();
    const foam = new Mesh(top, new MeshStandardMaterial({ color: '#75808a', roughness: 1, metalness: 0, side: DoubleSide, bumpScale: 1 }));
    const drape = new Mesh(top.clone(), new MeshPhysicalMaterial({ color: '#dfeaf2', roughness: 0.15, transmission: 0.2, transparent: true, opacity: 0.34, clearcoat: 1, side: DoubleSide }));
    drape.position.z += 0.012;
    const s0 = this.hf.lift(this.c[0], this.c[1], 0.07) ?? new Vector3(this.c[0], this.c[1], 0.2);
    const end = new Vector3(this.c[0] + this.cosT * (rx + 0.5), this.c[1] + this.sinT * (rx + 0.5), (this.hf.zAt(this.c[0] + this.cosT * (rx + 0.5), this.c[1] + this.sinT * (rx + 0.5)) || 0.05) + 0.25);
    const mid = new Vector3((s0.x + end.x) / 2, (s0.y + end.y) / 2 + 0.05, Math.max(s0.z, end.z) + 0.2);
    const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3([s0, mid, end]), 32, 0.022, 10), new MeshPhysicalMaterial({ color: '#cfe0ea', roughness: 0.25, transparent: true, opacity: 0.8 }));
    const port = new Mesh(new PlaneGeometry(0.12, 0.12), new MeshStandardMaterial({ color: '#cfe0ea', roughness: 0.4, side: DoubleSide }));
    port.position.copy(s0); port.position.z += 0.045;
    g.add(foam, drape, tube, port);
    return g;
  }

  private buildSilicone(): Group {
    const g = new Group();
    const plane = new PlaneGeometry(1, 1, 10, 10);
    const pos = plane.attributes.position as BufferAttribute;
    const rx = Math.max(this.a * 1.5, 0.12), ry = Math.max(this.b * 2.2, 0.1);
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i) * 2 * rx, gy = pos.getY(i) * 2 * ry;
      const x = this.c[0] + this.cosT * gx - this.sinT * gy, y = this.c[1] + this.sinT * gx + this.cosT * gy;
      pos.setXYZ(i, x, y, (this.hf.zAt(x, y) || 0.05) + 0.014);
    }
    plane.computeVertexNormals();
    g.add(new Mesh(plane, new MeshPhysicalMaterial({ color: '#e8d9cc', roughness: 0.3, transparent: true, opacity: 0.7, clearcoat: 0.6, side: DoubleSide })));
    return g;
  }

  attach(skin: Mesh, fat?: Mesh): void {
    this.geo = skin.geometry; this.fat = fat;
    // the shell geometry holds the front surface, the back surface and the rim walls; keep all of it as the rest pose
    this.base = Float32Array.from(skin.geometry.attributes.position.array as ArrayLike<number>);
    const idx = this.geo.index!.array as Uint32Array;
    const frontCount = this.geo.groups[0].count;
    this.frontIdx = Array.from(idx.slice(0, frontCount));
    this.backIdx = Array.from(idx.slice(frontCount));
  }

  setFat(m: Mesh): void { this.fat = m; }

  update(_time: number): void {
    const p = this.progress, stage = Math.min(STAGE_COUNT - 1, Math.floor(p)), f = Math.min(1, p - stage + (p >= STAGE_COUNT ? 1 : 0));
    const at = (i: number) => (stage > i ? 1 : stage === i ? f : 0);
    this.marks.forEach(m => { m.progress = Math.max(at(0), 0); m.opacity = stage >= 4 ? Math.max(0, 1 - (p - 4) * 0.8) : 1; });
    const none = this.mode === 'none';
    const incise = none ? 0 : at(1), under = none ? 0 : at(2), cut = none ? 0 : at(3), deep = none ? 0 : at(4), close = none ? 0 : at(5);
    if (this.buried) this.buried.visible = !none && stage >= 4 && stage < 6;
    if (this.ticks) { this.ticks.progress = none ? 0 : at(6); this.ticks.opacity = stage >= 6 ? 1 : 0; }
    if (this.strips) { this.strips.progress = at(7); this.strips.opacity = stage >= 7 ? 1 : 0; }
    if (this.foam) this.foam.visible = stage >= 7 || (none && stage >= 1);
    this.deform(incise, under, cut, Math.max(deep * 0.55, 0) + close * 0.45);
  }

  private deform(incise: number, under: number, cut: number, closure: number): void {
    if (!this.geo) return;
    const pos = this.geo.attributes.position as BufferAttribute;
    const wantRemoved = (this.mode === 'closure' || this.mode === 'defect') && cut > 0.001;
    for (let i = 0; i < this.n; i++) {
      let x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
      const [u, v] = this.local(x, y);
      const w = this.halfWidth(u);
      const av = Math.abs(v);
      if (this.mode === 'closure' || this.mode === 'defect') {
        const outside = av - w;
        if (outside > 0 && Math.abs(u) < this.a * 1.05) {
          // incision opens the seam a little, undermining lifts the edges, closure pulls them to the axis
          const near = Math.exp(-outside / (this.b * 1.2 + 0.02));
          const open = incise * 0.0045 * (1 - cut);
          const dv = Math.sign(v) * (open * near);
          const pull = this.mode === 'closure' ? Math.sign(v) * -Math.min(w * closure * 1.0, av) * Math.exp(-Math.max(outside, 0) / (this.b * 1.6 + 0.05)) : 0;
          x += this.cosT * 0 - this.sinT * (dv + pull); y += this.cosT * (dv + pull);
          z += under * 0.014 * near * (1 - closure) + (cut > 0 && closure < 1 ? 0.004 * near : 0);
        }
      }
      if (this.mode === 'z' && this.flap) {
        const t = sm(0, 1, under + incise * 0.0) * 0 + Math.max(0, Math.min(1, cut));
        const inT = (tri: P2[]) => {
          const [A, B, C] = tri; const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
          const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d, l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d;
          return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
        };
        const dx = this.flap.c2[0] - this.flap.c1[0], dy = this.flap.c2[1] - this.flap.c1[1];
        if (inT(this.flap.tri1)) { x += dx * t; y += dy * t; z += under * 0.012 * (1 - closure); }
        else if (inT(this.flap.tri2)) { x -= dx * t; y -= dy * t; z += under * 0.012 * (1 - closure); }
      }
      pos.setXYZ(i, x, y, z);
      const j = (i + this.n) * 3;
      pos.setXYZ(i + this.n, x + (this.base[j] - this.base[i * 3]), y + (this.base[j + 1] - this.base[i * 3 + 1]), z + (this.base[j + 2] - this.base[i * 3 + 2]));
    }
    pos.needsUpdate = true;
    // remove skin inside the excision once stage 3 starts (index rebuild only when the state flips)
    if (wantRemoved !== this.lastExcised && this.geo.index) {
      this.lastExcised = wantRemoved;
      const keep: number[] = [];
      const fi = this.frontIdx as number[];
      for (let t = 0; t < fi.length; t += 3) {
        if (wantRemoved) {
          const a = fi[t], b = fi[t + 1], c = fi[t + 2];
          const mx = (this.base[a * 3] + this.base[b * 3] + this.base[c * 3]) / 3, my = (this.base[a * 3 + 1] + this.base[b * 3 + 1] + this.base[c * 3 + 1]) / 3;
          const [u, v] = this.local(mx, my);
          if (Math.abs(v) < this.halfWidth(u) * 1.02) continue;
        }
        keep.push(fi[t], fi[t + 1], fi[t + 2]);
      }
      this.geo.setIndex([...keep, ...this.backIdx]);
      this.geo.clearGroups(); this.geo.addGroup(0, keep.length, 0); this.geo.addGroup(keep.length, this.backIdx.length, 1);
    }
    if (this.fat && this.lastExcised) this.fat.visible = true;
    void this.mesh; void Color;
  }

  dispose(): void { this.root.remove(this.group); this.group.clear(); }
}
