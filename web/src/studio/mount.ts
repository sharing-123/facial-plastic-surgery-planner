import { applyDom, lang, num, onLang } from '../i18n';
import { View2D } from './view2d';
import type { FaceViewer } from './viewer3d';
import { STAGE_COUNT, type SurgeryMode } from './surgery3d';
import { applySpec, closeExamples, openExamples, SPECS } from './examples';
import { playTheater } from './theater';
import { drawPlanImages } from './draw';
import { api, ApiError, type CaseRecord } from './api';
import { ACCEPT, PhotoError, loadPhotoFile, loadPhotoUrl, openCamera, type CameraSession } from './photo';
import { findingsHtml, gateHtml, managementHtml, planHtml, proportionsHtml, scaleHtml, stageBody, stageTitle, T, esc } from './panels';
import { newCode, patch, recompute, setClin, setCtx, setPhoto, setRstl, state, subscribe, analyseLesion, emit, type Tab } from './store';
import type { PlanContext } from '../clinical/planner';
import * as storeNs from './store';
import * as segNs from '../clinical/segment';
import * as drawNs from './draw';

const SAMPLES = [
  { url: '/samples/sample-1.jpg', name: 'sample-1.jpg' }, { url: '/samples/sample-2.jpg', name: 'sample-2.jpg' }, { url: '/samples/sample-3.jpg', name: 'sample-3.jpg' },
];

let viewer: FaceViewer | undefined;
let view2d: View2D | undefined;
let signature3d = '';
let playing = false;
let cams: CameraSession | undefined;
let wired = false;

