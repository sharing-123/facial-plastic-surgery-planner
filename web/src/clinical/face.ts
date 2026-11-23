/**
 * Face frame, photo quality gate and frontal proportions, ported from smile_symmetry.py, quality_gate.py and
 * face_proportions.py. Landmarks are 478 points in pixels (y down); the mm frame has y up and midline x = 0.
 * Thresholds are screening values from the prototype, not validated cut-offs.
 */
import type { P2 } from './rstl';

export const IRIS_A = [469, 471], IRIS_B = [474, 476];
export const IRIS_DIAMETER_MM = 11.7; // population mean visible horizontal iris diameter, about +-5%
export const OUTER_EYE_A = 33, OUTER_EYE_B = 263, INNER_EYE_A = 133, INNER_EYE_B = 362;
export const GLABELLA = 9, NASION = 168, SUBNASALE = 2, MENTON = 152;
export const UPPER_LIP_TOP = 0, UPPER_IN = 13, LOWER_IN = 14, LOWER_LIP_BOTTOM = 17;
export const EYE = { left: [133, 33], right: [362, 263] } as const; // (inner, outer) canthus, image-left / image-right
export const ALAR: [number, number] = [129, 358];
export const MOUTH: [number, number] = [61, 291];
export const ZYGOMA: [number, number] = [234, 454];
export const GONION: [number, number] = [172, 397];
const LID_UP = [159, 386], LID_LOW = [145, 374];

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pxPerMm(lm: P2[]): number {
  const d1 = Math.abs(lm[IRIS_A[0]][0] - lm[IRIS_A[1]][0]), d2 = Math.abs(lm[IRIS_B[0]][0] - lm[IRIS_B[1]][0]);
  return (d1 + d2) / 2 / IRIS_DIAMETER_MM;
}

/** Pixel to face-aligned millimetre frame (roll removed, y up, midline x = 0). */
export class FaceFrame {
  private c: number; private s: number; private origin: P2; readonly scale: number; private midx: number;

  constructor(lm: P2[], scaleOverride?: number) {
    const a = lm[OUTER_EYE_A], b = lm[OUTER_EYE_B];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    this.c = Math.cos(-ang); this.s = Math.sin(-ang);
    this.origin = [lm[INNER_EYE_A][0], lm[INNER_EYE_A][1]];
    this.scale = scaleOverride ?? pxPerMm(lm);
    const qa = this.rot(lm[INNER_EYE_A]), qb = this.rot(lm[INNER_EYE_B]);
    this.midx = 0.5 * (qa[0] + qb[0]);
  }

  private rot(p: P2): P2 {
    const x = p[0] - this.origin[0], y = p[1] - this.origin[1];
    return [(this.c * x - this.s * y) / this.scale, (this.s * x + this.c * y) / this.scale];
  }

  toMM(p: P2): P2 { const q = this.rot(p); return [q[0] - this.midx, -q[1]]; }

  toPx(q: P2): P2 {
    const x = (q[0] + this.midx) * this.scale, y = -q[1] * this.scale;
    // inverse rotation: [c s; -s c] applied to (x, y)
    return [this.c * x + this.s * y + this.origin[0], -this.s * x + this.c * y + this.origin[1]];
  }

  allMM(lm: P2[]): P2[] { return lm.map(p => this.toMM(p)); }
}

export interface ImageStats { blurVar: number; brightness: number }

/** Laplacian variance and mean brightness of the face crop resized to 256 px (same recipe as the gate). */
export function imageStats(src: CanvasImageSource, bbox: [number, number, number, number]): ImageStats | null {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return null;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, x0, y0, w, h, 0, 0, 256, 256);
  const d = ctx.getImageData(0, 0, 256, 256).data;
  const g = new Float32Array(256 * 256);
  let sum = 0;
  for (let i = 0; i < g.length; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += g[i]; }
  let m = 0, m2 = 0, n = 0;
  for (let y = 1; y < 255; y++) for (let x = 1; x < 255; x++) {
    const v = g[y * 256 + x - 1] + g[y * 256 + x + 1] + g[(y - 1) * 256 + x] + g[(y + 1) * 256 + x] - 4 * g[y * 256 + x];
    m += v; m2 += v * v; n++;
  }
  m /= n;
  return { blurVar: m2 / n - m * m, brightness: sum / g.length };
}

