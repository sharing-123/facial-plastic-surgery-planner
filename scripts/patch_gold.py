"""Palette and type pass in the WoundScan direction: near-black, amber gold ink, gold metal rings, heavier headings, gold buttons, stronger light shafts."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src")
files = [p for p in W.rglob("*") if p.suffix in (".ts", ".css")]
SUBS = [
    ("#a98bff", "#f2b84b"), ("#8f6bff", "#e8a93a"), ("#cdbdff", "#ffe0a0"), ("#9a7bff", "#f2b84b"), ("#d9ccff", "#fff0cf"), ("#ffd2c2", "#ffe9cf"),
    ("rgba(169, 139, 255", "rgba(242, 184, 75"), ("rgba(169,139,255", "rgba(242,184,75"),
    ("vec3(0.62, 0.52, 1.0)", "vec3(1.0, 0.72, 0.28)"), ("vec3(0.7, 0.62, 1.0)", "vec3(1.0, 0.78, 0.35)"),
    ("vec3 cold = vec3(0.45, 0.55, 1.0), warm = vec3(0.92, 0.82, 1.0);", "vec3 cold = vec3(0.95, 0.6, 0.2), warm = vec3(1.0, 0.9, 0.7);"),
    ("vec3(0.30, 0.20, 0.58) * halo * 0.022", "vec3(0.95, 0.55, 0.15) * halo * 0.035"),
    ("'#6e55ff', 2.2", "'#ffb347', 2.6"),
    ("[0.72, 0.78, 1.0]", "[1.0, 0.88, 0.62]"), ("[0.8, 0.66, 1.0]", "[1.0, 0.8, 0.5]"),
    ("color: '#e8dcc6', metalness: 1, roughness: 0.18", "color: '#e9b95a', metalness: 1, roughness: 0.22"),
    ("--bg: #07080a;", "--bg: #050506;"), ("#07080a", "#050506"),
    ("color: #f3dccd;", "color: #ffe2b8;"),
    ("font-weight: 350; font-size: clamp(2.1rem, 3.9vw, 3.5rem); line-height: 1.04; letter-spacing: -0.028em;", "font-weight: 650; font-size: clamp(2.1rem, 3.9vw, 3.5rem); line-height: 1.02; letter-spacing: -0.034em;"),
    ("font-weight: 300; font-size: clamp(3rem, 7.2vw, 6rem); line-height: 0.96; letter-spacing: -0.04em;", "font-weight: 650; font-size: clamp(3rem, 7.2vw, 6rem); line-height: 0.94; letter-spacing: -0.045em;"),
    ("background: var(--text); color: #0b0b0f; font-weight: 500; font-size: 1.02rem;", "background: var(--ink); color: #1a1205; font-weight: 600; font-size: 1.02rem;"),
    (".cta:hover { background: #fff; }", ".cta:hover { background: #ffd070; }"),
    (".btn { padding: 10px 14px; border-radius: 9px; background: var(--text); color: #0b0b0f;", ".btn { padding: 10px 14px; border-radius: 9px; background: var(--ink); color: #1a1205;"),
    (".btn:hover { background: #fff; }", ".btn:hover { background: #ffd070; }"),
    (".nav-cta { color: var(--text); padding: 8px 14px; border: 1px solid var(--line-strong); border-radius: 8px;", ".nav-cta { color: #1a1205; background: var(--ink); font-weight: 600; padding: 8px 14px; border: 1px solid var(--ink); border-radius: 8px;"),
    (".nav-cta:hover { background: rgba(236, 232, 226, 0.07); border-color: rgba(236, 232, 226, 0.4); }", ".nav-cta:hover { background: #ffd070; }"),
]
n = 0
for p in files:
    s = p.read_text(encoding="utf8")
    o = s
    for a, b in SUBS:
        s = s.replace(a, b)
    if s != o:
        p.write_text(s, encoding="utf8")
        n += 1
# stronger, narrower shafts
st = (W / "world/studio.ts").read_text(encoding="utf8")
st = st.replace("f * fall * uAmount * 0.18", "f * fall * uAmount * 0.42")
(W / "world/studio.ts").write_text(st, encoding="utf8")
ix = (W / "world/index.ts").read_text(encoding="utf8")
ix = ix.replace("buildBeam([3.4, 5.2, 2.2], 1.25,", "buildBeam([3.4, 5.2, 2.2], 0.8,").replace("buildBeam([0.4, 6.2, -3.2], 1.0,", "buildBeam([0.9, 6.2, -2.6], 0.7,")
(W / "world/index.ts").write_text(ix, encoding="utf8")
base = (W / "index.html").parent / "index.html"
h = base.read_text(encoding="utf8")
h = h.replace("%23a98bff", "%23f2b84b").replace("#07080a", "#050506")
base.write_text(h, encoding="utf8")
print("files changed", n)