export function mountStudio(root: HTMLElement): void {
  root.innerHTML = `
  <div class="studio">
    <aside class="rail" aria-label="${T('Photo and tools', 'Foto dan alat')}">
      <section class="card">
        <label class="lbl" for="case-code">${T('Case code (pseudonym)', 'Kode kasus (pseudonim)')}</label>
        <div class="row"><input id="case-code" class="code" maxlength="24" autocomplete="off" spellcheck="false"><button class="btn ghost small" data-act="new-code" title="${T('New code', 'Kode baru')}">${T('New', 'Baru')}</button></div>
        <p class="fine">${T('Do not type a name. The photo stays on this device.', 'Jangan mengetik nama. Foto tetap di perangkat ini.')}</p>
      </section>
      <section class="card">
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="${T('Add a photograph', 'Tambahkan foto')}" data-act="upload">
          <strong>${T('Add a frontal photograph', 'Tambahkan foto frontal')}</strong>
          <span>${T('Drop it here, or choose a file. JPEG, PNG or WebP.', 'Jatuhkan di sini, atau pilih berkas. JPEG, PNG, atau WebP.')}</span>
        </div>
        <input type="file" id="file" accept="${ACCEPT.join(',')}" hidden>
        <div class="row wrap"><button class="btn small" data-act="camera">${T('Use the camera', 'Pakai kamera')}</button><button class="btn small" data-act="examples">${T('Example outputs', 'Contoh hasil')}</button>
          ${SAMPLES.map((s, i) => `<button class="btn ghost small" data-sample="${i}">${T('Sample', 'Contoh')} ${i + 1}</button>`).join('')}</div>
        <p class="fine">${T('Samples are public-domain official portraits from Wikimedia Commons (see the attribution file in /samples).', 'Contoh adalah potret resmi domain publik dari Wikimedia Commons (lihat berkas atribusi di /samples).')}</p>
        <div id="msg" class="msg" role="status"></div>
      </section>
      <section class="card" id="gate-card"></section>
      <section class="card">
        <h4>${T('Tools', 'Alat')}</h4>
        <div class="tools" role="group">
          ${[['tap', 'Tap lesion', 'Ketuk lesi'], ['trace', 'Trace wound', 'Telusuri luka'], ['brush', 'Paint outline', 'Lukis kontur'], ['erase', 'Erase outline', 'Hapus kontur'], ['landmarks', 'Move landmarks', 'Geser landmark']].map(([k, en, id]) => `<button class="tool" data-tool="${k}" aria-pressed="false">${T(en, id)}</button>`).join('')}
        </div>
        <p class="fine" id="tool-hint"></p>
        <h4>${T('Layers', 'Lapisan')}</h4>
        <div class="tools" role="group">
          ${[['landmarks', 'Landmarks', 'Landmark'], ['grid', 'Proportions', 'Proporsi'], ['zones', 'Zones', 'Zona'], ['rstl', 'RSTL', 'RSTL'], ['lesion', 'Lesion', 'Lesi']].map(([k, en, id]) => `<button class="tool" data-layer="${k}" aria-pressed="false">${T(en, id)}</button>`).join('')}
        </div>
      </section>
      <section class="card" id="scale-card"></section>
    </aside>
    <main class="stage">
      <div class="tabs" role="tablist">
        ${([['photo', 'Photo', 'Foto'], ['3d', '3D', '3D'], ['plan', 'Plan', 'Rencana']] as const).map(([k, en, id]) => `<button role="tab" data-tab="${k}" aria-selected="false">${T(en, id)}</button>`).join('')}
        <span class="busy" id="busy" hidden></span>
      </div>
      <div class="views">
        <div class="view" data-view="photo"><div class="v2d-wrap" id="v2d"></div><div class="empty" id="empty"><h2>${T('Start with a photograph', 'Mulai dari satu foto')}</h2><p>${T('Everything fills in on its own: landmarks, mesh, measurements, differential, plan.', 'Semuanya terisi sendiri: landmark, mesh, pengukuran, diagnosis banding, rencana.')}</p></div></div>
        <div class="view" data-view="3d" hidden><div class="v3d-wrap" id="v3d"></div>
          <div class="v3d-ctl" id="v3d-ctl">
            <div class="row"><label>${T('Layers', 'Lapisan')}</label><input type="range" id="peel" min="0" max="1" step="0.005" value="0" aria-label="${T('Peel the layers: skin, fat, muscle, bone', 'Kupas lapisan: kulit, lemak, otot, tulang')}"><span class="fine" id="peel-lbl"></span></div>
            <div class="row"><button class="btn small" id="play" data-act="play">${T('Play the plan', 'Putar rencana')}</button><input type="range" id="stage" min="0" max="${STAGE_COUNT}" step="0.01" value="0" aria-label="${T('Surgical stage', 'Tahap operasi')}"></div>
            <div class="cap" id="stage-cap"></div>
          </div>
        </div>
        <div class="view" data-view="plan" hidden><div class="plan3" id="plan3"></div></div>
      </div>
    </main>
    <aside class="results" id="results" aria-label="${T('Results', 'Hasil')}"></aside>
  </div>
  <div class="modal" id="cam" hidden><div class="modal-box"><video id="cam-video" playsinline muted></video><div class="row"><button class="btn" data-act="cam-snap">${T('Capture', 'Ambil foto')}</button><button class="btn ghost" data-act="cam-close">${T('Cancel', 'Batal')}</button></div></div></div>
  <div class="modal" id="examples" hidden><div class="modal-box wide"><div class="row"><h4>${T('Example outputs', 'Contoh hasil')}</h4><button class="btn ghost small" data-act="examples-close">${T('Close', 'Tutup')}</button></div><div class="ex-body"></div></div></div>
  <div class="modal" id="ask" hidden><div class="modal-box small"><p id="ask-q"></p><input id="ask-in" type="number" step="0.1" min="1" max="300"><div class="row"><button class="btn" data-act="ask-ok">OK</button><button class="btn ghost" data-act="ask-no">${T('Cancel', 'Batal')}</button></div></div></div>`;

  view2d = new View2D(document.getElementById('v2d')!);
  view2d.onScaleRequest = (a, b) => askLength(a, b);
  wire(root);
  if (!wired) {
    wired = true;
    subscribe(render);
    // the shell is rebuilt for the new language; registered once, or the listener set would grow while it is being walked
    onLang(() => { viewer?.dispose(); viewer = undefined; signature3d = ''; mountStudio(root); });
  }
  (document.getElementById('case-code') as HTMLInputElement).value = state.code;
  render();
  void refreshCases();
  applyDom(root);
  if (new URLSearchParams(location.search).has('sample')) void loadSample(Number(new URLSearchParams(location.search).get('sample')) || 0);
  (window as unknown as Record<string, unknown>).__studio = { state, store: storeNs, seg: segNs, draw: drawNs, loadSample, setTab, get viewer() { return viewer; } };
}

