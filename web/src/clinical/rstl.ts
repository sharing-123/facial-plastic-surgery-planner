/**
 * Coarse rule-based relaxed skin tension line (RSTL) field, ported from wound_planner.py
 * (region_of / rstl_angle). Everything is in the face-aligned mm frame: y up, midline x = 0,
 * negative x = patient right. The field is an approximation of schematic maps, not a measured field.
 */
import { CANON } from '../face/geometry';

export type P2 = [number, number];

export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const BROW_R = [70, 63, 105, 66, 107];
export const BROW_L = [300, 293, 334, 296, 336];
export const NOSE_IDX = CANON.nose;
export const LIPS_IDX = CANON.lips;

export function convexHull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: P2[] = [];
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return [...lo, ...up];
}

export function inPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function segDist(p: P2, poly: P2[], closed = false): number {
  const n = poly.length;
  let best = Infinity;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / Math.max(abx * abx + aby * aby, 1e-9)));
    best = Math.min(best, Math.hypot(a[0] + abx * t - p[0], a[1] + aby * t - p[1]));
  }
  return best;
}

export type Region = 'lip' | 'nose' | 'brow' | 'glabella' | 'periorbital' | 'perioral' | 'chin' | 'forehead' | 'cheek' | 'outside_face_oval';

export class RstlContext {
  oval: P2[]; noseHull: P2[]; lipHull: P2[]; brows: [P2[], P2[]]; eyes: [P2[], P2[]];
  browY: [number, number]; mouthC: P2; lowerLipY: number; P: P2[];

  /** P: 478 landmarks (or 468) in the face-aligned mm frame. */
  constructor(P: P2[]) {
    this.P = P;
    const pick = (ids: number[]): P2[] => ids.map(i => P[i]);
    this.oval = pick(OVAL);
    this.noseHull = convexHull(pick(NOSE_IDX));
    this.lipHull = convexHull(pick(LIPS_IDX));
    this.brows = [pick(BROW_R), pick(BROW_L)];
    this.eyes = [pick(EYE_R), pick(EYE_L)];
    const ys = [...this.brows[0], ...this.brows[1]].map(p => p[1]);
    this.browY = [Math.min(...ys), Math.max(...ys)];
    this.mouthC = [(P[13][0] + P[14][0]) / 2, (P[13][1] + P[14][1]) / 2];
    this.lowerLipY = P[17][1];
  }

  regionOf(p: P2): Region {
    if (inPoly(p, this.lipHull)) return 'lip';
    if (inPoly(p, this.noseHull)) return 'nose';
    if (Math.min(segDist(p, this.brows[0]), segDist(p, this.brows[1])) <= 4) return 'brow';
    if (Math.abs(p[0]) <= 10 && this.browY[0] - 2 <= p[1] && p[1] <= this.browY[1] + 14) return 'glabella';
    if (Math.min(segDist(p, this.eyes[0], true), segDist(p, this.eyes[1], true)) <= 10) return 'periorbital';
    if (Math.hypot(p[0] - this.mouthC[0], p[1] - this.mouthC[1]) <= 20 && p[1] > this.lowerLipY - 8) return 'perioral';
    if (inPoly(p, this.oval)) {
      if (p[1] < this.lowerLipY - 8 && Math.abs(p[0]) <= 30) return 'chin';
      if (p[1] > this.browY[1] + 2) return 'forehead';
      return 'cheek';
    }
    return 'outside_face_oval';
  }

