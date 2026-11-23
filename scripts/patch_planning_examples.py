"""Planning examples (palsy, smile, cleft, nose) in the gallery, plus the Cleft tab wiring."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")

v = (W / "video.ts").read_text(encoding="utf8")
v = v.replace("  const smile = r.moves.find(m => m.key === 'smile');\n", "", 1)
v += """
/** Examples started from the gallery: a synthetic clip with a known answer, run through the same tracking as a real one. */
export const runPalsyExample = (): Promise<void> => runSynth({ smile: [0.4, 1], brow: [0.35, 1], eye: [0.5, 1] }, T('Synthetic right-sided weakness', 'Kelemahan sisi kanan sintetis'));
export const runSmileExample = (): Promise<void> => runSynth({ smile: [1, 0.4] }, T('Synthetic smile, left weaker', 'Senyum sintetis, kiri lebih lemah'));
"""
(W / "video.ts").write_text(v, encoding="utf8")

n = (W / "nose.ts").read_text(encoding="utf8")
n += "\nexport function runNoseExample(): void { demoProfile(); st.noseMm = null; refresh(); }\n"
(W / "nose.ts").write_text(n, encoding="utf8")

s = (W / "store.ts").read_text(encoding="utf8")
s = s.replace("export type Tab = 'photo' | '3d' | 'plan' | 'video' | 'nose';", "export type Tab = 'photo' | '3d' | 'plan' | 'video' | 'nose' | 'cleft';", 1)
(W / "store.ts").write_text(s, encoding="utf8")

e = (W / "examples.ts").read_text(encoding="utf8")
e = e.replace("""    const pick = (el: HTMLElement) => { closeExamples(); onPick(el.dataset.ex!); };""", """    body.insertAdjacentHTML('beforeend', planningHtml());
    const pick = (el: HTMLElement) => { closeExamples(); onPick(el.dataset.ex!); };""", 1)
e = e.replace("""export function closeExamples(): void {""", """const PLANNING: Array<{ id: string; img: string; chip: [string, string]; need: 'video' | 'photo' | 'profile'; title: [string, string]; sub: [string, string] }> = [
  { id: 'p-palsy', img: 'sample-2.jpg', need: 'video', chip: ['video', 'video'], title: ['Facial palsy pattern, right side', 'Pola kelumpuhan wajah, sisi kanan'], sub: ['Synthetic clip with a known answer: right against left brow, eye and smile, and what is usually done.', 'Klip sintetis dengan jawaban diketahui: alis, mata dan senyum kanan lawan kiri, dan apa yang lazim dikerjakan.'] },
  { id: 'p-smile', img: 'sample-3.jpg', need: 'video', chip: ['video', 'video'], title: ['Smile balance, with a preview', 'Keseimbangan senyum, dengan pratinjau'], sub: ['A weaker left corner, the gap in mm, and the smile if the corner matched the other side.', 'Sudut kiri lebih lemah, selisih dalam mm, dan senyum bila sudut itu setara dengan sisi lain.'] },
  { id: 'p-cleft', img: 'sample-1.jpg', need: 'photo', chip: ['front photo', 'foto depan'], title: ['Cleft-lip-type asymmetry', 'Asimetri tipe bibir sumbing'], sub: ['Twelve points, right against left, and the usual sequence of care by age.', 'Dua belas titik, kanan lawan kiri, dan urutan perawatan lazim menurut usia.'] },
  { id: 'p-nose', img: 'sample-2.jpg', need: 'profile', chip: ['side photo', 'foto samping'], title: ['Flat nose to a projected tip', 'Hidung pesek menjadi ujung lebih mancung'], sub: ['Angles and Goode ratio on a side view, the planned profile, a before and after slider, and the methods.', 'Sudut dan rasio Goode pada tampak samping, profil rencana, slider sebelum dan sesudah, dan metodenya.'] },
];

function planningHtml(): string {
  const i = lang() === 'id' ? 1 : 0;
  return `<h4 class="ex-h">${T('Planning and simulation examples (synthetic)', 'Contoh perencanaan dan simulasi (sintetis)')}</h4>` + PLANNING.map(p => `<article class="ex-card" data-ex="${p.id}" tabindex="0" role="button" aria-label="${esc(p.title[i])}">
    <div class="ex-thumb"><img src="/samples/${p.img}" alt=""><span class="ex-chip ${p.need}">${esc(p.chip[i])}</span><span class="ex-run">${T('Run the analysis', 'Jalankan analisis')} →</span></div>
    <h5>${esc(p.title[i])}</h5><p>${esc(p.sub[i])}</p></article>`).join('');
}

export function closeExamples(): void {""", 1)
# the lesion-card click handler is bound before planning cards exist; bind everything after both are inserted
e = e.replace("""    body.querySelectorAll<HTMLElement>('.ex-sheet').forEach""", """    body.querySelectorAll<HTMLElement>('.ex-sheet').forEach""", 1)
(W / "examples.ts").write_text(e, encoding="utf8")

m = (W / "mount.ts").read_text(encoding="utf8")
m = m.replace("import { mountNose, noseHtml, wireNose } from './nose';", "import { mountNose, noseHtml, runNoseExample, wireNose } from './nose';\nimport { cleftHtml, mountCleft, paintCleft, runCleftExample } from './cleft';", 1)
m = m.replace("import { hasMotion, motionHtml, mountVideo, paintMotion } from './video';", "import { hasMotion, motionHtml, mountVideo, paintMotion, runPalsyExample, runSmileExample } from './video';", 1)
m = m.replace("['video', 'Movement', 'Gerakan', 'video'], ['nose', 'Nose', 'Hidung', 'side']]", "['video', 'Movement', 'Gerakan', 'video'], ['nose', 'Nose', 'Hidung', 'side'], ['cleft', 'Cleft', 'Sumbing', 'photo']]", 1)
m = m.replace("<small class=\"tab-badge ${b}\">${b === 'video' ? T('video', 'video') : T('side photo', 'foto samping')}</small>", "<small class=\"tab-badge ${b}\">${b === 'video' ? T('video', 'video') : b === 'side' ? T('side photo', 'foto samping') : T('photo', 'foto')}</small>", 1)
m = m.replace("""        <div class="view" data-view="nose" hidden id="v-nose"></div>""", """        <div class="view" data-view="nose" hidden id="v-nose"></div>
        <div class="view" data-view="cleft" hidden id="v-cleft"></div>""", 1)
m = m.replace("  mountNose(document.getElementById('v-nose')!, () => renderResults());", "  mountNose(document.getElementById('v-nose')!, () => renderResults());\n  mountCleft(document.getElementById('v-cleft')!, () => renderResults());", 1)
m = m.replace("""  if (state.tab === 'video' || state.tab === 'nose') {
    el.innerHTML = `<div class="results-in">${state.tab === 'video' ? motionHtml() : noseHtml()}</div>`;
    if (state.tab === 'video') paintMotion(el); else wireNose(el);
    return;
  }""", """  if (state.tab === 'video' || state.tab === 'nose' || state.tab === 'cleft') {
    el.innerHTML = `<div class="results-in">${state.tab === 'video' ? motionHtml() : state.tab === 'nose' ? noseHtml() : cleftHtml()}</div>`;
    if (state.tab === 'video') paintMotion(el); else if (state.tab === 'nose') wireNose(el); else paintCleft(el);
    return;
  }""", 1)
m = m.replace("""async function runExample(id: string): Promise<void> {
  const sp = SPECS[id];
  if (!sp) return;""", """async function runExample(id: string): Promise<void> {
  if (id.startsWith('p-')) {
    if (id === 'p-palsy' || id === 'p-smile') { setTab('video'); await (id === 'p-palsy' ? runPalsyExample() : runSmileExample()); }
    else if (id === 'p-cleft') { setTab('cleft'); await runCleftExample(); }
    else { setTab('nose'); runNoseExample(); }
    return;
  }
  const sp = SPECS[id];
  if (!sp) return;""", 1)
(W / "mount.ts").write_text(m, encoding="utf8")

c = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\styles\studio.css")
t = c.read_text(encoding="utf8")
t += r"""
.ex-h { grid-column: 1 / -1; margin: 18px 0 2px; font-weight: 500; font-size: 0.9rem; color: var(--muted); letter-spacing: 0.04em; }
.ex-chip.video { color: #ff8f6e; border-color: rgba(255,143,110,0.6); } .ex-chip.profile { color: #f2c14b; border-color: rgba(242,193,75,0.6); }
.mv-badge.photo { color: #5fe8c8; border-color: rgba(95,232,200,0.5); }
.tab-badge.photo { color: #5fe8c8; border: 1px solid rgba(95,232,200,0.5); }
.cmp { position: relative; width: 100%; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); cursor: ew-resize; touch-action: none; outline: none; background: #0a0b0d; --p: 50%; }
.cmp canvas { display: block; width: 100%; height: auto; } .cmp .cmp-top { position: absolute; inset: 0; width: 100%; height: 100%; clip-path: inset(0 0 0 var(--p)); }
.cmp-h { position: absolute; top: 0; bottom: 0; left: var(--p); width: 2px; margin-left: -1px; background: #c8fff0; box-shadow: 0 0 12px #5fe8c8; }
.cmp-h b { position: absolute; top: 50%; left: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; background: rgba(5,6,8,0.85); border: 2px solid #c8fff0; }
.cmp-l, .cmp-r { position: absolute; top: 8px; font: 500 0.68rem 'JetBrains Mono', monospace; font-style: normal; color: #c8fff0; background: rgba(5,6,8,0.75); padding: 3px 9px; border-radius: 999px; pointer-events: none; } .cmp-l { left: 8px; } .cmp-r { right: 8px; }
.ref-ul { margin: 4px 0 10px; padding-left: 18px; display: grid; gap: 5px; font-size: 0.84rem; color: var(--text); line-height: 1.5; } .ref h5, .ref-ul + h5 { margin: 10px 0 0; font-weight: 500; font-size: 0.86rem; color: #5fe8c8; }
.cl-t td, .cl-t th { font-size: 0.78rem; } .tl { display: inline-block; width: 10px; height: 10px; border-radius: 50%; } .tl.g { background: #3fd67a; } .tl.y { background: #f2c14b; } .tl.r { background: #e84b4b; }
"""
c.write_text(t, encoding="utf8")
print("ok")
