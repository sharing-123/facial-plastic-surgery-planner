import type { P2 } from '../clinical/rstl';
import { FaceFrame, pxPerMm } from '../clinical/face';
import { detectFace } from './landmarker';
import { loadPhotoFile, loadPhotoUrl } from './photo';
import { compareSlider } from './warp';
import { T, esc } from './panels';
import { lang, num } from '../i18n';

/**
 * Skin lines from one photograph: a multi-scale Hessian ridge filter finds thin dark lines inside zones placed from the landmarks
 * (forehead, glabella, crow's feet, under the eyes, nasolabial). The result is a measurement of visible lines at rest: it is not an age
 * estimate and not a treatment decision. A softening preview fills the lines from the skin around them. It is an illustration of the size of
 * the effect, not a prediction of what a treatment would do. Lighting, make-up, beard, pores and compression create or hide lines.
 */
interface Zone { key: string; en: string; id: string; poly: P2[]; dynamic: boolean }
export interface ZoneRes { key: string; en: string; id: string; dynamic: boolean; areaCm2: number; usable: number; coverage: number; low: boolean }
export interface WrinkleReport { w: number; h: number; ppm: number; zones: ZoneRes[]; ridge: Uint8Array; zoneId: Uint8Array; skin: Uint8Array; lowRes: boolean; work: HTMLCanvasElement }

const MIN_PPM = 3.0, FINE = [0.4, 0.6], FOLD = [1.1, 1.9];
const FINE_T = 0.10, FOLD_T = 0.40, MIN_USABLE = 0.35;

function zonesFrom(L: P2[]): Zone[] {
  const ocw = Math.hypot(L[263][0] - L[33][0], L[263][1] - L[33][1]);
  const eyeY = (L[33][1] + L[263][1]) / 2, upY = Math.min(L[10][1], L[9][1]);
  const browTop = Math.min(L[105][1], L[334][1], L[66][1], L[296][1]);
  const poly = (...p: P2[]): P2[] => p;
  const side = (s: 1 | -1) => {
    const outer = s < 0 ? L[33] : L[263], mouth = s < 0 ? L[61] : L[291], alar = s < 0 ? L[129] : L[358];
    const lowLid = s < 0 ? L[145] : L[374];
    return { outer, mouth, alar, lowLid };
  };
  const R = side(-1), Lf = side(1);
  const nl = (S: ReturnType<typeof side>, s: 1 | -1) => poly([S.alar[0] + s * 0.02 * ocw, S.alar[1]], [S.alar[0] + s * 0.2 * ocw, S.alar[1] - 0.05 * ocw], [S.mouth[0] + s * 0.2 * ocw, S.mouth[1] + 0.12 * ocw], [S.mouth[0] + s * 0.02 * ocw, S.mouth[1] + 0.1 * ocw]);
  const cf = (S: ReturnType<typeof side>, s: 1 | -1) => poly([S.outer[0] + s * 0.04 * ocw, S.outer[1] - 0.2 * ocw], [S.outer[0] + s * 0.38 * ocw, S.outer[1] - 0.22 * ocw], [S.outer[0] + s * 0.4 * ocw, S.outer[1] + 0.3 * ocw], [S.outer[0] + s * 0.04 * ocw, S.outer[1] + 0.22 * ocw]);
  const ie = (S: ReturnType<typeof side>, s: 1 | -1) => poly([S.lowLid[0] - s * 0.22 * ocw, S.lowLid[1] + 0.04 * ocw], [S.lowLid[0] + s * 0.26 * ocw, S.lowLid[1] + 0.04 * ocw], [S.lowLid[0] + s * 0.28 * ocw, S.lowLid[1] + 0.3 * ocw], [S.lowLid[0] - s * 0.2 * ocw, S.lowLid[1] + 0.3 * ocw]);
  return [
    { key: 'forehead', en: 'Forehead', id: 'Dahi', dynamic: true, poly: poly([L[70][0], upY + (browTop - upY) * 0.12], [L[300][0], upY + (browTop - upY) * 0.12], [L[300][0], browTop - 0.03 * ocw], [L[70][0], browTop - 0.03 * ocw]) },
    { key: 'glabella', en: 'Between the brows (glabella)', id: 'Di antara alis (glabela)', dynamic: true, poly: poly([L[107][0] - 0.02 * ocw, browTop - 0.02 * ocw], [L[336][0] + 0.02 * ocw, browTop - 0.02 * ocw], [L[336][0] + 0.02 * ocw, eyeY - 0.06 * ocw], [L[107][0] - 0.02 * ocw, eyeY - 0.06 * ocw]) },
    { key: 'cfR', en: "Crow's feet, right", id: 'Kaki gagak, kanan', dynamic: true, poly: cf(R, -1) }, { key: 'cfL', en: "Crow's feet, left", id: 'Kaki gagak, kiri', dynamic: true, poly: cf(Lf, 1) },
    { key: 'ieR', en: 'Under the eye, right', id: 'Bawah mata, kanan', dynamic: false, poly: ie(R, -1) }, { key: 'ieL', en: 'Under the eye, left', id: 'Bawah mata, kiri', dynamic: false, poly: ie(Lf, 1) },
    { key: 'nlR', en: 'Nasolabial fold, right', id: 'Lipatan nasolabial, kanan', dynamic: false, poly: nl(R, -1) }, { key: 'nlL', en: 'Nasolabial fold, left', id: 'Lipatan nasolabial, kiri', dynamic: false, poly: nl(Lf, 1) },
  ];
}

