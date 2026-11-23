import { FaceFrame, pxPerMm } from '../clinical/face';
import type { P2 } from '../clinical/rstl';
import { detectFace } from './landmarker';
import { loadPhotoFile, loadPhotoUrl } from './photo';
import { compareSlider } from './warp';
import { cleftReference } from './reference';
import { T, esc } from './panels';
import { lang, num } from '../i18n';

/**
 * Cleft tab: unilateral cleft-lip symmetry from twelve points clicked on a front photo (a port of the Python prototype). The face model
 * is not trained on clefts and misplaces lip and nose points, so the points are clicked; the model is used only for roll and the
 * millimetre scale (the iris, 11.7 mm, which a cleft does not distort). Ratios and differences only: no severity grade, no aesthetic
 * score, no operation chosen. Right and left are the patient's.
 */
const POINTS: Array<[string, string, string]> = [
  ['nasion', 'Nasion (midline between the eyes)', 'Nasion (garis tengah di antara mata)'],
  ['prn', 'Pronasale (nasal tip)', 'Pronasale (ujung hidung)'],
  ['sn', 'Subnasale (columella base)', 'Subnasale (dasar kolumela)'],
  ['sbal_R', 'Subalare, patient right (alar base)', 'Subalare, kanan pasien (dasar alar)'],
  ['sbal_L', 'Subalare, patient left', 'Subalare, kiri pasien'],
  ['al_R', 'Alare, patient right (most lateral alar point)', 'Alare, kanan pasien (titik alar paling lateral)'],
  ['al_L', 'Alare, patient left', 'Alare, kiri pasien'],
  ['cph_R', "Cupid's bow peak, patient right", 'Puncak busur Cupid, kanan pasien'],
  ['cph_L', "Cupid's bow peak, patient left", 'Puncak busur Cupid, kiri pasien'],
  ['ls', "Labiale superius (centre of the Cupid's bow)", 'Labiale superius (tengah busur Cupid)'],
  ['ch_R', 'Cheilion (mouth corner), patient right', 'Cheilion (sudut mulut), kanan pasien'],
  ['ch_L', 'Cheilion (mouth corner), patient left', 'Cheilion (sudut mulut), kiri pasien'],
];
const KEYS = POINTS.map(p => p[0]);
type K = (typeof KEYS)[number];

const st = {
  pair: null as HTMLCanvasElement | null, palate: false,
  img: null as HTMLCanvasElement | null, w: 0, h: 0, name: '', pts: {} as Record<K, P2>, frame: null as FaceFrame | null,
  drag: null as K | null, onChange: () => { /* set on mount */ },
};
const el = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;
const ratio = (a: number, b: number): number | null => (Math.max(a, b) > 0 ? Math.min(a, b) / Math.max(a, b) : null);

