/**
 * Movement measures from a sequence of 478-point landmark frames (a video, or frames from the camera).
 *
 * Every frame is put in a head-fixed frame: origin at the midpoint of the inner canthi, x along the line between the outer canthi
 * (so head roll cancels), y up, and the unit is the outer-canthal width. Each measure is then compared with the person's own
 * neutral frames, so no outside norm is needed. The output is right-versus-left excursion and the percentage by which the
 * smaller side falls short of the larger one. It never grades severity and never gives a verdict: a clinician reads the numbers
 * next to the examination. "Right" and "left" are the patient's right and left (image left and image right on a frontal view).
 */
export type Pt = [number, number];
export type Side = 'R' | 'L';

// MediaPipe indices. Patient's right = image left.
const IDX = {
  outer: { R: 33, L: 263 }, inner: { R: 133, L: 362 },
  upperLid: { R: 159, L: 386 }, lowerLid: { R: 145, L: 374 },
  brow: { R: [105, 66, 107], L: [334, 296, 336] },
  corner: { R: 61, L: 291 }, nose: 1, subnasale: 2,
  lipIn: [13, 14],
} as const;

export interface Frame { t: number; lm: Pt[] | null }

export interface Measures {
  /** brow height above the canthal line, up positive, in outer-canthal widths */
  brow: Record<Side, number>;
  /** palpebral aperture */
  aperture: Record<Side, number>;
  /** mouth corner height relative to the eye midpoint (less negative = higher) */
  cornerY: Record<Side, number>;
  /** mouth corner distance from the midline */
  cornerX: Record<Side, number>;
  mouthOpen: number; yaw: number; rollDeg: number; ocwPx: number; irisPx: number | null;
}

export function measure(lm: Pt[]): Measures {
  const o = { R: lm[IDX.outer.R], L: lm[IDX.outer.L] };
  const ii = { R: lm[IDX.inner.R], L: lm[IDX.inner.L] };
  const ax = [o.L[0] - o.R[0], o.L[1] - o.R[1]];
  const ocw = Math.hypot(ax[0], ax[1]) || 1;
  const ux = [ax[0] / ocw, ax[1] / ocw];
  const uy = [ux[1], -ux[0]]; // image y points down, so this is "up" after the roll correction
  const org: Pt = [(ii.R[0] + ii.L[0]) / 2, (ii.R[1] + ii.L[1]) / 2];
  const to = (p: Pt): Pt => { const dx = p[0] - org[0], dy = p[1] - org[1]; return [(dx * ux[0] + dy * ux[1]) / ocw, (dx * uy[0] + dy * uy[1]) / ocw]; };
  const mean = (ids: readonly number[]): Pt => { let x = 0, y = 0; ids.forEach(i => { x += lm[i][0]; y += lm[i][1]; }); return to([x / ids.length, y / ids.length]); };
  const out = {
    brow: {} as Record<Side, number>, aperture: {} as Record<Side, number>, cornerY: {} as Record<Side, number>, cornerX: {} as Record<Side, number>,
  };
  for (const s of ['R', 'L'] as Side[]) {
    const up = to(lm[IDX.upperLid[s]]), lo = to(lm[IDX.lowerLid[s]]), br = mean(IDX.brow[s]), c = to(lm[IDX.corner[s]]);
    out.brow[s] = br[1]; // height above the canthal line, so the lid closing does not look like a brow lift
    out.aperture[s] = up[1] - lo[1];
    out.cornerY[s] = c[1];
    out.cornerX[s] = Math.abs(c[0]);
  }
  const nose = to(lm[IDX.nose]);
  const li = IDX.lipIn.map(i => to(lm[i]));
  const iris = lm.length > 476 ? (Math.hypot(lm[469][0] - lm[471][0], lm[469][1] - lm[471][1]) + Math.hypot(lm[474][0] - lm[476][0], lm[474][1] - lm[476][1])) / 2 : null;
  return { ...out, mouthOpen: li[0][1] - li[1][1], yaw: nose[0], rollDeg: (Math.atan2(ax[1], ax[0]) * 180) / Math.PI, ocwPx: ocw, irisPx: iris };
}

export type MoveKey = 'smile' | 'brow' | 'eye';
export interface SidePair { R: number; L: number }
export interface MoveResult {
  key: MoveKey; seen: boolean;
  /** peak excursion per side in outer-canthal widths (smile: corner lift; brow: lift; eye: closure as a fraction of the neutral aperture) */
  value: SidePair; mm: SidePair | null;
  /** the smaller side as a percentage of the larger side; null when the movement was not seen */
  ratio: number | null; weaker: Side | 'none' | null;
  /** extra, smile only: lateral excursion of the corners */
  lateral?: SidePair; peakT: number;
}

export interface Series { t: number[]; cornerY: SidePair[]; brow: SidePair[]; aperture: SidePair[]; mouthOpen: number[] }
export interface Quality { frames: number; detected: number; rate: number; maxYaw: number; maxRoll: number; neutralFrames: number; flags: string[] }
export interface MotionReport {
  moves: MoveResult[]; series: Series; quality: Quality; baseline: Measures | null; mmPerOcw: number | null; durationS: number;
}

const median = (a: number[]): number => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
export const IRIS_MM = 11.7;

