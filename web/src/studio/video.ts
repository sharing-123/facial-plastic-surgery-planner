import { analyseMotion, IRIS_MM, measure, type Frame, type Measures, type MotionReport, type MoveKey, type MoveResult, type Pt } from './motion';
import { detectFace, detectVideoFrame, startVideoSession } from './landmarker';
import { loadPhotoFile } from './photo';
import { T, esc } from './panels';
import { compareSlider, warpPush } from './warp';
import { palsyReference, smileReference } from './reference';
import { lang, num } from '../i18n';

/**
 * Movement tab: a facial-movement clip (uploaded, recorded live with prompts, or a synthetic test pattern with a known answer) is
 * tracked frame by frame in the browser and compared right against left. Nothing is uploaded or stored. No grade, no verdict.
 */
interface Thumb { c: HTMLCanvasElement; lm: Pt[] | null }
const ui = { ref: 'palsy' as 'palsy' | 'smile', stats: [] as Array<{ m: Measures; name: string; thumb: Thumb }>, report: null as MotionReport | null, thumbs: [] as Thumb[], name: '', running: false, onChange: () => { /* set on mount */ } };
const TH = 288;

export const MOVE_NAME: Record<MoveKey, [string, string]> = {
  smile: ['Smile: mouth-corner lift', 'Senyum: angkat sudut mulut'],
  brow: ['Eyebrow raise', 'Angkat alis'],
  eye: ['Eye closure', 'Menutup mata'],
};
const PROMPTS: Array<[number, string, string]> = [
  [0, 'Relax and look at the camera', 'Rileks dan lihat kamera'],
  [2.5, 'Smile as wide as you can', 'Tersenyum selebar mungkin'],
  [6, 'Relax', 'Rileks'],
  [7.5, 'Raise both eyebrows', 'Angkat kedua alis'],
  [10.5, 'Relax', 'Rileks'],
  [12, 'Close your eyes gently, then tightly', 'Pejamkan mata pelan, lalu kuat'],
  [15.5, 'Relax', 'Rileks'],
];

export function mountVideo(host: HTMLElement, onChange: () => void): void {
  ui.onChange = onChange;
  host.innerHTML = `
    <div class="mv">
      <div class="mv-stage"><canvas id="mv-cv" width="640" height="640"></canvas>
        <div class="mv-empty" id="mv-empty"><h2>${T('Movement needs a video', 'Gerakan butuh video')}</h2>
          <p>${T('A still photo cannot show how a face moves. Record a short clip (about 16 seconds): rest, smile, raise the brows, close the eyes. Everything is tracked on this device and nothing is uploaded.', 'Foto diam tidak bisa menunjukkan gerak wajah. Rekam klip singkat (sekitar 16 detik): rileks, senyum, angkat alis, tutup mata. Semuanya dilacak di perangkat ini dan tidak ada yang diunggah.')}</p></div>
        <div class="mv-prompt" id="mv-prompt" hidden></div>
        <div class="mv-bar"><i id="mv-bar"></i></div>
        <video id="mv-live" playsinline muted hidden></video>
      </div>
      <div class="mv-ctl">
        <button class="btn small" data-mv="record">${T('Record with the camera', 'Rekam dengan kamera')}</button>
        <button class="btn small" data-mv="file">${T('Choose a video', 'Pilih video')}</button>
        <input type="file" id="mv-file" accept="video/*" hidden>
        <button class="btn small" data-mv="stills">${T('Choose photos', 'Pilih foto')}</button>
        <input type="file" id="mv-stills" accept="image/jpeg,image/png,image/webp" multiple hidden>
      </div>
      <canvas id="mv-chart-live" class="mv-live-chart" width="640" height="120" hidden></canvas>
    </div>`;
  const file = host.querySelector<HTMLInputElement>('#mv-file')!;
  file.addEventListener('change', () => { const f = file.files?.[0]; if (f) void runFile(f); file.value = ''; });
  const stills = host.querySelector<HTMLInputElement>('#mv-stills')!;
  stills.addEventListener('change', async () => {
    const fs = [...(stills.files ?? [])]; stills.value = ''; if (!fs.length) return;
    const list: StillIn[] = [];
    for (const f of fs) { try { const p = await loadPhotoFile(f); list.push({ c: p.canvas, name: f.name }); } catch { /* skip unreadable */ } }
    if (list.length) void runStills(list);
  });
  host.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mv]');
    if (!b || ui.running) return;
    const k = b.dataset.mv!;
    if (k === 'file') file.click();
    else if (k === 'stills') stills.click();
    else if (k === 'record') void runLive();
  });
  if (ui.report) paintStageIdle();
}