interface Row { key: string; en: string; id: string; R?: number; L?: number; v?: number; ratio?: number | null; unit: string; band?: [number, number] }
function measure(): Row[] | null {
  const f = st.frame; if (!f || !KEYS.every(k => st.pts[k])) return null;
  const q: Record<string, P2> = {}; for (const k of KEYS) q[k] = f.toMM(st.pts[k]);
  const mid = q.nasion[0], p: Record<string, P2> = {}; for (const k of KEYS) p[k] = [q[k][0] - mid, q[k][1]];
  const d = (a: string, b: string) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]);
  const pair = (key: string, en: string, id: string, R: number, L: number): Row => ({ key, en, id, R, L, ratio: ratio(R, L), unit: 'mm' });
  const tilt = (Math.atan2(p.cph_L[1] - p.cph_R[1], p.cph_L[0] - p.cph_R[0]) * 180) / Math.PI;
  const col = [p.prn[0] - p.sn[0], p.prn[1] - p.sn[1]];
  return [
    pair('lip', 'Lateral lip height (alar base to Cupid\'s bow peak)', 'Tinggi bibir lateral (dasar alar ke puncak busur Cupid)', d('sbal_R', 'cph_R'), d('sbal_L', 'cph_L')),
    pair('bow', "Cupid's bow peak to subnasale", 'Puncak busur Cupid ke subnasale', d('cph_R', 'sn'), d('cph_L', 'sn')),
    pair('alar', 'Alar base to midline', 'Dasar alar ke garis tengah', Math.abs(p.sbal_R[0]), Math.abs(p.sbal_L[0])),
    pair('alare', 'Alare to subnasale (width of the nostril floor side)', 'Alare ke subnasale (sisi lantai nostril)', Math.abs(p.al_R[0] - p.sn[0]), Math.abs(p.al_L[0] - p.sn[0])),
    pair('comm', 'Mouth corner to midline', 'Sudut mulut ke garis tengah', Math.abs(p.ch_R[0]), Math.abs(p.ch_L[0])),
    { key: 'bowlvl', en: "Cupid's bow level difference", id: 'Beda tinggi busur Cupid', v: Math.abs(p.cph_L[1] - p.cph_R[1]), unit: 'mm', band: [1, 2] },
    { key: 'tilt', en: "Cupid's bow tilt", id: 'Kemiringan busur Cupid', v: Math.abs(tilt), unit: '°', band: [3, 6] },
    { key: 'commlvl', en: 'Mouth corner level difference', id: 'Beda tinggi sudut mulut', v: Math.abs(p.ch_L[1] - p.ch_R[1]), unit: 'mm', band: [1, 2] },
    { key: 'alarlvl', en: 'Alar base level difference', id: 'Beda tinggi dasar alar', v: Math.abs(p.sbal_L[1] - p.sbal_R[1]), unit: 'mm', band: [1, 2] },
    { key: 'tip', en: 'Nasal tip deviation from the midline', id: 'Deviasi ujung hidung dari garis tengah', v: Math.abs(p.prn[0]), unit: 'mm', band: [2, 4] },
    { key: 'colum', en: 'Columella deviation', id: 'Deviasi kolumela', v: Math.abs((Math.atan2(col[0], col[1]) * 180) / Math.PI), unit: '°', band: [5, 10] },
  ];
}

const gcol = (r: Row): 'g' | 'y' | 'r' => {
  if (r.R != null && r.L != null) { const q = ratio(r.R, r.L); return q == null ? 'g' : q >= 0.9 ? 'g' : q >= 0.8 ? 'y' : 'r'; }
  const v = r.v ?? 0, [a, b] = r.band!; return v <= a ? 'g' : v <= b ? 'y' : 'r';
};

async function setImage(c: HTMLCanvasElement, name: string): Promise<void> {
  st.pair = null; st.palate = false;
  st.img = c; st.w = c.width; st.h = c.height; st.name = name; st.pts = {} as Record<K, P2>; st.frame = null;
  const det = await detectFace(c).catch(() => ({ landmarks: [] }));
  if (det.landmarks.length) { const lm = det.landmarks.map(p => [p.x * c.width, p.y * c.height] as P2); st.frame = new FaceFrame(lm, pxPerMm(lm)); }
  refresh();
}

export function mountCleft(host: HTMLElement, onChange: () => void): void {
  st.onChange = onChange;
  host.innerHTML = `<div class="mv"><div class="mv-stage"><canvas id="cl-cv" width="640" height="640"></canvas>
      <div class="mv-empty" id="cl-empty"><h2>${T('Cleft lip symmetry from a front photo', 'Simetri bibir sumbing dari foto depan')}</h2>
        <p>${T('Choose a front photograph, then click twelve points in order. The face model is not trained on clefts, so the lip and nose points are yours; it is used only for roll and the millimetre scale from the iris.', 'Pilih foto depan, lalu klik dua belas titik berurutan. Model wajah tidak dilatih pada sumbing, jadi titik bibir dan hidung dari Anda; model hanya dipakai untuk koreksi miring dan skala mm dari iris.')}</p></div>
      <div class="mv-prompt" id="cl-prompt" hidden></div></div>
    <div class="mv-ctl"><button class="btn small" data-cl="file">${T('Choose a front photo', 'Pilih foto depan')}</button><input type="file" id="cl-file" accept="image/jpeg,image/png,image/webp" hidden>
      <button class="btn ghost small" data-cl="reset">${T('Clear points', 'Hapus titik')}</button></div></div>`;
  const file = el<HTMLInputElement>('cl-file');
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { const p = await loadPhotoFile(f); await setImage(p.canvas, f.name); } catch { alert(T('The file could not be read as an image.', 'Berkas tidak bisa dibaca sebagai gambar.')); } });
  host.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cl]'); if (!b) return;
    if (b.dataset.cl === 'file') file.click(); else if (b.dataset.cl === 'reset') { st.pts = {} as Record<K, P2>; refresh(); }
  });
  const cv = el<HTMLCanvasElement>('cl-cv');
  const xf = () => { const k = Math.min(cv.width / st.w, cv.height / st.h); return { k, ox: (cv.width - st.w * k) / 2, oy: (cv.height - st.h * k) / 2 }; };
  const at = (e: PointerEvent): P2 => { const r = cv.getBoundingClientRect(), t = xf(), s = cv.width / r.width; return [((e.clientX - r.left) * s - t.ox) / t.k, ((e.clientY - r.top) * s - t.oy) / t.k]; };
  cv.addEventListener('pointerdown', e => {
    if (!st.img || st.palate) return; const p = at(e), t = xf();
    const hit = KEYS.find(k => st.pts[k] && Math.hypot(st.pts[k][0] - p[0], st.pts[k][1] - p[1]) * t.k < 12);
    if (hit) { st.drag = hit; cv.setPointerCapture(e.pointerId); return; }
    const next = KEYS.find(k => !st.pts[k]); if (next) { st.pts[next] = p; refresh(); }
  });
  cv.addEventListener('pointermove', e => { if (st.drag) { st.pts[st.drag] = at(e); refresh(); } });
  cv.addEventListener('pointerup', () => { st.drag = null; });
  refresh();
}

