"""Turn the captured example renders into the backend gallery: server/examples/*.jpg + examples.json.

The wounds in the examples are SYNTHETIC lines drawn on public-domain portraits (see web/public/samples/ATTRIBUTION.json) so the
outputs of the studio can be shown without any patient data. Run after capturing ex<i>_{zones,rstl,measured,marking,result}.png.
"""
import json
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parents[1] / "server" / "examples"
OUT.mkdir(parents=True, exist_ok=True)

TECH = {
    "t.primary": ("Layered primary closure", "Penutupan primer berlapis"),
    "t.ellipse_min": ("Undermining and minimal elliptical excision", "Undermining dan eksisi elips minimal"),
    "t.z": ("Z-plasty", "Z-plasty"),
}
DX = {"laceration": ("Laceration", "Laserasi"), "scar": ("Mature linear scar", "Parut linear matang")}
REGION = {"forehead": ("forehead", "dahi"), "cheek": ("cheek", "pipi"), "chin": ("chin", "dagu"), "eyecheek": ("lateral cheek below the eye", "pipi lateral di bawah mata")}
SETTING = {"clinic": ("Outpatient clinic", "Poli rawat jalan"), "ed": ("Emergency department", "IGD"), "refer": ("Refer", "Rujuk")}

ITEMS = [
    dict(i=0, sample="sample-1.jpg", kind="laceration", region="forehead", len=27.5, ang=31.7, axis=0, dx="laceration", share=37, size=(28.6, 6.2),
         depth=(1.7, 3.0, 4.8), techs=["t.primary"], level="clinic", mid=0.924, nasal=97.8, mirror=2.1,
         title=("Oblique forehead laceration", "Laserasi dahi oblik"),
         note=("A synthetic 27 mm laceration drawn on a public-domain portrait. It lies 32 degrees off the forehead's horizontal lines, an intermediate angle.",
               "Laserasi sintetis 27 mm yang digambar pada potret domain publik. Letaknya 32 derajat dari garis horizontal dahi, sudut sedang.")),
    dict(i=1, sample="sample-2.jpg", kind="laceration", region="forehead", len=34.0, ang=13.7, axis=0, dx="laceration", share=34, size=(35.5, 6.9),
         depth=(1.7, 3.0, 4.8), techs=["t.primary", "t.ellipse_min"], level="clinic", mid=0.959, nasal=87.1, mirror=2.97,
         title=("Horizontal forehead laceration, favourable direction", "Laserasi dahi horizontal, arah menguntungkan"),
         note=("A synthetic 34 mm laceration that runs along the forehead lines, so the angle to RSTL is only 14 degrees. The plan keeps closure simple.",
               "Laserasi sintetis 34 mm yang searah garis dahi, jadi sudut terhadap RSTL hanya 14 derajat. Rencana menjaga penutupan tetap sederhana.")),
    dict(i=2, sample="sample-3.jpg", kind="scar", region="cheek", len=29.8, ang=64.8, axis=152, dx="scar", share=68, size=(30.6, 3.9),
         depth=(0.7, 1.3, 2.0), techs=["t.z"], level="clinic", mid=0.84, nasal=96.2, mirror=1.2,
         title=("Widened cheek scar across the skin lines", "Parut pipi melebar memotong garis kulit"),
         note=("A synthetic 14 month old scar lying 65 degrees across RSTL. The plan moves from an ellipse to a Z-plasty because an ellipse would be too long.",
               "Parut sintetis berusia 14 bulan yang memotong RSTL 65 derajat. Rencana beralih dari elips ke Z-plasty karena elips akan terlalu panjang.")),
    dict(i=3, sample="sample-2.jpg", kind="laceration", region="chin", len=27.9, ang=36.0, axis=0, dx="laceration", share=34, size=(33.2, 5.7),
         depth=(2.1, 3.8, 6.1), techs=["t.primary"], level="clinic", mid=0.959, nasal=87.1, mirror=2.97,
         title=("Oblique chin laceration", "Laserasi dagu oblik"),
         note=("A synthetic 28 mm laceration on the chin, 36 degrees off the skin lines. Closure is layered and primary, and the plan lists the lip border as a landmark to align first.",
               "Laserasi sintetis 28 mm di dagu, 36 derajat dari garis kulit. Penutupan berlapis primer, dan rencana menyebut batas bibir sebagai landmark yang disejajarkan lebih dulu.")),
    dict(i=4, sample="sample-3.jpg", kind="scar", region="forehead", len=19.1, ang=72.1, axis=0, dx="scar", share=68, size=(21.7, 3.2),
         depth=(0.7, 1.3, 2.0), techs=["t.z"], level="clinic", mid=0.84, nasal=96.2, mirror=1.2,
         title=("Vertical forehead scar across the lines", "Parut dahi vertikal memotong garis"),
         note=("A synthetic 19 mm scar standing 72 degrees across the horizontal forehead lines, the worst direction for a scar. Revision by Z-plasty re-aligns part of it with the lines.",
               "Parut sintetis 19 mm yang berdiri 72 derajat melintang garis horizontal dahi, arah terburuk untuk parut. Revisi dengan Z-plasty menyejajarkan sebagian parut dengan garis.")),
    dict(i=5, sample="sample-1.jpg", kind="laceration", region="eyecheek", len=20.5, ang=72.8, axis=32.4, dx="laceration", share=19, size=(24.6, 4.2),
         depth=(2.6, 4.8, 7.7), techs=["t.primary"], level="clinic", mid=0.924, nasal=97.8, mirror=2.1,
         title=("Cheek laceration beside the lower eyelid", "Laserasi pipi di samping kelopak bawah"),
         note=("A synthetic 20 mm laceration that starts close to the lower eyelid and runs 73 degrees across the skin lines. The differential share is low because no history was entered, so the plan flags the periorbital structures to check first.",
               "Laserasi sintetis 20 mm yang mulai dekat kelopak mata bawah dan memotong garis kulit 73 derajat. Porsi diferensial rendah karena riwayat belum diisi, sehingga rencana menandai struktur periorbital untuk diperiksa lebih dulu.")),
]
CAPTIONS = {
    "zones": ("Zone atlas and landmarks", "Atlas zona dan landmark"),
    "rstl": ("Proportion grid and skin tension lines", "Grid proporsi dan garis tegangan kulit"),
    "measured": ("1. Measured", "1. Terukur"),
    "marking": ("2. Marking", "2. Marking"),
    "result": ("3. Expected appearance (illustration)", "3. Perkiraan hasil (ilustrasi)"),
}

