"""Turn the captured example renders into the backend gallery: server/examples/*.jpg + examples.json.

The numbers come from the studio's own analysis of each example (web/src/studio/examples.ts specs, captured through
window.__studio), so the gallery cards and sheets agree with what a live run shows. The wounds are SYNTHETIC lines drawn on
public-domain portraits (web/public/samples/ATTRIBUTION.json); no patient data. Capture ex<i>_{measured,marking,result}.png first,
then:  python scripts/build_examples.py <capture_dir>   and   python scripts/build_sheets.py
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
    "t.w": ("W-plasty", "W-plasty"),
}
DX = {"laceration": ("Laceration", "Laserasi"), "scar": ("Mature linear scar", "Parut linear matang")}
SETTING = {"clinic": ("Outpatient clinic", "Poli rawat jalan"), "ed": ("Emergency department", "IGD"), "refer": ("Refer", "Rujuk")}

# Output of the live analysis (captured from the studio), plus the wording that does not depend on a number.
ITEMS = [
    dict(id="ex1", sample="sample-1.jpg", region=("brow and forehead", "alis dan dahi"), kind=("laceration", "laserasi"),
         m=dict(len=24.5, ang=48.6, axis=90, share=34, size=(28.2, 4.1), depth=(1.7, 3.0, 4.8), techs=["t.primary"], level="clinic", mid=0.924, nasal=97.8, mirror=2.1),
         title=("Oblique laceration at the brow and forehead", "Laserasi oblik di alis dan dahi"),
         tail=("It crosses the skin lines at an intermediate angle, so the plan keeps layered primary closure and marks the first sutures by halving.",
               "Laserasi memotong garis kulit pada sudut sedang, jadi rencana tetap penutupan primer berlapis dan jahitan pertama ditandai dengan halving.")),
    dict(id="ex2", sample="sample-2.jpg", region=("forehead", "dahi"), kind=("laceration", "laserasi"),
         m=dict(len=34.3, ang=4.6, axis=0, share=34, size=(40.0, 5.7), depth=(1.7, 3.0, 4.8), techs=["t.primary"], level="clinic", mid=0.959, nasal=87.1, mirror=2.97),
         title=("Horizontal forehead laceration, favourable direction", "Laserasi dahi horizontal, arah menguntungkan"),
         tail=("It runs along the forehead lines, so the angle to the skin tension lines is small and closure stays simple.",
               "Laserasi searah garis dahi, jadi sudut terhadap garis tegangan kulit kecil dan penutupan tetap sederhana.")),
    dict(id="ex3", sample="sample-3.jpg", region=("cheek near the lip", "pipi dekat bibir"), kind=("scar", "parut"),
         m=dict(len=33.5, ang=73.8, axis=33.9, share=68, size=(36.1, 3.3), depth=(0.7, 1.3, 2.0), techs=["t.w"], level="clinic", mid=0.84, nasal=96.2, mirror=1.2),
         title=("Long cheek scar across the skin lines", "Parut pipi panjang memotong garis kulit"),
         tail=("It lies across the skin lines, so a W-plasty breaks the line and moves part of it into them.",
               "Parut berada melintang garis kulit, jadi W-plasty memecah garisnya dan memindahkan sebagian ke arah garis.")),
    dict(id="ex4", sample="sample-2.jpg", region=("chin", "dagu"), kind=("laceration", "laserasi"),
         m=dict(len=27.9, ang=36.0, axis=0, share=34, size=(33.2, 5.7), depth=(2.1, 3.8, 6.1), techs=["t.primary"], level="clinic", mid=0.959, nasal=87.1, mirror=2.97),
         title=("Oblique chin laceration", "Laserasi dagu oblik"),
         tail=("Closure is layered and primary, and the plan lists the lip border as the landmark to align first.",
               "Penutupan berlapis primer, dan rencana menyebut batas bibir sebagai landmark yang disejajarkan lebih dulu.")),
    dict(id="ex5", sample="sample-3.jpg", region=("forehead", "dahi"), kind=("scar", "parut"),
         m=dict(len=19.1, ang=72.1, axis=0, share=68, size=(21.7, 3.2), depth=(0.7, 1.3, 2.0), techs=["t.z"], level="clinic", mid=0.84, nasal=96.2, mirror=1.2),
         title=("Vertical forehead scar across the lines", "Parut dahi vertikal memotong garis"),
         tail=("It stands across the horizontal forehead lines, the worst direction for a scar. A Z-plasty re-aligns part of it with the lines.",
               "Parut berdiri melintang garis horizontal dahi, arah terburuk untuk parut. Z-plasty menyejajarkan sebagian parut dengan garis.")),
    dict(id="ex6", sample="sample-1.jpg", region=("cheek below the eye", "pipi di bawah mata"), kind=("laceration", "laserasi"),
         m=dict(len=20.5, ang=72.8, axis=32.4, share=19, size=(24.6, 4.2), depth=(2.6, 4.8, 7.7), techs=["t.primary"], level="clinic", mid=0.924, nasal=97.8, mirror=2.1),
         title=("Cheek laceration beside the lower eyelid", "Laserasi pipi di samping kelopak bawah"),
         tail=("It starts close to the lower eyelid. The differential share is low because no history was entered, so the plan flags the periorbital structures to check first.",
               "Laserasi mulai dekat kelopak bawah. Porsi diferensial rendah karena riwayat belum diisi, sehingga rencana menandai struktur periorbital untuk diperiksa lebih dulu.")),
]
CAPTIONS = {
    "zones": ("Zone atlas and landmarks", "Atlas zona dan landmark"),
    "rstl": ("Proportion grid and skin tension lines", "Grid proporsi dan garis tegangan kulit"),
    "measured": ("1. Measured", "1. Terukur"),
    "marking": ("2. Marking", "2. Marking"),
    "result": ("3. Expected appearance (illustration)", "3. Perkiraan hasil (ilustrasi)"),
}

out = []
for n, it in enumerate(ITEMS):
    m = it["m"]
    imgs = []
    for k, (en, idn) in CAPTIONS.items():
        f = SRC / f"ex{n}_{k}.png"
        if not f.is_file():
            continue
        name = f"{it['id']}_{k}.jpg"
        Image.open(f).convert("RGB").save(OUT / name, "JPEG", quality=84, optimize=True)
        imgs.append({"file": name, "caption": {"en": en, "id": idn}})
    note = (f"A synthetic {m['len']:.0f} mm {it['kind'][0]} on a public-domain portrait, {m['ang']:.0f} degrees to the skin tension lines. {it['tail'][0]}",
            f"{it['kind'][1].capitalize()} sintetis {m['len']:.0f} mm pada potret domain publik, {m['ang']:.0f} derajat terhadap garis tegangan kulit. {it['tail'][1]}")
    dxk = "laceration" if it["kind"][0] == "laceration" else "scar"
    out.append({
        "id": it["id"], "sample": it["sample"], "synthetic": True,
        "title": {"en": it["title"][0], "id": it["title"][1]}, "note": {"en": note[0], "id": note[1]},
        "region": {"en": it["region"][0], "id": it["region"][1]},
        "diagnosis": {"en": DX[dxk][0], "id": DX[dxk][1], "share_percent": m["share"]},
        "numbers": {"length_mm": m["len"], "angle_to_rstl_deg": m["ang"], "rstl_axis_deg": m["axis"], "size_mm": list(m["size"]),
                    "depth_mm": {"low": m["depth"][0], "estimate": m["depth"][1], "high": m["depth"][2]},
                    "middle_to_lower_third": m["mid"], "nasal_index": m["nasal"], "mirror_asymmetry_mm": m["mirror"]},
        "techniques": [{"en": TECH[t][0], "id": TECH[t][1]} for t in m["techs"]],
        "setting": {"en": SETTING[m["level"]][0], "id": SETTING[m["level"]][1]},
        "images": imgs,
    })
(OUT / "examples.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf8")
print("examples:", len(out), "files:", len(list(OUT.glob('*.jpg'))))
