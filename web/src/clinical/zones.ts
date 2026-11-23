/**
 * 34-zone facial atlas, ported from face_zones.py. Each pixel inside the face oval gets exactly one zone label;
 * the grid lives in the face-aligned mm frame (y up, midline x = 0, negative x = patient right).
 */
import { BROW_L, BROW_R, EYE_L, EYE_R, LIPS_IDX, NOSE_IDX, OVAL, convexHull, inPoly, type P2 } from './rstl';

export const ZONES: Array<[string, string, boolean]> = [
  ['forehead_central', 'forehead', true], ['forehead_R', 'forehead', true], ['forehead_L', 'forehead', true],
  ['glabella', 'forehead', true], ['temple_R', 'temple', true], ['temple_L', 'temple', true],
  ['brow_R', 'brow', false], ['brow_L', 'brow', false],
  ['upper_lid_R', 'periorbital', true], ['upper_lid_L', 'periorbital', true],
  ['eye_R', 'eye', false], ['eye_L', 'eye', false],
  ['infraorbital_R', 'periorbital', true], ['infraorbital_L', 'periorbital', true],
  ['crows_feet_R', 'periorbital', true], ['crows_feet_L', 'periorbital', true],
  ['nose_dorsum', 'nose', true], ['nose_tip', 'nose', true], ['nose_ala_R', 'nose', true], ['nose_ala_L', 'nose', true],
  ['cheek_medial_R', 'cheek', true], ['cheek_medial_L', 'cheek', true],
  ['cheek_lateral_R', 'cheek', true], ['cheek_lateral_L', 'cheek', true],
  ['nasolabial_R', 'perioral', true], ['nasolabial_L', 'perioral', true],
  ['upper_lip_skin', 'perioral', true], ['vermilion_upper', 'lip', false], ['vermilion_lower', 'lip', false],
  ['chin', 'chin', true], ['marionette_R', 'perioral', true], ['marionette_L', 'perioral', true],
  ['jawline_R', 'jaw', true], ['jawline_L', 'jaw', true],
];
export const ZONE_NAMES = ZONES.map(z => z[0]);
export const ZONE_ID: Record<string, number> = Object.fromEntries(ZONE_NAMES.map((n, i) => [n, i + 1]));

export interface ZoneMap {
  w: number; h: number; x0: number; y1: number; res: number;
  lab: Uint8Array; // 0 = outside the face oval
}

const X0 = -100, X1 = 100, Y0 = -112, Y1 = 100;

