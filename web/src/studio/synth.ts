import { CANON } from '../face/geometry';
import type { Pt } from './motion';

/**
 * Synthetic movement for the video examples: a public-domain portrait is warped over time with a known strength per side
 * (smile, brow lift, eye closure). The result is then analysed exactly like a real clip, so the known strength can be compared with
 * what the analysis reports. It is a test pattern, not a patient, and says so wherever it is shown.
 */
export interface SynthSpec { smile?: [number, number]; brow?: [number, number]; eye?: [number, number]; seconds?: number; fps?: number }
export interface SynthClip { frames: HTMLCanvasElement[]; fps: number; size: number }

const bump = (t: number, a: number, b: number): number => {
  if (t <= a || t >= b) return 0;
  const x = (t - a) / (b - a);
  return x < 0.35 ? Math.sin((x / 0.35) * Math.PI / 2) : x < 0.65 ? 1 : Math.sin(((1 - x) / 0.35) * Math.PI / 2);
};
const gauss = (d: number, sigma: number): number => Math.exp(-(d * d) / (2 * sigma * sigma));

const UPPER_R = [246, 161, 160, 159, 158, 157, 173], UPPER_L = [466, 388, 387, 386, 385, 384, 398];

export async function renderSynth(photo: HTMLCanvasElement, lm: Pt[], spec: SynthSpec, onProgress?: (p: number) => void): Promise<SynthClip> {
  const fps = spec.fps ?? 10, secs = spec.seconds ?? 8, n = Math.round(fps * secs);
  // square crop around the face, 512 px
  const xs = lm.slice(0, 468).map(p => p[0]), ys = lm.slice(0, 468).map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const side = Math.max(x1 - x0, y1 - y0) * 1.45, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const S = 512, k = S / side;
  const base = document.createElement('canvas'); base.width = base.height = S;
  base.getContext('2d')!.drawImage(photo, cx - side / 2, cy - side / 2, side, side, 0, 0, S, S);
  const P: Pt[] = lm.slice(0, 468).map(p => [(p[0] - (cx - side / 2)) * k, (p[1] - (cy - side / 2)) * k] as Pt);
  const ocw = Math.hypot(P[263][0] - P[33][0], P[263][1] - P[33][1]);
  const midX = (P[133][0] + P[362][0]) / 2;
  const browMid = (a: number[]): Pt => [a.reduce((s, i) => s + P[i][0], 0) / a.length, a.reduce((s, i) => s + P[i][1], 0) / a.length];
  const brows = { R: browMid([105, 66, 107, 63, 70]), L: browMid([334, 296, 336, 293, 300]) };
  const lidY = { R: P[159][1], L: P[386][1] };
  const lowY = { R: P[145][1], L: P[374][1] };

  const frames: HTMLCanvasElement[] = [];
  const tri = CANON.triangles;
  for (let f = 0; f < n; f++) {
    const t = f / fps;
    const wSmile = bump(t, 1.0, 3.6), wBrow = bump(t, 3.9, 5.7), wEye = bump(t, 6.0, 7.5);
    const D: Pt[] = P.map(() => [0, 0] as Pt);
    const add = (i: number, dx: number, dy: number) => { D[i][0] += dx; D[i][1] += dy; };
    const sm = spec.smile ?? [0, 0], br = spec.brow ?? [0, 0], ey = spec.eye ?? [0, 0];
    (['R', 'L'] as const).forEach((s, si) => {
      const cIdx = s === 'R' ? 61 : 291, sign = P[cIdx][0] < midX ? -1 : 1;
      const wS = sm[si] * wSmile, wB = br[si] * wBrow, wE = ey[si] * wEye;
      for (let i = 0; i < P.length; i++) {
        if (wS > 0) {
          const g = gauss(Math.hypot(P[i][0] - P[cIdx][0], P[i][1] - P[cIdx][1]), 0.17 * ocw);
          if (g > 0.01 && (P[i][0] < midX) === (sign < 0)) add(i, sign * 0.035 * ocw * wS * g, -0.1 * ocw * wS * g);
        }
        if (wB > 0) {
          const b = brows[s], g = gauss(Math.hypot(P[i][0] - b[0], P[i][1] - b[1]), 0.18 * ocw);
          const above = Math.min(1, Math.max(0, (lidY[s] - 0.06 * ocw - P[i][1]) / (0.05 * ocw)));
          if (g > 0.01 && above > 0) add(i, 0, -0.07 * ocw * wB * g * above);
        }
        if (wE > 0) {
          const arc = s === 'R' ? UPPER_R : UPPER_L;
          let d = Infinity; for (const j of arc) d = Math.min(d, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
          const g = gauss(d, 0.035 * ocw);
          const upper = P[i][1] <= lowY[s] - 0.25 * (lowY[s] - lidY[s]);
          if (g > 0.01 && upper) add(i, 0, (lowY[s] - lidY[s]) * wE * g);
        }
      }
    });
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    for (const [a, b, d] of tri) {
      if (Math.max(Math.abs(D[a][0]) + Math.abs(D[a][1]), Math.abs(D[b][0]) + Math.abs(D[b][1]), Math.abs(D[d][0]) + Math.abs(D[d][1])) < 0.05) continue;
      const s0 = P[a], s1 = P[b], s2 = P[d];
      const t0: Pt = [s0[0] + D[a][0], s0[1] + D[a][1]], t1: Pt = [s1[0] + D[b][0], s1[1] + D[b][1]], t2: Pt = [s2[0] + D[d][0], s2[1] + D[d][1]];
      const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
      if (Math.abs(det) < 1e-6) continue;
      // affine map from the source triangle to the displaced one
      const m = (u0: number, u1: number, u2: number, v0: number, v1: number, v2: number): [number, number, number] => {
        const A = ((u1 - u0) * (s2[1] - s0[1]) - (u2 - u0) * (s1[1] - s0[1])) / det, B = ((u2 - u0) * (s1[0] - s0[0]) - (u1 - u0) * (s2[0] - s0[0])) / det;
        return [A, B, v0 - A * s0[0] - B * s0[1]] as [number, number, number];
      };
      const mx = m(t0[0], t1[0], t2[0], t0[0], t1[0], t2[0]), my = m(t0[1], t1[1], t2[1], t0[1], t1[1], t2[1]);
      const cxm = (t0[0] + t1[0] + t2[0]) / 3, cym = (t0[1] + t1[1] + t2[1]) / 3;
      const grow = (p: Pt): Pt => { const dx = p[0] - cxm, dy = p[1] - cym, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.7, p[1] + (dy / l) * 0.7]; };
      const g0 = grow(t0), g1 = grow(t1), g2 = grow(t2);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath(); ctx.clip();
      ctx.setTransform(mx[0], my[0], mx[1], my[1], mx[2], my[2]);
      ctx.drawImage(base, 0, 0);
      ctx.restore();
    }
    frames.push(c);
    onProgress?.((f + 1) / n);
    if (f % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }
  return { frames, fps, size: S };
}