function sepConv(src: Float32Array, w: number, h: number, kx: Float32Array, ky: Float32Array): Float32Array {
  const rx = (kx.length - 1) >> 1, ry = (ky.length - 1) >> 1, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -rx; k <= rx; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); s += src[y * w + xx] * kx[k + rx]; } tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -ry; k <= ry; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); s += tmp[yy * w + x] * ky[k + ry]; } out[y * w + x] = s;
  }
  return out;
}
function kernels(sigma: number): { g: Float32Array; g1: Float32Array; g2: Float32Array } {
  const r = Math.max(2, Math.ceil(3 * sigma)), n = 2 * r + 1, g = new Float32Array(n), g1 = new Float32Array(n), g2 = new Float32Array(n);
  let sum = 0;
  for (let i = -r; i <= r; i++) { const e = Math.exp(-(i * i) / (2 * sigma * sigma)); g[i + r] = e; sum += e; }
  for (let i = -r; i <= r; i++) { g[i + r] /= sum; g1[i + r] = (-i / (sigma * sigma)) * g[i + r]; g2[i + r] = ((i * i) / (sigma ** 4) - 1 / (sigma * sigma)) * g[i + r]; }
  return { g, g1, g2 };
}
function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array { const { g } = kernels(sigma); return sepConv(src, w, h, g, g); }

/** Strength of dark thin ridges at one scale (Frangi-style), per pixel. */
function ridge(g: Float32Array, w: number, h: number, sigma: number, c: number): Float32Array {
  const k = kernels(sigma), s2 = sigma * sigma;
  const hxx = sepConv(g, w, h, k.g2, k.g), hyy = sepConv(g, w, h, k.g, k.g2), hxy = sepConv(g, w, h, k.g1, k.g1);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const a = hxx[i] * s2, b = hyy[i] * s2, d = hxy[i] * s2, tmp = Math.sqrt(((a - b) / 2) ** 2 + d * d);
    const l1 = (a + b) / 2 + tmp, l2 = (a + b) / 2 - tmp;
    if (l1 <= 0) continue;
    const rb = Math.abs(l2) / (Math.abs(l1) + 1e-9), S2 = l1 * l1 + l2 * l2;
    out[i] = Math.exp(-(rb * rb) / 0.5) * (1 - Math.exp(-S2 / (2 * c * c)));
  }
  return out;
}

