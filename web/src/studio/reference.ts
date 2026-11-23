import { esc } from './panels';
import { lang } from '../i18n';

/**
 * Management reference: what is usually offered, and when. It is textbook content written for a clinician. It is NOT computed from the
 * measurements on the page, and it is not advice for one patient: the measurements never choose an operation. Sources are named so each
 * line can be checked.
 */
type L = [string, string];
interface Block { title: L; items: L[] }
const pick = (l: L): string => esc(l[lang() === 'id' ? 1 : 0]);
const html = (head: L, blocks: Block[], src: L): string => `<details class="acc ref" open><summary>${pick(head)}</summary><div class="accb">
  ${blocks.map(b => `<h5>${pick(b.title)}</h5><ul class="ref-ul">${b.items.map(i => `<li>${pick(i)}</li>`).join('')}</ul>`).join('')}
  <p class="fine">${pick(src)}</p></div></details>`;

const NOTE: L = ['Textbook reference for a clinician, not derived from the measurements above and not a recommendation for one patient.', 'Rujukan buku ajar untuk dokter, tidak diturunkan dari pengukuran di atas dan bukan rekomendasi untuk satu pasien.'];

export function palsyReference(): string {
  return html(['Facial palsy: what is usually done, by time since onset', 'Kelumpuhan wajah: apa yang lazim dikerjakan, menurut waktu sejak onset'], [
    { title: ['First, the cause', 'Pertama, penyebabnya'], items: [
      ['Forehead movement kept with a weak lower face points to a central cause (stroke, tumour): urgent imaging, not Bell palsy.', 'Gerak dahi masih ada dengan wajah bawah lemah mengarah ke sebab sentral (stroke, tumor): pencitraan segera, bukan Bell palsy.'],
      ['Look for zoster (ear vesicles), trauma, otitis, parotid mass, Lyme, and bilateral or recurrent palsy; these change the plan.', 'Cari zoster (vesikel telinga), trauma, otitis, massa parotis, Lyme, serta palsi bilateral atau berulang; ini mengubah rencana.'],
    ] },
    { title: ['Acute Bell palsy (first 72 hours)', 'Bell palsy akut (72 jam pertama)'], items: [
      ['Oral corticosteroid started within 72 hours (the AAO-HNSF guideline gives prednisolone 50 mg for 10 days, or 60 mg for 5 days then a 5-day taper).', 'Kortikosteroid oral dimulai dalam 72 jam (pedoman AAO-HNSF: prednisolon 50 mg selama 10 hari, atau 60 mg selama 5 hari lalu tapering 5 hari).'],
      ['An antiviral may be added to the steroid; an antiviral alone is not recommended.', 'Antivirus boleh ditambahkan ke steroid; antivirus saja tidak direkomendasikan.'],
      ['Protect the eye from the first day: lubricating drops by day, ointment at night, and taping or a moisture chamber; ophthalmology if the eye does not close.', 'Lindungi mata sejak hari pertama: tetes pelumas siang hari, salep malam hari, plester atau moisture chamber; ke mata bila tidak menutup.'],
      ['Surgical decompression is not offered for typical Bell palsy.', 'Dekompresi bedah tidak ditawarkan untuk Bell palsy tipikal.'],
    ] },
    { title: ['Not recovering (about 3 months) or recovery with synkinesis', 'Tidak pulih (sekitar 3 bulan) atau pulih dengan sinkinesis'], items: [
      ['Re-examine: imaging of the nerve course, and electrodiagnosis; look for a mass.', 'Periksa ulang: pencitraan perjalanan saraf, dan elektrodiagnosis; cari massa.'],
      ['Physiotherapy (neuromuscular retraining) and botulinum toxin for synkinesis, hypertonicity, or to balance the normal side.', 'Fisioterapi (retraining neuromuskular) dan toksin botulinum untuk sinkinesis, hipertonus, atau menyeimbangkan sisi normal.'],
    ] },
    { title: ['Persistent paralysis: the choice depends on how long the muscles have been without nerve supply', 'Paralisis menetap: pilihan bergantung pada lama otot tanpa persarafan'], items: [
      ['Within roughly 12 to 24 months: nerve-based reanimation, such as a cross-face nerve graft or a masseteric nerve transfer, with or without a free muscle.', 'Dalam kira-kira 12 sampai 24 bulan: reanimasi berbasis saraf, misalnya cangkok saraf cross-face atau transfer saraf masseterik, dengan atau tanpa otot bebas.'],
      ['Later, or when the nerve is not usable: free functional muscle transfer (gracilis) or temporalis tendon transfer.', 'Lebih lambat, atau saat saraf tidak bisa dipakai: transfer otot fungsional bebas (gracilis) atau transfer tendon temporalis.'],
      ['Static options for rest symmetry: fascia lata sling or suspension; brow lift.', 'Pilihan statis untuk simetri istirahat: sling fasia lata atau suspensi; brow lift.'],
      ['Eye: upper-lid gold or platinum weight, lower-lid tightening (tarsal strip), or lateral tarsorrhaphy when the cornea is at risk.', 'Mata: pemberat kelopak atas emas atau platinum, pengencangan kelopak bawah (tarsal strip), atau tarsorafi lateral bila kornea berisiko.'],
    ] },
  ], ['Sources: Baugh RF et al., AAO-HNSF Clinical Practice Guideline: Bell Palsy, Otolaryngol Head Neck Surg 2013; standard facial reanimation texts. Grading scales used by clinicians (House-Brackmann, Sunnybrook, eFACE) are not applied here. ', 'Sumber: Baugh RF dkk., AAO-HNSF Clinical Practice Guideline: Bell Palsy, Otolaryngol Head Neck Surg 2013; buku ajar reanimasi wajah. Skala yang dipakai dokter (House-Brackmann, Sunnybrook, eFACE) tidak diterapkan di sini. ']);
}

