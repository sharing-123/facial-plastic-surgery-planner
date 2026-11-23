"""Real cases, second pass: stage the chosen photographs, write the full case list in four categories, and wire the runners.
Point positions are pixel estimates on each photograph (converted to fractions); the clinician confirms or drags them in the tool."""
import json
import re
import shutil
from pathlib import Path

SRC2 = Path(r"C:\Users\allam\AppData\Local\Temp\claude\a7673535580505a5\ad480fce-68da-4eca-922b-b10bdaa34a89\scratchpad\real2")
REPO_FIG = Path(r"C:\Users\allam\AppData\Local\Temp\claude\a7673535580505a5\ad480fce-68da-4eca-922b-b10bdaa34a89\scratchpad\repo\assets\figure_marking.jpg")
PUB = Path(r"C:\Users\allam\Downloads\FaceStudio\web\public\real")
W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")

KEEP = ["13900470_3preoperation0.jpg", "17161036_postopt3.jpg", "baby_girl_with_cleft_palate_smiling.jpg", "girl_exhibiting_a_cleft_of_the_soft_palate_wellc.jpg",
        "cleftbefore.jpg", "cleftafter.jpg", "1rhinoplastybefore.jpg", "1rhinoplastyafter.jpg", "2rhinoplastybefore.jpg", "2rhinoplastyafter.jpg",
        "elderly_gambian_woman_face_portrait.jpg", "india_delhi_portrait_of_a_man_4780.jpg"]
att = json.loads((PUB / "ATTRIBUTION.json").read_text(encoding="utf8"))
a2 = json.loads((SRC2 / "ATTRIBUTION.json").read_text(encoding="utf8"))
for f in KEEP:
    shutil.copy(SRC2 / f, PUB / f)
    att[f] = a2[f]
shutil.copy(REPO_FIG, PUB / "wound_mannequin_marking.jpg")
att["wound_mannequin_marking.jpg"] = {"title": "Wound simulation mannequin: segmented contour, numbered sutures, schematic closure", "licence": "MIT (this repository)", "artist": "Muhammad Allam Rafi and Cindy Rizky Afrilia, output of the Python prototype", "source": "https://github.com/sharing-123/facial-plastic-surgery-planner/tree/python-package-v0.1.0", "size": [1896, 970]}
(PUB / "ATTRIBUTION.json").write_text(json.dumps(att, indent=1, ensure_ascii=False), encoding="utf8")


def frac(pts, size):
    return {k: [round(v[0] / size[0], 4), round(v[1] / size[1], 4)] for k, v in pts.items()}


S = (600, 800)
NOSE = {
    "man_before": {"G": (88, 238), "N": (75, 330), "Prn": (8, 466), "Cm": (45, 492), "Sn": (56, 512), "Ls": (47, 562), "Pg": (95, 640), "Ac": (108, 478)},
    "man_after": {"G": (92, 238), "N": (80, 330), "Prn": (6, 462), "Cm": (42, 496), "Sn": (54, 510), "Ls": (46, 562), "Pg": (92, 640), "Ac": (106, 476)},
    "woman_before": {"G": (78, 350), "N": (88, 440), "Prn": (52, 517), "Cm": (70, 540), "Sn": (84, 553), "Ls": (84, 603), "Pg": (110, 692), "Ac": (110, 522)},
    "woman_after": {"G": (82, 345), "N": (90, 430), "Prn": (40, 510), "Cm": (62, 538), "Sn": (82, 552), "Ls": (88, 605), "Pg": (108, 690), "Ac": (112, 525)},
}
CLEFT_INFANT = {"nasion": (345, 285), "prn": (350, 400), "sn": (345, 428), "sbal_R": (270, 435), "sbal_L": (415, 430), "al_R": (260, 420), "al_L": (425, 405),
                "cph_R": (293, 462), "cph_L": (330, 445), "ls": (310, 460), "ch_R": (238, 500), "ch_L": (392, 520)}