  /** Approximate RSTL direction in degrees (0 horizontal, 90 vertical) in [0, 180). */
  angle(region: Region, p: P2): number {
    const P = this.P;
    const side = p[0] < 0 ? 0 : 1;
    const deg = (y: number, x: number) => ((Math.atan2(y, x) * 180) / Math.PI + 360) % 180;
    if (region === 'forehead' || region === 'chin') return 0;
    if (region === 'glabella' || region === 'nose' || region === 'lip') return 90;
    if (region === 'brow') {
      const b = this.brows[side];
      let bi = 0, bd = Infinity;
      for (let k = 0; k < b.length - 1; k++) { const d = segDist(p, b.slice(k, k + 2)); if (d < bd) { bd = d; bi = k; } }
      return deg(b[bi + 1][1] - b[bi][1], b[bi + 1][0] - b[bi][0]);
    }
    if (region === 'periorbital') {
      const outer = side === 0 ? P[33] : P[263];
      const eye = this.eyes[side];
      const ecy = eye.reduce((s, q) => s + q[1], 0) / eye.length;
      if (Math.abs(p[0]) > Math.abs(outer[0]) && Math.abs(p[1] - ecy) < 12) return deg(p[1] - outer[1], p[0] - outer[0]);
      return 0;
    }
    if (region === 'perioral') return deg(p[1] - this.mouthC[1], p[0] - this.mouthC[0]);
    if (region === 'cheek') {
      const alar = P[129], comm = P[61];
      const theta = deg(comm[1] - alar[1], comm[0] - alar[0]);
      const w = Math.max(0, Math.min(1, (Math.abs(p[0]) - Math.abs(alar[0])) / Math.max(Math.abs(P[234][0]) - Math.abs(alar[0]), 1e-6)));
      const target = theta < 90 ? 0 : 180;
      const a = (1 - w) * theta + w * target;
      return side === 0 ? a % 180 : (180 - a) % 180;
    }
    let bi = 0, bd = Infinity;
    this.oval.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bi = i; } });
    const a = this.oval[(bi + 1) % this.oval.length], b = this.oval[(bi - 1 + this.oval.length) % this.oval.length];
    return deg(a[1] - b[1], a[0] - b[0]);
  }

  angleAt(p: P2): number { return this.angle(this.regionOf(p), p); }

  /** Field angle averaged over a small neighbourhood (doubled-angle vectors), so streamlines bend instead of kinking at region borders. */
  smoothAngle(p: P2, radius = 5): number {
    let sx = 0, sy = 0, wsum = 0;
    const taps: Array<[number, number, number]> = [[0, 0, 2], [radius, 0, 1], [-radius, 0, 1], [0, radius, 1], [0, -radius, 1], [radius * 0.7, radius * 0.7, 0.7], [-radius * 0.7, radius * 0.7, 0.7], [radius * 0.7, -radius * 0.7, 0.7], [-radius * 0.7, -radius * 0.7, 0.7]];
    for (const [dx, dy, w] of taps) {
      const q: P2 = [p[0] + dx, p[1] + dy];
      const r = this.regionOf(q);
      if (r === 'outside_face_oval') continue;
      const a = (this.angle(r, q) * Math.PI) / 90; // doubled angle: 0 and 180 degrees are the same line
      sx += Math.cos(a) * w; sy += Math.sin(a) * w; wsum += w;
    }
    if (!wsum) return this.angleAt(p);
    return (((Math.atan2(sy, sx) * 90) / Math.PI) + 180) % 180;
  }
}

/**
 * Trace streamlines of the RSTL field from a seed grid. Directions are headless (0 and 180 are the same line),
 * so each step keeps the sign that continues the previous heading.
 */
export function traceStreamlines(ctx: RstlContext, seeds: P2[], stepMm = 2, maxSteps = 26): P2[][] {
  const lines: P2[][] = [];
  for (const seed of seeds) {
    if (!inPoly(seed, ctx.oval)) continue;
    const walk = (sign: number): P2[] => {
      const out: P2[] = [];
      let p: P2 = [seed[0], seed[1]];
      let hx = 0, hy = 0;
      for (let i = 0; i < maxSteps; i++) {
        const r = ctx.regionOf(p);
        if (r === 'outside_face_oval') break;
        const a = (ctx.smoothAngle(p) * Math.PI) / 180;
        let dx = Math.cos(a), dy = Math.sin(a);
        if (i === 0) { dx *= sign; dy *= sign; } else if (dx * hx + dy * hy < 0) { dx = -dx; dy = -dy; }
        hx = dx; hy = dy;
        p = [p[0] + dx * stepMm, p[1] + dy * stepMm];
        out.push(p);
      }
      return out;
    };
    const back = walk(-1).reverse();
    const fwd = walk(1);
    const line = [...back, [seed[0], seed[1]] as P2, ...fwd];
    if (line.length > 4) lines.push(line);
  }
  return lines;
}
