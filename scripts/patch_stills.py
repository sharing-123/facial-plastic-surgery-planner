"""Movement tab: photographs as input (a rest photo plus movement photos, or one photo read statically), for real palsy photographs."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")
v = (W / "video.ts").read_text(encoding="utf8")

v = v.replace("import { analyseMotion, type Frame, type MotionReport, type MoveKey, type MoveResult, type Pt } from './motion';",
              "import { analyseMotion, IRIS_MM, measure, type Frame, type Measures, type MotionReport, type MoveKey, type MoveResult, type Pt } from './motion';", 1)
v = v.replace("import { detectVideoFrame, startVideoSession } from './landmarker';", "import { detectFace, detectVideoFrame, startVideoSession } from './landmarker';\nimport { loadPhotoFile } from './photo';", 1)
v = v.replace("const ui = { report: null as MotionReport | null,", "const ui = { stat: null as { m: Measures; name: string; thumb: Thumb } | null, report: null as MotionReport | null,", 1)

# controls
v = v.replace("""        <button class="btn small" data-mv="file">${T('Choose a video', 'Pilih video')}</button>
        <input type="file" id="mv-file" accept="video/*" hidden>""", """        <button class="btn small" data-mv="file">${T('Choose a video', 'Pilih video')}</button>
        <input type="file" id="mv-file" accept="video/*" hidden>
        <button class="btn small" data-mv="stills">${T('Choose photos', 'Pilih foto')}</button>
        <input type="file" id="mv-stills" accept="image/jpeg,image/png,image/webp" multiple hidden>""", 1)
v = v.replace("""  file.addEventListener('change', () => { const f = file.files?.[0]; if (f) void runFile(f); file.value = ''; });""", """  file.addEventListener('change', () => { const f = file.files?.[0]; if (f) void runFile(f); file.value = ''; });
  const stills = host.querySelector<HTMLInputElement>('#mv-stills')!;
  stills.addEventListener('change', async () => {
    const fs = [...(stills.files ?? [])]; stills.value = ''; if (!fs.length) return;
    const list: StillIn[] = [];
    for (const f of fs) { try { const p = await loadPhotoFile(f); list.push({ c: p.canvas, name: f.name }); } catch { /* skip unreadable */ } }
    if (list.length) void runStills(list);
  });""", 1)
v = v.replace("    if (k === 'file') file.click();", "    if (k === 'file') file.click();\n    else if (k === 'stills') stills.click();", 1)

# stills runner, before runFile
runner = """
export interface StillIn { c: HTMLCanvasElement; name: string }

/** Photographs instead of a clip: a rest photo first, then one photo per movement, or a single photo read statically. */
export async function runStills(list: StillIn[]): Promise<void> {
  setRunning(true); ui.report = null; ui.stat = null;
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
    if (list.length === 1) {
      const lm = lms[0];
      if (!lm) { prompt.hidden = false; prompt.textContent = T('No face was found in the photo.', 'Wajah tidak ditemukan pada foto.'); setRunning(false); return; }
      const m = measure(lm); ui.stat = { m, name: list[0].name, thumb: thumbOf(list[0].c, lm) };
      ui.thumbs = []; setRunning(false); drawFrame(list[0].c, lm, list[0].name, 0, false); ui.onChange(); return;
    }
    const frames: Frame[] = [], thumbs: Thumb[] = [];
    const rest = lms[0];
    for (let i = 0; i < 6; i++) { frames.push({ t: i * 0.1, lm: rest }); thumbs.push(thumbOf(list[0].c, rest)); }
    for (let k = 1; k < list.length; k++) { frames.push({ t: 1 + k * 0.1, lm: lms[k] }); thumbs.push(thumbOf(list[k].c, lms[k])); }
    await finish(frames, thumbs, list.map(s => s.name).join(' + '));
  } catch (err) { console.error(err); prompt.hidden = false; prompt.textContent = T('The photos could not be read.', 'Foto tidak bisa dibaca.'); setRunning(false); }
}

