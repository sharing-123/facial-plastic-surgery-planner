/** Wound geometry report on one photo, ported from wound_planner.plan(). Everything in face-aligned mm. */
import { BROW_L, BROW_R, EYE_L, EYE_R, RstlContext, segDist, type P2, type Region } from './rstl';
import { FaceFrame } from './face';
import { FAV, UNFAV, angDiff, ellipseFor, ellipsePoints, zPlasty, ELLIPSE_LW_RATIO, type ZPlasty } from './wound';

const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const ALAR_RIM = [129, 64, 98, 97, 2, 326, 327, 294, 358];

export interface Segment { region: Region; lengthMm: number; woundDeg: number; rstlDeg: number; angleToRstl: number }
export interface Critical { structure: string; minDistMm: number; crosses: boolean }
export interface WoundReport {
  lengthMm: number; chordMm: number; tortuosity: number | null;
  regions: Region[]; meanAngle: number; alignment: 'favourable' | 'intermediate' | 'unfavourable';
  worst: Segment; segments: Segment[]; critical: Critical[];
  ellipse: { axisDeg: number; halfLengthMm: number; halfWidthMm: number; ratio: number; tissueFactor: number; tooLong: boolean };
  z: ZPlasty; rstlSource: 'override' | 'approximation'; scalePxPerMm: number;
  /** mm-frame geometry used by the drawing code */
  Q: P2[]; ellipsePts: P2[]; axis: number; centre: P2; linear: boolean; elongation: number;
}

function densify(Q: P2[], step: number): P2[] {
  const out: P2[] = [Q[0]];
  for (let i = 0; i < Q.length - 1; i++) {
    const a = Q[i], b = Q[i + 1];
    const n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

function cross(p1: P2, p2: P2, poly: P2[], closed: boolean): boolean {
  const pts = closed ? [...poly, poly[0]] : poly;
  const ccw = (a: P2, b: P2, c: P2) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const q1 = pts[i], q2 = pts[i + 1];
    if (ccw(p1, q1, q2) !== ccw(p2, q1, q2) && ccw(p1, p2, q1) !== ccw(p1, p2, q2)) return true;
  }
  return false;
}

/**
 * @param lmPx 478 landmarks in px; woundPx clicked or traced px points (n >= 2)
 * @param opts rstlOverrideDeg clinician-set RSTL direction; ppmOverride manual calibration (px per mm) beats the iris scale
 */
export function analyseWound(lmPx: P2[], woundPx: P2[], opts: { rstlOverrideDeg?: number | null; ppmOverride?: number | null; zAngle?: number } = {}): WoundReport {
  const ff = new FaceFrame(lmPx, opts.ppmOverride ?? undefined);
  const P = ff.allMM(lmPx);
  const ctx = new RstlContext(P);
  const Q = woundPx.map(p => ff.toMM(p));
  const dense = densify(Q, 0.5);
  let length = 0;
  for (let i = 1; i < Q.length; i++) length += Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]);
  const chord = Math.hypot(Q[Q.length - 1][0] - Q[0][0], Q[Q.length - 1][1] - Q[0][1]);
  const ov = opts.rstlOverrideDeg != null ? ((opts.rstlOverrideDeg % 180) + 180) % 180 : null;

  const segs: Segment[] = [];
  let wsum = 0, dsum = 0;
  const Qs = densify(Q, 5);
  for (let i = 0; i < Qs.length - 1; i++) {
    const a = Qs[i], b = Qs[i + 1];
    const ln = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (ln === 0) continue;
    const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const reg = ctx.regionOf(m);
    const r = ov ?? ctx.angle(reg, m);
    const ang = (((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180 + 180) % 180;
    const dd = angDiff(ang, r);
    segs.push({ region: reg, lengthMm: Math.round(ln * 10) / 10, woundDeg: Math.round(ang * 10) / 10, rstlDeg: Math.round(r * 10) / 10, angleToRstl: Math.round(dd * 10) / 10 });
    wsum += ln * dd; dsum += ln;
  }
  const meanAngle = dsum ? wsum / dsum : 0;
  const worst = segs.reduce((w, s) => (s.angleToRstl > w.angleToRstl ? s : w), segs[0]);

  const pick = (ids: number[]) => ids.map(i => P[i]);
  const borders: Array<[string, P2[], boolean]> = [
    ['vermilion_border', pick(LIPS_OUTER), true], ['brow_R', pick(BROW_R), false], ['brow_L', pick(BROW_L), false],
    ['eyelid_margin_R', pick(EYE_R), true], ['eyelid_margin_L', pick(EYE_L), true], ['alar_rim', pick(ALAR_RIM), false],
  ];
  const critical: Critical[] = [];
  for (const [name, poly, closed] of borders) {
    const dmin = Math.min(...dense.map(p => segDist(p, poly, closed)));
    let crosses = false;
    for (let i = 0; i < Q.length - 1 && !crosses; i++) crosses = cross(Q[i], Q[i + 1], poly, closed);
    if (crosses || dmin <= 4) critical.push({ structure: name, minDistMm: Math.round(dmin * 10) / 10, crosses });
  }

  const cen: P2 = [Q.reduce((s, p) => s + p[0], 0) / Q.length, Q.reduce((s, p) => s + p[1], 0) / Q.length];
  const axis = ov ?? ctx.angle(ctx.regionOf(cen), cen);
  const fit = ellipseFor(Q[0], Q[Q.length - 1], axis);
  // linearity of the traced line: elongation of its bounding principal axes
  const mx = cen[0], my = cen[1];
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of dense) { sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; sxy += (p[0] - mx) * (p[1] - my); }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const elong = l2 > 1e-9 ? Math.sqrt(l1 / l2) : 99;
  return {
    lengthMm: Math.round(length * 10) / 10, chordMm: Math.round(chord * 10) / 10, tortuosity: chord > 0 ? Math.round((length / chord) * 100) / 100 : null,
    regions: [...new Set(segs.map(s => s.region))], meanAngle: Math.round(meanAngle * 10) / 10,
    alignment: meanAngle <= FAV ? 'favourable' : meanAngle >= UNFAV ? 'unfavourable' : 'intermediate',
    worst, segments: segs, critical,
    ellipse: { axisDeg: Math.round(axis * 10) / 10, halfLengthMm: Math.round(fit.a * 10) / 10, halfWidthMm: Math.round(fit.b * 10) / 10, ratio: ELLIPSE_LW_RATIO, tissueFactor: Math.round(fit.tissueFactor * 100) / 100, tooLong: fit.tissueFactor > 2 },
    z: zPlasty(Q[0], Q[Q.length - 1], opts.zAngle ?? 60), rstlSource: ov != null ? 'override' : 'approximation', scalePxPerMm: ff.scale,
    Q, ellipsePts: ellipsePoints(fit.c, fit.a, fit.b, axis), axis, centre: cen, linear: elong > 3 || Q.length <= 2, elongation: Math.round(elong * 10) / 10,
  };
}