function wire(root: HTMLElement): void {
  const file = document.getElementById('file') as HTMLInputElement;
  const drop = document.getElementById('drop')!;
  file.addEventListener('change', () => { const f = file.files?.[0]; if (f) void takeFile(f); file.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) void takeFile(f); });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  const ex = document.getElementById('examples')!;
  ex.addEventListener('click', e => { if (e.target === ex) closeExamples(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !ex.hidden) closeExamples(); });
  const code = document.getElementById('case-code') as HTMLInputElement;
  code.addEventListener('input', () => { state.code = code.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24); });
  root.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-tool],[data-layer],[data-sample],[data-stage]');
    if (!el) return;
    if (el.dataset.tab) return setTab(el.dataset.tab as Tab);
    if (el.dataset.tool) { patch({ tool: el.dataset.tool as typeof state.tool }); return; }
    if (el.dataset.layer) { const k = el.dataset.layer as keyof typeof state.layers; patch({ layers: { ...state.layers, [k]: !state.layers[k] } }); return; }
    if (el.dataset.sample) return void loadSample(Number(el.dataset.sample));
    if (el.dataset.stage) { const v = document.getElementById('stage') as HTMLInputElement; v.value = String(Number(el.dataset.stage) + 0.99); setStage(Number(v.value)); return; }
    const act = el.dataset.act;
    if (act === 'upload') file.click();
    else if (act === 'camera') void startCamera();
    else if (act === 'examples') void openExamples(id => void runExample(id));
    else if (act === 'examples-close') closeExamples();
    else if (act === 'cam-snap') void snap();
    else if (act === 'cam-close') closeCamera();
    else if (act === 'new-code') { state.code = newCode(); (document.getElementById('case-code') as HTMLInputElement).value = state.code; }
    else if (act === 'calibrate') { patch({ tool: 'scale' }); }
    else if (act === 'scale-reset') { state.ppm = null; recompute(); }
    else if (act === 'play') togglePlay();
    else if (act === 'save') void saveCase();
    else if (act === 'csv') exportCsv();
    else if (act === 'pdf') exportPdf();
    else if (act === 'ask-ok') answerAsk(true);
    else if (act === 'ask-no') answerAsk(false);
    else if (act === 'del') void removeCase(el.dataset.id!);
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.dataset.clin) setClin(t.dataset.clin as never, (t as HTMLInputElement).checked);
    else if (t.dataset.ctx) { const k = t.dataset.ctx as keyof PlanContext; setCtx({ [k]: t.type === 'number' ? Number(t.value) || 0 : t.value } as Partial<PlanContext>); }
    else if (t.dataset.rstl !== undefined) setRstl(t.value === '' ? null : ((Number(t.value) % 180) + 180) % 180);
    else if (t.dataset.age !== undefined) { state.age = t.value === '' ? null : Number(t.value); analyseLesion(); emit(); }
  });
  (document.getElementById('peel') as HTMLInputElement).addEventListener('input', e => { viewer?.setPeel(Number((e.target as HTMLInputElement).value)); updatePeelLabel(); });
  (document.getElementById('stage') as HTMLInputElement).addEventListener('input', e => { playing = false; setStage(Number((e.target as HTMLInputElement).value)); });
}