out = []
for it in ITEMS:
    imgs = []
    for k, (en, idn) in CAPTIONS.items():
        if not (SRC / f"ex{it['i']}_{k}.png").is_file():
            continue
        im = Image.open(SRC / f"ex{it['i']}_{k}.png").convert("RGB")
        name = f"ex{it['i'] + 1}_{k}.jpg"
        im.save(OUT / name, "JPEG", quality=84, optimize=True)
        imgs.append({"file": name, "caption": {"en": en, "id": idn}})
    out.append({
        "id": f"ex{it['i'] + 1}", "sample": it["sample"], "synthetic": True,
        "title": {"en": it["title"][0], "id": it["title"][1]}, "note": {"en": it["note"][0], "id": it["note"][1]},
        "region": {"en": REGION[it["region"]][0], "id": REGION[it["region"]][1]},
        "diagnosis": {"en": DX[it["dx"]][0], "id": DX[it["dx"]][1], "share_percent": it["share"]},
        "numbers": {"length_mm": it["len"], "angle_to_rstl_deg": it["ang"], "rstl_axis_deg": it["axis"], "size_mm": list(it["size"]),
                    "depth_mm": {"low": it["depth"][0], "estimate": it["depth"][1], "high": it["depth"][2]},
                    "middle_to_lower_third": it["mid"], "nasal_index": it["nasal"], "mirror_asymmetry_mm": it["mirror"]},
        "techniques": [{"en": TECH[t][0], "id": TECH[t][1]} for t in it["techs"]],
        "setting": {"en": SETTING[it["level"]][0], "id": SETTING[it["level"]][1]},
        "images": imgs,
    })
(OUT / "examples.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf8")
print("examples:", len(out), "files:", len(list(OUT.glob('*.jpg'))))