function statHtml(): string {
  const s = ui.stat!, m = s.m;
  const mm = m.irisPx ? IRIS_MM / (m.irisPx / m.ocwPx) : null;
  const val = (v: number) => (mm ? `${num(v * mm, 1)} mm` : `${num(v * 100, 1)}%`);
  const row = (en: string, id: string, R: number, L: number, ratioOf = false) => `<div class="ns-row"><div><b>${esc(lang() === 'id' ? id : en)}</b><span>${T('right', 'kanan')} ${val(R)} · ${T('left', 'kiri')} ${val(L)}</span></div><strong>${ratioOf ? `${Math.round((Math.min(R, L) / Math.max(R, L)) * 100)}%` : val(Math.abs(R - L))}</strong><em>${ratioOf ? T('smaller side as a share of the larger', 'sisi kecil sebagai bagian dari sisi besar') : T('difference between the sides', 'selisih antar sisi')}</em></div>`;
  return `<div class="mv-badge photo">${T('One photo: static reading', 'Satu foto: pembacaan statis')}</div>
    <section class="mv-card"><h5>${esc(s.name)}</h5><canvas class="mv-peak" id="mv-stat" width="${TH}" height="${TH}"></canvas>
      ${row('Eyebrow height above the canthal line', 'Tinggi alis di atas garis kantus', m.brow.R, m.brow.L)}
      ${row('Eye opening', 'Bukaan mata', m.aperture.R, m.aperture.L, true)}
      ${row('Mouth-corner height', 'Tinggi sudut mulut', m.cornerY.R - m.cornerY.L > 0 ? m.cornerY.R : m.cornerY.R, m.cornerY.L)}
      <p class="fine">${T('One photograph shows how the two sides sit in that pose, not how far each side can move, so it cannot tell a palsy from a resting asymmetry. Add a rest photo first, then the movement photos (smile, brow raise, eye closure), to compare how far each side moves. The scale comes from the iris (11.7 mm, about ±5%). No grade and no diagnosis.', 'Satu foto menunjukkan letak kedua sisi pada pose itu, bukan seberapa jauh tiap sisi bisa bergerak, jadi tidak bisa membedakan palsi dari asimetri saat istirahat. Tambahkan foto istirahat lebih dulu, lalu foto gerakan (senyum, angkat alis, menutup mata), untuk membandingkan seberapa jauh tiap sisi bergerak. Skala dari iris (11,7 mm, sekitar ±5%). Tanpa derajat dan tanpa diagnosis.')}</p></section>
    ${palsyReference()}${smileReference()}`;
}
"""
v = v.replace("async function runFile(f: File)", runner + "\nasync function runFile(f: File)", 1)

# results
v = v.replace("export function motionHtml(): string {\n  const r = ui.report;\n  if (!r) return", "export function motionHtml(): string {\n  const r = ui.report;\n  if (!r && ui.stat) return statHtml();\n  if (!r) return", 1)
v = v.replace("export function paintMotion(root: HTMLElement): void {\n  const r = ui.report; if (!r) return;", """export function paintMotion(root: HTMLElement): void {
  const sc = root.querySelector<HTMLCanvasElement>('#mv-stat');
  if (sc && ui.stat) {
    const th = ui.stat.thumb, k = sc.width / th.c.width; sc.height = Math.round(th.c.height * k);
    const ctx = sc.getContext('2d')!; ctx.drawImage(th.c, 0, 0, sc.width, sc.height);
    if (th.lm) { const L = th.lm.map(p => [p[0] * k, p[1] * k] as Pt); ctx.fillStyle = '#5fe8c8'; for (const i of [61, 159, 145, 105]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5); ctx.fillStyle = '#ff8f6e'; for (const i of [291, 386, 374, 334]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5); }
  }
  const r = ui.report; if (!r) return;""", 1)
v = v.replace("export const hasMotion = (): boolean => !!ui.report;", "export const hasMotion = (): boolean => !!ui.report || !!ui.stat;", 1)
(W / "video.ts").write_text(v, encoding="utf8")
print("ok")