export function buildZones(P: P2[], res = 1): ZoneMap {
  const w = Math.round((X1 - X0) / res), h = Math.round((Y1 - Y0) / res);
  const lab = new Uint8Array(w * h);
  const mm = (i: number, j: number): P2 => [X0 + (i + 0.5) * res, Y1 - (j + 0.5) * res];
  const pick = (ids: number[]) => ids.map(i => P[i]);
  const polyMask = (poly: P2[]): Uint8Array => {
    const m = new Uint8Array(w * h);
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / res)), i1 = Math.min(w - 1, Math.ceil((Math.max(...xs) - X0) / res));
    const j0 = Math.max(0, Math.floor((Y1 - Math.max(...ys)) / res)), j1 = Math.min(h - 1, Math.ceil((Y1 - Math.min(...ys)) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inPoly(mm(i, j), poly)) m[j * w + i] = 1;
    return m;
  };
  const rect = (xa: number, xb: number, ya: number, yb: number): P2[] => {
    const [x0, x1] = xa < xb ? [xa, xb] : [xb, xa];
    return [[x0, ya], [x1, ya], [x1, yb], [x0, yb]];
  };
  const oval = polyMask(pick(OVAL));
  const setMask = (name: string, m: Uint8Array) => { const id = ZONE_ID[name]; for (let k = 0; k < m.length; k++) if (m[k] && oval[k]) lab[k] = id; };
  const fill = (name: string, poly: P2[]) => setMask(name, polyMask(poly));
  const segMask = (a: P2, b: P2, half: number): Uint8Array => {
    const m = new Uint8Array(w * h);
    const abx = b[0] - a[0], aby = b[1] - a[1], l2 = Math.max(abx * abx + aby * aby, 1e-9);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [x, y] = mm(i, j);
      const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby) / l2));
      if (Math.hypot(a[0] + abx * t - x, a[1] + aby * t - y) <= half) m[j * w + i] = 1;
    }
    return m;
  };

  const ovalPts = pick(OVAL);
  const cheekL = ZONE_ID.cheek_lateral_L, cheekR = ZONE_ID.cheek_lateral_R;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (oval[k]) lab[k] = mm(i, j)[0] > 0 ? cheekL : cheekR;
  }
  const brows = [...pick(BROW_R), ...pick(BROW_L)];
  const browTop = Math.max(...brows.map(p => p[1])), browBot = Math.min(...brows.map(p => p[1]));
  const hair = P[10][1] + 4;
  const outX = { R: P[33][0], L: P[263][0] }, inX = { R: P[133][0], L: P[362][0] };
  const low = { R: P[145][1], L: P[374][1] }, up = { R: P[159][1], L: P[386][1] };
  const mouthC: P2 = [(P[13][0] + P[14][0]) / 2, (P[13][1] + P[14][1]) / 2];
  const llY = P[17][1];
  const comm = { R: P[61], L: P[291] }, alar = { R: P[129], L: P[358] };
  const sides: Array<['R' | 'L', number]> = [['R', -1], ['L', 1]];

  for (const [s, sg] of sides) fill(`cheek_medial_${s}`, rect(sg * 8, sg * 40, comm[s][1] - 6, low[s] - 3));
  fill('forehead_central', rect(-18, 18, browTop + 2, hair + 60));
  fill('forehead_R', rect(-120, -18, browTop + 2, hair + 60));
  fill('forehead_L', rect(18, 120, browTop + 2, hair + 60));
  for (const [s, sg] of sides) fill(`temple_${s}`, rect(outX[s] + sg * 4, sg * 120, browBot - 14, browTop + 10));
  fill('glabella', rect(-9, 9, P[9][1] - 8, P[9][1] + 14));
  for (const [s, sg] of sides) {
    fill(`upper_lid_${s}`, rect(inX[s], outX[s], up[s], browBot - 0.5));
    fill(`infraorbital_${s}`, rect(inX[s], outX[s] + sg * 4, low[s] - 14, low[s]));
    fill(`crows_feet_${s}`, rect(outX[s] + sg * 2, outX[s] + sg * 28, up[s] - 16, up[s] + 8));
  }
  const noseM = polyMask(convexHull(pick(NOSE_IDX)));
  setMask('nose_dorsum', noseM);
  const tipMask = segMask(P[1], P[1], 9);
  const tipAnd = noseM.map((v, k) => (v && tipMask[k] ? 1 : 0)) as Uint8Array;
  setMask('nose_tip', tipAnd);
  for (const [s, sg] of sides) {
    const a = polyMask(rect(sg * 7, sg * 30, P[2][1] - 4, P[1][1] + 2));
    setMask(`nose_ala_${s}`, noseM.map((v, k) => (v && a[k] && lab[k] !== ZONE_ID.nose_tip ? 1 : 0)) as Uint8Array);
  }
  for (const [s] of sides) {
    const a = alar[s], c = comm[s];
    const l = Math.max(Math.hypot(c[0] - a[0], c[1] - a[1]), 1e-6);
    const d: P2 = [(c[0] - a[0]) / l, (c[1] - a[1]) / l];
    const m = segMask(a, [c[0] + d[0] * 10, c[1] + d[1] * 10], 6);
    setMask(`nasolabial_${s}`, m.map((v, k) => (v && !noseM[k] ? 1 : 0)) as Uint8Array);
  }
  fill('upper_lip_skin', rect(-14, 14, P[0][1] + 1, P[2][1] - 2));
  fill('chin', rect(-30, 30, P[152][1] - 4, llY - 3));
  for (const [s] of sides) setMask(`marionette_${s}`, segMask(comm[s], [comm[s][0], comm[s][1] - 20], 5));
  // jawline band: within 12 mm of the oval edge, below the lower lip, outside the chin
  const edge = new Float32Array(w * h).fill(1e9);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!oval[k]) continue;
    const p = mm(i, j);
    let best = 1e9;
    for (let q = 0; q < ovalPts.length; q++) {
      const a = ovalPts[q], b = ovalPts[(q + 1) % ovalPts.length];
      const abx = b[0] - a[0], aby = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / Math.max(abx * abx + aby * aby, 1e-9)));
      best = Math.min(best, Math.hypot(a[0] + abx * t - p[0], a[1] + aby * t - p[1]));
    }
    edge[k] = best;
  }
  for (const [s, sg] of sides) {
    const m = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, [x, y] = mm(i, j);
      if (oval[k] && edge[k] <= 12 && y < llY - 10 && (x > 0) === (sg > 0) && lab[k] !== ZONE_ID.chin) m[k] = 1;
    }
    setMask(`jawline_${s}`, m);
  }
  const lips = polyMask(convexHull(pick(LIPS_IDX)));
  const lipUp = new Uint8Array(w * h), lipLow = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!lips[k]) continue;
    if (mm(i, j)[1] < mouthC[1]) lipLow[k] = 1; else lipUp[k] = 1;
  }
  setMask('vermilion_upper', lipUp);
  setMask('vermilion_lower', lipLow);
  for (const [s, idx] of [['R', EYE_R], ['L', EYE_L]] as const) setMask(`eye_${s}`, polyMask(pick(idx)));
  for (const [s, idx] of [['R', BROW_R], ['L', BROW_L]] as const) {
    const b = pick(idx);
    const poly: P2[] = [...b.map(p => [p[0], p[1] + 2.5] as P2), ...[...b].reverse().map(p => [p[0], p[1] - 2.5] as P2)];
    setMask(`brow_${s}`, polyMask(poly));
  }
  return { w, h, x0: X0, y1: Y1, res, lab: smooth(lab, w, h, 1.6 / res) };
}