export function analyseWrinkles(photo: HTMLCanvasElement, lm: P2[], ppmPhoto: number): WrinkleReport {
  const fw = Math.abs(lm[454][0] - lm[234][0]), s = Math.min(1, 640 / fw);
  const w = Math.round(photo.width * s), h = Math.round(photo.height * s), ppm = ppmPhoto * s;
  const work = document.createElement('canvas'); work.width = w; work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(photo, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const L = lm.map(p => [p[0] * s, p[1] * s] as P2);
  const zones = zonesFrom(L);
  // zone labels drawn into a canvas (id in the red channel)
  const zc = document.createElement('canvas'); zc.width = w; zc.height = h;
  const zx = zc.getContext('2d', { willReadFrequently: true })!; zx.imageSmoothingEnabled = false;
  zones.forEach((z, i) => { zx.fillStyle = `rgb(${i + 1},0,0)`; zx.beginPath(); z.poly.forEach((p, k) => (k ? zx.lineTo(p[0], p[1]) : zx.moveTo(p[0], p[1]))); zx.closePath(); zx.fill(); });
  const zd = zx.getImageData(0, 0, w, h).data, zoneId = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) zoneId[i] = zd[i * 4] > 0 && zd[i * 4 + 3] > 250 ? zd[i * 4] : 0;
  // region of interest
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (zoneId[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  x0 = Math.max(0, x0 - 12); y0 = Math.max(0, y0 - 12); x1 = Math.min(w - 1, x1 + 12); y1 = Math.min(h - 1, y1 + 12);
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  // skin mask from chroma around the cheeks, and the green channel normalised by its local mean
  const samp: Array<[number, number, number]> = [];
  for (const i of [205, 425, 50, 280]) for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
    const xx = Math.round(L[i][0] + dx), yy = Math.round(L[i][1] + dy); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const o = (yy * w + xx) * 4; samp.push([px[o], px[o + 1], px[o + 2]]);
  }
  const med = (k: number) => { const a = samp.map(v => v[k]).sort((p, q) => p - q); return a[a.length >> 1] ?? 128; };
  const mr = med(0), mg = med(1), mb = med(2), skin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const r = px[i * 4], g2 = px[i * 4 + 1], b = px[i * 4 + 2]; skin[i] = Math.abs(r - mr) < 60 && Math.abs(g2 - mg) < 55 && Math.abs(b - mb) < 60 ? 1 : 0; }
  const g = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) g[y * rw + x] = px[((y + y0) * w + x + x0) * 4 + 1] / 255;
  // large-scale illumination, estimated on a reduced copy
  const f = 4, sw = Math.ceil(rw / f), sh = Math.ceil(rh / f), small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) small[y * sw + x] = g[Math.min(rh - 1, y * f) * rw + Math.min(rw - 1, x * f)];
  const bs = blur(small, sw, sh, Math.max(2, (10 * ppm) / f)), gn = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) gn[y * rw + x] = g[y * rw + x] / (bs[Math.min(sh - 1, (y / f) | 0) * sw + Math.min(sw - 1, (x / f) | 0)] + 1e-3);
  const fine = FINE.map(m => ridge(gn, rw, rh, Math.max(1, m * ppm), 0.02)), fold = FOLD.map(m => ridge(gn, rw, rh, Math.max(1.4, m * ppm), 0.02));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = (y + y0) * w + x + x0, j = y * rw + x; if (!zoneId[i] || !skin[i]) continue;
    let a = 0, b = 0; for (const r of fine) a = Math.max(a, r[j]); for (const r of fold) b = Math.max(b, r[j]);
    if (a > FINE_T || b > FOLD_T) mask[i] = 1;
  }
  // drop tiny fragments (skin texture) by connected-component size
  const lab = new Int32Array(w * h), minPx = Math.max(6, Math.round(5 * ppm)), stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    const comp: number[] = []; stack.push(i); lab[i] = 1;
    while (stack.length) { const p = stack.pop()!; comp.push(p); const px0 = p % w, py0 = (p / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = px0 + dx, yy = py0 + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (mask[q] && !lab[q]) { lab[q] = 1; stack.push(q); } } }
    if (comp.length < minPx) for (const p of comp) mask[p] = 0;
  }
  const pxCm2 = 1 / (ppm * ppm) / 100;
  const res: ZoneRes[] = zones.map((z, i) => {
    let n = 0, u = 0, r = 0;
    for (let k = 0; k < w * h; k++) if (zoneId[k] === i + 1) { n++; if (skin[k]) { u++; if (mask[k]) r++; } }
    const usable = n ? u / n : 0;
    return { key: z.key, en: z.en, id: z.id, dynamic: z.dynamic, areaCm2: n * pxCm2, usable, coverage: u ? r / u : 0, low: usable < MIN_USABLE };
  });
  return { w, h, ppm, zones: res, ridge: mask, zoneId, skin, lowRes: ppm < MIN_PPM, work };
}

