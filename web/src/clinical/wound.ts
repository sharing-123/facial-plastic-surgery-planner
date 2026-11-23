/** Elliptical excision and Z-plasty geometry, ported from wound_planner.py (mm, face-aligned frame). */
import type { P2 } from './rstl';

export const ELLIPSE_LW_RATIO = 3.5; // commonly taught length:width 3-4:1
export const Z_GAIN: Record<number, number> = { 30: 25, 45: 50, 60: 75 }; // classic theoretical length gain, percent
export const FAV = 30, UNFAV = 60; // alignment bands in degrees

export const angDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};
const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export interface EllipseFit { c: P2; a: number; b: number; tissueFactor: number }

/** Smallest ellipse (length:width = k) with its long axis along axisDeg that contains both wound endpoints. */
export function ellipseFor(p1: P2, p2: P2, axisDeg: number, k = ELLIPSE_LW_RATIO): EllipseFit {
  const c: P2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const d = 0.5 * Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (d < 1e-6) return { c, a: 0, b: 0, tissueFactor: 1 };
  const th = rad(angDiff(deg(Math.atan2(p2[1] - p1[1], p2[0] - p1[0])), axisDeg));
  const a = d * Math.sqrt(Math.cos(th) ** 2 + (k * Math.sin(th)) ** 2);
  return { c, a, b: a / k, tissueFactor: a / d };
}

export function ellipsePoints(c: P2, a: number, b: number, axisDeg: number, n = 90): P2[] {
  const r = rad(axisDeg);
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * Math.PI * 2;
    const x = a * Math.cos(t), y = b * Math.sin(t);
    out.push([c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return out;
}

export interface ZPlasty { central: [P2, P2]; arm1: [P2, P2]; arm2: [P2, P2]; gainPct: number | null; limbMm: number }

export function zPlasty(p1: P2, p2: P2, alpha: number): ZPlasty {
  const vx = p2[0] - p1[0], vy = p2[1] - p1[1];
  const L = Math.hypot(vx, vy);
  const u: P2 = [vx / L, vy / L];
  const rot = (a: number): P2 => [Math.cos(a) * u[0] - Math.sin(a) * u[1], Math.sin(a) * u[0] + Math.cos(a) * u[1]];
  const al = rad(alpha);
  const r1 = rot(al), r2 = rot(-al);
  return {
    central: [p1, p2],
    arm1: [p1, [p1[0] + L * r1[0], p1[1] + L * r1[1]]],
    arm2: [p2, [p2[0] + L * r2[0], p2[1] + L * r2[1]]],
    gainPct: Z_GAIN[alpha] ?? null,
    limbMm: Math.round(L * 10) / 10,
  };
}