/** Soft-assignment smoothing: each pixel takes the zone with the largest blurred mask. */
function smooth(lab: Uint8Array, w: number, h: number, sigmaPx: number): Uint8Array {
  const n = lab.length;
  const best = new Float32Array(n).fill(-1);
  const out = new Uint8Array(n);
  const rad = Math.max(2, Math.ceil(sigmaPx * 3));
  const kern = new Float32Array(rad * 2 + 1);
  let ks = 0;
  for (let i = -rad; i <= rad; i++) { kern[i + rad] = Math.exp(-(i * i) / (2 * sigmaPx * sigmaPx)); ks += kern[i + rad]; }
  for (let i = 0; i < kern.length; i++) kern[i] /= ks;
  const present = new Set<number>();
  for (let k = 0; k < n; k++) if (lab[k]) present.add(lab[k]);
  const tmp = new Float32Array(n), blur = new Float32Array(n);
  for (const id of present) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0;
      for (let d = -rad; d <= rad; d++) { const x = i + d; if (x >= 0 && x < w && lab[j * w + x] === id) s += kern[d + rad]; }
      tmp[j * w + i] = s;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0;
      for (let d = -rad; d <= rad; d++) { const y = j + d; if (y >= 0 && y < h) s += tmp[y * w + i] * kern[d + rad]; }
      blur[j * w + i] = s;
    }
    for (let k = 0; k < n; k++) if (blur[k] > best[k]) { best[k] = blur[k]; out[k] = id; }
  }
  for (let k = 0; k < n; k++) if (!lab[k]) out[k] = 0;
  return out;
}