function setStatus(key: 'type' | 'size' | 'decode' | 'detect' | 'segment' | 'none'): void {
  const m = document.getElementById('msg');
  if (!m) return;
  const t: Record<string, string> = {
    type: T('That file type is not supported. Use JPEG, PNG or WebP.', 'Jenis berkas itu tidak didukung. Pakai JPEG, PNG, atau WebP.'),
    size: T('The file is larger than 25 MB.', 'Berkas lebih besar dari 25 MB.'),
    decode: T('The file could not be read as an image. It may be damaged.', 'Berkas tidak bisa dibaca sebagai gambar. Mungkin rusak.'),
    detect: T('The face model could not run on this device. Reload and try again.', 'Model wajah tidak bisa berjalan di perangkat ini. Muat ulang lalu coba lagi.'),
    segment: T('No lesion outline was found at that point. Tap on the lesion itself, or paint the outline.', 'Kontur lesi tidak ditemukan di titik itu. Ketuk pada lesinya, atau lukis konturnya.'),
    none: '',
  };
  m.textContent = t[key]; m.classList.toggle('bad', key !== 'none');
}

let loadToken = 0;
async function takeFile(f: File): Promise<void> {
  const my = ++loadToken;
  setStatus('none');
  try {
    const p = await loadPhotoFile(f);
    if (my !== loadToken) return; // a newer photo was added while this one was being read
    await setPhoto(p);
    view2d?.fit();
    void playScan(my);
  } catch (e) { setStatus(e instanceof PhotoError ? e.code : 'decode'); }
}

async function loadSample(i: number, play = true): Promise<void> {
  const s = SAMPLES[i] ?? SAMPLES[0];
  const my = ++loadToken;
  try { const p = await loadPhotoUrl(s.url, s.name); if (my !== loadToken) return; await setPhoto(p, s.name); view2d?.fit(); if (play) void playScan(my); } catch { setStatus('decode'); }
}

/** The analysis played on screen over the photo view; a newer photo cancels it. */
async function playScan(token: number): Promise<void> {
  if (token !== loadToken || !state.lm || state.tab !== 'photo') return;
  const views = document.querySelector<HTMLElement>('.views');
  if (views) await playTheater(views);
}

/** An example runs for real: photo, synthetic lesion, the studio's own analysis, then the three pictures with a staged reveal. */
async function runExample(id: string): Promise<void> {
  const sp = SPECS[id];
  if (!sp) return;
  setTab('photo');
  await loadSample(sp.sample, false);
  const my = loadToken;
  const ok = await applySpec(id);
  view2d?.fit();
  if (my !== loadToken) return;
  const views = document.querySelector<HTMLElement>('.views');
  if (views) await playTheater(views);
  if (my !== loadToken) return;
  if (ok) {
    patch({ layers: { ...state.layers, lesion: true, landmarks: false } });
    setTab('plan');
    const host = document.getElementById('plan3');
    host?.classList.add('reveal');
    setTimeout(() => host?.classList.remove('reveal'), 2400);
  }
}

async function startCamera(): Promise<void> {
  try {
    cams = await openCamera();
    const v = document.getElementById('cam-video') as HTMLVideoElement;
    v.srcObject = cams.video.srcObject; await v.play();
    document.getElementById('cam')!.hidden = false;
  } catch { document.getElementById('msg')!.textContent = T('No camera is available or permission was refused. Add a photograph from a file instead.', 'Kamera tidak tersedia atau izin ditolak. Tambahkan foto dari berkas.'); document.getElementById('msg')!.classList.add('bad'); }
}
function closeCamera(): void { cams?.stop(); cams = undefined; document.getElementById('cam')!.hidden = true; }
async function snap(): Promise<void> { if (!cams) return; const p = cams.snap(); closeCamera(); const my = ++loadToken; await setPhoto(p); view2d?.fit(); void playScan(my); }

