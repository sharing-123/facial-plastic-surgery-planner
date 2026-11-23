"""Wrinkle detection v2: thin centre lines by non-maximum suppression, length filter, and a density in mm of line per cm2."""
from pathlib import Path

p = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio\wrinkles.ts")
s = p.read_text(encoding="utf8")

# 1. ridge returns strength and the across-line direction
a = s.index("/** Strength of dark thin ridges at one scale"); b = s.index("export function analyseWrinkles")
s = s[:a] + """/** Strength of dark thin ridges at one scale (Frangi-style) and the direction across the line, per pixel. */
function ridge(g: Float32Array, w: number, h: number, sigma: number, c: number): { v: Float32Array; ang: Float32Array } {
  const k = kernels(sigma), s2 = sigma * sigma;
  const hxx = sepConv(g, w, h, k.g2, k.g), hyy = sepConv(g, w, h, k.g, k.g2), hxy = sepConv(g, w, h, k.g1, k.g1);
  const v = new Float32Array(w * h), ang = new Float32Array(w * h);
  for (let i = 0; i < v.length; i++) {
    const a = hxx[i] * s2, b = hyy[i] * s2, d = hxy[i] * s2, tmp = Math.sqrt(((a - b) / 2) ** 2 + d * d);
    const l1 = (a + b) / 2 + tmp, l2 = (a + b) / 2 - tmp;
    if (l1 <= 0) continue;
    const rb = Math.abs(l2) / (Math.abs(l1) + 1e-9), S2 = l1 * l1 + l2 * l2;
    v[i] = Math.exp(-(rb * rb) / 0.5) * (1 - Math.exp(-S2 / (2 * c * c)));
    ang[i] = 0.5 * Math.atan2(2 * hxy[i], hxx[i] - hyy[i]);
  }
  return { v, ang };
}

""" + s[b:]

# 2. thresholds
s = s.replace("const FINE_T = 0.10, FOLD_T = 0.40, MIN_USABLE = 0.35;", "const FINE_T = 0.22, FOLD_T = 0.55, MIN_USABLE = 0.35, MIN_LINE_MM = 7;", 1)

# 3. mask from NMS centre lines
a = s.index("  const mask = new Uint8Array(w * h);\n  for (let y = 0; y < rh; y++)"); b = s.index("  const pxCm2 = 1 / (ppm * ppm) / 100;")
s = s[:a] + """  // combined line score (fine and fold scales each against their own threshold) and the direction across the line
  const score = new Float32Array(rw * rh), dir = new Float32Array(rw * rh);
  for (let j = 0; j < score.length; j++) {
    let best = 0, bd = 0;
    for (const r of fine) { const q = r.v[j] / FINE_T; if (q > best) { best = q; bd = r.ang[j]; } }
    for (const r of fold) { const q = r.v[j] / FOLD_T; if (q > best) { best = q; bd = r.ang[j]; } }
    score[j] = best; dir[j] = bd;
  }
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
    const j = y * rw + x, i = (y + y0) * w + x + x0;
    if (score[j] <= 1 || !zoneId[i] || !skin[i]) continue;
    const nx = Math.cos(dir[j]), ny = Math.sin(dir[j]);
    const at = (dx: number, dy: number) => { const xx = Math.min(rw - 1, Math.max(0, Math.round(x + dx))), yy = Math.min(rh - 1, Math.max(0, Math.round(y + dy))); return score[yy * rw + xx]; };
    if (score[j] >= at(nx, ny) && score[j] >= at(-nx, -ny)) mask[i] = 1;
  }
  // drop short fragments: a line shorter than a few millimetres is skin texture
  const lab = new Int32Array(w * h), minPx = Math.max(8, Math.round(MIN_LINE_MM * ppm)), stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    const comp: number[] = []; stack.push(i); lab[i] = 1;
    while (stack.length) { const p = stack.pop()!; comp.push(p); const px0 = p % w, py0 = (p / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = px0 + dx, yy = py0 + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (mask[q] && !lab[q]) { lab[q] = 1; stack.push(q); } } }
    if (comp.length < minPx) for (const p of comp) mask[p] = 0;
  }
""" + s[b:]

# 4. density
s = s.replace("coverage: u ? r / u : 0,", "density: u ? ((r * 1.15) / ppm) / (u * pxCm2) : 0,", 1)
s = s.replace("usable: number; coverage: number; low: boolean }", "usable: number; density: number; low: boolean }", 1)
s = s.replace("<strong>${z.low ? '-' : `${num(z.coverage * 100, 1)}%`}</strong>", "<strong>${z.low ? '-' : `${num(z.density, 0)}`}</strong>", 1)
s = s.replace("T('of the usable skin is covered by detected lines', 'kulit terpakai yang tertutup garis terdeteksi')", "T('mm of line per cm² of usable skin', 'mm garis per cm² kulit terpakai')", 1)
s = s.replace("${T('Coverage is the share of usable skin that the line filter marks, at about ', 'Cakupan adalah bagian kulit terpakai yang ditandai filter garis, pada sekitar ')}", "${T('Density is the length of detected line per area of usable skin, at about ', 'Kepadatan adalah panjang garis terdeteksi per luas kulit terpakai, pada sekitar ')}", 1)
# 5. overlay: draw each line pixel two wide, softening mask a little wider
s = s.replace("if (rep.ridge[i]) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 143; id.data[i * 4 + 2] = 110; id.data[i * 4 + 3] = 235; }", "if (rep.ridge[i] || (i > 0 && rep.ridge[i - 1]) || (i >= rep.w && rep.ridge[i - rep.w])) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 143; id.data[i * 4 + 2] = 110; id.data[i * 4 + 3] = 235; }", 1)
s = s.replace("const m = blur(m0, w, h, 1.3); for (let i = 0; i < m.length; i++) m[i] = Math.min(1, m[i] * 3);", "const m = blur(m0, w, h, 2.2); for (let i = 0; i < m.length; i++) m[i] = Math.min(1, m[i] * 5);", 1)
p.write_text(s, encoding="utf8")
print("ok")
