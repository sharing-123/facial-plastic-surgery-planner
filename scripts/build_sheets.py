"""Compose the 3-panel annotated example sheets (measured / marking / expected appearance + findings) per language.

Reads server/examples/examples.json and the ex<i>_{measured,marking,result}.jpg renders written by build_examples.py,
and writes ex<i>_sheet_{en,id}.jpg. The sheet is added as the first image of each example in examples.json.
The wounds are synthetic and the right panel is an illustration, both stated on the sheet itself.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

D = Path(__file__).resolve().parents[1] / "server" / "examples"
F = Path(r"C:\Windows\Fonts")
BG, PANEL, INK, SOFT, MUTE, MINT, CORAL, AMBER = "#0b0c0e", "#14161a", "#eef3f1", "#c3ccc8", "#7d8985", "#5fe8c8", "#ff8f6e", "#f2c14b"


def font(name, size):
    return ImageFont.truetype(str(F / name), size)


H1, H2, B, S, BADGE = font("segoeuisl.ttf", 36), font("segoeui.ttf", 24), font("segoeui.ttf", 21), font("segoeui.ttf", 18), font("seguisb.ttf", 22)
W, M, PW, GAP = 1920, 32, 592, 40

T = {
    "en": dict(sheet="Example output", segm="Measured lesion", mark="Marking and tension lines", res="Expected appearance (illustration)",
               lesion="LESION", size="Size", kind="Type", region="Region", angle="Angle to skin lines", plan="PLAN", setting="Setting", depth="Depth, estimated",
               pal="FACIAL PALSY OR COSMETIC?", pal_ok="No palsy pattern on this still photo. The question here is a skin lesion, so this is a cosmetic and scar-planning problem.",
               pal_warn="Mirror asymmetry sits in the borderline band. The lesion is a skin problem, but check movement of the brow and eyelid in person before calling it cosmetic only.",
               pal_note="A still photo cannot show movement, so a palsy is never excluded by it. Thresholds are screening values.",
               mirror="Mirror asymmetry", mid="Middle to lower third", nasal="Nasal index", syn="Synthetic lesion drawn on a public-domain portrait. No patient data. Right panel is an illustration, not a predicted result.",
               mm="mm", deg="deg", chance="of the differential"),
    "id": dict(sheet="Contoh keluaran", segm="Lesi terukur", mark="Marking dan garis tegangan", res="Perkiraan hasil (ilustrasi)",
               lesion="LESI", size="Ukuran", kind="Jenis", region="Regio", angle="Sudut terhadap garis kulit", plan="RENCANA", setting="Tatalaksana", depth="Kedalaman, estimasi",
               pal="KELUMPUHAN WAJAH ATAU KOSMETIK?", pal_ok="Tidak ada pola kelumpuhan pada foto diam ini. Masalahnya lesi kulit, jadi ini persoalan kosmetik dan perencanaan parut.",
               pal_warn="Asimetri cermin berada di rentang batas. Lesinya masalah kulit, tetapi periksa gerak alis dan kelopak mata langsung sebelum menyebutnya kosmetik saja.",
               pal_note="Foto diam tidak menampilkan gerakan, jadi kelumpuhan tidak pernah tersingkir oleh foto. Ambang adalah nilai skrining.",
               mirror="Asimetri cermin", mid="Sepertiga tengah : bawah", nasal="Indeks nasal", syn="Lesi sintetis pada potret domain publik. Tanpa data pasien. Panel kanan ilustrasi, bukan prediksi hasil.",
               mm="mm", deg="derajat", chance="dari diferensial"),
}


def wrap(d, text, fnt, width):
    out, line = [], ""
    for w in text.split():
        t = (line + " " + w).strip()
        if d.textlength(t, font=fnt) <= width:
            line = t
        else:
            out.append(line); line = w
    if line:
        out.append(line)
    return out


def badge(d, xy, text, color):
    x, y = xy
    w = d.textlength(text, font=BADGE) + 28
    d.rounded_rectangle([x, y, x + w, y + 38], 19, fill="#0b0c0ee6", outline=color, width=2)
    d.text((x + 14, y + 6), text, font=BADGE, fill=color)


def sheet(ex, lang):
    t = T[lang]
    n = ex["numbers"]
    imgs = {k: Image.open(D / f"{ex['id']}_{k}.jpg").convert("RGB").resize((PW, PW), Image.LANCZOS) for k in ("measured", "marking", "result")}
    # compute text first to size the sheet
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    mirror = n["mirror_asymmetry_mm"]
    pal = t["pal_ok"] if mirror < 1.5 else t["pal_warn"]
    pal_lines = wrap(probe, pal, B, 690) + [""] + wrap(probe, t["pal_note"], S, 690)
    top = 96
    foot_y = top + 40 + PW + 28
    h = foot_y + 330
    im = Image.new("RGB", (W, h), BG)
    d = ImageDraw.Draw(im)
    d.text((M, 22), ex["title"][lang], font=H1, fill=INK)
    sub = f"{t['sheet']}  ·  {ex['region'][lang]}  ·  {ex['diagnosis'][lang]}"
    d.text((W - M - d.textlength(sub, font=S), 36), sub, font=S, fill=MUTE)
    heads = [t["segm"], t["mark"], t["res"]]
    for i, k in enumerate(("measured", "marking", "result")):
        x = M + i * (PW + GAP)
        d.text((x, top), f"{i + 1}.  {heads[i]}", font=H2, fill=SOFT)
        im.paste(imgs[k], (x, top + 40))
        d.rectangle([x, top + 40, x + PW, top + 40 + PW], outline="#2a2f33", width=1)
    # direct annotations on the panels
    y0 = top + 40 + PW - 52
    x1, x2, x3 = (M + i * (PW + GAP) for i in range(3))
    badge(d, (x1 + 14, top + 54), f"{n['length_mm']:.1f} {t['mm']}", MINT)
    badge(d, (x1 + 14, y0), f"{ex['diagnosis'][lang]} {ex['diagnosis']['share_percent']}%", CORAL)
    badge(d, (x2 + 14, top + 54), f"{n['angle_to_rstl_deg']:.0f}° / RSTL", AMBER)
    badge(d, (x3 + 14, y0), ex["techniques"][0][lang], MINT)
    # footer columns
    cols = [M, M + 590, M + 1180]
    d.line([M, foot_y - 12, W - M, foot_y - 12], fill="#262b2f", width=1)
    def label(x, y, s):
        d.text((x, y), s, font=S, fill=MINT)
    label(cols[0], foot_y, t["lesion"])
    rows = [(t["size"], f"{n['size_mm'][0]:.1f} x {n['size_mm'][1]:.1f} {t['mm']}"), (t["kind"], f"{ex['diagnosis'][lang]}, {ex['diagnosis']['share_percent']}% {t['chance']}"),
            (t["region"], ex["region"][lang]), (t["angle"], f"{n['angle_to_rstl_deg']:.1f} {t['deg']}")]
    for j, (a, b) in enumerate(rows):
        d.text((cols[0], foot_y + 32 + j * 34), a, font=S, fill=MUTE)
        d.text((cols[0] + 235, foot_y + 30 + j * 34), b, font=B, fill=INK)
    label(cols[1], foot_y, t["plan"])
    dep = n["depth_mm"]
    rows = [(t["kind"], ", ".join(x[lang] for x in ex["techniques"])), (t["setting"], ex["setting"][lang]), (t["depth"], f"{dep['low']}–{dep['high']} {t['mm']} ({dep['estimate']})")]
    yy = foot_y + 32
    for a, b in rows:
        d.text((cols[1], yy), a, font=S, fill=MUTE)
        lines = wrap(d, b, B, 320)
        for k2, ln in enumerate(lines):
            d.text((cols[1] + 200, yy - 2 + k2 * 26), ln, font=B, fill=INK)
        yy += max(34, 26 * len(lines) + 8)
    label(cols[2], foot_y, t["pal"])
    col = MINT if mirror < 1.5 else AMBER
    d.rounded_rectangle([cols[2], foot_y + 32, cols[2] + 14, foot_y + 58], 4, fill=col)
    d.text((cols[2] + 26, foot_y + 28), f"{t['mirror']} {mirror:.1f} {t['mm']}", font=B, fill=INK)
    d.text((cols[2] + 26, foot_y + 58), f"{t['mid']} {n['middle_to_lower_third']:.2f}  ·  {t['nasal']} {n['nasal_index']:.0f}", font=S, fill=MUTE)
    yy = foot_y + 96
    for ln in pal_lines:
        f2 = S if ln and ln in wrap(probe, t["pal_note"], S, 690) else B
        d.text((cols[2], yy), ln, font=f2, fill=SOFT if f2 is B else MUTE)
        yy += 26 if ln else 8
    d.text((M, h - 36), t["syn"], font=S, fill=MUTE)
    return im.crop((0, 0, W, max(h, yy + 70)))


data = json.loads((D / "examples.json").read_text(encoding="utf8"))
for ex in data:
    ex["images"] = [i for i in ex["images"] if not i["file"].endswith(("_sheet_en.jpg", "_sheet_id.jpg"))]
    for lang in ("en", "id"):
        name = f"{ex['id']}_sheet_{lang}.jpg"
        sheet(ex, lang).save(D / name, "JPEG", quality=88, optimize=True)
    ex["sheet"] = {"en": f"{ex['id']}_sheet_en.jpg", "id": f"{ex['id']}_sheet_id.jpg"}
(D / "examples.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf8")
print("sheets written", len(data) * 2)