export function cleftReference(): string {
  return html(['Cleft lip and palate: the usual sequence by age', 'Bibir sumbing dan celah langit: urutan lazim menurut usia'], [
    { title: ['Infancy', 'Bayi'], items: [
      ['Feeding support first (specialised bottles); a multidisciplinary cleft team from the start.', 'Dukungan menyusu lebih dulu (botol khusus); tim sumbing multidisiplin sejak awal.'],
      ['Presurgical infant orthopaedics (for example nasoalveolar moulding) is used in some centres.', 'Ortopedi bayi sebelum operasi (misalnya nasoalveolar moulding) dipakai di sebagian pusat.'],
      ['Lip repair at about 3 to 6 months: rotation-advancement (Millard), anatomic subunit (Fisher) or other techniques, often with primary correction of the nasal tip and alar base.', 'Perbaikan bibir pada usia sekitar 3 sampai 6 bulan: rotasi-advancement (Millard), subunit anatomis (Fisher) atau teknik lain, sering dengan koreksi primer ujung hidung dan dasar alar.'],
      ['Palate repair at about 9 to 12 months (two-flap palatoplasty, or Furlow double-opposing Z-plasty); ear checks and ventilation tubes as needed.', 'Perbaikan langit-langit pada usia sekitar 9 sampai 12 bulan (palatoplasti dua flap, atau Z-plasti berlawanan ganda Furlow); pemeriksaan telinga dan pipa ventilasi bila perlu.'],
    ] },
    { title: ['Childhood', 'Anak'], items: [
      ['Speech therapy from the toddler years; assess velopharyngeal function at about 4 to 5 years, and offer a pharyngeal flap, sphincter pharyngoplasty or a Furlow revision if it is insufficient.', 'Terapi wicara sejak balita; nilai fungsi velofaring sekitar usia 4 sampai 5 tahun, dan tawarkan pharyngeal flap, sphincter pharyngoplasty atau revisi Furlow bila tidak cukup.'],
      ['Orthodontics, and alveolar bone grafting at about 8 to 11 years before the canine erupts.', 'Ortodonti, dan cangkok tulang alveolar pada usia sekitar 8 sampai 11 tahun sebelum gigi taring erupsi.'],
    ] },
    { title: ['After growth', 'Setelah pertumbuhan'], items: [
      ['Orthognathic surgery when growth is complete (about 16 to 18 years) if the jaws are mismatched.', 'Bedah ortognatik setelah pertumbuhan selesai (sekitar 16 sampai 18 tahun) bila rahang tidak serasi.'],
      ['Definitive rhinoplasty and lip or scar revision once the nose has finished growing; revision is a shared decision with the patient.', 'Rinoplasti definitif dan revisi bibir atau parut setelah hidung selesai tumbuh; revisi adalah keputusan bersama dengan pasien.'],
    ] },
  ], ['Timing varies by centre. Sources: ACPA team-care standards and standard cleft surgery texts. The measurements on this page are asymmetries on a front photo; they do not choose the technique or the timing. ', 'Waktu bervariasi antar pusat. Sumber: standar perawatan tim ACPA dan buku ajar bedah sumbing. Pengukuran di halaman ini adalah asimetri pada foto depan; tidak memilih teknik atau waktu operasi. ']);
}

