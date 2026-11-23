import type { LandmarkLike } from '../face/geometry';
import type { P2 } from '../clinical/rstl';
import { FaceFrame, assessPhoto, frontalProportions, imageStats, type GateResult, type Proportions } from '../clinical/face';
import { buildZones, type ZoneMap } from '../clinical/zones';
import { RstlContext } from '../clinical/rstl';
import { analyseWound, type WoundReport } from '../clinical/woundplan';
import { DEFAULT_CTX, makePlan, type Plan, type PlanContext } from '../clinical/planner';
import { classify, type Classification, type Clin } from '../clinical/classify';
import { describe, growLesion, workImage, type Lesion, type WorkImage } from '../clinical/segment';
import { detectFace } from './landmarker';
import type { LoadedPhoto } from './photo';

export type Tab = 'photo' | '3d' | 'plan' | 'video' | 'nose' | 'cleft' | 'skin';
export interface Layers2D { landmarks: boolean; grid: boolean; zones: boolean; rstl: boolean; lesion: boolean }

export interface StudioState {
  code: string; photo?: LoadedPhoto; lm3?: LandmarkLike[]; lm?: P2[];
  gate?: GateResult; frame?: FaceFrame; P?: P2[]; props?: Proportions; zones?: ZoneMap; ctxR?: RstlContext;
  work?: WorkImage; lesion?: Lesion; woundPts?: P2[] | null;
  clin: Clin; ctx: PlanContext; rstlDeg: number | null; ppm: number | null; age: number | null;
  report?: WoundReport; plan?: Plan; cls?: Classification;
  tab: Tab; layers: Layers2D; tool: 'tap' | 'trace' | 'brush' | 'erase' | 'landmarks' | 'scale';
  busy: 'detect' | 'segment' | null; error: string | null; savedId?: string; sample?: string;
}

const listeners = new Set<() => void>();
export const state: StudioState = {
  code: pseudo(), clin: {}, ctx: { ...DEFAULT_CTX }, rstlDeg: null, ppm: null, age: null, tab: 'photo',
  layers: { landmarks: true, grid: false, zones: false, rstl: false, lesion: true }, tool: 'tap', busy: null, error: null,
};

export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(): void { listeners.forEach(f => f()); }
export function patch(p: Partial<StudioState>): void { Object.assign(state, p); emit(); }

function pseudo(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ', n = crypto.getRandomValues(new Uint32Array(2));
  return `FS-${a[n[0] % a.length]}${a[(n[0] >>> 8) % a.length]}-${String(n[1] % 10000).padStart(4, '0')}`;
}
export const newCode = pseudo;

/** Photo in, landmarks and everything that follows from them out. The photo is processed on this device only. */
export async function setPhoto(photo: LoadedPhoto, sample?: string): Promise<void> {
  Object.assign(state, {
    photo, lm3: undefined, lm: undefined, gate: undefined, frame: undefined, P: undefined, props: undefined, zones: undefined, ctxR: undefined,
    work: undefined, lesion: undefined, woundPts: null, report: undefined, plan: undefined, cls: undefined, busy: 'detect', error: null, sample,
    savedId: undefined, clin: {}, rstlDeg: null, ppm: null,
  } satisfies Partial<StudioState>);
  emit();
  try {
    const det = await detectFace(photo.canvas);
    if (!det.landmarks.length) {
      patch({ busy: null, gate: { status: 'CANNOT_ASSESS', failures: [{ code: 'no_face' }], warnings: [], metrics: {} }, error: null });
      return;
    }
    state.lm3 = det.landmarks;
    state.lm = det.landmarks.map(p => [p.x * photo.width, p.y * photo.height] as P2);
    state.work = workImage(photo.canvas);
    recompute(true);
    patch({ busy: null });
  } catch (e) {
    console.error(e);
    patch({ busy: null, error: 'detect' });
  }
}