const el = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;

function setRunning(on: boolean): void {
  if (on) startVideoSession();
  ui.running = on;
  document.querySelectorAll<HTMLButtonElement>('[data-mv]').forEach(b => { b.disabled = on; });
  el('mv-empty').hidden = on || !!ui.report || ui.stats.length > 0;
  el('mv-chart-live').hidden = !on;
}

function drawFrame(c: HTMLCanvasElement | HTMLVideoElement, lm: Pt[] | null, label: string, p: number, scan = true): void {
  const cv = el<HTMLCanvasElement>('mv-cv'), ctx = cv.getContext('2d')!;
  const w = c instanceof HTMLVideoElement ? c.videoWidth : c.width, h = c instanceof HTMLVideoElement ? c.videoHeight : c.height;
  const S = cv.width, k = Math.min(S / w, S / h);
  ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, S, S);
  const ox = (S - w * k) / 2, oy = (S - h * k) / 2;
  ctx.drawImage(c, ox, oy, w * k, h * k);
  if (lm) {
    ctx.fillStyle = 'rgba(95,232,200,0.75)';
    for (let i = 0; i < lm.length; i += 2) ctx.fillRect(ox + lm[i][0] * k - 1, oy + lm[i][1] * k - 1, 2, 2);
    ctx.fillStyle = '#ffffff';
    for (const i of [33, 133, 263, 362, 159, 145, 386, 374, 61, 291, 105, 334, 1]) ctx.beginPath(), ctx.arc(ox + lm[i][0] * k, oy + lm[i][1] * k, 3, 0, 6.283), ctx.fill();
  }
  if (scan) {
    const y = ((p * 5) % 1) * S;
    const g = ctx.createLinearGradient(0, y - 60, 0, y); g.addColorStop(0, 'rgba(95,232,200,0)'); g.addColorStop(1, 'rgba(95,232,200,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 60, S, 60); ctx.fillStyle = '#c8fff0'; ctx.fillRect(0, y - 1, S, 2);
  }
  ctx.font = '500 14px "JetBrains Mono", monospace'; ctx.fillStyle = '#5fe8c8'; ctx.fillText(label, 16, S - 16);
  el('mv-bar').style.width = `${Math.round(p * 100)}%`;
}

function thumbOf(c: HTMLCanvasElement | HTMLVideoElement, lm: Pt[] | null): Thumb {
  const w = c instanceof HTMLVideoElement ? c.videoWidth : c.width, h = c instanceof HTMLVideoElement ? c.videoHeight : c.height;
  const k = TH / Math.max(w, h), t = document.createElement('canvas');
  t.width = Math.round(w * k); t.height = Math.round(h * k);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  return { c: t, lm: lm ? lm.map(p => [p[0] * k, p[1] * k] as Pt) : null };
}

