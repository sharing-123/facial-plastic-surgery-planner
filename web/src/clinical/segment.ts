/**
 * Lesion outline from one tap, done in the browser with colour region growing in CIELAB, plus the appearance
 * features used for the differential. It is a classical method with no trained weights: it follows colour contrast,
 * so pale slough rings, shadows and hair can fool it. The brush in the studio exists to fix the outline.
 */
import { convexHull, type P2 } from './rstl';

export interface Lab { L: number; a: number; b: number }

export interface Lesion {
  w: number; h: number; scale: number;          // working grid and its scale to the full-resolution photo
  mask: Uint8Array;                             // working grid, 1 = lesion
  contourPx: P2[];                              // full-resolution photo px
  centroid: P2; endpoints: [P2, P2];            // px; ends of the principal axis
  majorPx: number; minorPx: number; areaPx: number;
  features: LesionFeatures;
}

export interface LesionFeatures {
  deltaE: number; deltaL: number; deltaA: number; deltaB: number; variegation: number;
  darkFrac: number; redFrac: number; yellowFrac: number;
  solidity: number; compactness: number; asymmetry: number; elongation: number;
  skin: Lab; mean: Lab;
}

const srgb = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fLab = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

export function toLab(r: number, g: number, b: number): Lab {
  const R = srgb(r), G = srgb(g), B = srgb(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const dE = (p: Lab, q: Lab) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

export interface WorkImage { w: number; h: number; scale: number; lab: Float32Array }

export function workImage(src: HTMLCanvasElement, maxSide = 720): WorkImage {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const lab = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { const q = toLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); lab[i * 3] = q.L; lab[i * 3 + 1] = q.a; lab[i * 3 + 2] = q.b; }
  return { w, h, scale, lab };
}

const px = (wi: WorkImage, i: number): Lab => ({ L: wi.lab[i * 3], a: wi.lab[i * 3 + 1], b: wi.lab[i * 3 + 2] });

/** Grow a lesion outline from a tap (px in the full-resolution photo). faceWidthPx bounds the search. */
export function growLesion(wi: WorkImage, seedPx: P2, faceWidthPx: number): Lesion | null {
  const sx = Math.round(seedPx[0] * wi.scale), sy = Math.round(seedPx[1] * wi.scale);
  if (sx < 2 || sy < 2 || sx >= wi.w - 2 || sy >= wi.h - 2) return null;
  const fw = faceWidthPx * wi.scale;
  // reference skin: median of an annulus around the tap
  const ringL: number[] = [], ringA: number[] = [], ringB: number[] = [];
  const r0 = fw * 0.1, r1 = fw * 0.2;
  for (let k = 0; k < 160; k++) {
    const t = (k / 160) * Math.PI * 2, r = r0 + ((k * 37) % 100) / 100 * (r1 - r0);
    const x = Math.round(sx + Math.cos(t) * r), y = Math.round(sy + Math.sin(t) * r);
    if (x < 0 || y < 0 || x >= wi.w || y >= wi.h) continue;
    const q = px(wi, y * wi.w + x); ringL.push(q.L); ringA.push(q.a); ringB.push(q.b);
  }
  if (ringL.length < 20) return null;
  const med = (v: number[]) => { const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
  const skin: Lab = { L: med(ringL), a: med(ringA), b: med(ringB) };
  // a thin wound is only a few pixels wide, so the tap may land beside it: start from the most distinct pixel nearby
  const search = Math.max(3, Math.round(fw * 0.015));
  let bx = sx, by = sy, bd = -1;
  for (let y = -search; y <= search; y++) for (let x = -search; x <= search; x++) {
    const xx = sx + x, yy = sy + y;
    if (xx < 1 || yy < 1 || xx >= wi.w - 1 || yy >= wi.h - 1 || x * x + y * y > search * search) continue;
    const d = dE(px(wi, yy * wi.w + xx), skin);
    if (d > bd) { bd = d; bx = xx; by = yy; }
  }
  let sL = 0, sa = 0, sb = 0, n = 0;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) { const q = px(wi, (by + y) * wi.w + bx + x); if (dE(q, skin) >= bd * 0.6) { sL += q.L; sa += q.a; sb += q.b; n++; } }
  if (!n) { const q = px(wi, by * wi.w + bx); sL = q.L; sa = q.a; sb = q.b; n = 1; }
  const seed: Lab = { L: sL / n, a: sa / n, b: sb / n };
  const contrast = dE(seed, skin);
  const T = Math.max(5, Math.min(26, contrast * 0.55));
  const maxR = fw * 0.28;
  const mask = new Uint8Array(wi.w * wi.h);
  const stack = [by * wi.w + bx];
  mask[stack[0]] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const x = i % wi.w, y = (i / wi.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= wi.w || ny >= wi.h) continue;
      const j = ny * wi.w + nx;
      if (mask[j]) continue;
      if (Math.hypot(nx - sx, ny - sy) > maxR) continue;
      const q = px(wi, j);
      // pixel joins when it is closer to the lesion colour than to the skin colour, within the tolerance
      if (dE(q, seed) <= T && dE(q, seed) <= dE(q, skin) * 1.05) { mask[j] = 1; stack.push(j); }
    }
    if (count > wi.w * wi.h * 0.2) break;
  }
  closeAndFill(mask, wi.w, wi.h);
  return describe(wi, mask, skin, seedPx);
}