CLEFT_PAIR = {"nasion": (144, 125), "prn": (148, 158), "sn": (147, 172), "sbal_R": (131, 175), "sbal_L": (163, 172), "al_R": (124, 168), "al_L": (170, 164),
              "cph_R": (140, 186), "cph_L": (160, 182), "ls": (150, 184), "ch_R": (118, 192), "ch_L": (180, 190)}


def js(o):
    return json.dumps(o, ensure_ascii=False).replace('"', "'")


def pts(d):
    return "{ " + ", ".join(f"{k}: [{v[0]}, {v[1]}]" for k, v in d.items()) + " }"


nose_man, nose_man_a = frac(NOSE["man_before"], S), frac(NOSE["man_after"], S)
nose_w, nose_w_a = frac(NOSE["woman_before"], S), frac(NOSE["woman_after"], S)
cl_inf, cl_pair = frac(CLEFT_INFANT, (653, 685)), frac(CLEFT_PAIR, (277, 277))

r = (W / "real.ts").read_text(encoding="utf8")
a = r.index("export const REAL: RealCase[] = [")
b = r.index("];", a) + 2
old = r[a:b]
# keep the palsy cases from the first pass, add the new ones
keep_palsy = [m for m in re.findall(r"  \{ id: 'r-palsy[^\n]*\n[^\n]*\n", old)]
new_cases = f"""
  {{ id: 'r-cleft-infant', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['13900470_3preoperation0.jpg'],
    title: ['Unilateral cleft lip in an infant', 'Bibir sumbing unilateral pada bayi'], sub: ['A real photograph before repair. The twelve points are pre-placed for you to confirm or drag.', 'Foto nyata sebelum perbaikan. Dua belas titik sudah dipasang untuk Anda konfirmasi atau geser.'],
    points: {pts(cl_inf)} }},
  {{ id: 'r-cleft-pair', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['cleftbefore.jpg'], pair: 'cleftafter.jpg',
    title: ['Cleft lip: before and after repair', 'Bibir sumbing: sebelum dan sesudah perbaikan'], sub: ['A real before and after pair of the same child, with a slider. The reading is for the first photograph.', 'Pasangan nyata sebelum dan sesudah dari anak yang sama, dengan slider. Pembacaan untuk foto pertama.'],
    points: {pts(cl_pair)} }},
  {{ id: 'r-cleft-postop', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['17161036_postopt3.jpg'], palate: true,
    title: ['Cleft lip just after repair', 'Bibir sumbing segera setelah perbaikan'], sub: ['A real photograph of the sutured lip and nose. The usual sequence of care by age follows.', 'Foto nyata bibir dan hidung yang dijahit. Urutan perawatan lazim menurut usia menyusul.'] }},
  {{ id: 'r-cleft-palate', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['baby_girl_with_cleft_palate_smiling.jpg'], palate: true,
    title: ['Cleft lip and palate in an infant', 'Bibir sumbing dan celah langit-langit pada bayi'], sub: ['A real photograph. The palate is described by examination, not measured on a photograph.', 'Foto nyata. Langit-langit digambarkan lewat pemeriksaan, tidak diukur pada foto.'] }},
  {{ id: 'r-cleft-soft', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['girl_exhibiting_a_cleft_of_the_soft_palate_wellc.jpg'], palate: true,
    title: ['Cleft of the soft palate (historical)', 'Celah langit-langit lunak (bersejarah)'], sub: ['A real historical photograph from the Wellcome Collection.', 'Foto bersejarah nyata dari Wellcome Collection.'] }},
  {{ id: 'r-nose-woman', cat: 'aesthetic', tab: 'nose', need: 'photo', files: ['2rhinoplastybefore.jpg'], pair: '2rhinoplastyafter.jpg',
    title: ['Nose: a short, rounded tip, and the real result', 'Hidung: ujung pendek membulat, dan hasil nyatanya'], sub: ['A real side view before and after rhinoplasty. Angles and Goode ratio, the planned profile, and the methods.', 'Tampak samping nyata sebelum dan sesudah rhinoplasti. Sudut dan rasio Goode, profil rencana, dan metodenya.'],
    points: {pts(nose_w)}, afterPoints: {pts(nose_w_a)} }},
  {{ id: 'r-nose-man', cat: 'aesthetic', tab: 'nose', need: 'photo', files: ['1rhinoplastybefore.jpg'], pair: '1rhinoplastyafter.jpg',
    title: ['Nose: a dorsal hump, and the real result', 'Hidung: punuk dorsum, dan hasil nyatanya'], sub: ['A real side view before and after rhinoplasty, read side by side with a slider.', 'Tampak samping nyata sebelum dan sesudah rhinoplasti, dibaca berdampingan dengan slider.'],
    points: {pts(nose_man)}, afterPoints: {pts(nose_man_a)} }},
  {{ id: 'r-smile-1', cat: 'aesthetic', tab: 'video', need: 'photo', files: ['../samples/sample-1.jpg'], ref: 'smile',
    title: ['Smile: how the two corners sit', 'Senyum: letak kedua sudut mulut'], sub: ['A real public-domain portrait. Mouth corners, eye opening and brow height, with the usual ways to improve a smile.', 'Potret domain publik nyata. Sudut mulut, bukaan mata dan tinggi alis, dengan cara lazim memperbaiki senyum.'] }},
  {{ id: 'r-smile-2', cat: 'aesthetic', tab: 'video', need: 'photo', files: ['../samples/sample-3.jpg'], ref: 'smile',
    title: ['Smile: a wide smile with teeth shown', 'Senyum: senyum lebar dengan gigi terlihat'], sub: ['A real public-domain portrait read the same way.', 'Potret domain publik nyata dibaca dengan cara yang sama.'] }},
  {{ id: 'r-lines-man', cat: 'aesthetic', tab: 'skin', need: 'photo', files: ['india_delhi_portrait_of_a_man_4780.jpg'],
    title: ['Lines: deep forehead and eye-corner lines', 'Garis: dahi dan sudut mata yang dalam'], sub: ['A real close-up portrait. Lines by zone, a softening preview, and what is usually done.', 'Potret dekat nyata. Garis per zona, pratinjau penghalusan, dan apa yang lazim dikerjakan.'] }},
  {{ id: 'r-lines-woman', cat: 'aesthetic', tab: 'skin', need: 'photo', files: ['elderly_gambian_woman_face_portrait.jpg'],
    title: ['Lines: fine lines and folds in older skin', 'Garis: garis halus dan lipatan pada kulit tua'], sub: ['A real close-up portrait read the same way.', 'Potret dekat nyata dibaca dengan cara yang sama.'] }},
  {{ id: 'r-wound-mannequin', cat: 'wound', tab: 'photo', need: 'photo', files: ['wound_mannequin_marking.jpg'], still: true,
    title: ['Wound marking on a simulation mannequin', 'Marking luka pada manekin simulasi'], sub: ['A real photograph with the segmented contour, numbered sutures and a schematic closure, from the Python prototype. Open it to read.', 'Foto nyata dengan kontur tersegmentasi, jahitan bernomor dan skema penutupan, dari prototipe Python. Buka untuk membaca.'] }},
"""
palsy_block = "".join(keep_palsy)
smile_recon = re.search(r"  \{ id: 'r-smile-recon'.*?\n.*?\n", old, flags=re.S)
rebuilt = "export const REAL: RealCase[] = [\n" + palsy_block + (smile_recon.group(0) if smile_recon else "") + new_cases + "];"
r = r[:a] + rebuilt + r[b:]