export type GateStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'CANNOT_ASSESS';
export interface GateItem { code: string; params?: Record<string, number | string> }
export interface GateResult { status: GateStatus; failures: GateItem[]; warnings: GateItem[]; metrics: Record<string, number | number[]> }

const T = {
  yaw: [0.08, 0.15], roll: [15, 30], mid_low: [[0.65, 1.5], [0.5, 2.0]], aspect: [0.7, 1.5], width: [220, 120], iris: [10, 6],
  iris_ratio: [0.08, 0.2], mouth: [0.12, 0.35], blur: [60, 20],
} as const;

/** Decide whether one photo is fit to measure at all; refusing is better than a confident wrong number. */
export function assessPhoto(lm: P2[], imgW: number, imgH: number, stats: ImageStats | null): GateResult {
  const fails: GateItem[] = [], warns: GateItem[] = [], m: GateResult['metrics'] = {};
  const res = (status: GateStatus): GateResult => ({ status, failures: fails, warnings: warns, metrics: m });
  if (!lm || lm.length < 478) { fails.push({ code: 'no_face' }); return res('CANNOT_ASSESS'); }
  const a = lm[EYE.left[1]], b = lm[EYE.right[1]];
  const oc = dist(a, b);
  if (oc < 1) { fails.push({ code: 'degenerate' }); return res('CANNOT_ASSESS'); }
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const u: P2 = [Math.cos(ang), Math.sin(ang)], v: P2 = [-u[1], u[0]];
  const dot = (p: P2, q: P2) => p[0] * q[0] + p[1] * q[1];
  const sub = (p: P2, q: P2): P2 => [p[0] - q[0], p[1] - q[1]];
  const [za, zb] = ZYGOMA;
  const left = Math.abs(dot(sub(lm[1], lm[za]), u)), right = Math.abs(dot(sub(lm[zb], lm[1]), u));
  m.yaw_asym = round(Math.abs(left - right) / Math.max(left + right, 1e-6), 3);
  if (m.yaw_asym >= T.yaw[1]) fails.push({ code: 'yaw' }); else if (m.yaw_asym >= T.yaw[0]) warns.push({ code: 'yaw' });
  m.roll_deg = round(Math.abs((ang * 180) / Math.PI), 1);
  if (m.roll_deg >= T.roll[1]) fails.push({ code: 'roll' }); else if (m.roll_deg >= T.roll[0]) warns.push({ code: 'roll' });
  const mid = dot(sub(lm[SUBNASALE], lm[GLABELLA]), v), low = dot(sub(lm[MENTON], lm[SUBNASALE]), v);
  if (low <= 0 || mid <= 0) fails.push({ code: 'pitch' });
  else {
    const r = mid / low; m.mid_to_low_ratio = round(r, 3);
    const [w0, w1] = T.mid_low[0], [f0, f1] = T.mid_low[1];
    if (r < f0 || r > f1) fails.push({ code: 'pitch' }); else if (r < w0 || r > w1) warns.push({ code: 'pitch_soft' });
  }
  const height = dist(lm[MENTON], lm[GLABELLA]), bizyg = dist(lm[za], lm[zb]);
  m.face_width_px = Math.round(bizyg);
  if (bizyg <= T.width[1]) fails.push({ code: 'small' }); else if (bizyg <= T.width[0]) warns.push({ code: 'small_soft' });
  const aspect = bizyg / Math.max(height, 1e-6); m.face_aspect = round(aspect, 3);
  if (aspect < T.aspect[0] || aspect > T.aspect[1]) fails.push({ code: 'aspect' });
  const iris = (Math.abs(lm[IRIS_A[0]][0] - lm[IRIS_A[1]][0]) + Math.abs(lm[IRIS_B[0]][0] - lm[IRIS_B[1]][0])) / 2;
  m.iris_px = round(iris, 1);
  if (iris <= T.iris[1]) fails.push({ code: 'iris_small' }); else if (iris <= T.iris[0]) warns.push({ code: 'iris_small_soft' });
  const ir = iris / oc; m.iris_to_outer_canthal = round(ir, 3);
  if (ir < T.iris_ratio[0] || ir > T.iris_ratio[1]) fails.push({ code: 'scale' });
  else if (ir < 0.115 || ir > 0.17) warns.push({ code: 'scale_marginal' });
  const fiss = LID_UP.map((u_, i) => dist(lm[u_], lm[LID_LOW[i]]) / Math.max(iris, 1e-6));
  m.eye_open_to_iris = fiss.map(x => round(x, 2));
  if (Math.max(...fiss) < 0.35) fails.push({ code: 'eyes_closed' }); else if (Math.min(...fiss) < 0.45) warns.push({ code: 'eye_narrow' });
  const mouthW = dist(lm[MOUTH[0]], lm[MOUTH[1]]);
  const gap = dist(lm[UPPER_IN], lm[LOWER_IN]) / Math.max(mouthW, 1e-6); m.mouth_open = round(gap, 3);
  if (gap >= T.mouth[1]) fails.push({ code: 'mouth' }); else if (gap >= T.mouth[0]) warns.push({ code: 'mouth' });
  const xs = lm.map(p => p[0]), ys = lm.map(p => p[1]);
  if (Math.min(...xs) < 0 || Math.max(...xs) >= imgW || Math.min(...ys) < 0 || Math.max(...ys) >= imgH) fails.push({ code: 'cropped' });
  else if (stats) {
    m.blur_laplacian_var = round(stats.blurVar, 1); m.brightness = round(stats.brightness, 1);
    if (stats.blurVar <= T.blur[1]) fails.push({ code: 'blur' }); else if (stats.blurVar <= T.blur[0]) warns.push({ code: 'blur' });
    if (stats.brightness < 45 || stats.brightness > 215) warns.push({ code: 'exposure' });
  }
  return res(fails.length ? 'CANNOT_ASSESS' : warns.length ? 'PASS_WITH_WARNINGS' : 'PASS');
}

