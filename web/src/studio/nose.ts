import { loadPhotoFile, loadPhotoUrl } from './photo';
import { T, esc } from './panels';
import { compareSlider, warpPush, type Push } from './warp';
import { noseReference } from './reference';
import { lang, num } from '../i18n';

/**
 * Nose tab: projection and tip rotation cannot be measured from a front photograph, so this tab works on a side-view (profile) photo.
 * The clinician marks eight points; the angles and the Goode ratio are computed from them, and a planned profile is drawn as a
 * line illustration. It shows geometry only: skin thickness, cartilage and the airway decide what is possible, and no verdict is given.
 */
type P = [number, number];
const KEYS = ['G', 'N', 'Prn', 'Cm', 'Sn', 'Ls', 'Pg', 'Ac'] as const;
type Key = (typeof KEYS)[number];
const NAMES: Record<Key, [string, string]> = {
  G: ['Glabella', 'Glabela'], N: ['Nasion (deepest point of the root)', 'Nasion (titik terdalam pangkal hidung)'], Prn: ['Pronasale (nose tip)', 'Pronasale (ujung hidung)'],
  Cm: ['Columella (most anterior point of the columella)', 'Kolumela (titik paling depan kolumela)'], Sn: ['Subnasale', 'Subnasale'], Ls: ['Labrale superius (upper lip)', 'Labrale superius (bibir atas)'],
  Pg: ['Pogonion (chin point)', 'Pogonion (titik dagu)'], Ac: ['Alar crease (where the wing meets the cheek)', 'Lipatan alar (sayap hidung bertemu pipi)'],
};

const st = { after: null as { img: HTMLCanvasElement; pts: Partial<Record<Key, P>> } | null, img: null as HTMLCanvasElement | HTMLImageElement | null, w: 0, h: 0, pts: {} as Partial<Record<Key, P>>, drag: null as Key | null, name: '', demo: false, target: 0.57, aug: 4, noseMm: null as number | null, onChange: () => { /* set on mount */ } };
const angle = (a: P, v: P, b: P): number => { const x = [a[0] - v[0], a[1] - v[1]], y = [b[0] - v[0], b[1] - v[1]]; return (Math.acos(Math.max(-1, Math.min(1, (x[0] * y[0] + x[1] * y[1]) / (Math.hypot(...x) * Math.hypot(...y) || 1)))) * 180) / Math.PI; };
const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function noseMetrics(p: Partial<Record<Key, P>> = st.pts): { nf: number; nl: number; goode: number; len: number; proj: number } | null {
  if (!KEYS.every(k => p[k])) return null;
  const P = p as Record<Key, P>;
  const len = dist(P.N, P.Prn), proj = Math.abs(P.Prn[0] - P.Ac[0]);
  return { nf: angle(P.G, P.N, P.Prn), nl: angle(P.Cm, P.Sn, P.Ls), goode: proj / len, len, proj };
}

/** The planned profile: tip moved forward until the Goode ratio reaches the target, and a small dorsal augmentation. Geometry only. */
function plan(): { prn: P; rhi: P; dorsal: [P, P, P]; shift: number } | null {
  const p = st.pts, m = noseMetrics(); if (!m) return null;
  const P = p as Record<Key, P>;
  const dir = P.Prn[0] >= P.N[0] ? 1 : -1;
  let prn: P = [...P.Prn];
  for (let i = 0; i < 12; i++) { const len = dist(P.N, prn); const want = st.target * len; const cur = Math.abs(prn[0] - P.Ac[0]); prn = [prn[0] + dir * (want - cur) * 0.6, prn[1]]; }
  if (Math.abs(prn[0] - P.Ac[0]) / dist(P.N, prn) < m.goode) prn = [...P.Prn]; // never plan a smaller nose than the current one
  const len = dist(P.N, prn), mid: P = [(P.N[0] + prn[0]) / 2, (P.N[1] + prn[1]) / 2];
  const t: P = [(prn[0] - P.N[0]) / len, (prn[1] - P.N[1]) / len], nrm: P = dir > 0 ? [t[1], -t[0]] : [-t[1], t[0]];
  const a = (st.aug / 100) * len;
  const rhi: P = [mid[0] + nrm[0] * a, mid[1] + nrm[1] * a];
  return { prn, rhi, dorsal: [P.N, rhi, prn], shift: (dist(prn, P.Prn) / m.len) * 100 };
}

