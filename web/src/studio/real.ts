import { loadPhotoUrl } from './photo';
import { runStills } from './video';
import { loadCleftUrl } from './cleft';
import { loadNoseUrl } from './nose';
import { runWrinkleUrl } from './wrinkles';
import { openLightbox } from './examples';
import { T, esc } from './panels';
import { lang } from '../i18n';
import type { Tab } from './store';

/**
 * Real cases: openly licensed photographs (Wikimedia Commons) of real facial palsy and cleft lip, with the licence and the author beside each.
 * They are published patient photographs used only to show how the tools read a real face. Nothing here is a diagnosis, and the
 * measurements never choose a treatment.
 */
export type Cat = 'palsy' | 'cleft' | 'aesthetic' | 'wound';
export interface RealCase {
  id: string; cat: Cat; tab: Tab; need: 'photo' | 'video';
  /** first file is the rest photo when there are several; one file is read statically */
  files: string[]; title: [string, string]; sub: [string, string];
  /** cleft only: the twelve points as fractions of the picture width and height, set for the clinician to confirm or drag */
  points?: Record<string, [number, number]>;
  /** the same subject after treatment: a second photograph read beside the first */
  pair?: string; afterPoints?: Record<string, [number, number]>;
  /** palate only: the photograph is shown and described, not measured */
  palate?: boolean;
  /** opens the picture in a viewer, no analysis */
  still?: boolean;
  /** which reference text follows the reading */
  ref?: 'palsy' | 'smile';
  /** a composite picture holding two panels side by side (before | after) */
  split?: boolean;
}