function liveChart(frames: Frame[]): void {
  const cv = el<HTMLCanvasElement>('mv-chart-live'); if (!cv) return;
  const r = analyseMotion(frames); const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const s = r.series; if (s.t.length < 2) return;
  const tmax = Math.max(s.t[s.t.length - 1], 8);
  const draw = (a: number[], col: string, lo: number, hi: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    a.forEach((v, i) => { const x = (s.t[i] / tmax) * cv.width, y = cv.height - ((v - lo) / (hi - lo)) * (cv.height - 12) - 6; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  };
  draw(s.cornerY.map(c => c.R), '#5fe8c8', -0.02, 0.12); draw(s.cornerY.map(c => c.L), '#ff8f6e', -0.02, 0.12);
  draw(s.brow.map(c => c.R), 'rgba(95,232,200,0.5)', -0.02, 0.12); draw(s.brow.map(c => c.L), 'rgba(255,143,110,0.5)', -0.02, 0.12);
}

async function finish(frames: Frame[], thumbs: Thumb[], name: string): Promise<void> {
  ui.report = analyseMotion(frames); ui.thumbs = thumbs; ui.name = name;
  setRunning(false); paintStageIdle(); ui.onChange();
}

function paintStageIdle(): void {
  const r = ui.report; if (!r) return;
  const best = r.moves.filter(m => m.seen).sort((a, b) => Math.max(b.value.R, b.value.L) - Math.max(a.value.R, a.value.L))[0];
  const i = best ? nearest(r, best.peakT) : 0;
  const th = ui.thumbs[i]; if (!th) return;
  drawFrame(th.c, th.lm, `${ui.name} · ${best ? best.peakT.toFixed(1) + ' s' : ''}`, 0, false);
  el('mv-bar').style.width = '100%';
}
const nearest = (r: MotionReport, t: number): number => { let bi = 0, bd = Infinity; r.series.t.forEach((x, i) => { const d = Math.abs(x - t); if (d < bd) { bd = d; bi = i; } }); return bi; };


export interface StillIn { c: HTMLCanvasElement; name: string }

/** Photographs instead of a clip: a rest photo first, then one photo per movement, or a single photo read statically. */
export async function runStills(list: StillIn[], mode: 'series' | 'compare' = 'series', ref: 'palsy' | 'smile' = 'palsy'): Promise<void> {
  setRunning(true); ui.report = null; ui.stats = []; ui.ref = ref;
  const prompt = el('mv-prompt'); prompt.hidden = false; prompt.textContent = T('Finding the face…', 'Mencari wajah…');
  try {
    const lms: Array<Pt[] | null> = [];
    for (const s of list) {
      const d = await detectFace(s.c);
      lms.push(d.landmarks.length ? d.landmarks.map(p => [p.x * s.c.width, p.y * s.c.height] as Pt) : null);
      drawFrame(s.c, lms[lms.length - 1], s.name, 0.5, true);
      await new Promise(r => setTimeout(r, 350));
    }
    prompt.hidden = true;
    if (list.length === 1 || mode === 'compare') {
      const got = list.map((s, i) => ({ s, lm: lms[i] })).filter(x => x.lm);
      if (!got.length) { prompt.hidden = false; prompt.textContent = T('No face was found in the photo.', 'Wajah tidak ditemukan pada foto.'); setRunning(false); return; }
      ui.stats = got.map(x => ({ m: measure(x.lm!), name: x.s.name, thumb: thumbOf(x.s.c, x.lm!) }));
      ui.thumbs = []; setRunning(false); drawFrame(got[0].s.c, got[0].lm!, got[0].s.name, 0, false); ui.onChange(); return;
    }
    const frames: Frame[] = [], thumbs: Thumb[] = [];
    const rest = lms[0];
    for (let i = 0; i < 6; i++) { frames.push({ t: i * 0.1, lm: rest }); thumbs.push(thumbOf(list[0].c, rest)); }
    for (let k = 1; k < list.length; k++) { frames.push({ t: 1 + k * 0.1, lm: lms[k] }); thumbs.push(thumbOf(list[k].c, lms[k])); }
    await finish(frames, thumbs, list.map(s => s.name).join(' + '));
  } catch (err) { console.error(err); prompt.hidden = false; prompt.textContent = T('The photos could not be read.', 'Foto tidak bisa dibaca.'); setRunning(false); }
}

function statCard(s: { m: Measures; name: string; thumb: Thumb }, i: number): string {
  const m = s.m;
  const mm = m.irisPx ? IRIS_MM / (m.irisPx / m.ocwPx) : null;
  const val = (v: number) => (mm ? `${num(v * mm, 1)} mm` : `${num(v * 100, 1)}%`);
  const row = (en: string, id: string, R: number, L: number, share = false) => `<div class="ns-row"><div><b>${esc(lang() === 'id' ? id : en)}</b><span>${T('right', 'kanan')} ${val(R)} · ${T('left', 'kiri')} ${val(L)}</span></div><strong>${share ? `${Math.round((Math.min(R, L) / Math.max(R, L, 1e-6)) * 100)}%` : val(Math.abs(R - L))}</strong><em>${share ? T('smaller side as a share of the larger', 'sisi kecil sebagai bagian dari sisi besar') : T('difference between the sides', 'selisih antar sisi')}</em></div>`;
  return `<section class="mv-card"><h5>${esc(s.name)}</h5><canvas class="mv-peak mv-stat" data-i="${i}" width="${TH}" height="${TH}"></canvas>
      ${row('Eyebrow height above the canthal line', 'Tinggi alis di atas garis kantus', m.brow.R, m.brow.L)}
      ${row('Eye opening', 'Bukaan mata', Math.max(0, m.aperture.R), Math.max(0, m.aperture.L), true)}
      ${row('Mouth corner, distance below the eye line', 'Sudut mulut, jarak di bawah garis mata', Math.abs(m.cornerY.R), Math.abs(m.cornerY.L))}</section>`;
}

function statHtml(): string {
  const two = ui.stats.length === 2;
  return `<div class="mv-badge photo">${two ? T('Two photos side by side', 'Dua foto berdampingan') : T('One photo: static reading', 'Satu foto: pembacaan statis')}</div>
    ${two ? `<section class="mv-card"><h5>${T('Before and after', 'Sebelum dan sesudah')}</h5><div id="mv-stat-cmp"></div></section>` : ''}
    ${ui.stats.map(statCard).join('')}
    <p class="fine">${T('A photograph shows how the two sides sit in that pose, not how far each side can move, so one photo cannot tell a palsy from a resting asymmetry. Add a rest photo first, then the movement photos (smile, brow raise, eye closure), or a short video, to compare how far each side moves. The scale comes from the iris (11.7 mm, about ±5%). No grade and no diagnosis.', 'Foto menunjukkan letak kedua sisi pada pose itu, bukan seberapa jauh tiap sisi bisa bergerak, jadi satu foto tidak bisa membedakan palsi dari asimetri saat istirahat. Tambahkan foto istirahat lebih dulu, lalu foto gerakan (senyum, angkat alis, menutup mata), atau video singkat, untuk membandingkan seberapa jauh tiap sisi bergerak. Skala dari iris (11,7 mm, sekitar ±5%). Tanpa derajat dan tanpa diagnosis.')}</p>
    ${ui.ref === 'smile' ? smileReference() : palsyReference() + smileReference()}`;
}

async function runFile(f: File): Promise<void> {
  if (f.size > 200_000_000) { alert(T('The video is larger than 200 MB.', 'Video lebih besar dari 200 MB.')); return; }
  setRunning(true); ui.report = null;
  const prompt = el('mv-prompt'); prompt.hidden = false; prompt.textContent = T('Reading the video…', 'Membaca video…');
  const url = URL.createObjectURL(f), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('decode')); });
    const dur = Math.min(v.duration || 0, 30), fps = 10, n = Math.max(1, Math.floor(dur * fps));
    const frames: Frame[] = [], thumbs: Thumb[] = [];
    const c = document.createElement('canvas'); const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < n; i++) {
      v.currentTime = i / fps;
      await new Promise<void>(res => { const t = setTimeout(res, 1500); v.onseeked = () => { clearTimeout(t); res(); }; });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const l = await detectVideoFrame(c, i * 100 + 1);
      frames.push({ t: i / fps, lm: l }); thumbs.push(thumbOf(c, l));
      drawFrame(c, l, `${f.name} · ${(i / fps).toFixed(1)} s`, i / n);
      if (i % 3 === 0) { liveChart(frames); await new Promise(r => setTimeout(r, 0)); }
    }
    prompt.hidden = true;
    await finish(frames, thumbs, f.name);
  } catch (err) { console.error(err); prompt.textContent = T('The video could not be read. Try an MP4 or WebM file.', 'Video tidak bisa dibaca. Coba berkas MP4 atau WebM.'); setRunning(false); }
  finally { URL.revokeObjectURL(url); }
}

