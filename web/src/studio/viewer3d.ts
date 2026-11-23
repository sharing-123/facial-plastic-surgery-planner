import {
  ACESFilmicToneMapping, AmbientLight, CanvasTexture, Color, DirectionalLight, Group, Matrix4, Mesh,
  PerspectiveCamera, Quaternion, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CANON, buildSurface, canonicalMesh, meshFromLandmarks, shellGeometry, type FaceMesh, type LandmarkLike } from '../face/geometry';
import { Heightfield } from '../face/heightfield';
import { buildEnvironment } from '../world/studio';
import { createSkinMaterial, createRimMaterial } from '../world/skin';
import { buildLayers, type Layers } from '../world/layers';
import { loadAnatomy } from '../world/anatomy';
import { InkLines } from '../world/ink';
import type { P2 } from '../clinical/rstl';
import type { StudioState } from './store';
import { SurgeryAnim } from './surgery3d';

/** Horn's closed-form similarity (scale, rotation, translation) from point set A to point set B. */
export function similarity(A: Float32Array, B: Float32Array, n: number): Matrix4 {
  const ca = new Vector3(), cb = new Vector3();
  for (let i = 0; i < n; i++) { ca.x += A[i * 3]; ca.y += A[i * 3 + 1]; ca.z += A[i * 3 + 2]; cb.x += B[i * 3]; cb.y += B[i * 3 + 1]; cb.z += B[i * 3 + 2]; }
  ca.divideScalar(n); cb.divideScalar(n);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const a = [A[i * 3] - ca.x, A[i * 3 + 1] - ca.y, A[i * 3 + 2] - ca.z], b = [B[i * 3] - cb.x, B[i * 3 + 1] - cb.y, B[i * 3 + 2] - cb.z];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c];
    sa += a[0] ** 2 + a[1] ** 2 + a[2] ** 2; sb += b[0] ** 2 + b[1] ** 2 + b[2] ** 2;
  }
  const [sxx, sxy, sxz] = S[0], [syx, syy, syz] = S[1], [szx, szy, szz] = S[2];
  const N = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  // dominant eigenvector of N by Jacobi sweeps
  const V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(N[p][q]) < 1e-12) continue;
      const th = (N[q][q] - N[p][p]) / (2 * N[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const a = N[k][p], b = N[k][q]; N[k][p] = c * a - s * b; N[k][q] = s * a + c * b; }
      for (let k = 0; k < 4; k++) { const a = N[p][k], b = N[q][k]; N[p][k] = c * a - s * b; N[q][k] = s * a + c * b; }
      for (let k = 0; k < 4; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (N[i][i] > N[best][best]) best = i;
  const quat = new Quaternion(V[1][best], V[2][best], V[3][best], V[0][best]).normalize();
  const s = Math.sqrt(sb / Math.max(sa, 1e-12));
  const M = new Matrix4().compose(new Vector3(), quat, new Vector3(s, s, s));
  const t = cb.clone().sub(ca.clone().applyMatrix4(M));
  return M.setPosition(t);
}

/** Orbitable photo-textured mesh of the uploaded face with real anatomy layers and the surgical plan. */
export class FaceViewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.05, 50);
  readonly controls: OrbitControls;
  private root = new Group();
  private mesh?: FaceMesh;
  private hf?: Heightfield;
  private layers?: Layers;
  private skin?: ReturnType<typeof createSkinMaterial>;
  private skinMesh?: Mesh;
  private overlays = new Group();
  anim?: SurgeryAnim;
  private raf = 0;
  private running = false;
  private wrap: HTMLElement;
  peel = 0;
  private toWorld: (px: P2) => P2 = p => p;

  constructor(wrap: HTMLElement) {
    this.wrap = wrap;
    const canvas = document.createElement('canvas');
    canvas.className = 'v3d-canvas';
    wrap.appendChild(canvas);
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: new URLSearchParams(location.search).has('capture') });
    this.renderer.toneMapping = ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(new Color('#0a0b0d'), 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.environment = buildEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.7;
    const key = new DirectionalLight('#ffe8d4', 2.2); key.position.set(-2.5, 3, 4);
    const rim = new DirectionalLight('#9fb8ff', 1.2); rim.position.set(3, 1.5, -3);
    this.scene.add(new AmbientLight('#ffffff', 0.25), key, rim, this.root);
    this.root.add(this.overlays);
    this.camera.position.set(0, 0, 4.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08; this.controls.minDistance = 1.2; this.controls.maxDistance = 9;
    this.controls.target.set(0, 0, 0.2);
    new ResizeObserver(() => this.resize()).observe(wrap);
    this.resize();
  }

  resize(): void {
    const w = Math.max(2, this.wrap.clientWidth), h = Math.max(2, this.wrap.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /** Build the face from the current case. Returns false when there is no face yet. */
  async setCase(s: StudioState): Promise<boolean> {
    if (!s.photo || !s.lm3) return false;
    this.clearFace();
    const W = s.photo.width, H = s.photo.height;
    const base = meshFromLandmarks(s.lm3 as LandmarkLike[], W, H);
    this.mesh = buildSurface(base, { subdivisions: 2, fillEyes: true, fillMouth: true });
    this.hf = new Heightfield(this.mesh, 300);
    const xf = base.xf!;
    this.toWorld = (p: P2): P2 => [(p[0] - xf.cx) * xf.s, -(p[1] - xf.cy) * xf.s];
    const tex = new CanvasTexture(s.photo.canvas); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
    const sk = createSkinMaterial('#ffffff');
    sk.material.map = tex; sk.material.roughness = 0.62; sk.material.clearcoat = 0.05; sk.material.sheen = 0.3;
    sk.u.uPore.value = 0; sk.u.uSss.value = 0.15; sk.material.needsUpdate = true;
    this.skin = sk;
    this.skinMesh = new Mesh(shellGeometry(this.mesh, 0.07), [sk.material, createRimMaterial()]);
    this.root.add(this.skinMesh);
    this.layers = buildLayers(this.mesh);
    this.root.add(this.layers.group);
    // anatomy was fitted under the canonical face; carry it onto this face with a similarity from the canonical landmarks
    const canon = canonicalMesh();
    const A = new Float32Array(canon.origCount * 3), B = new Float32Array(canon.origCount * 3);
    for (let i = 0; i < canon.origCount; i++) { A.set([canon.pos[i * 3], canon.pos[i * 3 + 1], canon.pos[i * 3 + 2]], i * 3); B.set([this.mesh.pos[i * 3], this.mesh.pos[i * 3 + 1], this.mesh.pos[i * 3 + 2]], i * 3); }
    const M = similarity(A, B, canon.origCount);
    loadAnatomy().then(a => { if (!this.layers) return; this.layers.setAnatomy(a); a.group.matrixAutoUpdate = false; a.group.matrix.copy(M); a.group.matrixWorldNeedsUpdate = true; }).catch(() => { /* layers stay schematic */ });
    void CANON;
    this.rebuildOverlays(s);
    this.controls.target.set(0, 0, 0.15);
    this.camera.position.set(0, 0, 4.2);
    this.start();
    return true;
  }

  private clearFace(): void {
    for (const o of [this.skinMesh, this.layers?.group]) if (o) { this.root.remove(o); }
    this.skinMesh = undefined; this.layers = undefined; this.anim?.dispose(); this.anim = undefined;
  }

  /** Lesion outline and plan marks lifted onto the mesh surface. */
  rebuildOverlays(s: StudioState): void {
    this.overlays.clear();
    if (!this.hf || !s.lesion || !s.frame) return;
    const lift = (pts: P2[]) => this.hf!.liftPolyline(pts.map(p => this.toWorld(p)), 0.006);
    const px = (mm: P2) => s.frame!.toPx(mm);
    const out = new InkLines(lift([...s.lesion.contourPx, s.lesion.contourPx[0]]), { width: 0.011, color: '#ff8f6e', glow: 1.4 });
    out.progress = 1; this.overlays.add(out);
    if (s.report && s.plan) {
      this.anim?.dispose();
      this.anim = new SurgeryAnim(this.root, this.mesh!, this.hf, s, this.toWorld, px);
      this.anim.attach(this.skinMesh!, this.layers?.fatMesh);
    }
  }

  setPeel(v: number): void {
    this.peel = v;
  }

  private applyPeel(time: number): void {
    const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const sub = this.peel;
    const dis = sm(0.06, 0.3, sub);
    if (this.skin) { this.skin.u.uDissolve.value = dis; this.skin.u.uTime.value = time; }
    this.layers?.apply({ peel: dis, fat: sm(0.34, 0.5, sub), muscle: sm(0.62, 0.74, sub), bone: sm(0.9, 1.01, sub) }, time);
  }

  start(): void { if (this.running) return; this.running = true; const loop = (t: number) => { if (!this.running) return; this.raf = requestAnimationFrame(loop); this.frame(t / 1000); }; this.raf = requestAnimationFrame(loop); }
  stop(): void { this.running = false; cancelAnimationFrame(this.raf); }

  frame(time: number): void {
    this.controls.update();
    this.applyPeel(time);
    this.anim?.update(time);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void { this.stop(); this.renderer.dispose(); this.wrap.innerHTML = ''; }
}