/** Fills the detected lines from the skin around them (mask-aware blur), by `strength` 0..1. */
export function softened(rep: WrinkleReport, strength: number): HTMLCanvasElement {
  const { w, h, work } = rep, ctx = work.getContext('2d', { willReadFrequently: true })!, src = ctx.getImageData(0, 0, w, h), out = ctx.createImageData(w, h);
  // dilated line mask with a soft edge
  const m0 = new Float32Array(w * h); for (let i = 0; i < w * h; i++) m0[i] = rep.ridge[i];
  const m = blur(m0, w, h, 1.3); for (let i = 0; i < m.length; i++) m[i] = Math.min(1, m[i] * 3);
  const keep = new Float32Array(w * h); for (let i = 0; i < w * h; i++) keep[i] = m[i] > 0.05 ? 0 : 1;
  const sg = Math.max(3, rep.ppm * 1.6);
  const den = blur(keep, w, h, sg);
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(w * h); for (let i = 0; i < w * h; i++) ch[i] = src.data[i * 4 + c] * keep[i];
    const num = blur(ch, w, h, sg);
    for (let i = 0; i < w * h; i++) { const fill = den[i] > 0.02 ? num[i] / den[i] : src.data[i * 4 + c]; out.data[i * 4 + c] = src.data[i * 4 + c] * (1 - strength * m[i]) + fill * strength * m[i]; }
  }
  for (let i = 0; i < w * h; i++) out.data[i * 4 + 3] = 255;
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.putImageData(out, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ tab */
const st = { photo: null as HTMLCanvasElement | null, name: '', rep: null as WrinkleReport | null, busy: false, strength: 0.85, overlay: true, msg: '', onChange: () => { /* set on mount */ } };
const el = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;

export function mountWrinkles(host: HTMLElement, onChange: () => void): void {
  st.onChange = onChange;
  host.innerHTML = `<div class="mv"><div class="mv-stage"><canvas id="wr-cv" width="720" height="720"></canvas>
      <div class="mv-empty" id="wr-empty"><h2>${T('Skin lines from one photo', 'Garis kulit dari satu foto')}</h2>
        <p>${T('Choose a front photograph with even light and no make-up, taken close enough that the skin shows fine detail. The lines are found in the forehead, between the brows, crow\'s feet, under the eyes and the nasolabial folds.', 'Pilih foto depan dengan cahaya merata dan tanpa make-up, diambil cukup dekat sehingga detail kulit terlihat. Garis dicari di dahi, antara alis, kaki gagak, bawah mata dan lipatan nasolabial.')}</p></div>
      <div class="mv-prompt" id="wr-prompt" hidden></div></div>
    <div class="mv-ctl"><button class="btn small" data-wr="file">${T('Choose a front photo', 'Pilih foto depan')}</button><input type="file" id="wr-file" accept="image/jpeg,image/png,image/webp" hidden>
      <button class="btn ghost small" data-wr="overlay">${T('Show or hide the lines', 'Tampil atau sembunyikan garis')}</button></div></div>`;
  const file = el<HTMLInputElement>('wr-file');
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { const p = await loadPhotoFile(f); await run(p.canvas, f.name); } catch { st.msg = T('The file could not be read as an image.', 'Berkas tidak bisa dibaca sebagai gambar.'); draw(); } });
  host.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-wr]'); if (!b) return; if (b.dataset.wr === 'file') file.click(); else { st.overlay = !st.overlay; draw(); } });
  draw();
}

export async function runWrinkleUrl(url: string, name: string): Promise<void> { const p = await loadPhotoUrl(url, name); await run(p.canvas, name); }

async function run(c: HTMLCanvasElement, name: string): Promise<void> {
  st.photo = c; st.name = name; st.rep = null; st.busy = true; st.msg = ''; draw(); st.onChange();
  await new Promise(r => setTimeout(r, 30));
  const det = await detectFace(c).catch(() => ({ landmarks: [] }));
  if (!det.landmarks.length) { st.busy = false; st.msg = T('No face was found in the photo.', 'Wajah tidak ditemukan pada foto.'); draw(); st.onChange(); return; }
  const lm = det.landmarks.map(p => [p.x * c.width, p.y * c.height] as P2);
  const ppm = new FaceFrame(lm, pxPerMm(lm)).scale;
  await new Promise(r => setTimeout(r, 30));
  st.rep = analyseWrinkles(c, lm, ppm); st.busy = false; draw(); st.onChange();
}