async function runLive(): Promise<void> {
  setRunning(true); ui.report = null;
  const prompt = el('mv-prompt'); prompt.hidden = false; prompt.textContent = T('Allow the camera…', 'Izinkan kamera…');
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    const v = el<HTMLVideoElement>('mv-live'); v.srcObject = stream; await v.play();
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const ctx = c.getContext('2d')!;
    const total = 16, frames: Frame[] = [], thumbs: Thumb[] = [];
    const t0 = performance.now(); let last = -1;
    while ((performance.now() - t0) / 1000 < total) {
      const t = (performance.now() - t0) / 1000;
      const step = Math.floor(t * 10);
      if (step === last) { await new Promise(r => setTimeout(r, 15)); continue; }
      last = step;
      const pr = [...PROMPTS].reverse().find(p => t >= p[0])!;
      prompt.textContent = lang() === 'id' ? pr[2] : pr[1];
      ctx.drawImage(v, 0, 0);
      const l = await detectVideoFrame(c, Math.round(t * 1000) + 1);
      frames.push({ t, lm: l }); thumbs.push(thumbOf(c, l));
      drawFrame(c, l, `${t.toFixed(1)} s`, t / total, false);
      if (step % 3 === 0) liveChart(frames);
    }
    prompt.hidden = true;
    await finish(frames, thumbs, T('Camera recording', 'Rekaman kamera'));
  } catch (err) { console.error(err); prompt.textContent = T('No camera is available or permission was refused. Choose a video file instead.', 'Kamera tidak tersedia atau izin ditolak. Pilih berkas video.'); setRunning(false); }
  finally { stream?.getTracks().forEach(t => t.stop()); }
}

