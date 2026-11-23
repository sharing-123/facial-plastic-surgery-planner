"""Palette pass 2: leave the gold-on-black look (too close to WoundScan) for pearl, platinum and aquamarine on graphite."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web")
files = [p for p in (W / "src").rglob("*") if p.suffix in (".ts", ".css")] + [W / "index.html"]
SUBS = [
    ("#f2b84b", "#5fe8c8"), ("%23f2b84b", "%235fe8c8"), ("#e8a93a", "#3fd6b4"), ("#ffe0a0", "#c8fff0"), ("#fff0cf", "#e8fff8"), ("#ffe9cf", "#dffff6"),
    ("rgba(242, 184, 75", "rgba(95, 232, 200"), ("rgba(242,184,75", "rgba(95,232,200"),
    ("vec3(1.0, 0.72, 0.28)", "vec3(0.37, 0.91, 0.78)"), ("vec3(1.0, 0.78, 0.35)", "vec3(0.45, 0.95, 0.85)"),
    ("vec3 cold = vec3(0.95, 0.6, 0.2), warm = vec3(1.0, 0.9, 0.7);", "vec3 cold = vec3(0.25, 0.72, 0.95), warm = vec3(0.85, 1.0, 0.97);"),
    ("vec3(0.95, 0.55, 0.15) * halo * 0.004", "vec3(0.1, 0.6, 0.6) * halo * 0.004"),
    ("'#ffb347', 2.6", "'#38d6c0', 2.6"),
    ("[1.0, 0.88, 0.62]", "[0.7, 1.0, 0.92]"), ("[1.0, 0.8, 0.5]", "[0.6, 0.9, 1.0]"),
    ("tint: [1.0, 0.86, 0.6]", "tint: [0.7, 1.0, 0.93]"), ("tint: [1.0, 0.78, 0.45]", "tint: [0.55, 0.9, 1.0]"), ("tint: [1.0, 0.9, 0.72]", "tint: [0.85, 1.0, 0.97]"), ("tint: [1.0, 0.82, 0.5]", "tint: [0.6, 0.95, 0.9]"),
    ("color: '#e9b95a', metalness: 1, roughness: 0.22", "color: '#d3dbe2', metalness: 1, roughness: 0.14"),
    ("color: #ffe2b8;", "color: #e6fff7;"),
    ("color: #1a1205;", "color: #04140f;"), ("#ffd070", "#a6f6e4"),
    ("font-weight: 650; font-size: clamp(2.1rem, 3.9vw, 3.5rem); line-height: 1.02; letter-spacing: -0.034em;", "font-weight: 380; font-size: clamp(2.1rem, 3.9vw, 3.5rem); line-height: 1.04; letter-spacing: -0.03em;"),
    ("font-weight: 650; font-size: clamp(3rem, 7.2vw, 6rem); line-height: 0.94; letter-spacing: -0.045em;", "font-weight: 320; font-size: clamp(3rem, 7.2vw, 6rem); line-height: 0.95; letter-spacing: -0.045em;"),
    ("color: #1a1205", "color: #04140f"),
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
print("files", n)