/** Everything derived from the landmarks and the lesion; called again after any correction. */
export function recompute(withGate = false): void {
  const { lm, photo } = state;
  if (!lm || !photo) return;
  const frame = new FaceFrame(lm, state.ppm ?? undefined);
  const P = frame.allMM(lm);
  state.frame = frame; state.P = P; state.ctxR = new RstlContext(P);
  state.props = frontalProportions(P);
  if (withGate || !state.gate) {
    const xs = lm.map(p => p[0]), ys = lm.map(p => p[1]);
    const stats = imageStats(photo.canvas, [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(photo.width, Math.max(...xs)), Math.min(photo.height, Math.max(...ys))]);
    state.gate = assessPhoto(lm, photo.width, photo.height, stats);
  }
  state.zones = undefined; // rebuilt on demand by zonesNow()
  analyseLesion();
  emit();
}

export function analyseLesion(): void {
  const { lesion, frame, ctxR, lm } = state;
  if (!lesion || !frame || !ctxR || !lm) { state.report = undefined; state.plan = undefined; state.cls = undefined; return; }
  const pts: P2[] = state.woundPts && state.woundPts.length >= 2 ? state.woundPts : lesion.endpoints;
  const rep = analyseWound(lm, pts, { rstlOverrideDeg: state.rstlDeg, ppmOverride: state.ppm });
  state.report = rep;
  state.plan = makePlan(rep, state.ctx);
  const region = ctxR.regionOf(frame.toMM(lesion.centroid));
  // choosing 'scar' in the plan context tells the differential the injury is old
  const clin = state.ctx.kind === 'scar' ? { ...state.clin, trauma: true, recent: false } : state.clin;
  state.cls = classify(lesion.features, 1 / frame.scale, lesion.majorPx, lesion.minorPx, region, clin, state.age);
}

export async function tapLesion(px: P2): Promise<void> {
  const { work, lm } = state;
  if (!work || !lm) return;
  patch({ busy: 'segment' });
  await new Promise(r => setTimeout(r, 10));
  const fw = Math.abs(lm[454][0] - lm[234][0]);
  const les = growLesion(work, px, fw);
  state.woundPts = null;
  if (!les) { patch({ busy: null, error: 'segment' }); return; }
  state.lesion = les; state.error = null;
  analyseLesion();
  patch({ busy: null });
}

/** Paint or erase on the lesion mask (brush in working-grid coordinates), then rebuild the lesion data. */
export function paintMask(px: P2, radiusPx: number, add: boolean): void {
  const { work, lesion } = state;
  if (!work || !lesion) return;
  const s = work.scale, cx = px[0] * s, cy = px[1] * s, r = Math.max(1.5, radiusPx * s);
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(work.h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(work.w - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) lesion.mask[y * work.w + x] = add ? 1 : 0;
    }
  }
}

export function commitMask(): void {
  const { work, lesion } = state;
  if (!work || !lesion) return;
  const next = describe(work, lesion.mask, lesion.features.skin, lesion.centroid);
  if (next) { state.lesion = next; state.woundPts = null; analyseLesion(); }
  emit();
}

export function setClin(k: keyof Clin, v: boolean): void { state.clin = { ...state.clin, [k]: v }; analyseLesion(); emit(); }
export function setCtx(p: Partial<PlanContext>): void { state.ctx = { ...state.ctx, ...p }; analyseLesion(); emit(); }
export function setRstl(deg: number | null): void { state.rstlDeg = deg; analyseLesion(); emit(); }
export function setScale(ppm: number | null): void { state.ppm = ppm; recompute(); }
export function moveLandmark(i: number, px: P2): void { if (!state.lm) return; state.lm[i] = px; state.lm3![i] = { ...state.lm3![i], x: px[0] / state.photo!.width, y: px[1] / state.photo!.height }; recompute(); }

/** Zone atlas for the current landmarks, built when first needed (it takes a fraction of a second). */
export function zonesNow(): ZoneMap | undefined {
  if (!state.P) return undefined;
  if (!state.zones) state.zones = buildZones(state.P, 1);
  return state.zones;
}
