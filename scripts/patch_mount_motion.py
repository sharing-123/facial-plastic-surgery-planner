"""Wire the Movement (video) and Nose (side photo) tabs and the capture guide into the studio shell."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")

st = (W / "store.ts").read_text(encoding="utf8")
st = st.replace("export type Tab = 'photo' | '3d' | 'plan';", "export type Tab = 'photo' | '3d' | 'plan' | 'video' | 'nose';", 1)
(W / "store.ts").write_text(st, encoding="utf8")

m = (W / "mount.ts").read_text(encoding="utf8")
m = m.replace("import { playTheater } from './theater';", "import { playTheater } from './theater';\nimport { guideHtml } from './guide';\nimport { hasMotion, motionHtml, mountVideo, paintMotion } from './video';\nimport { mountNose, noseHtml, wireNose } from './nose';", 1)
# guide card right after the case-code card
m = m.replace("""      <section class="card">
        <div class="drop" id="drop\"""", """      <section class="card"><details class="acc guide-acc"><summary>${T('What do I need to capture?', 'Apa yang perlu direkam?')}</summary><div class="accb">${guideHtml()}</div></details></section>
      <section class="card">
        <div class="drop" id="drop\"""", 1)
m = m.replace("""${([['photo', 'Photo', 'Foto'], ['3d', '3D', '3D'], ['plan', 'Plan', 'Rencana']] as const).map(([k, en, id]) => `<button role="tab" data-tab="${k}" aria-selected="false">${T(en, id)}</button>`).join('')}""",
              """${([['photo', 'Photo', 'Foto', ''], ['3d', '3D', '3D', ''], ['plan', 'Plan', 'Rencana', ''], ['video', 'Movement', 'Gerakan', 'video'], ['nose', 'Nose', 'Hidung', 'side']] as const).map(([k, en, id, b]) => `<button role="tab" data-tab="${k}" aria-selected="false">${T(en, id)}${b ? `<small class="tab-badge ${b}">${b === 'video' ? T('video', 'video') : T('side photo', 'foto samping')}</small>` : ''}</button>`).join('')}""", 1)
m = m.replace("""<div class="view" data-view="plan" hidden><div class="plan3" id="plan3"></div></div>""", """<div class="view" data-view="plan" hidden><div class="plan3" id="plan3"></div></div>
        <div class="view" data-view="video" hidden id="v-video"></div>
        <div class="view" data-view="nose" hidden id="v-nose"></div>""", 1)
m = m.replace("  view2d = new View2D(document.getElementById('v2d')!);", "  mountVideo(document.getElementById('v-video')!, () => renderResults());\n  mountNose(document.getElementById('v-nose')!, () => renderResults());\n  view2d = new View2D(document.getElementById('v2d')!);", 1)
m = m.replace("  const body = !state.photo ? `", """  if (state.tab === 'video' || state.tab === 'nose') {
    el.innerHTML = `<div class="results-in">${state.tab === 'video' ? motionHtml() : noseHtml()}</div>`;
    if (state.tab === 'video') paintMotion(el); else wireNose(el);
    return;
  }
  const body = !state.photo ? `""", 1)
m = m.replace("  if (s.tab === 'plan') renderPlan();", "  if (s.tab === 'plan') renderPlan();\n  void hasMotion;", 1)
(W / "mount.ts").write_text(m, encoding="utf8")

c = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\styles\studio.css")
t = c.read_text(encoding="utf8")
t += r"""
/* capture guide, movement and nose tabs */
.guide { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.guide li { display: grid; gap: 3px; }
.guide b { font-weight: 500; font-size: 0.88rem; color: var(--text); } .guide small { color: var(--muted); font-size: 0.78rem; line-height: 1.45; }
.chip { justify-self: start; font: 500 0.68rem 'JetBrains Mono', monospace; letter-spacing: 0.04em; padding: 2px 9px; border-radius: 999px; border: 1px solid; }
.chip.photo { color: #5fe8c8; border-color: rgba(95,232,200,0.5); background: rgba(95,232,200,0.08); }
.chip.video { color: #ff8f6e; border-color: rgba(255,143,110,0.55); background: rgba(255,143,110,0.08); }
.chip.profile { color: #f2c14b; border-color: rgba(242,193,75,0.55); background: rgba(242,193,75,0.08); }
.tab-badge { margin-left: 7px; font: 500 0.62rem 'JetBrains Mono', monospace; padding: 1px 7px; border-radius: 999px; vertical-align: 1px; }
.tab-badge.video { color: #ff8f6e; border: 1px solid rgba(255,143,110,0.5); } .tab-badge.side { color: #f2c14b; border: 1px solid rgba(242,193,75,0.5); }
.mv { position: absolute; inset: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 10px; padding: 12px; }
.mv-stage { position: relative; min-height: 0; display: grid; place-items: center; background: #0a0b0d; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px rgba(95,232,200,0.14); }
.mv-stage canvas { max-width: 100%; max-height: 100%; aspect-ratio: 1; width: auto; height: 100%; display: block; }
.mv-empty { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; padding: 24px; color: var(--muted); max-width: 560px; margin: auto; }
.mv-empty[hidden] { display: none; } .mv-empty h2 { font-weight: 350; font-size: 1.6rem; color: var(--text); margin: 0 0 8px; letter-spacing: -0.02em; }
.mv-prompt { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); padding: 8px 18px; border-radius: 999px; background: rgba(5,6,8,0.85); color: #c8fff0; font: 500 0.95rem system-ui; border: 1px solid rgba(95,232,200,0.5); white-space: nowrap; }
.mv-prompt[hidden] { display: none; }
.mv-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.08); } .mv-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #3fd6b4, #c8fff0); box-shadow: 0 0 12px #5fe8c8; }
.mv-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mv-sep { width: 1px; height: 18px; background: var(--line); margin: 0 4px; }
.mv-live-chart { position: absolute; right: 24px; bottom: 70px; width: 38%; max-width: 360px; height: auto; background: rgba(5,6,8,0.75); border: 1px solid var(--line); border-radius: 8px; pointer-events: none; }
.mv-live-chart[hidden] { display: none; }
.mv-card { border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 10px 0; display: grid; gap: 8px; }
.mv-card.dim { opacity: 0.8; } .mv-card h5 { margin: 0; font-weight: 500; font-size: 0.95rem; color: var(--text); }
.mv-row { display: grid; grid-template-columns: 52px 1fr auto; gap: 10px; align-items: center; font-size: 0.84rem; color: var(--muted); }
.mv-row i { display: block; height: 10px; width: var(--w); min-width: 2px; border-radius: 6px; transition: width 0.8s cubic-bezier(.2,.8,.2,1); animation: barIn 0.9s cubic-bezier(.2,.8,.2,1) both; }
.mv-row i.R { background: #5fe8c8; box-shadow: 0 0 10px rgba(95,232,200,0.4); } .mv-row i.L { background: #ff8f6e; box-shadow: 0 0 10px rgba(255,143,110,0.4); }
.mv-row b { font: 500 0.8rem 'JetBrains Mono', monospace; color: var(--text); }
@keyframes barIn { from { width: 0; } }
.mv-gap { margin: 0; color: var(--text); font-size: 0.9rem; }
.mv-peak { width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--line); }
.mv-badge { display: inline-block; font: 500 0.7rem 'JetBrains Mono', monospace; color: #ff8f6e; border: 1px solid rgba(255,143,110,0.5); border-radius: 999px; padding: 2px 10px; }
#mv-chart { width: 100%; height: auto; }
.lg { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 4px 0 8px; } .lg.R { background: #5fe8c8; } .lg.L { background: #ff8f6e; }
.ns-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 6px; }
.ns-row b { font-weight: 500; font-size: 0.9rem; color: var(--text); } .ns-row span { display: block; font-size: 0.74rem; color: var(--muted); }
.ns-row strong { font: 500 1.2rem 'JetBrains Mono', monospace; color: var(--text); align-self: center; } .ns-row em { grid-column: 1 / -1; font-style: normal; font-size: 0.76rem; }
.ns-row.ok em { color: #5fe8c8; } .ns-row.lo em, .ns-row.hi em { color: #f2c14b; }
.ns-in { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; font-size: 0.82rem; color: var(--muted); align-items: center; } .ns-in input[type=range] { grid-column: 1 / -1; } .ns-in b { color: var(--text); font-family: 'JetBrains Mono', monospace; } .ns-in input[type=number] { grid-column: 1 / -1; }
#ns-cv { cursor: crosshair; }
"""
c.write_text(t, encoding="utf8")
print("ok")
