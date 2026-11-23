"""Left, middle and right panels of the studio can be closed and opened, so one panel can fill the screen."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src")
m = (W / "studio" / "mount.ts").read_text(encoding="utf8")

m = m.replace("""  root.innerHTML = `
  <div class="studio">""", """  root.innerHTML = `
  <div class="panel-toggles" role="group" aria-label="${T('Panels', 'Panel')}">
    <button type="button" data-pnl="rail" aria-pressed="true" title="${T('Left panel: photo and tools', 'Panel kiri: foto dan alat')}"><i class="pg l"></i>${T('Left', 'Kiri')}</button>
    <button type="button" data-pnl="stage" aria-pressed="true" title="${T('Middle panel: the picture', 'Panel tengah: gambar')}"><i class="pg m"></i>${T('Middle', 'Tengah')}</button>
    <button type="button" data-pnl="results" aria-pressed="true" title="${T('Right panel: results', 'Panel kanan: hasil')}"><i class="pg r"></i>${T('Right', 'Kanan')}</button>
  </div>
  <div class="studio">""", 1)

m = m.replace("const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-tool],[data-layer],[data-sample],[data-stage]');\n    if (!el) return;",
              "const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-tool],[data-layer],[data-sample],[data-stage],[data-pnl]');\n    if (!el) return;\n    if (el.dataset.pnl) return togglePanel(el.dataset.pnl as PanelKey);", 1) if "const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-tool],[data-layer],[data-sample],[data-stage]');\n    if (!el) return;" in m else m
if "togglePanel(el.dataset.pnl" not in m:
    raise SystemExit("click handler pattern not found")

m = m.replace("let wired = false;", """let wired = false;

type PanelKey = 'rail' | 'stage' | 'results';
const panels: Record<PanelKey, boolean> = { rail: true, stage: true, results: true };
try { const saved = JSON.parse(localStorage.getItem('fs-panels') ?? 'null'); if (saved) for (const k of Object.keys(panels) as PanelKey[]) if (typeof saved[k] === 'boolean') panels[k] = saved[k]; } catch { /* storage unavailable: all panels open */ }

function togglePanel(k: PanelKey): void {
  const open = (Object.keys(panels) as PanelKey[]).filter(x => panels[x]);
  if (panels[k] && open.length === 1) return; // the last open panel stays
  panels[k] = !panels[k];
  try { localStorage.setItem('fs-panels', JSON.stringify(panels)); } catch { /* ignore */ }
  applyPanels();
  view2d?.fit(); viewer?.resize();
  window.dispatchEvent(new Event('resize'));
}

/** Shows or hides the three columns and lets the open ones share the width. */
function applyPanels(): void {
  const studio = document.querySelector<HTMLElement>('.studio'); if (!studio) return;
  const cls = studio.classList;
  cls.toggle('no-rail', !panels.rail); cls.toggle('no-stage', !panels.stage); cls.toggle('no-results', !panels.results);
  const wide = window.matchMedia('(min-width: 1181px)').matches;
  const cols: string[] = [];
  if (panels.rail) cols.push('296px');
  if (panels.stage) cols.push('minmax(0, 1fr)');
  if (panels.results) cols.push(panels.stage ? '420px' : 'minmax(0, 1fr)');
  studio.style.gridTemplateColumns = wide ? cols.join(' ') : '';
  cls.toggle('only-results', panels.results && !panels.stage && !panels.rail);
  document.querySelectorAll<HTMLElement>('[data-pnl]').forEach(b => b.setAttribute('aria-pressed', String(panels[b.dataset.pnl as PanelKey])));
}
window.addEventListener('resize', () => applyPanels());""", 1)
m = m.replace("  (document.getElementById('case-code') as HTMLInputElement).value = state.code;\n  render();", "  (document.getElementById('case-code') as HTMLInputElement).value = state.code;\n  applyPanels();\n  render();", 1)
(W / "studio" / "mount.ts").write_text(m, encoding="utf8")

css = r"""
/* panel toggles: close the left, middle or right column so one panel can fill the screen */
.panel-toggles { position: fixed; top: 58px; right: 18px; z-index: 40; display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: rgba(10,11,13,0.9); backdrop-filter: blur(8px); }
.panel-toggles button { display: flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px; font: 500 0.72rem 'JetBrains Mono', monospace; color: var(--muted); transition: background-color 160ms, color 160ms; }
.panel-toggles button[aria-pressed='true'] { background: rgba(95,232,200,0.14); color: #c8fff0; }
.panel-toggles button:hover { color: var(--text); }
.pg { display: inline-block; width: 16px; height: 11px; border: 1.5px solid currentColor; border-radius: 3px; position: relative; opacity: 0.9; }
.pg::after { content: ''; position: absolute; top: 0; bottom: 0; width: 5px; background: currentColor; opacity: 0.7; }
.pg.l::after { left: 0; } .pg.r::after { right: 0; } .pg.m::after { left: 5px; }
.studio.no-rail .rail, .studio.no-stage .stage, .studio.no-results .results { display: none; }
.studio.only-results .results { max-width: 980px; width: 100%; margin-inline: auto; }
.studio.no-stage .results .results-in { font-size: 1.02rem; }
@media (max-width: 1180px) { .panel-toggles { top: 52px; right: 10px; } .studio.no-rail { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) { .panel-toggles button { padding: 4px 8px; } .panel-toggles { right: 6px; } }
"""
c = W / "styles" / "studio.css"
t = c.read_text(encoding="utf8")
if "/* panel toggles" not in t:
    c.write_text(t + css, encoding="utf8")
print("ok")
