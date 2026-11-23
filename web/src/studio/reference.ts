import { esc } from './panels';
import { lang } from '../i18n';

/**
 * Management reference: what is usually offered, by whom, when, and where the tissue comes from. It is textbook content written for a
 * clinician. It is NOT computed from the measurements on the page and is not advice for one patient: the measurements never choose an
 * operation. Each line carries role tags (who does it) so a team can see who is needed. Sources are named so each line can be checked.
 */
type L = [string, string];
export type Role = 'NEU' | 'ENT' | 'NS' | 'PS' | 'OPH' | 'REH' | 'ORT' | 'OMF' | 'PED' | 'SLP' | 'ICU' | 'DERM' | 'DENT';
const ROLE: Record<Role, L> = {
  NEU: ['Neurology', 'Neurologi'], ENT: ['ENT / neurotology', 'THT / neurotologi'], NS: ['Neurosurgery', 'Bedah saraf'], PS: ['Plastic surgery', 'Bedah plastik'],
  OPH: ['Ophthalmology / oculoplastics', 'Mata / okuloplasti'], REH: ['Rehabilitation, physiotherapy', 'Rehabilitasi, fisioterapi'], ORT: ['Orthodontics', 'Ortodonti'],
  OMF: ['Oral and maxillofacial', 'Bedah mulut dan maksilofasial'], PED: ['Paediatrics, genetics', 'Pediatri, genetika'], SLP: ['Speech therapy', 'Terapi wicara'],
  ICU: ['Burn unit, anaesthesia, ICU', 'Unit luka bakar, anestesi, ICU'], DERM: ['Dermatology', 'Dermatologi'], DENT: ['Dentistry', 'Kedokteran gigi'],
};
export interface Item { t: L; roles?: Role[]; donor?: L }
export interface Block { title: L; items: Item[] }
const pick = (l: L): string => esc(l[lang() === 'id' ? 1 : 0]);
const chips = (r?: Role[]): string => (r ?? []).map(x => `<span class="role ${x}">${pick(ROLE[x])}</span>`).join('');
const li = (i: Item): string => `<li>${chips(i.roles)}<span>${pick(i.t)}</span>${i.donor ? `<em class="donor">${pick(['Donor: ', 'Donor: '])}${pick(i.donor)}</em>` : ''}</li>`;
export const refHtml = (head: L, blocks: Block[], src: L, open = true): string => `<details class="acc ref" ${open ? 'open' : ''}><summary>${pick(head)}</summary><div class="accb">
  ${blocks.map(b => `<h5>${pick(b.title)}</h5><ul class="ref-ul">${b.items.map(li).join('')}</ul>`).join('')}
  <p class="fine">${pick(src)}</p></div></details>`;

const NOTE: L = ['Textbook reference for a clinician, not derived from the measurements above and not a recommendation for one patient.', 'Rujukan buku ajar untuk dokter, tidak diturunkan dari pengukuran di atas dan bukan rekomendasi untuk satu pasien.'];