/* ------------------------------------------------------------------ results */
const SIDE = { R: ['right', 'kanan'], L: ['left', 'kiri'] } as const;
const sideName = (s: 'R' | 'L'): string => (lang() === 'id' ? SIDE[s][1] : SIDE[s][0]);

const FLAG: Record<string, [string, string]> = {
  lowDetection: ['The face was lost in many frames. Light the face evenly and keep it in view.', 'Wajah hilang di banyak frame. Terangi wajah merata dan jaga tetap terlihat.'],
  turned: ['The head turned during the clip. Keep facing the camera; turning changes the corner and brow positions.', 'Kepala menoleh selama klip. Tetap menghadap kamera; menoleh mengubah posisi sudut mulut dan alis.'],
  tilted: ['The head tilted a lot. The analysis corrects roll, but a large tilt still adds error.', 'Kepala miring jauh. Analisis mengoreksi kemiringan, tetapi miring besar tetap menambah galat.'],
  short: ['The clip is very short, so the resting position is poorly defined.', 'Klip sangat pendek, jadi posisi istirahat kurang jelas.'],
};

function bars(m: MoveResult): string {
  const hi = Math.max(m.value.R, m.value.L, 1e-6);
  const unit = m.key === 'eye' ? (v: number) => `${Math.round(v * 100)}%` : (v: number, mm?: number | null) => (mm != null ? `${num(mm, 1)} mm` : `${num(v * 100, 1)}%`);
  const row = (s: 'R' | 'L') => `<div class="mv-row"><span>${esc(sideName(s))}</span><i style="--w:${Math.round((m.value[s] / hi) * 100)}%" class="${s}"></i><b>${m.key === 'eye' ? unit(m.value[s]) : unit(m.value[s], m.mm?.[s])}</b></div>`;
  return row('R') + row('L');
}