r = r.replace("export type Cat = 'palsy' | 'cleft' | 'aesthetic';", "export type Cat = 'palsy' | 'cleft' | 'aesthetic' | 'wound';", 1)
r = r.replace("  /** which reference text follows the reading */", "  /** the same subject after treatment: a second photograph read beside the first */\n  pair?: string; afterPoints?: Record<string, [number, number]>;\n  /** palate only: the photograph is shown and described, not measured */\n  palate?: boolean;\n  /** opens the picture in a viewer, no analysis */\n  still?: boolean;\n  /** which reference text follows the reading */", 1)
r = r.replace("""  { cat: 'aesthetic', title:""", """  { cat: 'wound', title: ['Wounds and scars', 'Luka dan parut'], sub: ['Upload your own photograph in the Photo tab to measure size, direction against the skin lines, marking and plan. Below is a real marking example.', 'Unggah foto Anda sendiri di tab Foto untuk mengukur ukuran, arah terhadap garis kulit, marking dan rencana. Di bawah ini contoh marking nyata.'] },
  { cat: 'aesthetic', title:""", 1)
# order: palsy, cleft, aesthetic, wound
c0 = r.index("const CATS:"); c1 = r.index("];", c0)
cats_txt = r[c0:c1]
parts = re.split(r"\n  \{ cat: ", cats_txt)
head, items = parts[0], ["  { cat: " + p for p in parts[1:]]
order = {"'palsy'": 0, "'cleft'": 1, "'aesthetic'": 2, "'wound'": 3}
items.sort(key=lambda s: order[re.match(r"  \{ cat: ('[a-z]+')", s).group(1)])
r = r[:c0] + head + "\n" + "\n".join(x.rstrip().rstrip(",") + "," for x in items) + "\n" + r[c1:]