/* ------------------------------------------------------------------ facial palsy */
export function palsyReference(): string {
  return refHtml(['Facial palsy: the team, and what is done by situation and time', 'Kelumpuhan wajah: tim, dan apa yang dikerjakan menurut situasi dan waktu'], [
    { title: ['Who does what', 'Siapa mengerjakan apa'], items: [
      { roles: ['NEU'], t: ['Finds the cause (peripheral or central, Bell, zoster, trauma, tumour), starts steroid, orders electrodiagnosis, tracks recovery.', 'Mencari penyebab (perifer atau sentral, Bell, zoster, trauma, tumor), memulai steroid, meminta elektrodiagnosis, memantau pemulihan.'] },
      { roles: ['ENT'], t: ['Temporal bone and parotid causes, zoster oticus, temporal bone fracture; intratemporal nerve decompression or repair in selected traumatic cases.', 'Sebab tulang temporal dan parotis, zoster otikus, fraktur tulang temporal; dekompresi atau perbaikan saraf intratemporal pada kasus trauma terpilih.'] },
      { roles: ['NS'], t: ['Skull-base and cerebellopontine-angle tumours (for example vestibular schwannoma): preserves the nerve, or repairs it inside the skull and plans immediate reconstruction with plastic surgery.', 'Tumor dasar tengkorak dan sudut serebelopontin (misalnya schwannoma vestibular): mempertahankan saraf, atau memperbaikinya di dalam tengkorak dan merencanakan rekonstruksi segera bersama bedah plastik.'] },
      { roles: ['PS'], t: ['Facial reanimation: nerve repair and grafts, nerve transfers, free and regional muscle transfer, static slings, brow and eyelid surgery, synkinesis surgery, secondary refinements.', 'Reanimasi wajah: perbaikan dan cangkok saraf, transfer saraf, transfer otot bebas dan regional, sling statis, bedah alis dan kelopak mata, bedah sinkinesis, penyempurnaan sekunder.'] },
      { roles: ['OPH'], t: ['Protects the cornea from day one; lubrication, taping, then lid procedures (gold weight, lower-lid tightening, tarsorrhaphy) with plastic surgery.', 'Melindungi kornea sejak hari pertama; pelumas, plester, lalu tindakan kelopak (pemberat emas, pengencangan kelopak bawah, tarsorafi) bersama bedah plastik.'] },
      { roles: ['REH'], t: ['Neuromuscular retraining and mirror biofeedback; before and after every operation and with botulinum toxin for synkinesis.', 'Retraining neuromuskular dan biofeedback cermin; sebelum dan sesudah setiap operasi dan bersama toksin botulinum untuk sinkinesis.'] },
    ] },
    { title: ['Acute Bell palsy (first 72 hours)', 'Bell palsy akut (72 jam pertama)'], items: [
      { roles: ['NEU'], t: ['Oral corticosteroid within 72 hours (AAO-HNSF: prednisolone 50 mg for 10 days, or 60 mg for 5 days then a 5-day taper). An antiviral may be added; an antiviral alone is not recommended.', 'Kortikosteroid oral dalam 72 jam (AAO-HNSF: prednisolon 50 mg selama 10 hari, atau 60 mg selama 5 hari lalu tapering 5 hari). Antivirus boleh ditambahkan; antivirus saja tidak direkomendasikan.'] },
      { roles: ['OPH'], t: ['Eye protection from the first day: drops by day, ointment at night, taping or a moisture chamber.', 'Proteksi mata sejak hari pertama: tetes siang hari, salep malam hari, plester atau moisture chamber.'] },
      { roles: ['ENT', 'NS'], t: ['No surgical decompression for typical Bell palsy. Forehead movement kept with a weak lower face points to a central cause (stroke, tumour): urgent imaging instead.', 'Tidak ada dekompresi bedah untuk Bell palsy tipikal. Gerak dahi masih ada dengan wajah bawah lemah mengarah ke sebab sentral (stroke, tumor): pencitraan segera.'] },
    ] },
    { title: ['The nerve is cut or sacrificed (trauma, tumour surgery): repair early', 'Saraf terputus atau dikorbankan (trauma, operasi tumor): perbaiki dini'], items: [
      { roles: ['NS', 'ENT', 'PS'], t: ['Direct end-to-end repair without tension when the ends meet; best within days, still useful for months. Done by the operating surgeon with a plastic surgeon when a graft is needed.', 'Perbaikan ujung ke ujung tanpa tegangan bila kedua ujung bertemu; terbaik dalam hitungan hari, masih berguna selama beberapa bulan. Dikerjakan ahli bedah yang mengoperasi bersama dokter bedah plastik bila perlu cangkok.'] },
      { roles: ['PS'], t: ['Interposition nerve graft when there is a gap (the facial nerve main trunk or branches).', 'Cangkok saraf interposisi bila ada celah (batang utama atau cabang saraf fasialis).'], donor: ['great auricular nerve (neck, next to the ear) or sural nerve (lateral ankle), a few centimetres', 'saraf aurikularis magnus (leher, di samping telinga) atau saraf suralis (pergelangan kaki lateral), beberapa sentimeter'] },
      { roles: ['NS', 'PS'], t: ['The proximal stump is not available (inside the brainstem or skull base): a nerve transfer to the facial nerve, see below.', 'Tunggul proksimal tidak tersedia (di batang otak atau dasar tengkorak): transfer saraf ke saraf fasialis, lihat di bawah.'] },
    ] },
    { title: ['Nerve transfers (the facial muscles are still receptive, up to about 12 to 24 months)', 'Transfer saraf (otot wajah masih reseptif, sampai kira-kira 12 sampai 24 bulan)'], items: [
      { roles: ['PS', 'ENT'], t: ['Masseteric nerve (cranial nerve V3) to the facial nerve or the buccal branch: strong, fast (months), a good smile; spontaneity needs retraining.', 'Saraf masseterik (saraf kranial V3) ke saraf fasialis atau cabang bukal: kuat, cepat (bulan), senyum baik; spontanitas butuh latihan.'], donor: ['masseteric nerve branch in front of the ear, cost is little', 'cabang saraf masseterik di depan telinga, kerugian kecil'] },
      { roles: ['PS', 'ENT'], t: ['Hypoglossal-facial transfer (XII to VII), often a split or jump graft so the tongue keeps working: reliable tone, less spontaneity.', 'Transfer hipoglosus-fasialis (XII ke VII), sering dengan belah atau jump graft agar lidah tetap berfungsi: tonus andal, spontanitas kurang.'] },
      { roles: ['PS'], t: ['Cross-face nerve graft: healthy-side buccal branches are joined to a long nerve graft that crosses the face to the paralysed side. It brings spontaneous smiling and is used with a free muscle (below).', 'Cangkok saraf cross-face: cabang bukal sisi sehat disambung ke cangkok saraf panjang yang melintasi wajah ke sisi lumpuh. Memberi senyum spontan dan dipakai bersama otot bebas (di bawah).'], donor: ['sural nerve, 10 to 15 cm from the leg', 'saraf suralis, 10 sampai 15 cm dari tungkai'] },
    ] },
    { title: ['Long-standing paralysis or congenital (Möbius): bring new muscle', 'Paralisis lama atau kongenital (Möbius): bawa otot baru'], items: [
      { roles: ['PS'], t: ['Free functional muscle transfer, usually gracilis: a 6 to 8 cm segment with its artery, vein and nerve is placed from the zygoma or temporal fascia to the corner of the mouth, joined to facial artery and vein, and driven by a cross-face graft (two stages, 6 to 12 months apart) or the masseteric nerve (one stage).', 'Transfer otot fungsional bebas, biasanya gracilis: segmen 6 sampai 8 cm beserta arteri, vena dan sarafnya dipasang dari zigoma atau fasia temporalis ke sudut mulut, disambung ke arteri dan vena fasialis, dan digerakkan oleh cangkok cross-face (dua tahap, berjarak 6 sampai 12 bulan) atau saraf masseterik (satu tahap).'], donor: ['gracilis muscle, medial thigh (the leg keeps adduction through the other adductors)', 'otot gracilis, paha medial (tungkai tetap bisa adduksi lewat adduktor lain)'] },
      { roles: ['PS'], t: ['Temporalis tendon transfer (Labbé): the temporalis tendon is brought to the mouth corner. Quick and reliable, for older or unfit patients or when a free muscle is not possible; it can leave a temporal hollow and needs relearning.', 'Transfer tendon temporalis (Labbé): tendon temporalis dibawa ke sudut mulut. Cepat dan andal, untuk pasien lebih tua atau tidak layak atau saat otot bebas tidak mungkin; bisa meninggalkan cekungan temporal dan butuh belajar ulang.'], donor: ['temporalis muscle and tendon, same side', 'otot dan tendon temporalis, sisi yang sama'] },
      { roles: ['PS'], t: ['Static suspension for rest symmetry: fascia lata or other sling from the mouth corner to the zygoma or temporal fascia; also for patients who cannot have a longer operation.', 'Suspensi statis untuk simetri istirahat: fasia lata atau sling lain dari sudut mulut ke zigoma atau fasia temporalis; juga untuk pasien yang tidak bisa menjalani operasi lebih panjang.'], donor: ['fascia lata, lateral thigh', 'fasia lata, paha lateral'] },
    ] },
    { title: ['Eye and brow (with ophthalmology)', 'Mata dan alis (bersama bagian mata)'], items: [
      { roles: ['OPH', 'PS'], t: ['Upper-lid loading with a gold or platinum weight (usually about 0.8 to 1.6 g, chosen by trial) closes the eye by gravity.', 'Pemberat kelopak atas emas atau platinum (biasanya sekitar 0,8 sampai 1,6 g, dipilih dengan uji coba) menutup mata oleh gravitasi.'] },
      { roles: ['OPH', 'PS'], t: ['Lower-lid tightening (lateral tarsal strip canthoplasty), with a spacer graft if the lid is short; temporary or lateral tarsorrhaphy when the cornea is at risk.', 'Pengencangan kelopak bawah (kantoplasti lateral tarsal strip), dengan cangkok spacer bila kelopak pendek; tarsorafi sementara atau lateral bila kornea berisiko.'], donor: ['conchal (ear) cartilage or acellular dermis for the spacer', 'tulang rawan konka (telinga) atau dermis aseluler untuk spacer'] },
      { roles: ['PS'], t: ['Brow ptosis: direct, endoscopic or temporal brow lift; the midface can be lifted with the same sling.', 'Ptosis alis: brow lift langsung, endoskopik atau temporal; wajah tengah bisa diangkat dengan sling yang sama.'] },
    ] },
    { title: ['Not recovering, or recovering with synkinesis', 'Tidak pulih, atau pulih dengan sinkinesis'], items: [
      { roles: ['NEU', 'ENT'], t: ['At about 3 months with no recovery: imaging of the nerve course and electrodiagnosis; look for a mass.', 'Pada sekitar 3 bulan tanpa pemulihan: pencitraan perjalanan saraf dan elektrodiagnosis; cari massa.'] },
      { roles: ['REH', 'PS', 'NEU'], t: ['Botulinum toxin and retraining for synkinesis and hypertonicity, or to balance the normal side (depressor anguli oris, platysma).', 'Toksin botulinum dan retraining untuk sinkinesis dan hipertonus, atau untuk menyeimbangkan sisi normal (depressor anguli oris, platisma).'] },
      { roles: ['PS'], t: ['Selective neurolysis or myectomy for refractory synkinesis; thinning and refinement of a transferred muscle later.', 'Neurolisis selektif atau miektomi untuk sinkinesis refrakter; penipisan dan penyempurnaan otot yang ditransfer kemudian.'] },
    ] },
  ], ['Sources: Baugh RF et al., AAO-HNSF Clinical Practice Guideline: Bell Palsy, Otolaryngol Head Neck Surg 2013; standard facial reanimation texts. Scales used by clinicians (House-Brackmann, Sunnybrook, eFACE, FACE-Q) are not applied here. The Movement tab measures excursion on video, which can be repeated before and after treatment. ', 'Sumber: Baugh RF dkk., AAO-HNSF Clinical Practice Guideline: Bell Palsy, Otolaryngol Head Neck Surg 2013; buku ajar reanimasi wajah. Skala yang dipakai dokter (House-Brackmann, Sunnybrook, eFACE, FACE-Q) tidak diterapkan di sini. Tab Gerakan mengukur ekskursi pada video, yang bisa diulang sebelum dan sesudah terapi. ']);
}

