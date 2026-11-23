import { DataTexture, Group, LinearFilter, Mesh, RGBAFormat, SRGBColorSpace, Vector3 } from 'three';
import {
  CANON, buildSurface, canonicalMesh, shellGeometry, type FaceMesh,
} from '../face/geometry';
import { Heightfield } from '../face/heightfield';
import { RstlContext, traceStreamlines, type P2 } from '../clinical/rstl';
import { ZONES, buildZones, type ZoneMap } from '../clinical/zones';
import { ellipseFor, ellipsePoints } from '../clinical/wound';
import { InkDots, InkLines } from './ink';
import { createRimMaterial, createSkinMaterial, type SkinUniforms } from './skin';
import { buildLayers, type Layers } from './layers';
import { ScanSet } from './scan';

const MM = 0.01; // 1 mm in world units

export interface HeroState {
  yaw: number; pitch: number; roll: number; lift: number;
  dissolve: number; peel: number; assemble: number; wave: number; dots: number;
  grid: number; rstl: number; zones: number; plan: number;
  fat: number; muscle: number; bone: number;
  solid: number; cloud: number; after: number; scanY: number; laser: number; wire: number; wireY: number; rings: number; explode: number; settle: number;
}

export const REST: HeroState = {
  yaw: 0, pitch: 0, roll: 0, lift: 0, dissolve: 0, peel: 0, assemble: 1, wave: 0, dots: 0,
  grid: 0, rstl: 0, zones: 0, plan: 0, fat: 0, muscle: 0, bone: 0,
  solid: 1, cloud: 0, after: 0.18, scanY: 1.2, laser: 0, wire: 0, wireY: 1.2, rings: 0, explode: 0, settle: 1,
};

const GROUP_COLOR: Record<string, [number, number, number]> = {
  forehead: [126, 168, 255], temple: [107, 140, 255], brow: [150, 150, 160], periorbital: [197, 140, 255],
  eye: [60, 60, 70], nose: [255, 159, 176], cheek: [255, 179, 138], perioral: [255, 211, 122],
  lip: [255, 111, 142], chin: [155, 227, 193], jaw: [127, 210, 255],
};

/** RGBA texture of the zone atlas: tinted interiors, bright borders. Sampled by object-space xy in the skin shader. */
function zoneTexture(zm: ZoneMap): DataTexture {
  const up = 2, W = zm.w * up, H = zm.h * up;
  const lab = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) lab[j * W + i] = zm.lab[Math.floor(j / up) * zm.w + Math.floor(i / up)];
  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, id = lab[k];
    if (!id) continue;
    const [, grp] = ZONES[id - 1];
    const c = GROUP_COLOR[grp];
    const edge = (i > 0 && lab[k - 1] !== id) || (j > 0 && lab[k - W] !== id) || (i < W - 1 && lab[k + 1] !== id) || (j < H - 1 && lab[k + W] !== id);
    data.set(edge ? [235, 225, 255, 255] : [c[0], c[1], c[2], 120], k * 4);
  }
  const t = new DataTexture(data, W, H, RGBAFormat);
  t.colorSpace = SRGBColorSpace; t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

export class Hero {
  readonly root = new Group();
  readonly spin = new Group();
  readonly mesh: FaceMesh;
  readonly base: FaceMesh;
  readonly hf: Heightfield;
  readonly skin: Mesh;
  readonly u: SkinUniforms;
  readonly dots: InkDots;
  readonly grid: InkLines;
  readonly midline: InkLines;
  readonly rstl: InkLines;
  readonly plan: InkLines;
  readonly planAxis: InkLines;
  readonly layers: Layers;
  readonly scan: ScanSet;
  readonly layerAnchors = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  readonly ctx: RstlContext;
  readonly P: P2[];
  readonly anchors: Record<string, Vector3> = {};
  readonly wound: { p1: P2; p2: P2; axis: number; ellipse: { a: number; b: number; factor: number } };

