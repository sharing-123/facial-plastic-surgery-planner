"""Remove the synthetic examples from the studio UI: gallery section, synthetic clip/profile/cleft buttons and their code."""
import re
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")

# ---- video.ts
v = (W / "video.ts").read_text(encoding="utf8")
v = v.replace("import { renderSynth, type SynthSpec } from './synth';\n", "")
v = v.replace("import { loadPhotoUrl } from './photo';\nimport { detectFace } from './landmarker';\n", "")
v = v.replace(", truth: null as SynthSpec | null", "")
a = v.index("async function runSynth("); b = v.index("async function runFile(")
v = v[:a] + v[b:]
v = re.sub(r"\n        <span class=\"mv-sep\"></span>\n        <span class=\"fine\">\$\{T\('Synthetic test, known answer:'.*?</button>\n        <button class=\"btn ghost small\" data-mv=\"synth-eye\">.*?</button>", "", v, flags=re.S)
v = re.sub(r"    else if \(k === 'synth-smile'\).*?\n    else if \(k === 'synth-brow'\).*?\n    else if \(k === 'synth-eye'\).*?\n", "", v)
v = v.replace("async function finish(frames: Frame[], thumbs: Thumb[], name: string, truth: SynthSpec | null): Promise<void> {\n  ui.report = analyseMotion(frames); ui.thumbs = thumbs; ui.name = name; ui.truth = truth;", "async function finish(frames: Frame[], thumbs: Thumb[], name: string): Promise<void> {\n  ui.report = analyseMotion(frames); ui.thumbs = thumbs; ui.name = name;")
v = v.replace("await finish(frames, thumbs, f.name, null);", "await finish(frames, thumbs, f.name);").replace("await finish(frames, thumbs, T('Camera recording', 'Rekaman kamera'), null);", "await finish(frames, thumbs, T('Camera recording', 'Rekaman kamera'));")
a = v.index("  const truth = ui.truth ?"); b = v.index("  return `${truth}")
v = v[:a] + v[b:]
v = v.replace("  return `${truth}\n", "  return `\n", 1)
v = re.sub(r"\n/\*\* Examples started from the gallery.*$", "\n", v, flags=re.S)
(W / "video.ts").write_text(v, encoding="utf8")

# ---- cleft.ts
c = (W / "cleft.ts").read_text(encoding="utf8")
a = c.index("/** A front photo with cleft-type asymmetry"); b = c.index("export function mountCleft(")
c = c[:a] + c[b:]
c = c.replace("      <button class=\"btn ghost small\" data-cl=\"demo\">${T('Synthetic test, known asymmetry', 'Uji sintetis, asimetri diketahui')}</button><button", "      <button")
c = c.replace(" else if (b.dataset.cl === 'demo') void syntheticExample();", "")
c = c.replace("export async function runCleftExample(): Promise<void> { await syntheticExample(); }\n", "")
c = c.replace("import { compareSlider, warpPush, type Push } from './warp';", "import { compareSlider } from './warp';")
c = c.replace("import { loadPhotoFile, loadPhotoUrl } from './photo';", "import { loadPhotoFile } from './photo';")
c = re.sub(r"    \$\{st\.synthetic \? `<div class=\"banner\">.*?</div>` : ''\}\n", "", c, flags=re.S)
(W / "cleft.ts").write_text(c, encoding="utf8")

# ---- nose.ts
n = (W / "nose.ts").read_text(encoding="utf8")
a = n.index("/** The canonical mesh seen from the side"); b = n.index("export function noseMetrics")
n = n[:a] + n[b:]
n = n.replace("        <button class=\"btn ghost small\" data-ns=\"demo\">${T('Rendered test profile', 'Profil uji render')}</button>\n", "")
n = n.replace("    else if (b.dataset.ns === 'demo') { demoProfile(); st.noseMm = null; refresh(); }\n", "")
n = re.sub(r"\n    \$\{st\.demo \? `<div class=\"banner\">.*?</div>` : ''\}", "", n, flags=re.S)
n = n.replace("\nexport function runNoseExample(): void { demoProfile(); st.noseMm = null; refresh(); }\n", "\n")
n = n.replace("import { CANON } from '../face/geometry';\n", "")
(W / "nose.ts").write_text(n, encoding="utf8")

# ---- examples.ts: gallery section
e = (W / "examples.ts").read_text(encoding="utf8")
e = e.replace("    body.insertAdjacentHTML('beforeend', planningHtml());\n", "")
a = e.index("const PLANNING:"); b = e.index("export function closeExamples")
e = e[:a] + e[b:]
(W / "examples.ts").write_text(e, encoding="utf8")

# ---- mount.ts
m = (W / "mount.ts").read_text(encoding="utf8")
m = re.sub(r"  if \(id\.startsWith\('p-'\)\) \{.*?\n    return;\n  \}\n", "", m, flags=re.S)
m = m.replace("import { mountNose, noseHtml, runNoseExample, wireNose } from './nose';", "import { mountNose, noseHtml, wireNose } from './nose';")
m = m.replace("import { cleftHtml, mountCleft, paintCleft, runCleftExample } from './cleft';", "import { cleftHtml, mountCleft, paintCleft } from './cleft';")
m = m.replace("import { hasMotion, motionHtml, mountVideo, paintMotion, runPalsyExample, runSmileExample } from './video';", "import { hasMotion, motionHtml, mountVideo, paintMotion } from './video';")
(W / "mount.ts").write_text(m, encoding="utf8")
(W / "synth.ts").unlink(missing_ok=True)
print("ok")