export const round = (v: number, n = 2): number => { const k = 10 ** n; return Math.round(v * k) / k; };

export const REFERENCES: Record<string, string> = {
  middle_to_lower_third: 'canon 1.0 (glabella-subnasale : subnasale-menton)',
  upper_lip_to_lower_face: 'canon 1:2 (subnasale-stomion : stomion-menton)',
  fifths_each: 'canon 0.20 of bizygomatic width per fifth',
  alar_to_intercanthal: 'canon about 1.0',
  eye_width_to_intercanthal: 'canon about 1.0',
  mouth_to_alar: 'commonly cited about 1.5',
  lower_to_upper_vermilion: 'commonly cited 1.5 to 1.6 (varies with ethnicity and age)',
  canthal_tilt_deg: 'commonly cited roughly +4 to +8 degrees (outer canthus higher)',
  bigonial_to_bizygomatic: 'no universal canon; reported for tracking change',
};

export const MIRROR_PAIRS: Record<string, [number, number]> = {
  outer_canthus: [33, 263], inner_canthus: [133, 362], mouth_corner: [61, 291], brow: [105, 334], upper_lid: [159, 386],
  lower_lid: [145, 374], alar: [129, 358], zygoma: [234, 454], gonion: [172, 397],
};

export const NASAL_INDEX_CLASSES: Array<[number, string]> = [[55, 'hyperleptorrhine'], [70, 'leptorrhine'], [85, 'mesorrhine'], [100, 'platyrrhine'], [1e9, 'hyperplatyrrhine']];

export interface Proportions {
  lengths: Record<string, number>;
  ratios: Record<string, number | null>;
  fifths: Record<string, number>;
  tilt: { left: number; right: number };
  nose: { alarWidth: number; height: number; index: number; klass: string; alarToBizygomatic: number; alarLevelDiff: number; tipDeviation: number };
  mirror: { perPair: Record<string, number>; mean: number; largest: string };
}