  constructor() {
    this.base = canonicalMesh();
    this.mesh = buildSurface(this.base, { subdivisions: 2, fillMouth: true });
    this.hf = new Heightfield(this.mesh, 380);
    this.P = CANON.vertices.map(v => [v[0] * 10, v[1] * 10] as P2); // mm, y up
    this.ctx = new RstlContext(this.P);

    const { material, u } = createSkinMaterial();
    this.u = u;
    const zm = buildZones(this.P, 1);
    const zt = zoneTexture(zm);
    u.uZone.value = zt;
    this.skin = new Mesh(shellGeometry(this.mesh, 0.085), [material, createRimMaterial(u.uSolid)]);
    this.skin.renderOrder = 1;
    this.spin.add(this.skin);

    // landmarks
    const pts: Vector3[] = [];
    for (let i = 0; i < this.base.origCount; i++) {
      const p = this.hf.lift(this.base.pos[i * 3], this.base.pos[i * 3 + 1], 0.004);
      if (p) pts.push(p);
    }
    this.dots = new InkDots(pts, { size: 0.05 });
    this.spin.add(this.dots);

    // proportion grid: thirds (horizontal) and fifths (vertical)
    const P = this.P;
    const hLines = [P[10][1], P[9][1], P[2][1], P[152][1]].map(y => this.row(y));
    const vx = [P[33][0], P[133][0], P[362][0], P[263][0], P[234][0] + 1.5, P[454][0] - 1.5];
    const vLines = vx.map(x => this.col(x));
    this.grid = new InkLines([...hLines, ...vLines].flat(), { width: 0.0042, color: '#5fe8c8', glow: 1.25 });
    this.grid.material.uniforms.uStagger.value = 0.9;
    this.midline = new InkLines(this.col(0), { width: 0.0036, color: '#e8fff8', glow: 1.3, dash: 0.05 });
    this.spin.add(this.grid, this.midline);

    // RSTL streamlines
    const seeds: P2[] = [];
    for (let y = -90; y <= 84; y += 7) for (let x = -76; x <= 76; x += 7) seeds.push([x + (Math.round(y / 7) % 2) * 3.5, y]);
    const stream = traceStreamlines(this.ctx, seeds, 1.6, 9);
    const rstlLines: Vector3[][] = [];
    for (const s of stream) rstlLines.push(...this.hf.liftPolyline(s.map(p => [p[0] * MM, p[1] * MM] as [number, number]), 0.0035));
    this.rstl = new InkLines(rstlLines, { width: 0.0034, color: '#c8fff0', glow: 1.15 });
    this.rstl.material.uniforms.uStagger.value = 0.95;
    this.spin.add(this.rstl);

    // a worked wound plan on the patient's right cheek: wound line, RSTL axis, elliptical excision
    const p1: P2 = [-58, -4], p2: P2 = [-41, -27];
    const mid: P2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const axis = this.ctx.angleAt(mid);
    const fit = ellipseFor(p1, p2, axis);
    this.wound = { p1, p2, axis, ellipse: { a: fit.a, b: fit.b, factor: fit.tissueFactor } };
    const ell = ellipsePoints(fit.c, fit.a, fit.b, axis, 120);
    const ellRuns = this.hf.liftPolyline(ell.map(p => [p[0] * MM, p[1] * MM] as [number, number]), 0.004);
    this.plan = new InkLines(ellRuns, { width: 0.0058, color: '#ff8f6e', glow: 1.7 });
    const axisPts = [-1, 1].map(s => [fit.c[0] + Math.cos((axis * Math.PI) / 180) * fit.a * 1.5 * s, fit.c[1] + Math.sin((axis * Math.PI) / 180) * fit.a * 1.5 * s] as P2);
    const woundRun = this.hf.liftPolyline([p1, p2].map(p => [p[0] * MM, p[1] * MM] as [number, number]), 0.0045);
    const axisRun = this.hf.liftPolyline(this.dense(axisPts[0], axisPts[1], 1.2).map(p => [p[0] * MM, p[1] * MM] as [number, number]), 0.004);
    this.planAxis = new InkLines([...woundRun, ...axisRun], { width: 0.0042, color: '#dffff6', glow: 1.4, dash: 0.035 });
    this.spin.add(this.plan, this.planAxis);

    this.layers = buildLayers(this.mesh);
    this.spin.add(this.layers.group);

    this.scan = new ScanSet(this.mesh, this.base, Math.min(44000, matchMedia('(pointer: coarse)').matches ? 16000 : 44000), 0.9, -0.95);
    this.spin.add(this.scan.group);
    this.root.add(this.spin, this.scan.rings);
    const a = (name: string, mm: P2, lift = 0.012) => {
      const v = this.hf.lift(mm[0] * MM, mm[1] * MM, lift);
      if (v) this.anchors[name] = v;
    };
    a('trichion', [0, P[10][1]]); a('glabella', [0, P[9][1]]); a('subnasale', [0, P[2][1]]); a('menton', [0, P[152][1]]);
    a('nose', [0, P[1][1]], 0.05); a('woundCentre', fit.c, 0.02); a('cheekR', [-52, -12]); a('exoR', [P[33][0], P[33][1]]);
    a('exoL', [P[263][0], P[263][1]]); a('gonionL', [P[397][0], P[397][1]]);
  }

  private dense(a: P2, b: P2, stepMm: number): P2[] {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / stepMm));
    return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P2);
  }

  /** Horizontal line across the face at height y (mm), lifted onto the skin. */
  private row(y: number): Vector3[][] {
    return this.hf.liftPolyline(this.dense([-90, y], [90, y], 1.5).map(p => [p[0] * MM, p[1] * MM] as [number, number]), 0.004);
  }

  private col(x: number): Vector3[][] {
    return this.hf.liftPolyline(this.dense([x, -100], [x, 92], 1.5).map(p => [p[0] * MM, p[1] * MM] as [number, number]), 0.004);
  }

  apply(s: HeroState, time: number, pointScale = 700): void {
    this.spin.rotation.set(s.pitch, s.yaw, s.roll);
    this.root.position.y = -0.04 + s.lift + Math.sin(time * 0.6) * 0.012;
    this.u.uTime.value = time;
    this.u.uDissolve.value = s.dissolve;
    this.u.uSolid.value = s.solid;
    this.skin.visible = s.solid > 0.002;
    this.scan.apply(s, time, pointScale);
    this.layers.setExplode(s.explode);
    this.skin.position.z = 0.95 * s.explode;
    const ex = s.explode;
    const ax = [0.62, 0.62, 0.62, 0.62], ay = [0.55, 0.26, -0.03, -0.32], az = [0.95, 0.5, 0.05, -0.45];
    this.layerAnchors.forEach((v, i) => v.set(ax[i], ay[i], az[i] * ex + 0.35));
    this.u.uZoneMix.value = s.zones;
    const du = this.dots.material.uniforms;
    du.uAssemble.value = s.assemble; du.uWave.value = s.wave; du.uOpacity.value = s.dots; du.uTime.value = time;
    this.dots.visible = s.dots > 0.001;
    this.grid.progress = s.grid; this.midline.progress = s.grid;
    this.rstl.progress = s.rstl;
    this.plan.progress = s.plan; this.planAxis.progress = Math.min(1, s.plan * 1.4);
    this.layers.apply(s, time);
  }
}
