/** Marking geometry in face-aligned mm (y up), ported from markings.py. Drawing aids for a surgeon, not a plan. */
import type { P2 } from './rstl';
import { zPlasty, type ZPlasty } from './wound';

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];

function arc(Q: P2[]): { cum: number[]; d: number[] } {
  const d: number[] = [], cum = [0];
  for (let i = 1; i < Q.length; i++) { const l = Math.hypot(...sub(Q[i], Q[i - 1])); d.push(l); cum.push(cum[i - 1] + l); }
  return { cum, d };
}

export function pathLength(Q: P2[]): number { const { cum } = arc(Q); return cum[cum.length - 1] ?? 0; }

export function pointAt(Q: P2[], s: number): { p: P2; tan: P2 } {
  const { cum, d } = arc(Q);
  const ss = Math.max(0, Math.min(cum[cum.length - 1], s));
  let i = 0;
  while (i < Q.length - 2 && cum[i + 1] <= ss) i++;
  const t = d[i] > 0 ? (ss - cum[i]) / d[i] : 0;
  const len = Math.max(d[i], 1e-9);
  return { p: [Q[i][0] + (Q[i + 1][0] - Q[i][0]) * t, Q[i][1] + (Q[i + 1][1] - Q[i][1]) * t], tan: [(Q[i + 1][0] - Q[i][0]) / len, (Q[i + 1][1] - Q[i][1]) / len] };
}

/** Order of placing n sutures by repeated halving: the middle first, then the middle of each half. */
export function bisectionOrder(n: number): number[] {
  const order: number[] = [], queue: Array<[number, number]> = [[0, n - 1]];
  while (queue.length) {
    const [lo, hi] = queue.shift()!;
    if (lo > hi) continue;
    const mid = Math.floor((lo + hi) / 2);
    order.push(mid);
    queue.push([lo, mid - 1], [mid + 1, hi]);
  }
  const rank = new Array<number>(n).fill(0);
  order.forEach((idx, r) => { rank[idx] = r + 1; });
  return rank;
}

export interface SutureMark { index: number; order: number; centre: P2; a: P2; b: P2; arcMm: number }

export function sutureGuide(Q: P2[], spacing = 4, bite = 3): SutureMark[] {
  const L = pathLength(Q);
  const n = Math.max(1, Math.floor(L / spacing + 0.5));
  const step = L / n;
  const rank = bisectionOrder(n);
  const out: SutureMark[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * step;
    const { p, tan } = pointAt(Q, s);
    const nrm: P2 = [-tan[1], tan[0]];
    out.push({ index: i + 1, order: rank[i], centre: p, a: [p[0] + nrm[0] * bite, p[1] + nrm[1] * bite], b: [p[0] - nrm[0] * bite, p[1] - nrm[1] * bite], arcMm: Math.round(s * 10) / 10 });
  }
  return out;
}

export function wPlasty(Q: P2[], limb = 6): [P2[], P2[]] {
  const L = pathLength(Q);
  const h = limb * Math.sin(Math.PI / 3);
  const lines: P2[][] = [];
  for (const [sign, shift] of [[1, 0], [-1, 0.5]] as const) {
    const pts: P2[] = [];
    for (let i = 0; ; i++) {
      const s = (i + shift) * limb;
      if (s > L) break;
      const { p, tan } = pointAt(Q, s);
      const nrm: P2 = [-tan[1], tan[0]];
      pts.push(i % 2 === 1 ? [p[0] + nrm[0] * sign * h, p[1] + nrm[1] * sign * h] : p);
    }
    lines.push([pointAt(Q, 0).p, ...pts, pointAt(Q, L).p]);
  }
  return [lines[0], lines[1]];
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Irregular broken line for long scars; deterministic for a given seed. */
export function geometricBrokenLine(Q: P2[], seed = 7, seg: [number, number] = [5, 9], amp: [number, number] = [2.5, 5]): P2[] {
  const r = rng(seed), L = pathLength(Q);
  const pts: P2[] = [pointAt(Q, 0).p];
  let s = 0, side = 1;
  while (s < L - 3) {
    s = Math.min(L, s + seg[0] + r() * (seg[1] - seg[0]));
    const { p, tan } = pointAt(Q, s);
    const nrm: P2 = [-tan[1], tan[0]], a = amp[0] + r() * (amp[1] - amp[0]);
    pts.push(s < L ? [p[0] + nrm[0] * side * a, p[1] + nrm[1] * side * a] : p);
    side *= -1;
  }
  pts.push(pointAt(Q, L).p);
  return pts;
}

export function tissueRemovedMm2(a: P2[], b: P2[]): number {
  const loop = [...a, ...[...b].reverse()];
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const j = (i + 1) % loop.length; s += loop[i][0] * loop[j][1] - loop[j][0] * loop[i][1]; }
  return Math.abs(s) / 2;
}

export function zPlastySeries(Q: P2[], alpha = 60, limb = 15, maxN = 6): ZPlasty[] {
  const L = pathLength(Q);
  const n = Math.min(maxN, Math.max(1, Math.floor(L / limb + 0.5)));
  const out: ZPlasty[] = [];
  for (let i = 0; i < n; i++) out.push(zPlasty(pointAt(Q, (L * i) / n).p, pointAt(Q, (L * (i + 1)) / n).p, i % 2 === 0 ? alpha : -alpha));
  return out;
}
