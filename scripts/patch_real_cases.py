"""Real cases: stage the chosen openly licensed photographs, and let the Movement tab read two photos side by side (before and after)."""
import json
import shutil
from pathlib import Path

SRC = Path(r"C:\Users\allam\AppData\Local\Temp\claude\a7673535580505a5\ad480fce-68da-4eca-922b-b10bdaa34a89\scratchpad\real")
PUB = Path(r"C:\Users\allam\Downloads\FaceStudio\web\public\real")
W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")
KEEP = [
    "fazialisl_hmung_tag_05_bell_ph_nomen_2_1000.jpg", "bell_s_palsy_symptoms_show_your_teeth.jpg", "bell_s_palsy_symptoms_closed_eyes.jpg",
    "bellspalsy.jpg", "man_suffering_from_right_facial_palsy_wellcome_l.jpg", "before_and_after_dynamic_smile_reconstruction.jpg", "cleft_lip_child.jpg",
]
PUB.mkdir(parents=True, exist_ok=True)
att = json.loads((SRC / "ATTRIBUTION.json").read_text(encoding="utf8"))
out = {}
for f in KEEP:
    shutil.copy(SRC / f, PUB / f)
    out[f] = att[f]
(PUB / "ATTRIBUTION.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf8")

v = (W / "video.ts").read_text(encoding="utf8")
v = v.replace("const ui = { stat: null as { m: Measures; name: string; thumb: Thumb } | null,", "const ui = { stats: [] as Array<{ m: Measures; name: string; thumb: Thumb }>,", 1)
v = v.replace("export async function runStills(list: StillIn[]): Promise<void> {\n  setRunning(true); ui.report = null; ui.stat = null;", "export async function runStills(list: StillIn[], mode: 'series' | 'compare' = 'series'): Promise<void> {\n  setRunning(true); ui.report = null; ui.stats = [];", 1)
old = v[v.index("    if (list.length === 1) {"):v.index("    const frames: Frame[] = [], thumbs: Thumb[] = [];\n    const rest = lms[0];")]
new = """    if (list.length === 1 || mode === 'compare') {
      const got = list.map((s, i) => ({ s, lm: lms[i] })).filter(x => x.lm);
      if (!got.length) { prompt.hidden = false; prompt.textContent = T('No face was found in the photo.', 'Wajah tidak ditemukan pada foto.'); setRunning(false); return; }
      ui.stats = got.map(x => ({ m: measure(x.lm!), name: x.s.name, thumb: thumbOf(x.s.c, x.lm!) }));
      ui.thumbs = []; setRunning(false); drawFrame(got[0].s.c, got[0].lm!, got[0].s.name, 0, false); ui.onChange(); return;
    }
"""
v = v.replace(old, new, 1)
# statHtml for several photos
a = v.index("function statHtml(): string {"); b = v.index("async function runFile(f: File)")
stat = """function statCard(s: { m: Measures; name: string; thumb: Thumb }, i: number): string {
  const m = s.m;
  const mm = m.irisPx ? IRIS_MM / (m.irisPx / m.ocwPx) : null;
  const val = (v: number) => (mm ? `${num(v * mm, 1)} mm` : `${num(v * 100, 1)}%`);
  const row = (en: string, id: string, R: number, L: number, share = false) => `<div class="ns-row"><div><b>${esc(lang() === 'id' ? id : en)}</b><span>${T('right', 'kanan')} ${val(R)} · ${T('left', 'kiri')} ${val(L)}</span></div><strong>${share ? `${Math.round((Math.min(R, L) / Math.max(R, L)) * 100)}%` : val(Math.abs(R - L))}</strong><em>${share ? T('smaller side as a share of the larger', 'sisi kecil sebagai bagian dari sisi besar') : T('difference between the sides', 'selisih antar sisi')}</em></div>`;
  return `<section class="mv-card"><h5>${esc(s.name)}</h5><canvas class="mv-peak mv-stat" data-i="${i}" width="${TH}" height="${TH}"></canvas>
      ${row('Eyebrow height above the canthal line', 'Tinggi alis di atas garis kantus', m.brow.R, m.brow.L)}
      ${row('Eye opening', 'Bukaan mata', m.aperture.R, m.aperture.L, true)}
      ${row('Mouth-corner height', 'Tinggi sudut mulut', m.cornerY.R, m.cornerY.L)}</section>`;
}

function statHtml(): string {
  const two = ui.stats.length === 2;
  return `<div class="mv-badge photo">${two ? T('Two photos side by side', 'Dua foto berdampingan') : T('One photo: static reading', 'Satu foto: pembacaan statis')}</div>
    ${two ? `<section class="mv-card"><h5>${T('Before and after', 'Sebelum dan sesudah')}</h5><div id="mv-stat-cmp"></div></section>` : ''}
    ${ui.stats.map(statCard).join('')}
    <p class="fine">${T('A photograph shows how the two sides sit in that pose, not how far each side can move, so one photo cannot tell a palsy from a resting asymmetry. Add a rest photo first, then the movement photos (smile, brow raise, eye closure), or a short video, to compare how far each side moves. The scale comes from the iris (11.7 mm, about ±5%). No grade and no diagnosis.', 'Foto menunjukkan letak kedua sisi pada pose itu, bukan seberapa jauh tiap sisi bisa bergerak, jadi satu foto tidak bisa membedakan palsi dari asimetri saat istirahat. Tambahkan foto istirahat lebih dulu, lalu foto gerakan (senyum, angkat alis, menutup mata), atau video singkat, untuk membandingkan seberapa jauh tiap sisi bergerak. Skala dari iris (11,7 mm, sekitar ±5%). Tanpa derajat dan tanpa diagnosis.')}</p>
    ${palsyReference()}${smileReference()}`;
}

"""
v = v[:a] + stat + v[b:]
v = v.replace("  if (!r && ui.stat) return statHtml();", "  if (!r && ui.stats.length) return statHtml();", 1)
a = v.index("  const sc = root.querySelector<HTMLCanvasElement>('#mv-stat');"); b = v.index("  const r = ui.report; if (!r) return;")
paint = """  root.querySelectorAll<HTMLCanvasElement>('.mv-stat').forEach(sc => {
    const s = ui.stats[Number(sc.dataset.i)]; if (!s) return;
    const th = s.thumb, k = sc.width / th.c.width; sc.height = Math.round(th.c.height * k);
    const ctx = sc.getContext('2d')!; ctx.drawImage(th.c, 0, 0, sc.width, sc.height);
    if (th.lm) { const L = th.lm.map(p => [p[0] * k, p[1] * k] as Pt); ctx.fillStyle = '#5fe8c8'; for (const i of [61, 159, 145, 105]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5); ctx.fillStyle = '#ff8f6e'; for (const i of [291, 386, 374, 334]) ctx.fillRect(L[i][0] - 2.5, L[i][1] - 2.5, 5, 5); }
  });
  const cmp = root.querySelector<HTMLElement>('#mv-stat-cmp');
  if (cmp && ui.stats.length === 2) {
    const [a, b] = ui.stats.map(s => s.thumb.c);
    const same = document.createElement('canvas'); same.width = a.width; same.height = a.height; same.getContext('2d')!.drawImage(b, 0, 0, a.width, a.height);
    cmp.appendChild(compareSlider(a, same, T('Before', 'Sebelum'), T('After', 'Sesudah')));
  }
"""
v = v[:a] + paint + v[b:]
v = v.replace("export const hasMotion = (): boolean => !!ui.report || !!ui.stat;", "export const hasMotion = (): boolean => !!ui.report || ui.stats.length > 0;", 1)
(W / "video.ts").write_text(v, encoding="utf8")

