import { T } from './panels';

/** What each assessment needs, so the clinician knows before capturing: one photo, a video, or a side-view photo. */
export type Need = 'photo' | 'video' | 'profile';
export interface Row { need: Need; en: [string, string]; id: [string, string] }

export const ROWS: Row[] = [
  { need: 'photo', en: ['Wound, scar or lesion: size, direction, marking, plan', 'A front photo shows the shape and the direction of the lesion.'], id: ['Luka, parut atau lesi: ukuran, arah, marking, rencana', 'Foto depan menunjukkan bentuk dan arah lesi.'] },
  { need: 'photo', en: ['Proportions and static asymmetry', 'Distances at rest are measured on one front photo.'], id: ['Proporsi dan asimetri statis', 'Jarak saat istirahat diukur dari satu foto depan.'] },
  { need: 'video', en: ['Facial palsy: brow, eye closure, smile', 'Palsy is a problem of movement. A still photo cannot show how far each side moves.'], id: ['Kelumpuhan wajah: alis, menutup mata, senyum', 'Kelumpuhan adalah masalah gerak. Foto diam tidak menunjukkan seberapa jauh tiap sisi bergerak.'] },
  { need: 'video', en: ['Smile: corner lift, symmetry, teeth shown', 'The smile is a movement; the peak and the speed come from a clip.'], id: ['Senyum: angkat sudut, simetri, gigi terlihat', 'Senyum adalah gerakan; puncak dan kecepatannya dari klip.'] },
  { need: 'profile', en: ['Nose: projection, tip rotation, dorsum', 'Projection is depth. It shows only on a true side view.'], id: ['Hidung: proyeksi, rotasi ujung, dorsum', 'Proyeksi adalah kedalaman. Hanya terlihat pada tampak samping sejati.'] },
];

export const CHIP: Record<Need, [string, string]> = { photo: ['Photo is enough', 'Foto cukup'], video: ['Needs video', 'Butuh video'], profile: ['Needs a side photo', 'Butuh foto samping'] };

export function guideHtml(): string {
  const id = T('0', '1') === '1';
  return `<ul class="guide">${ROWS.map(r => `<li><span class="chip ${r.need}">${CHIP[r.need][id ? 1 : 0]}</span><b>${(id ? r.id : r.en)[0]}</b><small>${(id ? r.id : r.en)[1]}</small></li>`).join('')}</ul>`;
}