let askPending: ((v: number | null) => void) | null = null;
function askLength(a: [number, number], b: [number, number]): void {
  const px = Math.hypot(a[0] - b[0], a[1] - b[1]);
  (document.getElementById('ask-q') as HTMLElement).textContent = T('How long is the segment you marked, in mm?', 'Berapa panjang segmen yang Anda tandai, dalam mm?');
  const input = document.getElementById('ask-in') as HTMLInputElement; input.value = '';
  document.getElementById('ask')!.hidden = false; input.focus();
  askPending = v => { if (v && v > 0) { state.ppm = px / v; recompute(); } patch({ tool: 'tap' }); };
}
function answerAsk(ok: boolean): void {
  const v = Number((document.getElementById('ask-in') as HTMLInputElement).value);
  document.getElementById('ask')!.hidden = true; askPending?.(ok && v > 0 ? v : null); askPending = null;
}

export function setTab(tab: Tab): void {
  patch({ tab });
}

let building: Promise<void> | null = null;
function sig3d(): string {
  return `${state.photo?.name}|${state.lm3?.[1].x.toFixed(4)}|${state.lesion?.centroid.map(v => v.toFixed(0)).join(',') ?? ''}|${state.plan?.techniques[0]?.name.k}|${state.plan?.marking.join('')}|${state.report?.lengthMm}`;
}
/** Build or refresh the 3D viewer; concurrent calls share one build, and it repeats if the case changed meanwhile. */
function ensure3d(): Promise<void> {
  if (!state.photo || !state.lm3) return Promise.resolve();
  if (building) return building;
  building = (async () => {
    const wrap = document.getElementById('v3d')!;
    if (!viewer) { const { FaceViewer } = await import('./viewer3d'); viewer = new FaceViewer(wrap); }
    for (let guard = 0; guard < 4; guard++) {
      const sig = sig3d();
      if (sig === signature3d) break;
      signature3d = sig;
      await viewer.setCase(state);
      viewer.resize();
    }
    viewer.start();
    updatePeelLabel();
    setStage(Number((document.getElementById('stage') as HTMLInputElement).value));
  })().finally(() => { building = null; });
  return building;
}

function modeOf(): SurgeryMode { return viewer?.anim?.mode ?? 'closure'; }
function setStage(v: number): void {
  if (viewer?.anim) viewer.anim.progress = v;
  const i = Math.min(STAGE_COUNT - 1, Math.floor(v));
  const cap = document.getElementById('stage-cap');
  if (cap) cap.innerHTML = state.plan ? `<b>${i + 1}/${STAGE_COUNT} ${esc(stageTitle(modeOf(), i))}</b> ${esc(stageBody(modeOf(), i))}` : T('Outline a lesion to see its plan played out.', 'Konturkan lesi untuk melihat rencananya diputar.');
  document.querySelectorAll<HTMLElement>('.steps2 li').forEach(li => li.classList.toggle('on', Number(li.dataset.stage) === i));
}
function togglePlay(): void {
  playing = !playing;
  const b = document.getElementById('play'); if (b) b.textContent = playing ? T('Pause', 'Jeda') : T('Play the plan', 'Putar rencana');
  const s = document.getElementById('stage') as HTMLInputElement;
  if (playing && Number(s.value) >= STAGE_COUNT - 0.02) s.value = '0';
  let last = performance.now();
  const step = (t: number) => {
    if (!playing) return;
    const dt = (t - last) / 1000; last = t;
    const v = Math.min(STAGE_COUNT, Number(s.value) + dt / 3.4);
    s.value = String(v); setStage(v);
    if (v >= STAGE_COUNT) { playing = false; if (b) b.textContent = T('Play the plan', 'Putar rencana'); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function updatePeelLabel(): void {
  const v = viewer?.peel ?? 0;
  const el = document.getElementById('peel-lbl');
  if (el) el.textContent = v < 0.08 ? T('skin', 'kulit') : v < 0.38 ? T('fat and SMAS (schematic)', 'lemak dan SMAS (skematik)') : v < 0.64 ? T('muscle', 'otot') : T('bone', 'tulang');
}

/* ------------------------------------------------------------------- render */
function render(): void {
  const s = state;
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === s.tab)));
  document.querySelectorAll<HTMLElement>('.view').forEach(v => { v.hidden = v.dataset.view !== s.tab; });
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === s.tool)));
  document.querySelectorAll<HTMLElement>('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(s.layers[b.dataset.layer as keyof typeof s.layers])));
  const hint = document.getElementById('tool-hint');
  if (hint) hint.textContent = ({
    tap: T('Tap the middle of the lesion.', 'Ketuk bagian tengah lesi.'), trace: T('Tap along the wound, then double-tap to finish.', 'Ketuk sepanjang luka, lalu ketuk dua kali untuk selesai.'),
    brush: T('Paint where the outline should include more.', 'Lukis bagian yang harus ikut dalam kontur.'), erase: T('Paint where the outline should exclude.', 'Lukis bagian yang harus keluar dari kontur.'),
    landmarks: T('Drag a white landmark; every number is recalculated.', 'Seret landmark putih; semua angka dihitung ulang.'), scale: T('Tap the two ends of a length you know.', 'Ketuk dua ujung panjang yang Anda ketahui.'),
  } as Record<string, string>)[s.tool];
  const busy = document.getElementById('busy')!;
  busy.hidden = !s.busy; busy.textContent = s.busy === 'detect' ? T('Finding the face…', 'Mencari wajah…') : T('Outlining…', 'Mengonturkan…');
  document.getElementById('empty')!.hidden = !!s.photo;
  document.getElementById('gate-card')!.innerHTML = s.gate ? `<h4>${T('Photo quality', 'Kualitas foto')}</h4>${gateHtml()}` : '';
  document.getElementById('scale-card')!.innerHTML = s.frame ? `<h4>${T('Scale', 'Skala')}</h4>${scaleHtml()}` : '';
  if (s.error) setStatus(s.error as 'detect' | 'segment'); else if (!document.getElementById('msg')!.classList.contains('bad')) setStatus('none');
  if (s.error === null && document.getElementById('msg')) { /* keep any file error until a new photo */ }
  view2d?.draw();
  renderResults();
  if (s.tab === 'plan') renderPlan();
  if (s.tab === '3d') void ensure3d();
}