/** The planned geometry applied to the picture itself as a smooth push (tip forward, dorsum up). An illustration, not a prediction. */
function simulate(): HTMLCanvasElement | null {
  const pl = plan(), m = noseMetrics(); if (!pl || !m || !st.img) return null;
  const P = st.pts as Record<Key, P>;
  const mid: P = [(P.N[0] + P.Prn[0]) / 2, (P.N[1] + P.Prn[1]) / 2], len = m.len;
  const tipDx = pl.prn[0] - P.Prn[0];
  const pushes: Push[] = [
    { x: P.Prn[0], y: P.Prn[1], dx: tipDx, dy: 0, sigma: 0.2 * len },
    { x: P.Cm[0], y: P.Cm[1], dx: tipDx * 0.55, dy: 0, sigma: 0.16 * len },
    { x: mid[0], y: mid[1], dx: pl.rhi[0] - mid[0], dy: pl.rhi[1] - mid[1], sigma: 0.22 * len },
  ];
  return warpPush(st.img as HTMLCanvasElement, pushes, 720);
}

const el = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;
function xf(cv: HTMLCanvasElement): { k: number; ox: number; oy: number } { const k = Math.min(cv.width / st.w, cv.height / st.h); return { k, ox: (cv.width - st.w * k) / 2, oy: (cv.height - st.h * k) / 2 }; }

export function mountNose(host: HTMLElement, onChange: () => void): void {
  st.onChange = onChange;
  host.innerHTML = `
    <div class="mv">
      <div class="mv-stage"><canvas id="ns-cv" width="640" height="640"></canvas>
        <div class="mv-empty" id="ns-empty"><h2>${T('Nose projection needs a side-view photo', 'Proyeksi hidung butuh foto tampak samping')}</h2>
          <p>${T('A front photograph cannot show how far the tip projects or how the tip is rotated. Take a true profile (the ear canal level with the eye, relaxed lips), then mark eight points.', 'Foto depan tidak menunjukkan seberapa maju ujung hidung atau seberapa berputar ujungnya. Ambil foto profil sejati (liang telinga sejajar mata, bibir rileks), lalu tandai delapan titik.')}</p></div>
        <div class="mv-prompt" id="ns-prompt" hidden></div>
      </div>
      <div class="mv-ctl">
        <button class="btn small" data-ns="file">${T('Choose a side photo', 'Pilih foto samping')}</button>
        <input type="file" id="ns-file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="btn ghost small" data-ns="reset">${T('Clear points', 'Hapus titik')}</button>
      </div>
    </div>`;
  const file = el<HTMLInputElement>('ns-file');
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = ''; if (!f) return;
    try { const p = await loadPhotoFile(f); st.img = p.canvas; st.w = p.width; st.h = p.height; st.pts = {}; st.name = f.name; st.demo = false; st.noseMm = null; st.after = null; refresh(); } catch { alert(T('The file could not be read as an image.', 'Berkas tidak bisa dibaca sebagai gambar.')); }
  });
  host.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ns]'); if (!b) return;
    if (b.dataset.ns === 'file') file.click();
    else if (b.dataset.ns === 'reset') { st.pts = {}; refresh(); }
  });
  const cv = el<HTMLCanvasElement>('ns-cv');
  const at = (e: PointerEvent): P => { const r = cv.getBoundingClientRect(), t = xf(cv), sx = cv.width / r.width; return [((e.clientX - r.left) * sx - t.ox) / t.k, ((e.clientY - r.top) * sx - t.oy) / t.k]; };
  cv.addEventListener('pointerdown', e => {
    if (!st.img) return; const p = at(e), t = xf(cv);
    const hit = KEYS.find(k => st.pts[k] && dist(st.pts[k]!, p) * t.k < 14);
    if (hit) { st.drag = hit; cv.setPointerCapture(e.pointerId); return; }
    const next = KEYS.find(k => !st.pts[k]); if (next) { st.pts[next] = p; refresh(); }
  });
  cv.addEventListener('pointermove', e => { if (st.drag) { st.pts[st.drag] = at(e); refresh(); } });
  cv.addEventListener('pointerup', () => { st.drag = null; });
  refresh();
}

