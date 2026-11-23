"""Theater, example cards, lightbox and staged reveal styles; also tidies the Spec type in examples.ts."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src")
e = W / "studio" / "examples.ts"
s = e.read_text(encoding="utf8")
a, b = s.index("export interface Spec {"), s.index("export const SPECS")
s = s[:a] + "/** [landmark index, [dx, dy]] with the offset in face widths. */\nexport type Anchor = [number, [number, number]];\nexport interface Spec { sample: number; kind: 'laceration' | 'scar'; a: Anchor; b: Anchor; w: number }\n\n" + s[b:]
s = s.replace("export const SPECS: Record<string, { sample: number; kind: 'laceration' | 'scar'; a: [number, [number, number]]; b: [number, [number, number]]; w: number }> = {", "export const SPECS: Record<string, Spec> = {", 1)
s = s.replace("const P = (c: [number, [number, number]]): [number, number]", "const P = (c: Anchor): [number, number]")
e.write_text(s, encoding="utf8")

css = r"""
/* examples gallery */
body.modal-open { overflow: hidden; }
.modal-box.wide { position: relative; }
.modal-box.wide > .row:first-child { position: sticky; top: -16px; z-index: 2; background: var(--surface); padding: 4px 0 10px; margin: -4px 0 0; }
.ex-body { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.ex-card { display: grid; gap: 6px; align-content: start; cursor: pointer; border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: rgba(255,255,255,0.02); transition: transform 0.35s cubic-bezier(.2,.8,.2,1), border-color 0.3s, background 0.3s; outline: none; }
.ex-card:hover, .ex-card:focus-visible { transform: translateY(-4px); border-color: #5fe8c8; background: rgba(95,232,200,0.05); }
.ex-card h5 { margin: 4px 2px 0; font-weight: 500; font-size: 0.98rem; color: var(--text); }
.ex-card p { margin: 0 2px; font-size: 0.8rem; color: var(--muted); }
.ex-thumb { position: relative; overflow: hidden; border-radius: 10px; aspect-ratio: 1; background: #0b0c0e; }
.ex-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.8s cubic-bezier(.2,.8,.2,1), filter 0.4s; filter: saturate(0.85) brightness(0.85); }
.ex-card:hover .ex-thumb img { transform: scale(1.08); filter: none; }
.ex-thumb::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: #c8fff0; box-shadow: 0 0 14px #5fe8c8; opacity: 0; }
.ex-card:hover .ex-thumb::after { opacity: 1; animation: exscan 1.4s linear infinite; }
@keyframes exscan { from { top: 0; } to { top: 100%; } }
.ex-chip { position: absolute; left: 8px; top: 8px; font: 500 0.72rem 'JetBrains Mono', monospace; color: #c8fff0; background: rgba(5,6,8,0.78); border: 1px solid rgba(95,232,200,0.5); border-radius: 999px; padding: 3px 9px; }
.ex-run { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 10px 9px; font: 500 0.78rem 'JetBrains Mono', monospace; color: #04140f; background: linear-gradient(transparent, rgba(95,232,200,0.95)); transform: translateY(100%); transition: transform 0.35s cubic-bezier(.2,.8,.2,1); }
.ex-card:hover .ex-run, .ex-card:focus-visible .ex-run { transform: none; }
.ex-sheet { justify-self: start; background: none; border: 0; color: var(--muted); font-size: 0.76rem; text-decoration: underline; text-underline-offset: 3px; padding: 2px; cursor: pointer; }
.ex-sheet:hover { color: #5fe8c8; }
.lightbox { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; background: rgba(5,6,8,0.92); padding: 4vh 3vw; cursor: zoom-out; animation: lbIn 0.3s ease; }
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 10px; }
.lb-x { position: absolute; right: 18px; top: 14px; width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line-strong); background: rgba(20,22,26,0.9); color: var(--text); font-size: 1.5rem; line-height: 1; cursor: pointer; }
@keyframes lbIn { from { opacity: 0; } to { opacity: 1; } }

/* analysis theater */
.theater { position: absolute; inset: 0; z-index: 8; display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 300px); gap: 26px; align-items: center; padding: 16px 22px; background: radial-gradient(120% 90% at 30% 40%, #0d1012, #050506); animation: thIn 0.5s cubic-bezier(.2,.8,.2,1); transition: opacity 0.4s, transform 0.4s; }
.theater.out { opacity: 0; transform: scale(1.015); pointer-events: none; }
@keyframes thIn { from { opacity: 0; } to { opacity: 1; } }
.th-main { min-width: 0; min-height: 0; height: 100%; display: grid; place-items: center; }
.th-fig { position: relative; height: 100%; max-height: 100%; aspect-ratio: 1; max-width: 100%; border-radius: 8px; overflow: hidden; background: #0a0b0d; box-shadow: 0 40px 90px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(95,232,200,0.16); }
.th-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.th-br { position: absolute; width: 22px; height: 22px; border: 0 solid #5fe8c8; opacity: 0.9; pointer-events: none; }
.th-br.tl { left: 10px; top: 10px; border-width: 2px 0 0 2px; } .th-br.tr { right: 10px; top: 10px; border-width: 2px 2px 0 0; }
.th-br.bl { left: 10px; bottom: 34px; border-width: 0 0 2px 2px; } .th-br.br { right: 10px; bottom: 34px; border-width: 0 2px 2px 0; }
.th-cap { position: absolute; left: 14px; bottom: 16px; display: flex; gap: 10px; align-items: baseline; font: 500 0.74rem 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #5fe8c8; text-shadow: 0 1px 8px #000; }
.th-cap b { font-weight: 500; color: #e6fff7; }
.th-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.08); }
.th-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #3fd6b4, #c8fff0); box-shadow: 0 0 12px #5fe8c8; }
.th-skip { position: absolute; right: 12px; bottom: 14px; background: rgba(5,6,8,0.7); color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; font: 500 0.72rem 'JetBrains Mono', monospace; cursor: pointer; }
.th-skip:hover { color: #5fe8c8; border-color: #5fe8c8; }
.th-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.th-steps li { display: grid; grid-template-columns: 14px 1fr; column-gap: 12px; row-gap: 2px; align-items: center; color: #6d7774; font-size: 0.98rem; transition: color 0.3s, transform 0.3s; }
.th-steps .dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid currentColor; transition: background 0.3s, box-shadow 0.3s; }
.th-steps .val { grid-column: 2; font: 500 0.78rem 'JetBrains Mono', monospace; color: #5fe8c8; max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.4s, opacity 0.4s; }
.th-steps li.on { color: #eef3f1; transform: translateX(5px); }
.th-steps li.on .dot { background: #5fe8c8; border-color: #5fe8c8; box-shadow: 0 0 14px #5fe8c8; animation: thPulse 1s ease-in-out infinite; }
.th-steps li.done { color: #c3ccc8; }
.th-steps li.done .dot { background: #5fe8c8; border-color: #5fe8c8; }
.th-steps li.done .val { max-height: 2em; opacity: 1; }
@keyframes thPulse { 50% { box-shadow: 0 0 4px #5fe8c8; } }
@media (max-width: 860px) { .theater { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; gap: 12px; padding: 10px; } .th-steps { grid-template-columns: 1fr 1fr; gap: 8px 14px; font-size: 0.8rem; } }

/* staged reveal of the three pictures */
.plan3.reveal figure { animation: figIn 0.9s cubic-bezier(.2,.8,.2,1) both; }
.plan3.reveal figure:nth-child(2) { animation-delay: 0.25s; } .plan3.reveal figure:nth-child(3) { animation-delay: 0.5s; }
@keyframes figIn { from { opacity: 0; transform: translateY(22px) scale(0.97); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
"""
c = W / "styles" / "studio.css"
t = c.read_text(encoding="utf8")
if "/* analysis theater */" not in t:
    t = t.replace(".ex-body { display: grid; gap: 22px; }\n.ex-item { margin: 0; display: grid; gap: 8px; }\n.ex-item img { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line-strong); background: #0b0c0e; }\n.ex-item figcaption { color: var(--muted, #8b9692); font-size: 0.86rem; line-height: 1.5; }\n", ".ex-body { display: grid; }\n")
    t += css
    c.write_text(t, encoding="utf8")
print("ok")