const openState = new Map<string, boolean>();
function section(id: string, title: string, body: string, open: boolean): string {
  const o = openState.get(id) ?? open;
  return `<details class="acc" data-acc="${id}" ${o ? 'open' : ''}><summary>${title}</summary><div class="accb">${body}</div></details>`;
}

function renderResults(): void {
  const el = document.getElementById('results')!;
  const mode = modeOf();
  const stage = Math.min(STAGE_COUNT - 1, Math.floor(Number((document.getElementById('stage') as HTMLInputElement | null)?.value ?? 0)));
  const has = !!state.photo && !!state.gate && state.gate.status !== 'CANNOT_ASSESS';
  const refused = state.gate?.status === 'CANNOT_ASSESS';
  const body = !state.photo ? `<p class="muted">${T('Results appear here after you add a photograph.', 'Hasil muncul di sini setelah Anda menambahkan foto.')}</p>`
    : refused ? `<div class="banner bad">${T('This photograph cannot be assessed, so no measurements are shown. See the reasons on the left and take a new photograph.', 'Foto ini tidak bisa dinilai, jadi tidak ada angka yang ditampilkan. Lihat alasannya di kiri dan ambil foto baru.')}</div>`
    : section('find', T('Lesion and differential', 'Lesi dan diagnosis banding'), findingsHtml(), true) +
      section('plan', T('Surgical plan', 'Rencana bedah'), planHtml(mode, stage), true) +
      section('manage', T('What to do: ED, clinic, refer', 'Apa yang dikerjakan: IGD, poli, rujuk'), managementHtml(), false) +
      section('face', T('Face analysis', 'Analisis wajah'), proportionsHtml(), false) +
      section('case', T('Case', 'Kasus'), caseHtml(), false);
  el.innerHTML = `<div class="results-in">${body}<p class="fine disclaimer">${T('Decision support for clinicians. Not a diagnosis, no beauty score, no verdict on whether surgery is needed. The photo is processed on this device.', 'Alat bantu keputusan untuk dokter. Bukan diagnosis, tanpa skor kecantikan, tanpa vonis perlu atau tidaknya operasi. Foto diproses di perangkat ini.')}</p></div>`;
  el.querySelectorAll<HTMLDetailsElement>('details[data-acc]').forEach(d => d.addEventListener('toggle', () => openState.set(d.dataset.acc!, d.open)));
  void has;
}