function draw(): void {
  const cv = el<HTMLCanvasElement>('wr-cv'); if (!cv) return;
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, cv.width, cv.height);
  el('wr-empty').hidden = !!st.photo;
  const pr = el('wr-prompt'); pr.hidden = !st.busy && !st.msg; pr.textContent = st.busy ? T('Finding the lines…', 'Mencari garis…') : st.msg;
  if (!st.photo) return;
  const rep = st.rep, src = rep ? rep.work : st.photo, k = Math.min(cv.width / src.width, cv.height / src.height), ox = (cv.width - src.width * k) / 2, oy = (cv.height - src.height * k) / 2;
  ctx.drawImage(src, ox, oy, src.width * k, src.height * k);
  if (rep && st.overlay) {
    const o = document.createElement('canvas'); o.width = rep.w; o.height = rep.h; const ox2 = o.getContext('2d')!, id = ox2.createImageData(rep.w, rep.h);
    for (let i = 0; i < rep.w * rep.h; i++) { if (rep.ridge[i]) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 143; id.data[i * 4 + 2] = 110; id.data[i * 4 + 3] = 235; } else if (rep.zoneId[i]) { id.data[i * 4] = 95; id.data[i * 4 + 1] = 232; id.data[i * 4 + 2] = 200; id.data[i * 4 + 3] = 22; } }
    ox2.putImageData(id, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(o, ox, oy, rep.w * k, rep.h * k);
  }
  ctx.font = '12px "JetBrains Mono", monospace'; ctx.fillStyle = '#5fe8c8'; ctx.fillText(st.name, 12, cv.height - 12);
}

export function wrinkleHtml(): string {
  const lead = `<div class="mv-badge photo">${T('Photo is enough for lines at rest', 'Foto cukup untuk garis saat istirahat')}</div>`;
  if (!st.photo) return `${lead}<div class="banner">${T('Choose a front photograph to map the skin lines.', 'Pilih foto depan untuk memetakan garis kulit.')}</div>`;
  if (st.busy) return `${lead}<p class="fine">${T('Finding the lines…', 'Mencari garis…')}</p>`;
  const r = st.rep; if (!r) return `${lead}<div class="banner bad">${esc(st.msg)}</div>`;
  const L = lang() === 'id' ? 'id' : 'en';
  const rows = r.zones.map(z => `<div class="ns-row ${z.low ? 'lo' : ''}"><div><b>${esc(z[L])}</b><span>${num(z.areaCm2, 1)} cm² · ${T('usable skin', 'kulit terpakai')} ${Math.round(z.usable * 100)}%</span></div><strong>${z.low ? '-' : `${num(z.coverage * 100, 1)}%`}</strong><em>${z.low ? T('too little skin in view (hair, shadow, glasses); not read', 'terlalu sedikit kulit terlihat (rambut, bayangan, kacamata); tidak dibaca') : T('of the usable skin is covered by detected lines', 'kulit terpakai yang tertutup garis terdeteksi')}</em></div>`).join('');
  return `${lead}
    ${r.lowRes ? `<div class="banner bad">${T('The photo is too small for fine lines: under 3 pixels per millimetre. Use a closer or larger photograph.', 'Foto terlalu kecil untuk garis halus: kurang dari 3 piksel per milimeter. Pakai foto yang lebih dekat atau lebih besar.')}</div>` : ''}
    <section class="mv-card"><h5>${T('Visible lines at rest, by zone', 'Garis terlihat saat istirahat, per zona')}</h5>${rows}
      <p class="fine">${T('Coverage is the share of usable skin that the line filter marks, at about ', 'Cakupan adalah bagian kulit terpakai yang ditandai filter garis, pada sekitar ')}${num(r.ppm, 1)} ${T('pixels per millimetre', 'piksel per milimeter')}. ${T('Compare photographs only under the same light, distance and camera.', 'Bandingkan foto hanya dengan cahaya, jarak dan kamera yang sama.')}</p></section>
    <section class="mv-card"><h5>${T('Softening preview (illustration)', 'Pratinjau penghalusan (ilustrasi)')}</h5><div id="wr-cmp"></div>
      <label class="ns-in">${T('Amount', 'Jumlah')} <input type="range" id="wr-amt" min="0" max="100" step="5" value="${Math.round(st.strength * 100)}"><b>${Math.round(st.strength * 100)}%</b></label>
      <p class="fine">${T('The lines are filled from the skin around them. It shows how much of the picture the lines occupy, not what a treatment would achieve: results depend on the cause, the depth, the skin and the method.', 'Garis diisi dari kulit di sekitarnya. Ini menunjukkan seberapa besar bagian gambar yang diduduki garis, bukan hasil suatu terapi: hasil bergantung pada penyebab, kedalaman, kulit dan metode.')}</p></section>
    <details class="acc ref" open><summary>${T('Why a photo is not the whole story', 'Mengapa foto bukan seluruh cerita')}</summary><div class="accb"><ul class="ref-ul">
      <li>${T('Forehead, glabella and crow\'s feet lines are mostly dynamic: they deepen with expression. A rest photo cannot tell a dynamic line from a static one. Take photographs raising the brows, frowning and smiling, or a short video, and compare.', 'Garis dahi, glabela dan kaki gagak sebagian besar dinamis: makin dalam saat berekspresi. Foto istirahat tidak bisa membedakan garis dinamis dari statis. Ambil foto saat mengangkat alis, mengerutkan dahi dan tersenyum, atau video singkat, lalu bandingkan.')}</li>
      <li>${T('Nasolabial and under-eye lines mostly reflect volume loss and skin quality, and are static.', 'Garis nasolabial dan bawah mata sebagian besar mencerminkan hilangnya volume dan kualitas kulit, dan bersifat statis.')}</li></ul></div></details>
    ${wrinkleReference()}`;
}

