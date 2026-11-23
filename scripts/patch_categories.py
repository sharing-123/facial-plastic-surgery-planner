"""Gallery in tidy categories: facial palsy, cleft lip and palate, aesthetic (nose, smile, lines), wounds and scars."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")

r = (W / "real.ts").read_text(encoding="utf8")
r = r.replace("export interface RealCase {\n  id: string; tab: Tab; need: 'photo' | 'video';", "export type Cat = 'palsy' | 'cleft' | 'aesthetic';\nexport interface RealCase {\n  id: string; cat: Cat; tab: Tab; need: 'photo' | 'video';", 1)
for i in ["r-palsy-eye", "r-palsy-teeth", "r-palsy-eyes", "r-palsy-smile", "r-palsy-old", "r-smile-recon"]:
    r = r.replace(f"{{ id: '{i}', tab:", f"{{ id: '{i}', cat: '{'aesthetic' if i == 'r-smile-recon' else 'palsy'}', tab:", 1)
r = r.replace("{ id: 'r-cleft-child', tab:", "{ id: 'r-cleft-child', cat: 'cleft', tab:", 1)
CATS = """const CATS: Array<{ cat: Cat; title: [string, string]; sub: [string, string] }> = [
  { cat: 'palsy', title: ['Facial palsy', 'Kelumpuhan wajah'], sub: ['Real photographs: how the two sides sit and move, and what is usually done by time since onset. A video is needed to judge movement.', 'Foto nyata: letak dan gerak kedua sisi, dan apa yang lazim dikerjakan menurut waktu sejak onset. Video diperlukan untuk menilai gerakan.'] },
  { cat: 'cleft', title: ['Cleft lip and palate', 'Bibir sumbing dan celah langit-langit'], sub: ['Real photographs: twelve points, right against left, and the usual sequence of care by age.', 'Foto nyata: dua belas titik, kanan lawan kiri, dan urutan perawatan lazim menurut usia.'] },
  { cat: 'aesthetic', title: ['Aesthetic planning: nose, smile, lines', 'Perencanaan estetika: hidung, senyum, garis'], sub: ['Real photographs with a preview of the geometry and the methods usually used. What to change, if anything, is the patient\\'s choice.', 'Foto nyata dengan pratinjau geometri dan metode yang lazim dipakai. Apa yang diubah, bila ada, adalah pilihan pasien.'] },
];

"""
r = r.replace("interface Attribution {", CATS + "interface Attribution {", 1)
a = r.index("export async function realHtml"); b = r.index("export async function runReal")
new_html = """export async function realHtml(): Promise<string> {
  if (!REAL.length) return '';
  const a = await credits(), i = lang() === 'id' ? 1 : 0;
  return CATS.map(c => {
    const cases = REAL.filter(r => r.cat === c.cat); if (!cases.length) return '';
    return `<div class="ex-sec"><h4 class="ex-h">${esc(c.title[i])} <span>${cases.length}</span></h4><p class="fine">${esc(c.sub[i])}</p></div>` + cases.map(r => {
      const cr = a[r.files[0]];
      const credit = cr ? `${esc(cr.artist.slice(0, 60))} · ${esc(cr.licence)}` : '';
      return `<article class="ex-card" data-ex="${r.id}" tabindex="0" role="button" aria-label="${esc(r.title[i])}">
      <div class="ex-thumb"><img src="/real/${esc(r.files[r.files.length > 1 ? 1 : 0])}" alt=""><span class="ex-chip ${r.need}">${r.need === 'video' ? T('movement', 'gerakan') : T('photo', 'foto')}</span><span class="ex-run">${T('Run the analysis', 'Jalankan analisis')} →</span></div>
      <h5>${esc(r.title[i])}</h5><p>${esc(r.sub[i])}</p><p class="fine">${credit}</p></article>`;
    }).join('');
  }).join('');
}

"""
r = r[:a] + new_html + r[b:]
(W / "real.ts").write_text(r, encoding="utf8")

e = (W / "examples.ts").read_text(encoding="utf8")
e = e.replace("    body.insertAdjacentHTML('beforeend', await realHtml());\n", "")
e = e.replace("    body.innerHTML = items.map(e => `<article", "    body.innerHTML = (await realHtml()) + `<div class=\"ex-sec\"><h4 class=\"ex-h\">${T('Wounds and scars (synthetic lesions on public-domain portraits)', 'Luka dan parut (lesi sintetis pada potret domain publik)')} <span>${items.length}</span></h4><p class=\"fine\">${T('Measured size, direction against the skin lines, marking and plan.', 'Ukuran terukur, arah terhadap garis kulit, marking dan rencana.')}</p></div>` + items.map(e => `<article", 1)
(W / "examples.ts").write_text(e, encoding="utf8")

c = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\styles\studio.css")
t = c.read_text(encoding="utf8")
t += r"""
.ex-sec { grid-column: 1 / -1; margin: 22px 0 2px; padding-top: 14px; border-top: 1px solid var(--line); } .ex-sec:first-child { margin-top: 0; border-top: 0; padding-top: 0; }
.ex-sec .ex-h { margin: 0 0 2px; font-size: 1.05rem; font-weight: 500; color: var(--text); letter-spacing: 0; display: flex; gap: 10px; align-items: baseline; }
.ex-sec .ex-h span { font: 500 0.72rem 'JetBrains Mono', monospace; color: #5fe8c8; border: 1px solid rgba(95,232,200,0.4); border-radius: 999px; padding: 1px 8px; }
.ex-sec .fine { margin: 0; }
"""
c.write_text(t, encoding="utf8")
print("ok")