function moveCard(m: MoveResult): string {
  const nm = MOVE_NAME[m.key][lang() === 'id' ? 1 : 0];
  if (!m.seen) return `<section class="mv-card dim"><h5>${esc(nm)}</h5><p class="muted">${T('Not enough of this movement was seen in the clip to compare the two sides. Record it again and make the movement as full as you can.', 'Gerakan ini tidak cukup terlihat di klip untuk membandingkan kedua sisi. Rekam ulang dan lakukan gerakan sepenuh mungkin.')}</p></section>`;
  const gap = m.weaker === 'none' ? T('The two sides moved about equally (within 10%).', 'Kedua sisi bergerak hampir sama (selisih di bawah 10%).')
    : T(`The ${sideName(m.weaker as 'R' | 'L')} side reached ${Math.round(m.ratio!)}% of the ${sideName(m.weaker === 'R' ? 'L' : 'R')} side.`, `Sisi ${sideName(m.weaker as 'R' | 'L')} mencapai ${Math.round(m.ratio!)}% dari sisi ${sideName(m.weaker === 'R' ? 'L' : 'R')}.`);
  const unitNote = m.key === 'eye' ? T('Closure of the neutral eye opening (100% = fully closed).', 'Penutupan dari bukaan mata saat istirahat (100% = tertutup penuh).') : T('Peak movement compared with the person\'s own resting position.', 'Gerakan puncak dibanding posisi istirahat orang itu sendiri.');
  return `<section class="mv-card"><h5>${esc(nm)}</h5>${bars(m)}<p class="mv-gap">${esc(gap)}</p><p class="fine">${esc(unitNote)}</p><canvas class="mv-peak" data-key="${m.key}" width="${TH}" height="${TH}"></canvas></section>`;
}

export function motionHtml(): string {
  const r = ui.report;
  if (!r && ui.stats.length) return statHtml();
  if (!r) return `<div class="banner">${T('Movement analysis needs a video: a smile, a brow raise and eye closure cannot be judged from one photo. Record or choose a clip on the left.', 'Analisis gerakan butuh video: senyum, angkat alis, dan menutup mata tidak bisa dinilai dari satu foto. Rekam atau pilih klip di kiri.')}</div>
    <p class="fine">${T('Photo is enough for lesions and static proportions. Video is needed for facial palsy and the smile. A side-view photo is needed for nose projection.', 'Foto cukup untuk lesi dan proporsi statis. Video diperlukan untuk kelumpuhan wajah dan senyum. Foto samping diperlukan untuk proyeksi hidung.')}</p>`;
  const q = r.quality;
  const flags = q.flags.map(f => `<li>${esc(FLAG[f]?.[lang() === 'id' ? 1 : 0] ?? f)}</li>`).join('');
  return `
    <div class="mv-badge">${T('Needs video', 'Butuh video')}</div>
    ${r.moves.map(moveCard).join('')}
    ${smileSimCard(r)}
    <section class="mv-card"><h5>${T('Over time', 'Sepanjang waktu')}</h5><canvas id="mv-chart" width="520" height="220"></canvas>
      <p class="fine"><span class="lg R"></span>${esc(sideName('R'))} <span class="lg L"></span>${esc(sideName('L'))} · ${T('mouth corner lift (solid), brow lift (dashed)', 'angkat sudut mulut (garis penuh), angkat alis (putus-putus)')}</p></section>
    <section class="mv-card"><h5>${T('Quality of the clip', 'Kualitas klip')}</h5>
      <p class="fine">${q.detected}/${q.frames} ${T('frames with a face', 'frame dengan wajah')} · ${r.durationS.toFixed(1)} s${r.mmPerOcw ? ` · ${T('scale from the iris (11.7 mm), about', 'skala dari iris (11,7 mm), sekitar')} ${num(r.mmPerOcw, 0)} mm ${T('per outer-canthal width', 'per lebar kantus luar')}` : ''}</p>
      ${flags ? `<ul class="fine">${flags}</ul>` : `<p class="fine">${T('No quality problem found.', 'Tidak ada masalah kualitas.')}</p>`}</section>
    <p class="fine">${T('Tested on synthetic clips with a known answer: the smile gap was recovered closely (set 40%, measured 41%), but the face model under-stated the brow gap (set 30%, measured 61%) and the eye-closure gap (set 60% closed, ratio 75%). Read a smaller gap as a lower bound: the real difference between the sides can be larger than shown.', 'Diuji pada klip sintetis dengan jawaban diketahui: selisih senyum terbaca hampir tepat (diset 40%, terukur 41%), tetapi model wajah meremehkan selisih alis (diset 30%, terukur 61%) dan selisih menutup mata (diset tertutup 60%, rasio 75%). Anggap selisih yang kecil sebagai batas bawah: beda sebenarnya antar sisi bisa lebih besar dari yang tampak.')}</p>
    <p class="fine disclaimer">${T('Screening numbers for a clinician to read beside the examination. No grade, no diagnosis, and no verdict. The right side is the patient\'s right. Blinking can look like eye closure, so ask for a slow, full closure. A video cannot show cause: a normal result does not exclude palsy, and an abnormal one does not prove it.', 'Angka skrining untuk dibaca dokter bersama pemeriksaan. Tanpa derajat, tanpa diagnosis, tanpa vonis. Sisi kanan adalah kanan pasien. Berkedip bisa terbaca sebagai menutup mata, jadi minta penutupan penuh yang pelan. Video tidak menunjukkan penyebab: hasil normal tidak menyingkirkan kelumpuhan, dan hasil abnormal tidak membuktikannya.')}</p>
    ${r.moves.some(m => m.seen && m.weaker && m.weaker !== 'none') ? palsyReference() + smileReference() : ''}`;
}