# real.ts: cases
r = (W / "real.ts").read_text(encoding="utf8")
r = r.replace("  points?: Record<string, [number, number]>;\n}", "  points?: Record<string, [number, number]>;\n  /** a composite picture holding two panels side by side (before | after) */\n  split?: boolean;\n}", 1)
r = r.replace("export const REAL: RealCase[] = [];", """export const REAL: RealCase[] = [
  { id: 'r-palsy-eye', tab: 'video', need: 'video', files: ['fazialisl_hmung_tag_05_bell_ph_nomen_2_1000.jpg'],
    title: ['Bell palsy: eye closure and Bell phenomenon', 'Bell palsy: menutup mata dan fenomena Bell'], sub: ['A real photograph on day 5. The eye on the image right does not close and rolls up.', 'Foto nyata hari ke-5. Mata di sisi kanan gambar tidak menutup dan berputar ke atas.'] },
  { id: 'r-palsy-teeth', tab: 'video', need: 'video', files: ['bell_s_palsy_symptoms_show_your_teeth.jpg'],
    title: ['Facial palsy: showing the teeth', 'Kelumpuhan wajah: memperlihatkan gigi'], sub: ['A real photograph of an attempted smile with the teeth shown.', 'Foto nyata upaya senyum dengan gigi diperlihatkan.'] },
  { id: 'r-palsy-eyes', tab: 'video', need: 'video', files: ['bell_s_palsy_symptoms_closed_eyes.jpg'],
    title: ['Facial palsy: eyes squeezed shut', 'Kelumpuhan wajah: mata dipejamkan kuat'], sub: ['A real photograph of an attempt to close the eyes tightly.', 'Foto nyata upaya memejamkan mata kuat.'] },
  { id: 'r-palsy-smile', tab: 'video', need: 'video', files: ['bellspalsy.jpg'],
    title: ['Facial palsy: smile with the head tilted', 'Kelumpuhan wajah: senyum dengan kepala miring'], sub: ['A real photograph of a smile. The head is tilted, which the reading corrects for roll only.', 'Foto nyata senyum. Kepala miring, yang hanya dikoreksi untuk roll.'] },
  { id: 'r-palsy-old', tab: 'video', need: 'video', files: ['man_suffering_from_right_facial_palsy_wellcome_l.jpg'],
    title: ['Right facial palsy (historical photograph)', 'Kelumpuhan wajah kanan (foto bersejarah)'], sub: ['A real historical photograph from the Wellcome Collection.', 'Foto bersejarah nyata dari Wellcome Collection.'] },
  { id: 'r-smile-recon', tab: 'video', need: 'video', files: ['before_and_after_dynamic_smile_reconstruction.jpg'], split: true,
    title: ['Smile reconstruction: before and after', 'Rekonstruksi senyum: sebelum dan sesudah'], sub: ['A real before and after pair after dynamic smile reconstruction, read side by side with a slider.', 'Pasangan nyata sebelum dan sesudah rekonstruksi senyum dinamis, dibaca berdampingan dengan slider.'] },
  { id: 'r-cleft-child', tab: 'cleft', need: 'photo', files: ['cleft_lip_child.jpg'],
    title: ['Unilateral cleft lip in a child', 'Bibir sumbing unilateral pada anak'], sub: ['A real photograph. The twelve points are pre-placed for you to confirm or drag.', 'Foto nyata. Dua belas titik sudah dipasang untuk Anda konfirmasi atau geser.'],
    points: { nasion: [0.52, 0.36], prn: [0.52, 0.53], sn: [0.52, 0.60], sbal_R: [0.46, 0.61], sbal_L: [0.575, 0.60], al_R: [0.434, 0.568], al_L: [0.605, 0.558], cph_R: [0.457, 0.70], cph_L: [0.54, 0.674], ls: [0.50, 0.675], ch_R: [0.406, 0.73], ch_L: [0.61, 0.727] } },
];""", 1)
r = r.replace("""    const list = [];
    for (const f of r.files) { const p = await loadPhotoUrl(`/real/${f}`, f); list.push({ c: p.canvas, name: f }); }
    await runStills(list);""", """    const list: Array<{ c: HTMLCanvasElement; name: string }> = [];
    for (const f of r.files) { const p = await loadPhotoUrl(`/real/${f}`, f); list.push({ c: p.canvas, name: f }); }
    if (r.split) {
      const src = list[0].c, w = Math.floor(src.width / 2), halves: typeof list = [];
      for (const [i, nm] of [T('Before', 'Sebelum'), T('After', 'Sesudah')].entries()) {
        const c = document.createElement('canvas'); c.width = w; c.height = src.height;
        c.getContext('2d')!.drawImage(src, i * w, 0, w, src.height, 0, 0, w, src.height); halves.push({ c, name: nm });
      }
      await runStills(halves, 'compare');
    } else await runStills(list);""", 1)
(W / "real.ts").write_text(r, encoding="utf8")
print("ok")