function refresh(notify = true): void {
  const cv = el<HTMLCanvasElement>('ns-cv'); if (!cv) return;
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, cv.width, cv.height);
  el('ns-empty').hidden = !!st.img;
  const prompt = el('ns-prompt');
  if (st.img) {
    const t = xf(cv); ctx.drawImage(st.img, t.ox, t.oy, st.w * t.k, st.h * t.k);
    const P = (p: P): P => [t.ox + p[0] * t.k, t.oy + p[1] * t.k];
    const next = KEYS.find(k => !st.pts[k]);
    prompt.hidden = !next; if (next) prompt.textContent = `${KEYS.indexOf(next) + 1}/8 · ${NAMES[next][lang() === 'id' ? 1 : 0]}`;
    const m = noseMetrics(), pl = plan();
    if (m) {
      const p = st.pts as Record<Key, P>;
      // alar vertical and the projection distance
      ctx.strokeStyle = 'rgba(200,255,240,0.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      const a = P(p.Ac), tip = P(p.Prn); ctx.beginPath(); ctx.moveTo(a[0], a[1] - 90); ctx.lineTo(a[0], a[1] + 90); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = '#5fe8c8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], tip[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      for (const [x, y, z] of [['G', 'N', 'Prn'], ['Cm', 'Sn', 'Ls']] as Key[][]) { ctx.beginPath(); ctx.moveTo(...P(p[x])); ctx.lineTo(...P(p[y])); ctx.lineTo(...P(p[z])); ctx.stroke(); }
      if (pl) {
        ctx.strokeStyle = '#c8fff0'; ctx.setLineDash([7, 5]); ctx.lineWidth = 2.5; ctx.beginPath();
        pl.dorsal.forEach((q, i) => { const s = P(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#c8fff0'; const s = P(pl.prn); ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 6.283); ctx.fill();
      }
    }
    for (const k of KEYS) { const q = st.pts[k]; if (!q) continue; const s = P(q); ctx.fillStyle = '#ff8f6e'; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '12px "JetBrains Mono", monospace'; ctx.fillText(k, s[0] + 8, s[1] - 6); }
    ctx.font = '12px "JetBrains Mono", monospace'; ctx.fillStyle = '#5fe8c8'; ctx.fillText(st.name, 14, cv.height - 14);
  }
  if (notify) st.onChange();
}

const REF = {
  nf: [115, 135] as const, nl: [90, 110] as const, goode: [0.55, 0.60] as const,
};
function band(v: number, r: readonly [number, number]): { cls: string; txt: string } {
  return v < r[0] ? { cls: 'lo', txt: T('below the commonly cited range', 'di bawah rentang yang lazim dikutip') } : v > r[1] ? { cls: 'hi', txt: T('above the commonly cited range', 'di atas rentang yang lazim dikutip') } : { cls: 'ok', txt: T('inside the commonly cited range', 'di dalam rentang yang lazim dikutip') };
}

export function noseHtml(): string {
  const m = noseMetrics();
  const lead = `<div class="mv-badge">${T('Needs a side-view photo', 'Butuh foto tampak samping')}</div>`;
  if (!st.img) return `<div class="banner">${T('Choose a side-view photo, or use the rendered test profile, then mark the eight points in order.', 'Pilih foto tampak samping, atau pakai profil uji render, lalu tandai delapan titik berurutan.')}</div>${lead}`;
  if (!m) return `${lead}<p class="fine">${T('Mark all eight points to see the measurements. You can drag a point afterwards.', 'Tandai kedelapan titik untuk melihat pengukuran. Titik bisa digeser setelahnya.')}</p>`;
  const nf = band(m.nf, REF.nf), nl = band(m.nl, REF.nl), go = band(m.goode, REF.goode), pl = plan()!;
  const row = (label: string, val: string, ref: string, b: { cls: string; txt: string }) => `<div class="ns-row ${b.cls}"><div><b>${esc(label)}</b><span>${esc(ref)}</span></div><strong>${esc(val)}</strong><em>${esc(b.txt)}</em></div>`;
  const mm = st.noseMm ? pl.shift / 100 * st.noseMm : null;
  return `${lead}
    <section class="mv-card"><h5>${T('Measured on the side view', 'Terukur pada tampak samping')}</h5>
      ${row(T('Nasofrontal angle', 'Sudut nasofrontal'), `${num(m.nf, 0)}°`, `${REF.nf[0]}–${REF.nf[1]}°`, nf)}
      ${row(T('Nasolabial angle', 'Sudut nasolabial'), `${num(m.nl, 0)}°`, `${REF.nl[0]}–${REF.nl[1]}° (${T('men lower, women higher', 'pria lebih kecil, wanita lebih besar')})`, nl)}
      ${row(T('Tip projection (Goode ratio)', 'Proyeksi ujung (rasio Goode)'), num(m.goode, 2), `${REF.goode[0].toFixed(2)}–${REF.goode[1].toFixed(2)}`, go)}
      <p class="fine">${T('Ranges are the commonly cited screening values for a side view (Powell and Humphreys for the angles, Goode for the ratio). Populations differ, and the face is judged as a whole, so a value outside a range is not a verdict.', 'Rentang adalah nilai skrining yang lazim dikutip untuk tampak samping (Powell dan Humphreys untuk sudut, Goode untuk rasio). Populasi berbeda dan wajah dinilai utuh, jadi nilai di luar rentang bukan vonis.')}</p></section>
    ${afterCard(m)}
    <section class="mv-card"><h5>${T('Planned profile (illustration)', 'Profil rencana (ilustrasi)')}</h5>
      <label class="ns-in">${T('Target Goode ratio', 'Target rasio Goode')} <input type="range" id="ns-target" min="0.50" max="0.64" step="0.01" value="${st.target}"><b>${st.target.toFixed(2)}</b></label>
      <label class="ns-in">${T('Dorsal augmentation, % of nasal length', 'Augmentasi dorsum, % panjang hidung')} <input type="range" id="ns-aug" min="0" max="10" step="1" value="${st.aug}"><b>${st.aug}%</b></label>
      <label class="ns-in">${T('Nasion to tip length in mm (optional, for mm)', 'Panjang nasion ke ujung dalam mm (opsional, untuk mm)')} <input type="number" id="ns-mm" min="20" max="80" step="1" value="${st.noseMm ?? ''}" placeholder="mm"></label>
      <p class="mv-gap">${pl.shift < 0.5 ? T('The tip already reaches the target ratio, so no forward movement is drawn.', 'Ujung hidung sudah mencapai rasio target, jadi tidak ada gerakan ke depan yang digambar.') : T(`The dashed line moves the tip forward by ${num(pl.shift, 1)}% of the nasal length${mm ? ` (about ${num(mm, 1)} mm)` : ''} and raises the dorsum by ${st.aug}%.`, `Garis putus-putus memajukan ujung sebesar ${num(pl.shift, 1)}% panjang hidung${mm ? ` (sekitar ${num(mm, 1)} mm)` : ''} dan menaikkan dorsum ${st.aug}%.`)}</p>
      <div id="ns-sim"></div>
      <p class="fine">${T('A line drawing of geometry only. It does not predict the soft tissue. Skin thickness, cartilage, the airway and the whole face decide what is possible, and what to change is the patient\'s and surgeon\'s decision.', 'Gambar garis geometri saja. Tidak memprediksi jaringan lunak. Ketebalan kulit, tulang rawan, jalan napas, dan keseluruhan wajah menentukan apa yang mungkin, dan apa yang diubah adalah keputusan pasien dan dokter bedah.')}</p></section>
    ${noseReference(pl.shift >= 0.5, st.aug > 0, m.nf > REF.nf[1])}`;
}

/** Hooks the sliders that noseHtml() renders. */
export function wireNose(root: HTMLElement): void {
  const num2 = (id: string, fn: (v: number) => void) => {
    const i = root.querySelector<HTMLInputElement>(`#${id}`); if (!i) return;
    // while dragging only the picture and the label change; the panel is rebuilt on release so the slider keeps its grip
    i.addEventListener('input', () => { fn(Number(i.value)); const b = i.nextElementSibling; if (b) b.textContent = id === 'ns-aug' ? `${i.value}%` : Number(i.value).toFixed(2); refresh(false); });
    i.addEventListener('change', () => st.onChange());
  };
  num2('ns-target', v => { st.target = v; }); num2('ns-aug', v => { st.aug = v; });
  const real = root.querySelector<HTMLElement>('#ns-real');
  if (real && st.after && st.img) {
    const a = document.createElement('canvas'); a.width = st.img.width; a.height = st.img.height; a.getContext('2d')!.drawImage(st.img as HTMLCanvasElement, 0, 0);
    const b = document.createElement('canvas'); b.width = a.width; b.height = a.height; b.getContext('2d')!.drawImage(st.after.img, 0, 0, a.width, a.height);
    real.appendChild(compareSlider(a, b, T('Before', 'Sebelum'), T('After', 'Sesudah')));
  }
  const host = root.querySelector<HTMLElement>('#ns-sim'), after = host ? simulate() : null;
  if (host && after && st.img) {
    const before = document.createElement('canvas'); before.width = after.width; before.height = after.height;
    before.getContext('2d')!.drawImage(st.img, 0, 0, before.width, before.height);
    host.appendChild(compareSlider(before, after, T('Now', 'Sekarang'), T('Planned (illustration)', 'Rencana (ilustrasi)')));
  }
  root.querySelector<HTMLInputElement>('#ns-mm')?.addEventListener('change', e => { const v = Number((e.target as HTMLInputElement).value); st.noseMm = v > 0 ? v : null; st.onChange(); });
}
export const hasNose = (): boolean => !!st.img;


/** A real profile photograph with the eight points pre-placed (fractions of the picture) for the clinician to confirm or drag. */
export async function loadNoseUrl(url: string, name: string, frac: Record<string, [number, number]>, after?: { url: string; frac: Record<string, [number, number]> }): Promise<void> {
  const p = await loadPhotoUrl(url, name);
  st.img = p.canvas; st.w = p.width; st.h = p.height; st.name = name; st.demo = false; st.noseMm = null; st.after = null; st.pts = {};
  for (const k of KEYS) if (frac[k]) st.pts[k] = [frac[k][0] * st.w, frac[k][1] * st.h];
  if (after) {
    const a = await loadPhotoUrl(after.url, 'after'); const pts: Partial<Record<Key, P>> = {};
    for (const k of KEYS) if (after.frac[k]) pts[k] = [after.frac[k][0] * a.width, after.frac[k][1] * a.height];
    st.after = { img: a.canvas, pts };
  }
  refresh();
}

function afterCard(before: NonNullable<ReturnType<typeof noseMetrics>>): string {
  if (!st.after) return '';
  const a = noseMetrics(st.after.pts); if (!a) return '';
  const d = (x: number, y: number, u: string, dg = 0) => `${num(y - x, dg)}${u}`;
  const row = (label: string, b: string, af: string, ch: string) => `<div class="ns-row"><div><b>${esc(label)}</b><span>${T('before', 'sebelum')} ${esc(b)} · ${T('after', 'sesudah')} ${esc(af)}</span></div><strong>${esc(ch)}</strong></div>`;
  return `<section class="mv-card"><h5>${T('Real outcome: before and after (photographs)', 'Hasil nyata: sebelum dan sesudah (foto)')}</h5><div id="ns-real"></div>
    ${row(T('Nasofrontal angle', 'Sudut nasofrontal'), `${num(before.nf, 0)}°`, `${num(a.nf, 0)}°`, d(before.nf, a.nf, '°')) }
    ${row(T('Nasolabial angle', 'Sudut nasolabial'), `${num(before.nl, 0)}°`, `${num(a.nl, 0)}°`, d(before.nl, a.nl, '°'))}
    ${row(T('Goode ratio', 'Rasio Goode'), num(before.goode, 2), num(a.goode, 2), d(before.goode, a.goode, '', 2))}
    <p class="fine">${T('The points on both photographs were placed by the program for you to confirm; moving a point by a few pixels changes an angle by a few degrees. A real photograph pair is also affected by head position and lighting, so read the change as an estimate.', 'Titik pada kedua foto dipasang program untuk Anda konfirmasi; menggeser titik beberapa piksel mengubah sudut beberapa derajat. Pasangan foto nyata juga dipengaruhi posisi kepala dan cahaya, jadi baca perubahan sebagai perkiraan.')}</p></section>`;
}