# runner
a = r.index("export async function runReal");
r = r[:a] + """export async function runReal(id: string, setTab: (t: Tab) => void): Promise<void> {
  const r = REAL.find(x => x.id === id); if (!r) return;
  if (r.still) { openLightbox(`/real/${r.files[0]}`); return; }
  setTab(r.tab);
  const url = (f: string) => (f.startsWith('../') ? `/${f.slice(3)}` : `/real/${f}`);
  if (r.tab === 'video') {
    const list: Array<{ c: HTMLCanvasElement; name: string }> = [];
    for (const f of r.files) { const p = await loadPhotoUrl(url(f), f.split('/').pop()!); list.push({ c: p.canvas, name: f.split('/').pop()! }); }
    if (r.split) {
      const src = list[0].c, w = Math.floor(src.width / 2), halves: typeof list = [];
      for (const [i, nm] of [T('Before', 'Sebelum'), T('After', 'Sesudah')].entries()) {
        const c = document.createElement('canvas'); c.width = w; c.height = src.height;
        c.getContext('2d')!.drawImage(src, i * w, 0, w, src.height, 0, 0, w, src.height); halves.push({ c, name: nm });
      }
      await runStills(halves, 'compare', r.ref ?? 'palsy');
    } else await runStills(list, 'series', r.ref ?? 'palsy');
  } else if (r.tab === 'cleft') {
    await loadCleftUrl(url(r.files[0]), r.files[0], r.points, { pairUrl: r.pair ? url(r.pair) : undefined, palate: r.palate });
  } else if (r.tab === 'nose') {
    await loadNoseUrl(url(r.files[0]), r.files[0], r.points ?? {}, r.pair && r.afterPoints ? { url: url(r.pair), frac: r.afterPoints } : undefined);
  } else if (r.tab === 'skin') {
    await runWrinkleUrl(url(r.files[0]), r.files[0]);
  }
}
"""
r = r.replace("import { loadCleftUrl } from './cleft';", "import { loadCleftUrl } from './cleft';\nimport { loadNoseUrl } from './nose';\nimport { runWrinkleUrl } from './wrinkles';\nimport { openLightbox } from './examples';", 1)
(W / "real.ts").write_text(r, encoding="utf8")

# lightbox export in examples.ts
e = (W / "examples.ts").read_text(encoding="utf8")
e = e.replace("function openSheet(name: string): void {\n  const lb = document.createElement('div');", "function openSheet(name: string): void { openLightbox(`/api/examples/img/${name}`); }\n\nexport function openLightbox(src: string): void {\n  const lb = document.createElement('div');", 1)
e = e.replace("<img src=\"/api/examples/img/${esc(name)}\" alt=\"\">`;\n  const close", "<img src=\"${esc(src)}\" alt=\"\">`;\n  const close", 1)
(W / "examples.ts").write_text(e, encoding="utf8")
print("ok")