export const REAL: RealCase[] = [
  { id: 'r-palsy-eye', cat: 'palsy', tab: 'video', need: 'video', files: ['fazialisl_hmung_tag_05_bell_ph_nomen_2_1000.jpg'],
    title: ['Bell palsy: eye closure and Bell phenomenon', 'Bell palsy: menutup mata dan fenomena Bell'], sub: ['A real photograph on day 5. The eye on the image right does not close and rolls up.', 'Foto nyata hari ke-5. Mata di sisi kanan gambar tidak menutup dan berputar ke atas.'] },
  { id: 'r-palsy-teeth', cat: 'palsy', tab: 'video', need: 'video', files: ['bell_s_palsy_symptoms_show_your_teeth.jpg'],
    title: ['Facial palsy: showing the teeth', 'Kelumpuhan wajah: memperlihatkan gigi'], sub: ['A real photograph of an attempted smile with the teeth shown.', 'Foto nyata upaya senyum dengan gigi diperlihatkan.'] },
  { id: 'r-palsy-eyes', cat: 'palsy', tab: 'video', need: 'video', files: ['bell_s_palsy_symptoms_closed_eyes.jpg'],
    title: ['Facial palsy: eyes squeezed shut', 'Kelumpuhan wajah: mata dipejamkan kuat'], sub: ['A real photograph of an attempt to close the eyes tightly.', 'Foto nyata upaya memejamkan mata kuat.'] },
  { id: 'r-palsy-smile', cat: 'palsy', tab: 'video', need: 'video', files: ['bellspalsy.jpg'],
    title: ['Facial palsy: smile with the head tilted', 'Kelumpuhan wajah: senyum dengan kepala miring'], sub: ['A real photograph of a smile. The head is tilted, which the reading corrects for roll only.', 'Foto nyata senyum. Kepala miring, yang hanya dikoreksi untuk roll.'] },
  { id: 'r-palsy-old', cat: 'palsy', tab: 'video', need: 'video', files: ['man_suffering_from_right_facial_palsy_wellcome_l.jpg'],
    title: ['Right facial palsy (historical photograph)', 'Kelumpuhan wajah kanan (foto bersejarah)'], sub: ['A real historical photograph from the Wellcome Collection.', 'Foto bersejarah nyata dari Wellcome Collection.'] },
  { id: 'r-smile-recon', cat: 'aesthetic', tab: 'video', need: 'video', files: ['before_and_after_dynamic_smile_reconstruction.jpg'], split: true,
    title: ['Smile reconstruction: before and after', 'Rekonstruksi senyum: sebelum dan sesudah'], sub: ['A real before and after pair after dynamic smile reconstruction, read side by side with a slider.', 'Pasangan nyata sebelum dan sesudah rekonstruksi senyum dinamis, dibaca berdampingan dengan slider.'] },

  { id: 'r-cleft-infant', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['13900470_3preoperation0.jpg'],
    title: ['Unilateral cleft lip in an infant', 'Bibir sumbing unilateral pada bayi'], sub: ['A real photograph before repair. The twelve points are pre-placed for you to confirm or drag.', 'Foto nyata sebelum perbaikan. Dua belas titik sudah dipasang untuk Anda konfirmasi atau geser.'],
    points: { nasion: [0.5283, 0.4161], prn: [0.536, 0.5839], sn: [0.5283, 0.6248], sbal_R: [0.4135, 0.635], sbal_L: [0.6355, 0.6277], al_R: [0.3982, 0.6131], al_L: [0.6508, 0.5912], cph_R: [0.4487, 0.6745], cph_L: [0.5054, 0.6496], ls: [0.4747, 0.6715], ch_R: [0.3645, 0.7299], ch_L: [0.6003, 0.7591] } },
  { id: 'r-cleft-pair', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['cleftbefore.jpg'], pair: 'cleftafter.jpg',
    title: ['Cleft lip: before and after repair', 'Bibir sumbing: sebelum dan sesudah perbaikan'], sub: ['A real before and after pair of the same child, with a slider. The reading is for the first photograph.', 'Pasangan nyata sebelum dan sesudah dari anak yang sama, dengan slider. Pembacaan untuk foto pertama.'],
    points: { nasion: [0.5199, 0.4513], prn: [0.5343, 0.5704], sn: [0.5307, 0.6209], sbal_R: [0.4729, 0.6318], sbal_L: [0.5884, 0.6209], al_R: [0.4477, 0.6065], al_L: [0.6137, 0.5921], cph_R: [0.5054, 0.6715], cph_L: [0.5776, 0.657], ls: [0.5415, 0.6643], ch_R: [0.426, 0.6931], ch_L: [0.6498, 0.6859] } },
  { id: 'r-cleft-postop', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['17161036_postopt3.jpg'], palate: true,
    title: ['Cleft lip just after repair', 'Bibir sumbing segera setelah perbaikan'], sub: ['A real photograph of the sutured lip and nose. The usual sequence of care by age follows.', 'Foto nyata bibir dan hidung yang dijahit. Urutan perawatan lazim menurut usia menyusul.'] },
  { id: 'r-cleft-palate', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['baby_girl_with_cleft_palate_smiling.jpg'], palate: true,
    title: ['Cleft lip and palate in an infant', 'Bibir sumbing dan celah langit-langit pada bayi'], sub: ['A real photograph. The palate is described by examination, not measured on a photograph.', 'Foto nyata. Langit-langit digambarkan lewat pemeriksaan, tidak diukur pada foto.'] },
  { id: 'r-cleft-soft', cat: 'cleft', tab: 'cleft', need: 'photo', files: ['girl_exhibiting_a_cleft_of_the_soft_palate_wellc.jpg'], palate: true,
    title: ['Cleft of the soft palate (historical)', 'Celah langit-langit lunak (bersejarah)'], sub: ['A real historical photograph from the Wellcome Collection.', 'Foto bersejarah nyata dari Wellcome Collection.'] },
  { id: 'r-nose-woman', cat: 'aesthetic', tab: 'nose', need: 'photo', files: ['2rhinoplastybefore.jpg'], pair: '2rhinoplastyafter.jpg',
    title: ['Nose: a short, rounded tip, and the real result', 'Hidung: ujung pendek membulat, dan hasil nyatanya'], sub: ['A real side view before and after rhinoplasty. Angles and Goode ratio, the planned profile, and the methods.', 'Tampak samping nyata sebelum dan sesudah rhinoplasti. Sudut dan rasio Goode, profil rencana, dan metodenya.'],
    points: { G: [0.13, 0.4375], N: [0.1467, 0.55], Prn: [0.0867, 0.6462], Cm: [0.1167, 0.675], Sn: [0.14, 0.6913], Ls: [0.14, 0.7538], Pg: [0.1833, 0.865], Ac: [0.1667, 0.6513] }, afterPoints: { G: [0.1367, 0.4313], N: [0.15, 0.5375], Prn: [0.0667, 0.6375], Cm: [0.1033, 0.6725], Sn: [0.1367, 0.69], Ls: [0.1467, 0.7562], Pg: [0.18, 0.8625], Ac: [0.1667, 0.6525] } },
  { id: 'r-nose-man', cat: 'aesthetic', tab: 'nose', need: 'photo', files: ['1rhinoplastybefore.jpg'], pair: '1rhinoplastyafter.jpg',
    title: ['Nose: a dorsal hump, and the real result', 'Hidung: punuk dorsum, dan hasil nyatanya'], sub: ['A real side view before and after rhinoplasty, read side by side with a slider.', 'Tampak samping nyata sebelum dan sesudah rhinoplasti, dibaca berdampingan dengan slider.'],
    points: { G: [0.1467, 0.2975], N: [0.125, 0.4125], Prn: [0.0133, 0.5825], Cm: [0.075, 0.615], Sn: [0.0933, 0.64], Ls: [0.0783, 0.7025], Pg: [0.1583, 0.8], Ac: [0.18, 0.5975] }, afterPoints: { G: [0.1533, 0.2975], N: [0.1333, 0.4125], Prn: [0.01, 0.5775], Cm: [0.07, 0.62], Sn: [0.09, 0.6375], Ls: [0.0767, 0.7025], Pg: [0.1533, 0.8], Ac: [0.1767, 0.595] } },
  { id: 'r-smile-1', cat: 'aesthetic', tab: 'video', need: 'photo', files: ['../samples/sample-1.jpg'], ref: 'smile',
    title: ['Smile: how the two corners sit', 'Senyum: letak kedua sudut mulut'], sub: ['A real public-domain portrait. Mouth corners, eye opening and brow height, with the usual ways to improve a smile.', 'Potret domain publik nyata. Sudut mulut, bukaan mata dan tinggi alis, dengan cara lazim memperbaiki senyum.'] },
  { id: 'r-smile-2', cat: 'aesthetic', tab: 'video', need: 'photo', files: ['../samples/sample-3.jpg'], ref: 'smile',
    title: ['Smile: a wide smile with teeth shown', 'Senyum: senyum lebar dengan gigi terlihat'], sub: ['A real public-domain portrait read the same way.', 'Potret domain publik nyata dibaca dengan cara yang sama.'] },
  { id: 'r-lines-man', cat: 'aesthetic', tab: 'skin', need: 'photo', files: ['india_delhi_portrait_of_a_man_4780.jpg'],
    title: ['Lines: deep forehead and eye-corner lines', 'Garis: dahi dan sudut mata yang dalam'], sub: ['A real close-up portrait. Lines by zone, a softening preview, and what is usually done.', 'Potret dekat nyata. Garis per zona, pratinjau penghalusan, dan apa yang lazim dikerjakan.'] },
  { id: 'r-lines-woman', cat: 'aesthetic', tab: 'skin', need: 'photo', files: ['elderly_gambian_woman_face_portrait.jpg'],
    title: ['Lines: fine lines and folds in older skin', 'Garis: garis halus dan lipatan pada kulit tua'], sub: ['A real close-up portrait read the same way.', 'Potret dekat nyata dibaca dengan cara yang sama.'] },
  { id: 'r-wound-mannequin', cat: 'wound', tab: 'photo', need: 'photo', files: ['wound_mannequin_marking.jpg'], still: true,
    title: ['Wound marking on a simulation mannequin', 'Marking luka pada manekin simulasi'], sub: ['A real photograph with the segmented contour, numbered sutures and a schematic closure, from the Python prototype. Open it to read.', 'Foto nyata dengan kontur tersegmentasi, jahitan bernomor dan skema penutupan, dari prototipe Python. Buka untuk membaca.'] },
];