export function noseReference(deficitTip: boolean, dorsal: boolean, lowRadix: boolean): string {
  const items: Block[] = [];
  items.push({ title: ['Raising the dorsum', 'Menaikkan dorsum'], items: dorsal ? [
    ['Autologous cartilage graft (septal, ear or rib): lowest extrusion and infection risk, donor-site cost, can warp (rib) or resorb slightly.', 'Cangkok tulang rawan autolog (septum, telinga atau iga): risiko ekstrusi dan infeksi paling rendah, ada beban area donor, bisa melengkung (iga) atau resorpsi ringan.'],
    ['Silicone implant (alloplast): widely used for a low dorsum in East and Southeast Asian noses, easy and reversible, with a higher risk of capsule, extrusion and infection, especially at the tip.', 'Implan silikon (aloplas): luas dipakai untuk dorsum rendah pada hidung Asia Timur dan Tenggara, mudah dan bisa dicabut, risiko kapsul, ekstrusi dan infeksi lebih tinggi, terutama di ujung.'],
    ['ePTFE (Gore-Tex) or porous implants: stable, tissue ingrowth makes removal harder.', 'ePTFE (Gore-Tex) atau implan berpori: stabil, jaringan tumbuh ke dalam sehingga pencabutan lebih sulit.'],
    ['Non-surgical: hyaluronic acid filler or threads give a temporary lift; the nasal root and dorsum carry a real risk of vascular occlusion and skin or eye injury, so a clinician who can manage it should do it.', 'Non-bedah: filler asam hialuronat atau benang memberi dorongan sementara; pangkal dan dorsum hidung punya risiko nyata oklusi vaskular serta cedera kulit atau mata, jadi harus dikerjakan dokter yang dapat menanganinya.'],
  ] : [['No dorsal augmentation is drawn in this preview.', 'Tidak ada augmentasi dorsum yang digambar di pratinjau ini.']] });
  if (lowRadix) items.push({ title: ['Radix', 'Radiks'], items: [['A shallow nasofrontal angle is treated by raising the radix with a small graft, matched to the brow-nose line.', 'Sudut nasofrontal yang dangkal diatasi dengan menaikkan radiks memakai cangkok kecil, disesuaikan dengan garis alis-hidung.']] });
  items.push({ title: ['Projecting the tip', 'Memajukan ujung hidung'], items: deficitTip ? [
    ['In rising order of effect: columellar strut, tip onlay or cap graft, tongue-in-groove, septal extension graft.', 'Menurut urutan efek yang meningkat: columellar strut, tip onlay atau cap graft, tongue-in-groove, septal extension graft.'],
    ['Thick, sebaceous skin limits how much the tip can be defined; thin skin shows every graft edge.', 'Kulit tebal dan berminyak membatasi seberapa jelas ujung bisa dibentuk; kulit tipis memperlihatkan setiap tepi cangkok.'],
  ] : [['The tip already reaches the target ratio, so no forward movement is drawn.', 'Ujung sudah mencapai rasio target, jadi tidak ada gerakan ke depan yang digambar.']] });
  items.push({ title: ['Always', 'Selalu'], items: [
    ['Examine the airway and septum; a change in shape can change breathing.', 'Periksa jalan napas dan septum; perubahan bentuk dapat mengubah pernapasan.'],
    ['Skin thickness, the lower lateral cartilages and the whole face decide what is possible; the picture is a geometric illustration.', 'Ketebalan kulit, tulang rawan lateral bawah dan seluruh wajah menentukan apa yang mungkin; gambar adalah ilustrasi geometri.'],
    ['What to change, if anything, is the patient\'s choice, made with a surgeon after a full consultation; revision rates in rhinoplasty are not small.', 'Apa yang diubah, bila ada, adalah pilihan pasien bersama dokter bedah setelah konsultasi lengkap; angka revisi rinoplasti tidak kecil.'],
  ] });
  return html(['Methods for the change drawn here', 'Metode untuk perubahan yang digambar di sini'], items, NOTE);
}

export function smileReference(): string {
  return html(['Improving a smile: what is usually done', 'Memperbaiki senyum: apa yang lazim dikerjakan'], [
    { title: ['When the smile is uneven because of facial palsy', 'Bila senyum tidak rata karena kelumpuhan wajah'], items: [
      ['Balance the normal side with botulinum toxin (for example the depressor anguli oris), often with physiotherapy.', 'Seimbangkan sisi normal dengan toksin botulinum (misalnya depressor anguli oris), sering bersama fisioterapi.'],
      ['Smile reanimation when the palsy persists: cross-face nerve graft with a free gracilis, masseteric nerve transfer, or temporalis tendon transfer; static slings for rest symmetry.', 'Reanimasi senyum bila palsi menetap: cangkok saraf cross-face dengan gracilis bebas, transfer saraf masseterik, atau transfer tendon temporalis; sling statis untuk simetri istirahat.'],
    ] },
    { title: ['When the smile is symmetric and the wish is cosmetic', 'Bila senyum simetris dan keinginannya kosmetik'], items: [
      ['Gummy smile: botulinum toxin to the elevators of the upper lip, orthodontics, crown lengthening, or lip repositioning.', 'Gummy smile: toksin botulinum pada pengangkat bibir atas, ortodonti, crown lengthening, atau lip repositioning.'],
      ['Smile arc and tooth display: dental or orthodontic correction. Lip lift for a long upper lip.', 'Kurva senyum dan tampilan gigi: koreksi gigi atau ortodonti. Lip lift untuk bibir atas yang panjang.'],
    ] },
  ], NOTE);
}
