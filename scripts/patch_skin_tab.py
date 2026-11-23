"""Wire the Lines (wrinkles) tab into the studio shell and the real-case runner."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")

s = (W / "store.ts").read_text(encoding="utf8")
s = s.replace("'video' | 'nose' | 'cleft';", "'video' | 'nose' | 'cleft' | 'skin';", 1)
(W / "store.ts").write_text(s, encoding="utf8")

m = (W / "mount.ts").read_text(encoding="utf8")
m = m.replace("import { cleftHtml, mountCleft, paintCleft } from './cleft';", "import { cleftHtml, mountCleft, paintCleft } from './cleft';\nimport { mountWrinkles, wireWrinkles, wrinkleHtml } from './wrinkles';", 1)
m = m.replace("['cleft', 'Cleft', 'Sumbing', 'photo']]", "['cleft', 'Cleft', 'Sumbing', 'photo'], ['skin', 'Lines', 'Kerutan', 'photo']]", 1)
m = m.replace("""        <div class="view" data-view="cleft" hidden id="v-cleft"></div>""", """        <div class="view" data-view="cleft" hidden id="v-cleft"></div>
        <div class="view" data-view="skin" hidden id="v-skin"></div>""", 1)
m = m.replace("  mountCleft(document.getElementById('v-cleft')!, () => renderResults());", "  mountCleft(document.getElementById('v-cleft')!, () => renderResults());\n  mountWrinkles(document.getElementById('v-skin')!, () => renderResults());", 1)
m = m.replace("""  if (state.tab === 'video' || state.tab === 'nose' || state.tab === 'cleft') {
    el.innerHTML = `<div class="results-in">${state.tab === 'video' ? motionHtml() : state.tab === 'nose' ? noseHtml() : cleftHtml()}</div>`;
    if (state.tab === 'video') paintMotion(el); else if (state.tab === 'nose') wireNose(el); else paintCleft(el);
    return;
  }""", """  if (state.tab === 'video' || state.tab === 'nose' || state.tab === 'cleft' || state.tab === 'skin') {
    el.innerHTML = `<div class="results-in">${state.tab === 'video' ? motionHtml() : state.tab === 'nose' ? noseHtml() : state.tab === 'cleft' ? cleftHtml() : wrinkleHtml()}</div>`;
    if (state.tab === 'video') paintMotion(el); else if (state.tab === 'nose') wireNose(el); else if (state.tab === 'cleft') paintCleft(el); else wireWrinkles(el);
    return;
  }""", 1)
(W / "mount.ts").write_text(m, encoding="utf8")
print("ok")