/** Thresholds below which a movement is treated as "not seen" (in outer-canthal widths, about 0.9 mm per 0.01). */
const SEEN = { smile: 0.02, brow: 0.015, eye: 0.35 };

export function analyseMotion(frames: Frame[]): MotionReport {
  const ok = frames.filter(f => f.lm && f.lm.length >= 468) as Array<{ t: number; lm: Pt[] }>;
  const ms = ok.map(f => measure(f.lm));
  const flags: string[] = [];
  const rate = frames.length ? ok.length / frames.length : 0;
  if (rate < 0.8) flags.push('lowDetection');
  const t0 = ok.length ? ok[0].t : 0;
  // neutral: the first stretch of the clip, or at least the first 6 frames, taken as the person's own rest position
  const nNeutral = Math.max(4, Math.min(ms.length, Math.round(ms.length * 0.1)));
  const baseIdx = ms.slice(0, nNeutral);
  const base: Measures | null = ms.length ? {
    brow: { R: median(baseIdx.map(m => m.brow.R)), L: median(baseIdx.map(m => m.brow.L)) },
    aperture: { R: median(baseIdx.map(m => m.aperture.R)), L: median(baseIdx.map(m => m.aperture.L)) },
    cornerY: { R: median(baseIdx.map(m => m.cornerY.R)), L: median(baseIdx.map(m => m.cornerY.L)) },
    cornerX: { R: median(baseIdx.map(m => m.cornerX.R)), L: median(baseIdx.map(m => m.cornerX.L)) },
    mouthOpen: median(baseIdx.map(m => m.mouthOpen)), yaw: median(baseIdx.map(m => m.yaw)), rollDeg: median(baseIdx.map(m => m.rollDeg)),
    ocwPx: median(baseIdx.map(m => m.ocwPx)), irisPx: median(baseIdx.map(m => m.irisPx ?? 0)) || null,
  } : null;
  const mmPerOcw = base && base.irisPx ? IRIS_MM / (base.irisPx / base.ocwPx) : null;
  const maxYaw = ms.length ? Math.max(...ms.map(m => Math.abs(m.yaw - (base?.yaw ?? 0)))) : 0;
  const maxRoll = ms.length ? Math.max(...ms.map(m => Math.abs(m.rollDeg - (base?.rollDeg ?? 0)))) : 0;
  if (maxYaw > 0.1) flags.push('turned');
  if (maxRoll > 12) flags.push('tilted');
  if (ms.length < 12) flags.push('short');

  const series: Series = { t: ok.map(f => f.t - t0), cornerY: [], brow: [], aperture: [], mouthOpen: [] };
  if (base) {
    ms.forEach(m => {
      series.cornerY.push({ R: m.cornerY.R - base.cornerY.R, L: m.cornerY.L - base.cornerY.L });
      series.brow.push({ R: m.brow.R - base.brow.R, L: m.brow.L - base.brow.L });
      series.aperture.push({ R: m.aperture.R / (base.aperture.R || 1), L: m.aperture.L / (base.aperture.L || 1) });
      series.mouthOpen.push(m.mouthOpen - base.mouthOpen);
    });
  }
  const peak = (a: number[]): { v: number; i: number } => { let v = -Infinity, i = 0; a.forEach((x, k) => { if (x > v) { v = x; i = k; } }); return { v: Math.max(0, v), i }; };
  const mk = (key: MoveKey, R: number, L: number, iR: number, iL: number, lateral?: SidePair): MoveResult => {
    const seen = Math.max(R, L) >= SEEN[key];
    const hi = Math.max(R, L), lo = Math.min(R, L);
    return {
      key, seen, value: { R, L }, mm: mmPerOcw ? { R: R * mmPerOcw, L: L * mmPerOcw } : null,
      ratio: seen && hi > 0 ? (lo / hi) * 100 : null, weaker: !seen ? null : Math.abs(R - L) < hi * 0.1 ? 'none' : R < L ? 'R' : 'L',
      lateral, peakT: series.t[(R >= L ? iR : iL)] ?? 0,
    };
  };
  const moves: MoveResult[] = [];
  if (base && series.t.length) {
    const sR = peak(series.cornerY.map(c => c.R)), sL = peak(series.cornerY.map(c => c.L));
    const latR = peak(ms.map(m => m.cornerX.R - base.cornerX.R)), latL = peak(ms.map(m => m.cornerX.L - base.cornerX.L));
    moves.push(mk('smile', sR.v, sL.v, sR.i, sL.i, { R: latR.v, L: latL.v }));
    const bR = peak(series.brow.map(c => c.R)), bL = peak(series.brow.map(c => c.L));
    moves.push(mk('brow', bR.v, bL.v, bR.i, bL.i));
    const eR = peak(series.aperture.map(c => 1 - c.R)), eL = peak(series.aperture.map(c => 1 - c.L));
    moves.push(mk('eye', Math.min(1, eR.v), Math.min(1, eL.v), eR.i, eL.i));
  }
  return {
    moves, series, baseline: base, mmPerOcw, durationS: series.t.length ? series.t[series.t.length - 1] : 0,
    quality: { frames: frames.length, detected: ok.length, rate, maxYaw, maxRoll, neutralFrames: nNeutral, flags },
  };
}
