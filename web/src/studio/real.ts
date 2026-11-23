import { loadPhotoUrl } from './photo';
import { runStills } from './video';
import { loadCleftUrl } from './cleft';
import { T, esc } from './panels';
import { lang } from '../i18n';
import type { Tab } from './store';

/**
 * Real cases: openly licensed photographs (Wikimedia Commons) of real facial palsy and cleft lip, with the licence and the author beside each.
 * They are published patient photographs used only to show how the tools read a real face. Nothing here is a diagnosis, and the
 * measurements never choose a treatment.
 */
export interface RealCase {
  id: string; tab: Tab; need: 'photo' | 'video';
  /** first file is the rest photo when there are several; one file is read statically */
  files: string[]; title: [string, string]; sub: [string, string];
  /** cleft only: the twelve points as fractions of the picture width and height, set for the clinician to confirm or drag */
  points?: Record<string, [number, number]>;
  /** a composite picture holding two panels side by side (before | after) */
  split?: boolean;
}

export const REAL: RealCase[] = [
  { id: 'r-palsy-eye', tab: 'video', need: 'video', files: ['fazialisl_hmung_tag_05_bell_ph_nomen_2_1000.jpg'],
    title: ['Bell palsy: eye closure and Bell phenomenon', 'Bell palsy: menutup mata dan fenomena Bell'], sub: ['A real photograph on day 5. The eye on the image right does not close and rolls up.', 'Foto nyata hari ke-5. Mata di sisi kanan gambar tidak menutup dan berputar ke atas.'] },
  { id: 'r-palsy-teeth', tab: 'video', need: 'video', files: ['bell_s_palsy_symptoms_show_your_teeth.jpg'],
    title: ['Facial palsy: showing the teeth', 'Kelumpuhan wajah: memperlihatkan gigi'], sub: ['A real photograph of an attempted smile with the teeth shown.', 'Foto nyata upaya senyum dengan gigi diperlihatkan.'] },
  { id: 'r-palsy-eyes', tab: 'video', need: 'video', files: ['bell_s_palsy_symptoms_closed_eyes.jpg'],
    title: ['Facial palsy: eyes squeezed shut', 'Kelumpuhan wajah: mata dipejamkan kuat'], sub: ['A real photograph of an attempt to close the eyes tightly.', 'Foto nyata upaya memejamkan mata kuat.'] },
  { id: 'r-palsy-smile', tab: 'video', need: 'video', files: ['bellspalsy.jpg'],
    title: ['Facial palsy: smile with the head tilted', 'Kelumpuhan wajah: senyum dengan kepala miring'], sub: ['A real photograph of a smile. The head is tilted, which the reading corrects for roll only.', 'Foto nyata senyum. Kepala miring, yang hanya dikoreksi untuk roll.'] },
  { id: 'r-palsy-old', tab: 'video', need: 'video', files: ['man_suffering_from_right_facial_palsy_wellcome_l.jpg'],
    title: ['Right facial palsy (historical photograph)', 'Kelumpuhan wajah kanan (foto bersejarah)'], sub: ['A real historical photograph from the Wellcome Collection.', 'Foto bersejarah nyata dari Wellcome Collection.'] },
  { id: 'r-smile-recon', tab: 'video', need: 'video', files: ['before_and_after_dynamic_smile_reconstruction.jpg'], split: true,
    title: ['Smile reconstruction: before and after', 'Rekonstruksi senyum: sebelum dan sesudah'], sub: ['A real before and after pair after dynamic smile reconstruction, read side by side with a slider.', 'Pasangan nyata sebelum dan sesudah rekonstruksi senyum dinamis, dibaca berdampingan dengan slider.'] },
  { id: 'r-cleft-child', tab: 'cleft', need: 'photo', files: ['cleft_lip_child.jpg'],
    title: ['Unilateral cleft lip in a child', 'Bibir sumbing unilateral pada anak'], sub: ['A real photograph. The twelve points are pre-placed for you to confirm or drag.', 'Foto nyata. Dua belas titik sudah dipasang untuk Anda konfirmasi atau geser.'],
    points: { nasion: [0.52, 0.36], prn: [0.52, 0.53], sn: [0.52, 0.60], sbal_R: [0.46, 0.61], sbal_L: [0.575, 0.60], al_R: [0.434, 0.568], al_L: [0.605, 0.558], cph_R: [0.457, 0.70], cph_L: [0.54, 0.674], ls: [0.50, 0.675], ch_R: [0.406, 0.73], ch_L: [0.61, 0.727] } },
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
  return `<h4 class="ex-h">${T('Real cases (openly licensed photographs)', 'Kasus nyata (foto berlisensi terbuka)')}</h4>` + REAL.map(r => {
    const c = a[r.files[0]];
    const credit = c ? `${esc(c.artist.slice(0, 60))} · ${esc(c.licence)}` : '';
    return `<article class="ex-card" data-ex="${r.id}" tabindex="0" role="button" aria-label="${esc(r.title[i])}">
      <div class="ex-thumb"><img src="/real/${esc(r.files[r.files.length > 1 ? 1 : 0])}" alt=""><span class="ex-chip ${r.need}">${r.need === 'video' ? T('movement', 'gerakan') : T('front photo', 'foto depan')}</span><span class="ex-run">${T('Run the analysis', 'Jalankan analisis')} →</span></div>
      <h5>${esc(r.title[i])}</h5><p>${esc(r.sub[i])}</p><p class="fine">${credit}</p></article>`;
  }).join('');
}

export async function runReal(id: string, setTab: (t: Tab) => void): Promise<void> {
  const r = REAL.find(x => x.id === id); if (!r) return;
  setTab(r.tab);
  if (r.tab === 'video') {
    const list: Array<{ c: HTMLCanvasElement; name: string }> = [];
    for (const f of r.files) { const p = await loadPhotoUrl(`/real/${f}`, f); list.push({ c: p.canvas, name: f }); }
    if (r.split) {
      const src = list[0].c, w = Math.floor(src.width / 2), halves: typeof list = [];
      for (const [i, nm] of [T('Before', 'Sebelum'), T('After', 'Sesudah')].entries()) {
        const c = document.createElement('canvas'); c.width = w; c.height = src.height;
        c.getContext('2d')!.drawImage(src, i * w, 0, w, src.height, 0, 0, w, src.height); halves.push({ c, name: nm });
      }
      await runStills(halves, 'compare');
    } else await runStills(list);
  } else {
    await loadCleftUrl(`/real/${r.files[0]}`, r.files[0], r.points);
  }
}