/** Measurements and ratios from one landmark set in mm (y up). Reports differences, never a score. */
export function frontalProportions(p: P2[]): Proportions {
  const stomion: P2 = [(p[UPPER_IN][0] + p[LOWER_IN][0]) / 2, (p[UPPER_IN][1] + p[LOWER_IN][1]) / 2];
  const middle = p[GLABELLA][1] - p[SUBNASALE][1], lower = p[SUBNASALE][1] - p[MENTON][1];
  const upperLip = p[SUBNASALE][1] - stomion[1], lowerPart = stomion[1] - p[MENTON][1];
  const eyeL = dist(p[EYE.left[0]], p[EYE.left[1]]), eyeR = dist(p[EYE.right[0]], p[EYE.right[1]]);
  const ic = dist(p[EYE.left[0]], p[EYE.right[0]]);
  const alar = dist(p[ALAR[0]], p[ALAR[1]]), mouth = dist(p[MOUTH[0]], p[MOUTH[1]]);
  const bizyg = dist(p[ZYGOMA[0]], p[ZYGOMA[1]]), bigon = dist(p[GONION[0]], p[GONION[1]]);
  const outerCanthal = dist(p[EYE.left[1]], p[EYE.right[1]]);
  const xs = {
    outer_left: Math.abs(p[EYE.left[1]][0] - p[ZYGOMA[0]][0]), eye_left: eyeL, intercanthal: ic, eye_right: eyeR,
    outer_right: Math.abs(p[ZYGOMA[1]][0] - p[EYE.right[1]][0]),
  };
  const fifths = Object.fromEntries(Object.entries(xs).map(([k, x]) => [k, round(x / bizyg, 3)]));
  const upperV = p[UPPER_LIP_TOP][1] - p[UPPER_IN][1], lowerV = p[LOWER_IN][1] - p[LOWER_LIP_BOTTOM][1];
  const tilt = (side: 'left' | 'right') => {
    const [inner, outer] = EYE[side];
    return round((Math.atan2(p[outer][1] - p[inner][1], Math.abs(p[outer][0] - p[inner][0])) * 180) / Math.PI, 1);
  };
  const nh = dist(p[NASION], p[SUBNASALE]);
  const ni = nh > 0 ? (100 * alar) / nh : 0;
  const per: Record<string, number> = {};
  for (const [name, [a, b]] of Object.entries(MIRROR_PAIRS)) per[name] = round(Math.hypot(p[a][0] + p[b][0], p[a][1] - p[b][1]));
  const vals = Object.values(per);
  return {
    lengths: {
      bizygomatic_width: round(bizyg), bigonial_width: round(bigon), intercanthal: round(ic), outer_canthal: round(outerCanthal),
      eye_width_left: round(eyeL), eye_width_right: round(eyeR), alar_width: round(alar), mouth_width: round(mouth),
      glabella_to_subnasale: round(middle), subnasale_to_menton: round(lower), face_height: round(middle + lower),
    },
    ratios: {
      middle_to_lower_third: round(middle / lower, 3), upper_lip_to_lower_face: round(upperLip / lowerPart, 3),
      alar_to_intercanthal: round(alar / ic, 3), eye_left_to_intercanthal: round(eyeL / ic, 3), eye_right_to_intercanthal: round(eyeR / ic, 3),
      mouth_to_alar: round(mouth / alar, 3), lower_to_upper_vermilion: upperV > 0 ? round(lowerV / upperV, 3) : null,
      bigonial_to_bizygomatic: round(bigon / bizyg, 3), face_width_to_height: round(bizyg / (middle + lower), 3),
    },
    fifths,
    tilt: { left: tilt('left'), right: tilt('right') },
    nose: {
      alarWidth: round(alar), height: round(nh), index: round(ni, 1), klass: NASAL_INDEX_CLASSES.find(([lim]) => ni < lim)?.[1] ?? '',
      alarToBizygomatic: round(alar / bizyg, 3), alarLevelDiff: round(Math.abs(p[ALAR[0]][1] - p[ALAR[1]][1])), tipDeviation: round(p[1][0]),
    },
    mirror: { perPair: per, mean: round(vals.reduce((s, x) => s + x, 0) / vals.length), largest: Object.keys(per).reduce((a, b) => (per[a] >= per[b] ? a : b)) },
  };
}