/* ------------------------------------------------------------------ cleft */
export function cleftReference(): string {
  return refHtml(['Cleft lip and palate: the team, the operations and the usual sequence by age', 'Bibir sumbing dan celah langit: tim, operasi, dan urutan lazim menurut usia'], [
    { title: ['The team', 'Tim'], items: [
      { roles: ['PS'], t: ['Leads the surgical plan: lip and nose repair, palate repair, secondary lip and nose surgery, and the timing of each.', 'Memimpin rencana operasi: perbaikan bibir dan hidung, perbaikan langit-langit, operasi bibir dan hidung sekunder, dan waktu masing-masing.'] },
      { roles: ['PED'], t: ['Feeding, growth, airway, associated syndromes and genetic counselling.', 'Pemberian makan, pertumbuhan, jalan napas, sindrom penyerta dan konseling genetik.'] },
      { roles: ['ENT'], t: ['Hearing and middle-ear disease (ventilation tubes), and airway; velopharyngeal assessment with speech therapy.', 'Pendengaran dan penyakit telinga tengah (pipa ventilasi), dan jalan napas; penilaian velofaring bersama terapi wicara.'] },
      { roles: ['SLP', 'ORT'], t: ['Speech therapy from toddler age; orthodontics from the mixed dentition to the end of growth.', 'Terapi wicara sejak usia balita; ortodonti dari gigi campuran sampai pertumbuhan selesai.'] },
      { roles: ['OMF', 'DENT'], t: ['Alveolar bone graft, orthognathic surgery after growth, and dental care.', 'Cangkok tulang alveolar, bedah ortognatik setelah pertumbuhan, dan perawatan gigi.'] },
    ] },
    { title: ['Infancy', 'Bayi'], items: [
      { roles: ['PED', 'ORT'], t: ['Feeding support first (specialised bottles). Presurgical infant orthopaedics, for example nasoalveolar moulding, is used in some centres.', 'Dukungan menyusu lebih dulu (botol khusus). Ortopedi bayi sebelum operasi, misalnya nasoalveolar moulding, dipakai di sebagian pusat.'] },
      { roles: ['PS'], t: ['Lip repair at about 3 to 6 months. Rotation-advancement (Millard) lowers the notched side and advances a lateral flap; the anatomic subunit method (Fisher) and the Mohler and Tennison-Randall methods are others. The nasal tip and alar base are often corrected in the same operation.', 'Perbaikan bibir pada usia sekitar 3 sampai 6 bulan. Rotasi-advancement (Millard) menurunkan sisi yang berlekuk dan memajukan flap lateral; metode subunit anatomis (Fisher) serta metode Mohler dan Tennison-Randall adalah pilihan lain. Ujung hidung dan dasar alar sering dikoreksi dalam operasi yang sama.'] },
      { roles: ['PS'], t: ['Palate repair at about 9 to 12 months: two-flap palatoplasty (Bardach) or von Langenbeck, with intravelar veloplasty to put the palatal muscles back in line; the Furlow double-opposing Z-plasty lengthens the soft palate.', 'Perbaikan langit-langit pada usia sekitar 9 sampai 12 bulan: palatoplasti dua flap (Bardach) atau von Langenbeck, dengan veloplasti intravelar untuk meluruskan otot langit-langit; Z-plasti berlawanan ganda Furlow memanjangkan langit-langit lunak.'] },
      { roles: ['ENT'], t: ['Ear checks and ventilation tubes as needed, often at the time of the lip or palate repair.', 'Pemeriksaan telinga dan pipa ventilasi bila perlu, sering saat perbaikan bibir atau langit-langit.'] },
    ] },
    { title: ['Childhood', 'Anak'], items: [
      { roles: ['SLP', 'ENT', 'PS'], t: ['Speech assessment at about 4 to 5 years. If the palate does not close the nose off during speech (velopharyngeal insufficiency): a Furlow revision, a pharyngeal flap, or a sphincter pharyngoplasty. Palatal fistulas are closed when they cause symptoms.', 'Penilaian bicara pada usia sekitar 4 sampai 5 tahun. Bila langit-langit tidak menutup hidung saat bicara (insufisiensi velofaring): revisi Furlow, pharyngeal flap, atau sphincter pharyngoplasty. Fistula langit-langit ditutup bila bergejala.'], donor: ['pharyngeal flap: the back wall of the throat, same field', 'pharyngeal flap: dinding belakang tenggorok, lapangan yang sama'] },
      { roles: ['OMF', 'ORT', 'PS'], t: ['Alveolar bone grafting at about 8 to 11 years, before the canine erupts, to close the gum cleft and support the teeth and the base of the nose.', 'Cangkok tulang alveolar pada usia sekitar 8 sampai 11 tahun, sebelum gigi taring erupsi, untuk menutup celah gusi dan menopang gigi serta dasar hidung.'], donor: ['cancellous bone from the anterior iliac crest (hip)', 'tulang kanselus dari krista iliaka anterior (panggul)'] },
      { roles: ['PS'], t: ['Secondary lip surgery for a short or tight lip: scar revision, or a cross-lip (Abbé) flap from the lower lip to the upper lip.', 'Operasi bibir sekunder untuk bibir pendek atau kencang: revisi parut, atau flap bibir silang (Abbé) dari bibir bawah ke bibir atas.'], donor: ['Abbé flap: a wedge of the lower lip on its own artery, divided at about 2 to 3 weeks', 'flap Abbé: irisan bibir bawah dengan arterinya sendiri, dipisah sekitar 2 sampai 3 minggu'] },
    ] },
    { title: ['After growth (about 16 to 18 years)', 'Setelah pertumbuhan (sekitar 16 sampai 18 tahun)'], items: [
      { roles: ['OMF', 'ORT'], t: ['Orthognathic surgery (for example a Le Fort I maxillary advancement) when the jaws are mismatched.', 'Bedah ortognatik (misalnya advancement maksila Le Fort I) bila rahang tidak serasi.'] },
      { roles: ['PS'], t: ['Definitive rhinoplasty: septal and tip reconstruction with cartilage grafts, columellar strut, and alar base correction. Revision is a shared decision with the patient.', 'Rinoplasti definitif: rekonstruksi septum dan ujung dengan cangkok tulang rawan, columellar strut, dan koreksi dasar alar. Revisi adalah keputusan bersama dengan pasien.'], donor: ['septal, conchal (ear) or costal (rib) cartilage', 'tulang rawan septum, konka (telinga) atau kosta (iga)'] },
    ] },
  ], ['Timing varies by centre. Sources: ACPA team-care standards and standard cleft surgery texts. The measurements on this page are asymmetries on a front photo; they do not choose the technique or the timing. ', 'Waktu bervariasi antar pusat. Sumber: standar perawatan tim ACPA dan buku ajar bedah sumbing. Pengukuran di halaman ini adalah asimetri pada foto depan; tidak memilih teknik atau waktu operasi. ']);
}