let savedCases: CaseRecord[] = [];
function caseHtml(): string {
  const rows = savedCases.filter(c => c.code === state.code).map(c => `<tr><td>${new Date(c.created_at).toLocaleDateString(lang() === 'id' ? 'id-ID' : 'en-GB')}</td><td class="n">${esc(String((c.summary as { lengthMm?: number }).lengthMm ?? '-'))}</td><td class="n">${esc(String((c.summary as { mirrorMean?: number }).mirrorMean ?? '-'))}</td><td><button class="btn ghost small" data-act="del" data-id="${c.id}" aria-label="${T('Delete', 'Hapus')}">×</button></td></tr>`).join('');
  return `<div class="row wrap"><button class="btn small" data-act="save">${T('Save this case', 'Simpan kasus ini')}</button><button class="btn ghost small" data-act="csv">CSV</button><button class="btn ghost small" data-act="pdf">PDF</button></div>
  <p class="fine" id="save-msg">${T('Only numbers and a small thumbnail are saved. The original photograph is never stored.', 'Hanya angka dan thumbnail kecil yang disimpan. Foto asli tidak pernah disimpan.')}</p>
  <h5>${T('Trend for this code', 'Tren untuk kode ini')}</h5>${rows ? `<table class="tbl"><thead><tr><th>${T('Date', 'Tanggal')}</th><th>${T('Lesion mm', 'Lesi mm')}</th><th>${T('Asym. mm', 'Asim. mm')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">${T('No saved visits for this code yet.', 'Belum ada kunjungan tersimpan untuk kode ini.')}</p>`}`;
}

function summary(): Record<string, unknown> {
  const s = state;
  return {
    lengthMm: s.report?.lengthMm ?? null, meanAngle: s.report?.meanAngle ?? null, dx: s.cls?.top ?? null, tier: s.cls?.malignancy.tier ?? null,
    sizeMm: s.cls?.sizeMm ?? null, depthMm: s.cls ? { est: s.cls.depth.mm, lo: s.cls.depth.loMm, hi: s.cls.depth.hiMm } : null, setting: s.cls?.setting.level ?? null,
    technique: s.plan?.techniques[0]?.name.k ?? null, scalePxPerMm: s.frame ? Math.round(s.frame.scale * 100) / 100 : null, gate: s.gate?.status ?? null,
    mirrorMean: s.props?.mirror.mean ?? null, nasalIndex: s.props?.nose.index ?? null, middleToLower: s.props?.ratios.middle_to_lower_third ?? null,
  };
}

function thumb(): string | null {
  const p = state.photo; if (!p) return null;
  const c = document.createElement('canvas'); const k = 160 / Math.max(p.width, p.height);
  c.width = Math.round(p.width * k); c.height = Math.round(p.height * k);
  c.getContext('2d')!.drawImage(p.canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}

async function refreshCases(): Promise<void> { try { savedCases = await api.list(); } catch { savedCases = []; } renderResults(); }

async function saveCase(): Promise<void> {
  const msg = document.getElementById('save-msg');
  try {
    const rec = await api.save(state.code, summary(), thumb());
    savedCases = [rec, ...savedCases]; state.savedId = rec.id;
    renderResults(); const m2 = document.getElementById('save-msg'); if (m2) m2.textContent = T('Saved.', 'Tersimpan.');
  } catch (e) {
    const detail = e instanceof ApiError ? e.detail : T('The server is not reachable.', 'Server tidak terjangkau.');
    if (msg) { msg.textContent = detail; msg.classList.add('bad'); }
  }
}
async function removeCase(id: string): Promise<void> { try { await api.remove(id); savedCases = savedCases.filter(c => c.id !== id); renderResults(); } catch { /* keep list */ } }

function download(name: string, data: string, mime: string): void {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCsv(): void {
  const s = summary();
  const rows = [['code', state.code], ...Object.entries(s).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')])];
  download(`${state.code}.csv`, '﻿' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv;charset=utf-8');
}
function exportPdf(): void {
  const imgs = drawPlanImages(state);
  const w = window.open('', '_blank'); if (!w) return;
  const im = (c: HTMLCanvasElement | undefined, cap: string) => (c ? `<figure><img src="${c.toDataURL('image/jpeg', 0.85)}"><figcaption>${cap}</figcaption></figure>` : '');
  const s = summary();
  w.document.write(`<!doctype html><html lang="${lang()}"><head><meta charset="utf-8"><title>${esc(state.code)}</title><style>body{font:13px system-ui;margin:24px;color:#111}h1{font-size:18px}figure{display:inline-block;width:32%;margin:0 .5%}img{width:100%}figcaption{font-size:11px}table{border-collapse:collapse}td{border:1px solid #ccc;padding:3px 8px}.f{color:#555;font-size:11px;margin-top:14px}</style></head><body>
  <h1>FaceStudio ${esc(state.code)}</h1><p>${new Date().toLocaleDateString()}</p>
  ${im(imgs?.measured, T('Measured', 'Terukur'))}${im(imgs?.marking, T('Marking', 'Marking'))}${im(imgs?.result, T('Expected appearance (illustration)', 'Perkiraan hasil (ilustrasi)'))}
  <table>${Object.entries(s).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))}</td></tr>`).join('')}</table>
  <p class="f">${T('Decision support for clinicians; not a diagnosis. Sizes and depth are estimates from a 2D photograph. A photograph cannot exclude malignancy.', 'Alat bantu keputusan untuk dokter; bukan diagnosis. Ukuran dan kedalaman adalah perkiraan dari foto 2D. Foto tidak dapat menyingkirkan keganasan.')}</p></body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}

function renderPlan(): void {
  const host = document.getElementById('plan3')!;
  const imgs = drawPlanImages(state);
  if (!imgs) { host.innerHTML = `<div class="empty"><p>${T('Outline a lesion to get the three pictures: measured, marked, expected appearance.', 'Konturkan lesi untuk mendapatkan tiga gambar: terukur, marking, perkiraan hasil.')}</p></div>`; return; }
  const p = state.plan!, r = state.report!;
  const cap = [
    [T('Measured', 'Terukur'), T(`Length ${num(r.lengthMm, 1)} mm, ${num(r.meanAngle, 0)}° to the RSTL axis (${num(r.axis, 0)}°). Scale bar 10 mm.`, `Panjang ${num(r.lengthMm, 1)} mm, ${num(r.meanAngle, 0)}° terhadap sumbu RSTL (${num(r.axis, 0)}°). Skala 10 mm.`)],
    [T('Marking', 'Marking'), p.marking.length ? T('Lines to draw on the skin; numbers show the order of the first sutures (halving).', 'Garis yang digambar di kulit; angka menunjukkan urutan jahitan pertama (halving).') : T('No automatic marking for this technique.', 'Tidak ada marking otomatis untuk teknik ini.')],
    [T('Expected appearance', 'Perkiraan hasil'), T('An illustration of the closed line, not a prediction of the result.', 'Ilustrasi garis yang sudah tertutup, bukan prediksi hasil.')],
  ];
  host.innerHTML = [imgs.measured, imgs.marking, imgs.result].map((c, i) => `<figure><img alt="${esc(cap[i][0])}" src="${c.toDataURL('image/jpeg', 0.88)}"><figcaption><b>${i + 1}. ${esc(cap[i][0])}</b> ${esc(cap[i][1])}</figcaption></figure>`).join('');
}

void refreshCases;
void applyDom;
void recompute;
export { refreshCases };