function wrinkleReference(): string {
  const i = lang() === 'id' ? 1 : 0;
  const items: Array<[[string, string], [string, string]]> = [
    [['Mainly dynamic lines (forehead, glabella, crow\'s feet)', 'Garis dinamis (dahi, glabela, kaki gagak)'], ['Botulinum toxin is the usual choice; dose and points are individual, and a heavy brow needs care in the forehead.', 'Toksin botulinum adalah pilihan lazim; dosis dan titik bersifat individual, dan alis yang berat butuh kehati-hatian di dahi.']],
    [['Static folds with volume loss (nasolabial, marionette, tear trough)', 'Lipatan statis dengan hilangnya volume (nasolabial, marionette, tear trough)'], ['Volume with hyaluronic acid filler or fat, or lifting procedures. Filler near the nose and glabella carries a real risk of vascular occlusion.', 'Pengisian volume dengan filler asam hialuronat atau lemak, atau prosedur lifting. Filler dekat hidung dan glabela berisiko nyata oklusi vaskular.']],
    [['Fine lines and skin quality', 'Garis halus dan kualitas kulit'], ['Sun protection, topical retinoids, chemical peels, microneedling and laser resurfacing; deeper resurfacing has longer downtime and a risk of pigment change, so darker skin needs a careful choice of method.', 'Tabir surya, retinoid topikal, peeling kimia, microneedling dan laser resurfacing; resurfacing lebih dalam butuh pemulihan lebih lama dan berisiko perubahan pigmen, jadi kulit lebih gelap perlu pemilihan metode yang cermat.']],
  ];
  return `<details class="acc ref" open><summary>${T('What is usually done for lines', 'Apa yang lazim dikerjakan untuk garis')}</summary><div class="accb">${items.map(([a, b]) => `<h5>${esc(a[i])}</h5><ul class="ref-ul"><li>${esc(b[i])}</li></ul>`).join('')}<p class="fine">${T('Textbook reference for a clinician, not derived from the measurements above and not a recommendation for one patient.', 'Rujukan buku ajar untuk dokter, tidak diturunkan dari pengukuran di atas dan bukan rekomendasi untuk satu pasien.')}</p></div></details>`;
}

/** Builds the before and after slider and hooks the amount slider after the results HTML is in the page. */
export function wireWrinkles(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#wr-cmp'), r = st.rep; if (!host || !r) return;
  const build = () => { host.innerHTML = ''; host.appendChild(compareSlider(r.work, softened(r, st.strength), T('Now', 'Sekarang'), T('Softened (illustration)', 'Dihaluskan (ilustrasi)'))); };
  build();
  const amt = root.querySelector<HTMLInputElement>('#wr-amt');
  amt?.addEventListener('input', () => { const b = amt.nextElementSibling; if (b) b.textContent = `${amt.value}%`; });
  amt?.addEventListener('change', () => { st.strength = Number(amt.value) / 100; build(); });
}
export const hasWrinkles = (): boolean => !!st.photo;