/* ------------------------------------------------------------------ nose */
export function noseReference(deficitTip: boolean, dorsal: boolean, lowRadix: boolean): string {
  const items: Block[] = [];
  items.push({ title: ['Who and where', 'Siapa dan di mana'], items: [
    { roles: ['PS', 'ENT'], t: ['Rhinoplasty is done by a plastic or facial plastic (ENT) surgeon. The airway, septum and turbinates are assessed first; functional correction can be done at the same time.', 'Rinoplasti dikerjakan dokter bedah plastik atau bedah plastik wajah (THT). Jalan napas, septum dan konka dinilai lebih dulu; koreksi fungsional bisa dikerjakan bersamaan.'] },
  ] });
  items.push({ title: ['Raising the dorsum (a low or flat nose)', 'Menaikkan dorsum (hidung rendah atau pesek)'], items: dorsal ? [
    { roles: ['PS'], t: ['Autologous cartilage: lowest extrusion and infection risk; can resorb a little or, for rib, warp.', 'Tulang rawan autolog: risiko ekstrusi dan infeksi terendah; bisa sedikit resorpsi atau, untuk iga, melengkung.'], donor: ['septum (inside the nose, limited), conchal cartilage (ear, curved and soft), costal cartilage from the 6th to 7th rib (chest, plenty and straight; carve or diced in fascia)', 'septum (di dalam hidung, terbatas), tulang rawan konka (telinga, melengkung dan lunak), tulang rawan kosta iga ke-6 sampai 7 (dada, banyak dan lurus; diukir atau diced dalam fasia)'] },
    { roles: ['PS'], t: ['Silicone implant (alloplast): widely used for a low dorsum in East and Southeast Asian noses, easy and removable, with a higher risk of capsule, extrusion and infection, especially at the tip; an L-shaped implant that reaches the tip is the main cause of tip problems.', 'Implan silikon (aloplas): luas dipakai untuk dorsum rendah pada hidung Asia Timur dan Tenggara, mudah dan bisa dicabut, risiko kapsul, ekstrusi dan infeksi lebih tinggi, terutama di ujung; implan berbentuk L yang mencapai ujung adalah penyebab utama masalah ujung.'] },
    { roles: ['PS'], t: ['ePTFE (Gore-Tex) or porous implants: stable, tissue ingrowth makes removal harder. Temporalis or deep temporal fascia can wrap and soften a graft.', 'ePTFE (Gore-Tex) atau implan berpori: stabil, jaringan tumbuh ke dalam sehingga pencabutan lebih sulit. Fasia temporalis dapat membungkus dan melunakkan cangkok.'], donor: ['temporal fascia, scalp above the ear', 'fasia temporalis, kulit kepala di atas telinga'] },
    { roles: ['PS', 'DERM'], t: ['Non-surgical: hyaluronic acid filler or threads give a temporary lift; the nasal root and dorsum carry a real risk of vascular occlusion and skin or eye injury, so a clinician who can manage it should do it.', 'Non-bedah: filler asam hialuronat atau benang memberi dorongan sementara; pangkal dan dorsum hidung punya risiko nyata oklusi vaskular serta cedera kulit atau mata, jadi harus dikerjakan dokter yang dapat menanganinya.'] },
  ] : [{ t: ['No dorsal augmentation is drawn in this preview.', 'Tidak ada augmentasi dorsum yang digambar di pratinjau ini.'] }] });
  if (lowRadix) items.push({ title: ['Radix', 'Radiks'], items: [{ roles: ['PS'], t: ['A shallow nasofrontal angle is treated by raising the radix with a small graft, matched to the brow-nose line.', 'Sudut nasofrontal yang dangkal diatasi dengan menaikkan radiks memakai cangkok kecil, disesuaikan dengan garis alis-hidung.'] }] });
  items.push({ title: ['Projecting the tip (a short or underprojected tip)', 'Memajukan ujung hidung (ujung pendek atau kurang proyeksi)'], items: deficitTip ? [
    { roles: ['PS'], t: ['In rising order of effect: columellar strut, tip onlay or cap graft, tongue-in-groove, septal extension graft. Suture techniques refine the shape; alar base reduction narrows a wide base.', 'Menurut urutan efek yang meningkat: columellar strut, tip onlay atau cap graft, tongue-in-groove, septal extension graft. Teknik jahitan menyempurnakan bentuk; reduksi dasar alar menyempitkan dasar yang lebar.'], donor: ['septal or conchal cartilage; costal cartilage when a lot is needed', 'tulang rawan septum atau konka; kosta bila butuh banyak'] },
    { roles: ['PS'], t: ['Thick, sebaceous skin limits how much the tip can be defined; thin skin shows every graft edge.', 'Kulit tebal dan berminyak membatasi seberapa jelas ujung bisa dibentuk; kulit tipis memperlihatkan setiap tepi cangkok.'] },
  ] : [{ t: ['The tip already reaches the target ratio, so no forward movement is drawn.', 'Ujung sudah mencapai rasio target, jadi tidak ada gerakan ke depan yang digambar.'] }] });
  items.push({ title: ['Always', 'Selalu'], items: [
    { t: ['Examine the airway and septum; a change in shape can change breathing.', 'Periksa jalan napas dan septum; perubahan bentuk dapat mengubah pernapasan.'] },
    { t: ['Skin thickness, the lower lateral cartilages and the whole face decide what is possible; the picture is a geometric illustration.', 'Ketebalan kulit, tulang rawan lateral bawah dan seluruh wajah menentukan apa yang mungkin; gambar adalah ilustrasi geometri.'] },
    { t: ['What to change, if anything, is the patient\'s choice, made with a surgeon after a full consultation; revision rates in rhinoplasty are not small.', 'Apa yang diubah, bila ada, adalah pilihan pasien bersama dokter bedah setelah konsultasi lengkap; angka revisi rinoplasti tidak kecil.'] },
  ] });
  return refHtml(['Methods for the change drawn here', 'Metode untuk perubahan yang digambar di sini'], items, NOTE);
}