function refresh(): void {
  const cv = el<HTMLCanvasElement>('cl-cv'); if (!cv) return;
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, cv.width, cv.height);
  el('cl-empty').hidden = !!st.img;
  if (st.img) {
    const k = Math.min(cv.width / st.w, cv.height / st.h), ox = (cv.width - st.w * k) / 2, oy = (cv.height - st.h * k) / 2;
    ctx.drawImage(st.img, ox, oy, st.w * k, st.h * k);
    const next = KEYS.find(x => !st.pts[x]); const pr = el('cl-prompt'); pr.hidden = !next || st.palate;
    if (next && !st.palate) pr.textContent = `${KEYS.indexOf(next) + 1}/12 · ${POINTS[KEYS.indexOf(next)][lang() === 'id' ? 2 : 1]}`;
    ctx.font = '11px "JetBrains Mono", monospace';
    for (const key of KEYS) { const p = st.pts[key]; if (!p) continue; ctx.fillStyle = key.endsWith('_R') ? '#5fe8c8' : key.endsWith('_L') ? '#ff8f6e' : '#fff'; ctx.beginPath(); ctx.arc(ox + p[0] * k, oy + p[1] * k, 3.5, 0, 6.283); ctx.fill(); }
    if (KEYS.every(x => st.pts[x])) {
      ctx.strokeStyle = 'rgba(200,255,240,0.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
      const X = (a: string) => [ox + st.pts[a][0] * k, oy + st.pts[a][1] * k] as const;
      for (const [a, b] of [['cph_R', 'cph_L'], ['ch_R', 'ch_L'], ['sbal_R', 'sbal_L']]) { ctx.beginPath(); ctx.moveTo(...X(a)); ctx.lineTo(...X(b)); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#5fe8c8'; ctx.fillText(st.name, 12, cv.height - 12);
  }
  st.onChange();
}

export function cleftHtml(): string {
  const lead = `<div class="mv-badge photo">${T('Photo is enough', 'Foto cukup')}</div>`;
  if (!st.img) return `${lead}<div class="banner">${T('Choose a front photo, or use the synthetic test, then click the twelve points in order.', 'Pilih foto depan, atau pakai uji sintetis, lalu klik dua belas titik berurutan.')}</div>`;
  if (st.palate) return `${lead}<div class="banner">${T('A photograph of the palate shows what is there but cannot measure it: the cleft of the palate is described by its extent (soft palate only, hard and soft palate, with or without the lip), found by examination. Below is what is usually done and when.', 'Foto langit-langit memperlihatkan keadaannya tetapi tidak bisa mengukurnya: celah langit-langit digambarkan menurut luasnya (hanya langit-langit lunak, keras dan lunak, dengan atau tanpa bibir), ditemukan lewat pemeriksaan. Di bawah ini apa yang lazim dikerjakan dan kapan.')}</div>${cleftReference()}`;
  const rows = measure();
  if (!rows) return `${lead}<p class="fine">${st.frame ? T('Click all twelve points. The scale comes from the iris.', 'Klik kedua belas titik. Skala dari iris.') : T('No face was found for the scale, so distances cannot be given in mm. Try a clearer front photo.', 'Wajah tidak ditemukan untuk skala, jadi jarak tidak bisa dalam mm. Coba foto depan yang lebih jelas.')}</p>`;
  const L = lang() === 'id' ? 'id' : 'en';
  const col = (c: string) => `<i class="tl ${c}"></i>`;
  const body = rows.map(r => {
    const c = gcol(r);
    return r.R != null ? `<tr><td>${esc(r[L])}</td><td class="n">${num(r.R!, 1)}</td><td class="n">${num(r.L!, 1)}</td><td class="n">${r.ratio != null ? num(r.ratio, 2) : '-'}</td><td>${col(c)}</td></tr>`
      : `<tr><td>${esc(r[L])}</td><td class="n" colspan="3">${num(r.v!, 1)} ${r.unit}</td><td>${col(c)}</td></tr>`;
  }).join('');
  return `${lead}
    <section class="mv-card"><h5>${T('Right against left (patient\'s sides)', 'Kanan lawan kiri (sisi pasien)')}</h5>
      <table class="tbl cl-t"><thead><tr><th></th><th>${T('Right', 'Kanan')}</th><th>${T('Left', 'Kiri')}</th><th>${T('Min/max', 'Min/maks')}</th><th></th></tr></thead><tbody>${body}</tbody></table>
      <p class="fine">${T('Green, yellow and red are prototype screening bands (ratio 0.90 and 0.80; 1 to 2 mm; 3 to 6°), not clinical cut-offs. The scale comes from the iris (11.7 mm, about ±5%). There is no severity grade, no aesthetic score and no operation chosen: established cleft scales are rated by trained clinicians, and nothing here has been validated against them.', 'Hijau, kuning, dan merah adalah pita skrining prototipe (rasio 0,90 dan 0,80; 1 sampai 2 mm; 3 sampai 6°), bukan batas klinis. Skala dari iris (11,7 mm, sekitar ±5%). Tidak ada derajat keparahan, skor estetika, atau operasi yang dipilih: skala sumbing yang mapan dinilai dokter terlatih, dan tidak ada di sini yang divalidasi terhadapnya.')}</p></section>
    ${st.pair ? `<section class="mv-card"><h5>${T('Before and after repair (real photographs)', 'Sebelum dan sesudah perbaikan (foto nyata)')}</h5><div id="cl-cmp"></div><p class="fine">${T('The reading above is for the first photograph. The second shows the same child after the lip repair.', 'Pembacaan di atas untuk foto pertama. Foto kedua menunjukkan anak yang sama setelah perbaikan bibir.')}</p></section>` : ''}
    <p class="fine">${T('For infants the iris-based millimetre scale is approximate; the min/max ratios do not depend on it.', 'Untuk bayi, skala mm dari iris hanya perkiraan; rasio min/maks tidak bergantung padanya.')}</p>
    ${cleftReference()}`;
}

export function paintCleft(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('#cl-cmp');
  if (host && st.pair && st.img) {
    const a = document.createElement('canvas'); a.width = st.img.width; a.height = st.img.height; a.getContext('2d')!.drawImage(st.img, 0, 0);
    const b = document.createElement('canvas'); b.width = a.width; b.height = a.height; b.getContext('2d')!.drawImage(st.pair, 0, 0, a.width, a.height);
    host.appendChild(compareSlider(a, b, T('Before', 'Sebelum'), T('After', 'Sesudah')));
  }
}
export const hasCleft = (): boolean => !!st.img;

/** A real photograph with the twelve points pre-placed (as fractions of the picture) for the clinician to confirm or drag. */
export async function loadCleftUrl(url: string, name: string, frac?: Record<string, [number, number]>, opts: { pairUrl?: string; palate?: boolean } = {}): Promise<void> {
  const p = await loadPhotoUrl(url, name);
  await setImage(p.canvas, name);
  if (opts.palate) { st.palate = true; st.pts = {} as Record<K, P2>; }
  if (opts.pairUrl) st.pair = (await loadPhotoUrl(opts.pairUrl, 'after')).canvas;
  if (frac) { for (const k of KEYS) if (frac[k]) st.pts[k] = [frac[k][0] * st.w, frac[k][1] * st.h]; }
  refresh();
}