/** Rebuild lesion data from an edited mask (brush) without re-growing. */
export function describe(wi: WorkImage, mask: Uint8Array, skinIn: Lab | null, seedPx: P2): Lesion | null {
  const { w, h } = wi;
  const xs: number[] = [], ys: number[] = [];
  let area = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { area++; xs.push(i % w); ys.push((i / w) | 0); }
  if (area < 12) return null;
  const cx = xs.reduce((s, v) => s + v, 0) / area, cy = ys.reduce((s, v) => s + v, 0) / area;
  let sxx = 0, syy = 0, sxy = 0;
  for (let k = 0; k < area; k++) { const dx = xs[k] - cx, dy = ys[k] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
  let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let k = 0; k < area; k++) {
    const dx = xs[k] - cx, dy = ys[k] - cy, t = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const major = tMax - tMin + 1, minor = vMax - vMin + 1;
  // boundary pixels, ordered by angle around the centroid (adequate for the mostly convex outlines this produces)
  const edge: P2[] = [];
  for (let k = 0; k < area; k++) {
    const x = xs[k], y = ys[k], i = y * w + x;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) edge.push([x, y]);
  }
  edge.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  const hull = convexHull(edge);
  let hullA = 0;
  for (let i = 0; i < hull.length; i++) { const j = (i + 1) % hull.length; hullA += hull[i][0] * hull[j][1] - hull[j][0] * hull[i][1]; }
  hullA = Math.abs(hullA) / 2;
  let per = 0;
  for (let i = 0; i < edge.length; i++) { const j = (i + 1) % edge.length; per += Math.hypot(edge[i][0] - edge[j][0], edge[i][1] - edge[j][1]); }
  // asymmetry: overlap of the mask with its mirror image about the principal axis
  let inter = 0;
  for (let k = 0; k < area; k++) {
    const dx = xs[k] - cx, dy = ys[k] - cy, t = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    const mx = Math.round(cx + t * ux + v * uy), my = Math.round(cy + t * uy - v * ux);
    if (mx >= 0 && my >= 0 && mx < w && my < h && mask[my * w + mx]) inter++;
  }
  // colours
  let L = 0, A = 0, B = 0;
  for (let k = 0; k < area; k++) { const q = px(wi, ys[k] * w + xs[k]); L += q.L; A += q.a; B += q.b; }
  const mean: Lab = { L: L / area, a: A / area, b: B / area };
  let skin = skinIn;
  if (!skin) {
    const dil = new Uint8Array(mask), dil2 = new Uint8Array(mask);
    grow(dil, w, h, 4); grow(dil2, w, h, 10);
    let l = 0, a = 0, b = 0, c = 0;
    for (let i = 0; i < mask.length; i++) if (dil2[i] && !dil[i]) { const q = px(wi, i); l += q.L; a += q.a; b += q.b; c++; }
    skin = c ? { L: l / c, a: a / c, b: b / c } : mean;
  }
  let vL = 0, dark = 0, red = 0, yellow = 0;
  for (let k = 0; k < area; k++) {
    const q = px(wi, ys[k] * w + xs[k]);
    vL += (q.L - mean.L) ** 2;
    if (q.L < skin.L - 22) dark++;
    if (q.a > skin.a + 8) red++;
    if (q.b > skin.b + 12 && q.L > skin.L - 8) yellow++;
  }
  const f = 1 / wi.scale;
  const toFull = (x: number, y: number): P2 => [x * f, y * f];
  const features: LesionFeatures = {
    deltaE: dE(mean, skin), deltaL: mean.L - skin.L, deltaA: mean.a - skin.a, deltaB: mean.b - skin.b, variegation: Math.sqrt(vL / area),
    darkFrac: dark / area, redFrac: red / area, yellowFrac: yellow / area,
    solidity: hullA > 0 ? Math.min(1, area / hullA) : 1, compactness: (per * per) / (4 * Math.PI * area), asymmetry: 1 - inter / area,
    elongation: major / Math.max(minor, 1), skin, mean,
  };
  void seedPx;
  return {
    w, h, scale: wi.scale, mask, contourPx: edge.map(p => toFull(p[0], p[1])), centroid: toFull(cx, cy),
    endpoints: [toFull(cx + ux * tMin, cy + uy * tMin), toFull(cx + ux * tMax, cy + uy * tMax)],
    majorPx: major * f, minorPx: minor * f, areaPx: area * f * f, features,
  };
}

function grow(m: Uint8Array, w: number, h: number, r: number): void {
  for (let it = 0; it < r; it++) {
    const src = new Uint8Array(m);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!src[i] && (src[i - 1] || src[i + 1] || src[i - w] || src[i + w])) m[i] = 1; }
  }
}

function closeAndFill(mask: Uint8Array, w: number, h: number): void {
  grow(mask, w, h, 2);
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const out = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    if (!inv[i] || out[i]) continue;
    out[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
  }
  for (let i = 0; i < mask.length; i++) mask[i] = out[i] ? 0 : 1;
  // erode back by one pass so the grown seam does not inflate the outline
  const src = new Uint8Array(mask);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (src[i] && (!src[i - 1] || !src[i + 1] || !src[i - w] || !src[i + w])) mask[i] = 0; }
}