/* ------------------------------------------------------------------ smile */
export function smileReference(): string {
  return refHtml(['Improving a smile: what is usually done', 'Memperbaiki senyum: apa yang lazim dikerjakan'], [
    { title: ['When the smile is uneven because of facial palsy', 'Bila senyum tidak rata karena kelumpuhan wajah'], items: [
      { roles: ['PS', 'REH'], t: ['Balance the normal side with botulinum toxin (for example the depressor anguli oris), often with physiotherapy.', 'Seimbangkan sisi normal dengan toksin botulinum (misalnya depressor anguli oris), sering bersama fisioterapi.'] },
      { roles: ['PS'], t: ['Smile reanimation when the palsy persists: cross-face nerve graft with a free gracilis, masseteric nerve transfer, or temporalis tendon transfer; static slings for rest symmetry. See the palsy reference for donors and timing.', 'Reanimasi senyum bila palsi menetap: cangkok saraf cross-face dengan gracilis bebas, transfer saraf masseterik, atau transfer tendon temporalis; sling statis untuk simetri istirahat. Lihat rujukan palsi untuk donor dan waktu.'] },
    ] },
    { title: ['When the smile is symmetric and the wish is cosmetic', 'Bila senyum simetris dan keinginannya kosmetik'], items: [
      { roles: ['PS', 'DERM'], t: ['Gummy smile: botulinum toxin to the lip elevators (levator labii superioris alaeque nasi), or lip repositioning surgery.', 'Gummy smile: toksin botulinum pada pengangkat bibir (levator labii superioris alaeque nasi), atau operasi reposisi bibir.'] },
      { roles: ['ORT', 'OMF', 'DENT'], t: ['Gummy smile from the bone or the gum: crown lengthening, orthodontics, or an upward jaw movement (Le Fort I impaction) for a vertical maxillary excess.', 'Gummy smile dari tulang atau gusi: crown lengthening, ortodonti, atau pergeseran rahang ke atas (impaksi Le Fort I) untuk kelebihan vertikal maksila.'] },
      { roles: ['DENT', 'ORT'], t: ['Smile arc and tooth display: dental or orthodontic correction.', 'Kurva senyum dan tampilan gigi: koreksi gigi atau ortodonti.'] },
      { roles: ['PS'], t: ['Long upper lip: lip lift (a skin excision under the nose).', 'Bibir atas panjang: lip lift (eksisi kulit di bawah hidung).'] },
    ] },
  ], NOTE);
}