const CATS: Array<{ cat: Cat; title: [string, string

]; sub: [string, string] }> = [
  { cat: 'palsy', title: ['Facial palsy', 'Kelumpuhan wajah'], sub: ['Real photographs: how the two sides sit and move, and what is usually done by time since onset. A video is needed to judge movement.', 'Foto nyata: letak dan gerak kedua sisi, dan apa yang lazim dikerjakan menurut waktu sejak onset. Video diperlukan untuk menilai gerakan.'] },
  { cat: 'cleft', title: ['Cleft lip and palate', 'Bibir sumbing dan celah langit-langit'], sub: ['Real photographs: twelve points, right against left, and the usual sequence of care by age.', 'Foto nyata: dua belas titik, kanan lawan kiri, dan urutan perawatan lazim menurut usia.'] },
  { cat: 'aesthetic', title: ['Aesthetic planning: nose, smile, lines', 'Perencanaan estetika: hidung, senyum, garis'], sub: ['Real photographs with a preview of the geometry and the methods usually used. What to change, if anything, is the patient\'s choice.', 'Foto nyata dengan pratinjau geometri dan metode yang lazim dipakai. Apa yang diubah, bila ada, adalah pilihan pasien.'] },
  { cat: 'wound', title: ['Wounds and scars', 'Luka dan parut'], sub: ['Upload your own photograph in the Photo tab to measure size, direction against the skin lines, marking and plan. Below is a real marking example.', 'Unggah foto Anda sendiri di tab Foto untuk mengukur ukuran, arah terhadap garis kulit, marking dan rencana. Di bawah ini contoh marking nyata.'] },
];

interface Attribution { title: string; licence: string; artist: string; source: string }
let attrib: Record<string, Attribution> | undefined;
async function credits(): Promise<Record<string, Attribution>> {
  if (attrib) return attrib;
  try { attrib = (await (await fetch('/real/ATTRIBUTION.json')).json()) as Record<string, Attribution>; } catch { attrib = {}; }
  return attrib;
}

export async function realHtml(): Promise<string> {
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

export async function runReal(id: string, setTab: (t: Tab) => void): Promise<void> {
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