function smileSimCard(r: MotionReport): string {
  const m = r.moves.find(x => x.key === 'smile');
  if (!m || !m.seen || !m.weaker || m.weaker === 'none') return '';
  return `<section class="mv-card"><h5>${T('Illustration: the smile if the weaker corner matched the stronger one', 'Ilustrasi: senyum bila sudut yang lemah setara dengan yang kuat')}</h5><div id="mv-smile-sim"></div>
    <p class="fine">${T('The weaker corner is lifted by the measured gap. It shows the size of the difference, not what an operation, toxin or therapy would achieve.', 'Sudut yang lemah diangkat sebesar selisih terukur. Ini menunjukkan besar selisihnya, bukan hasil operasi, toksin atau terapi.')}</p></section>`;
}

/** Draws the canvases that motionHtml() leaves empty: the peak frame of each movement and the time chart. */
export function paintMotion(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>('.mv-stat').forEach(sc => {
    const s = ui.stats[Number(sc.dataset.i)]; if (!s) return;
    const th = s.thumb, k = sc.width / th.c.width; sc.height = Math.round(th.c.height * k);
    const ctx = sc.getContext('2d')!; ctx.drawImage(th.c, 0, 0, sc.width, sc.height);
    if (th.lm) { const L = th.lm.map(p => [p[0] * k, p[1] * k] as Pt); ctx.fillStyle = '#5fe8c8'; for (const i of [61, 159, 145, 105]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5); ctx.fillStyle = '#ff8f6e'; for (const i of [291, 386, 374, 334]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5); }
  });
  const cmp = root.querySelector<HTMLElement>('#mv-stat-cmp');
  if (cmp && ui.stats.length === 2) {
    const [a, b] = ui.stats.map(x => x.thumb.c);
    const same = document.createElement('canvas'); same.width = a.width; same.height = a.height; same.getContext('2d')!.drawImage(b, 0, 0, a.width, a.height);
    cmp.appendChild(compareSlider(a, same, T('Before', 'Sebelum'), T('After', 'Sesudah')));
  }
  const r = ui.report; if (!r) return;
  root.querySelectorAll<HTMLCanvasElement>('.mv-peak').forEach(cv => {
    const m = r.moves.find(x => x.key === cv.dataset.key)!; const th = ui.thumbs[nearest(r, m.peakT)]; if (!th) return;
    const ctx = cv.getContext('2d')!; const k = cv.width / th.c.width;
    cv.height = Math.round(th.c.height * k);
    ctx.drawImage(th.c, 0, 0, cv.width, cv.height);
    if (th.lm) {
      const L = th.lm.map(p => [p[0] * k, p[1] * k] as Pt);
      ctx.fillStyle = '#5fe8c8'; for (const i of m.key === 'smile' ? [61] : m.key === 'brow' ? [105, 66, 107] : [159, 145]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5);
      ctx.fillStyle = '#ff8f6e'; for (const i of m.key === 'smile' ? [291] : m.key === 'brow' ? [334, 296, 336] : [386, 374]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5);
      // illustration: the height the weaker corner would reach if it matched the stronger side
      if (m.key === 'smile' && m.weaker && m.weaker !== 'none') {
        const weak = m.weaker === 'R' ? 61 : 291, gap = Math.abs(m.value.R - m.value.L) * (L[263][0] - L[33][0]);
        ctx.strokeStyle = '#c8fff0'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(L[weak][0], L[weak][1]); ctx.lineTo(L[weak][0], L[weak][1] - gap); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(L[weak][0], L[weak][1] - gap, 4, 0, 6.283); ctx.stroke();
      }
    }
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = '#fff'; ctx.fillText(`${m.peakT.toFixed(1)} s`, 8, cv.height - 8);
  });
  const sim = root.querySelector<HTMLElement>('#mv-smile-sim'), sm = r.moves.find(x => x.key === 'smile');
  if (sim && sm && sm.weaker && sm.weaker !== 'none') {
    const th = ui.thumbs[nearest(r, sm.peakT)];
    if (th?.lm) {
      const ocw = Math.hypot(th.lm[263][0] - th.lm[33][0], th.lm[263][1] - th.lm[33][1]), gap = Math.abs(sm.value.R - sm.value.L) * ocw;
      const wi = sm.weaker === 'R' ? 61 : 291, out = sm.weaker === 'R' ? -1 : 1;
      const after = warpPush(th.c, [{ x: th.lm[wi][0], y: th.lm[wi][1], dx: out * gap * 0.35, dy: -gap, sigma: 0.16 * ocw }], 600);
      const before = document.createElement('canvas'); before.width = after.width; before.height = after.height; before.getContext('2d')!.drawImage(th.c, 0, 0, before.width, before.height);
      sim.appendChild(compareSlider(before, after, T('Measured', 'Terukur'), T('Balanced (illustration)', 'Seimbang (ilustrasi)')));
    }
  }
  const ch = root.querySelector<HTMLCanvasElement>('#mv-chart');
  if (ch) {
    const ctx = ch.getContext('2d')!, s = r.series; ctx.clearRect(0, 0, ch.width, ch.height);
    const tmax = Math.max(...s.t, 1), pad = 22;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, ch.height - pad); ctx.lineTo(ch.width, ch.height - pad); ctx.stroke();
    const line = (a: number[], col: string, dash: number[], lo: number, hi: number) => {
      ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 2; ctx.beginPath();
      a.forEach((v, i) => { const x = pad + (s.t[i] / tmax) * (ch.width - pad - 6), y = ch.height - pad - ((v - lo) / (hi - lo)) * (ch.height - pad - 10); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    };
    const hi = Math.max(0.06, ...s.cornerY.map(c => Math.max(c.R, c.L)), ...s.brow.map(c => Math.max(c.R, c.L))) * 1.1, lo = -0.01;
    line(s.cornerY.map(c => c.R), '#5fe8c8', [], lo, hi); line(s.cornerY.map(c => c.L), '#ff8f6e', [], lo, hi);
    line(s.brow.map(c => c.R), '#5fe8c8', [5, 4], lo, hi); line(s.brow.map(c => c.L), '#ff8f6e', [5, 4], lo, hi);
    ctx.fillStyle = '#8b9692'; ctx.font = '10px "JetBrains Mono", monospace';
    for (let t = 0; t <= tmax; t += 2) ctx.fillText(`${t}s`, pad + (t / tmax) * (ch.width - pad - 6) - 6, ch.height - 6);
  }
}

export const hasMotion = (): boolean => !!ui.report || ui.stats.length > 0;

