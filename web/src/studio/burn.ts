import { FaceFrame, pxPerMm } from '../clinical/face';
import type { P2 } from '../clinical/rstl';
import { growLesion, workImage, type Lesion, type WorkImage } from '../clinical/segment';
import { detectFace } from './landmarker';
import { loadPhotoFile, loadPhotoUrl } from './photo';
import { refHtml, type Block } from './reference';
import { T, esc } from './panels';
import { lang, num } from '../i18n';

/**
 * Burn tab: a facial burn photograph is outlined by tapping on it, the area and the facial units involved are read, the clinician picks the
 * depth, and the page lists what is usually done: heal, graft or flap, with the roles of the team and where the donor tissue comes from.
 * Depth cannot be measured from a photograph; it is the clinician's finding after examination and over time. The page never decides
 * between a graft and a flap: it lays out the usual options for that depth and site.
 */
type Depth = 1 | 2 | 3 | 4;
type Unit = 'forehead' | 'eyelid' | 'nose' | 'lip' | 'cheek' | 'chin' | 'other';
const UNIT_NAME: Record<Unit, [string, string]> = { forehead: ['Forehead', 'Dahi'], eyelid: ['Eyelids', 'Kelopak mata'], nose: ['Nose', 'Hidung'], lip: ['Lips', 'Bibir'], cheek: ['Cheeks', 'Pipi'], chin: ['Chin', 'Dagu'], other: ['Ear, scalp or neck (outside the front view)', 'Telinga, kulit kepala atau leher (di luar tampak depan)'] };

const st = { img: null as HTMLCanvasElement | null, name: '', lm: null as P2[] | null, frame: null as FaceFrame | null, work: null as WorkImage | null, les: null as Lesion | null, units: [] as Unit[], depth: null as Depth | null, msg: '', onChange: () => { /* set on mount */ } };
const el = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;

export function mountBurn(host: HTMLElement, onChange: () => void): void {
  st.onChange = onChange;
  host.innerHTML = `<div class="mv"><div class="mv-stage"><canvas id="bn-cv" width="720" height="720"></canvas>
      <div class="mv-empty" id="bn-empty"><h2>${T('Facial burn: graft or flap, and from where', 'Luka bakar wajah: cangkok atau flap, dan dari mana')}</h2>
        <p>${T('Choose a front photograph, then tap the burn to outline it. You choose the depth; the page lists what is usually done for that depth and site, who does it, and where the donor tissue comes from.', 'Pilih foto depan, lalu ketuk luka bakar untuk mengonturkannya. Kedalaman Anda pilih; halaman mendaftar apa yang lazim dikerjakan untuk kedalaman dan lokasi itu, siapa yang mengerjakan, dan dari mana jaringan donor diambil.')}</p></div>
      <div class="mv-prompt" id="bn-prompt" hidden></div></div>
    <div class="mv-ctl"><button class="btn small" data-bn="file">${T('Choose a front photo', 'Pilih foto depan')}</button><input type="file" id="bn-file" accept="image/jpeg,image/png,image/webp" hidden>
      <button class="btn ghost small" data-bn="clear">${T('Clear the outline', 'Hapus kontur')}</button></div></div>`;
  const file = el<HTMLInputElement>('bn-file');
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { const p = await loadPhotoFile(f); await setPhoto(p.canvas, f.name); } catch { st.msg = T('The file could not be read as an image.', 'Berkas tidak bisa dibaca sebagai gambar.'); draw(); } });
  host.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-bn]'); if (!b) return; if (b.dataset.bn === 'file') file.click(); else { st.les = null; st.units = []; draw(); st.onChange(); } });
  const cv = el<HTMLCanvasElement>('bn-cv');
  cv.addEventListener('pointerdown', e => {
    if (!st.img || !st.work || !st.lm) return;
    const r = cv.getBoundingClientRect(), s = cv.width / r.width, k = Math.min(cv.width / st.img.width, cv.height / st.img.height);
    const ox = (cv.width - st.img.width * k) / 2, oy = (cv.height - st.img.height * k) / 2;
    const px: P2 = [((e.clientX - r.left) * s - ox) / k, ((e.clientY - r.top) * s - oy) / k];
    const fw = Math.abs(st.lm[454][0] - st.lm[234][0]);
    const les = growLesion(st.work, px, fw);
    if (!les) { st.msg = T('No outline was found at that point. Tap on the burn itself.', 'Kontur tidak ditemukan di titik itu. Ketuk pada luka bakarnya.'); draw(); return; }
    st.msg = ''; st.les = les; st.units = unitsOf(les, st.lm); draw(); st.onChange();
  });
  draw();
}

async function setPhoto(c: HTMLCanvasElement, name: string): Promise<void> {
  st.img = c; st.name = name; st.les = null; st.units = []; st.lm = null; st.frame = null; st.work = null; st.msg = T('Finding the face…', 'Mencari wajah…'); draw(); st.onChange();
  const det = await detectFace(c).catch(() => ({ landmarks: [] }));
  if (!det.landmarks.length) { st.msg = T('No face was found, so the area and the facial units cannot be read. Tap still outlines nothing without a face.', 'Wajah tidak ditemukan, jadi luas dan unit wajah tidak bisa dibaca. Ketuk tidak mengonturkan apa pun tanpa wajah.'); draw(); st.onChange(); return; }
  st.lm = det.landmarks.map(p => [p.x * c.width, p.y * c.height] as P2);
  st.frame = new FaceFrame(st.lm, pxPerMm(st.lm)); st.work = workImage(c);
  st.msg = T('Tap the burn to outline it.', 'Ketuk luka bakar untuk mengonturkannya.'); draw(); st.onChange();
}
export async function loadBurnUrl(url: string, name: string): Promise<void> { const p = await loadPhotoUrl(url, name); await setPhoto(p.canvas, name); }

/** Which facial units the outlined area touches, from boxes placed with the landmarks (approximate). */
function unitsOf(les: Lesion, lm: P2[]): Unit[] {
  const ocw = Math.hypot(lm[263][0] - lm[33][0], lm[263][1] - lm[33][1]);
  const browTop = Math.min(lm[105][1], lm[334][1], lm[66][1], lm[296][1]), eyeLo = Math.max(lm[145][1], lm[374][1]), mouthY = (lm[61][1] + lm[291][1]) / 2;
  const unitAt = (x: number, y: number): Unit => {
    const inX = (a: number, b: number) => x >= Math.min(lm[a][0], lm[b][0]) && x <= Math.max(lm[a][0], lm[b][0]);
    if (x < lm[234][0] - 0.05 * ocw || x > lm[454][0] + 0.05 * ocw || y < lm[10][1] - 0.1 * ocw || y > lm[152][1] + 0.1 * ocw) return 'other';
    if (y < browTop - 0.02 * ocw) return 'forehead';
    if (y < eyeLo + 0.08 * ocw && (inX(33, 133) || inX(362, 263))) return 'eyelid';
    if (inX(129, 358) && y > lm[168][1] && y < lm[2][1] + 0.05 * ocw) return 'nose';
    if (y > lm[2][1] + 0.05 * ocw && y < lm[17][1] + 0.1 * ocw && inX(61, 291)) return 'lip';
    if (y > lm[17][1] + 0.1 * ocw) return 'chin';
    return y > eyeLo || y > mouthY - 1 ? 'cheek' : 'cheek';
  };
  const hit = new Map<Unit, number>(); let n = 0;
  for (let y = 0; y < les.h; y += 2) for (let x = 0; x < les.w; x += 2) { if (!les.mask[y * les.w + x]) continue; n++; const u = unitAt(x / les.scale, y / les.scale); hit.set(u, (hit.get(u) ?? 0) + 1); }
  return [...hit.entries()].filter(([, c]) => c / Math.max(1, n) > 0.05).sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

function draw(): void {
  const cv = el<HTMLCanvasElement>('bn-cv'); if (!cv) return;
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, cv.width, cv.height);
  el('bn-empty').hidden = !!st.img;
  const pr = el('bn-prompt'); pr.hidden = !st.msg; pr.textContent = st.msg;
  if (!st.img) return;
  const k = Math.min(cv.width / st.img.width, cv.height / st.img.height), ox = (cv.width - st.img.width * k) / 2, oy = (cv.height - st.img.height * k) / 2;
  ctx.drawImage(st.img, ox, oy, st.img.width * k, st.img.height * k);
  if (st.les) { ctx.fillStyle = '#ff8f6e'; for (const p of st.les.contourPx) ctx.fillRect(ox + p[0] * k - 1, oy + p[1] * k - 1, 2.4, 2.4); }
  ctx.font = '12px "JetBrains Mono", monospace'; ctx.fillStyle = '#5fe8c8'; ctx.fillText(st.name, 12, cv.height - 12);
}

/* ------------------------------------------------------------------ what is usually done */
const DEPTH: Record<Depth, { name: [string, string]; look: [string, string]; plan: Block['items'] }> = {
  1: { name: ['Superficial (epidermis)', 'Superfisial (epidermis)'], look: ['Red, dry, painful, no blisters, blanches.', 'Merah, kering, nyeri, tanpa lepuh, memucat bila ditekan.'], plan: [
    { roles: ['ICU', 'PS'], t: ['Heals in about 5 to 7 days without a scar: cool the area, moisturise, protect from the sun. No graft.', 'Sembuh dalam sekitar 5 sampai 7 hari tanpa parut: dinginkan area, lembapkan, lindungi dari matahari. Tanpa cangkok.'] },
  ] },
  2: { name: ['Superficial partial thickness', 'Ketebalan parsial superfisial'], look: ['Blisters, moist and pink, very painful, blanches and refills briskly.', 'Lepuh, lembap dan merah muda, sangat nyeri, memucat dan terisi kembali cepat.'], plan: [
    { roles: ['ICU', 'PS'], t: ['Usually heals in 10 to 21 days from the hair follicles and glands, which the face has plenty of. Dressings (hydrofibre, silver or a biological dressing) or the face left open with ointment, kept clean and moist.', 'Biasanya sembuh dalam 10 sampai 21 hari dari folikel rambut dan kelenjar, yang banyak pada wajah. Balutan (hydrofibre, perak atau balutan biologis) atau wajah dibiarkan terbuka dengan salep, tetap bersih dan lembap.'] },
    { roles: ['PS'], t: ['If it has not healed by about 14 to 21 days the risk of a thick scar rises: early excision and a thin graft is considered.', 'Bila belum sembuh pada sekitar hari ke-14 sampai 21, risiko parut tebal meningkat: eksisi dini dan cangkok tipis dipertimbangkan.'] },
  ] },
  3: { name: ['Deep partial thickness', 'Ketebalan parsial dalam'], look: ['Mottled red and white, drier, less painful, slow or no capillary refill; often not healing by 3 weeks.', 'Bercak merah dan putih, lebih kering, kurang nyeri, pengisian kapiler lambat atau tidak ada; sering belum sembuh pada 3 minggu.'], plan: [
    { roles: ['PS'], t: ['Usually needs tangential excision and a thin split-thickness skin graft (sheet, not meshed on the face), or a dermal substitute with a thin graft. Done early, in the first 7 to 10 days, before infection and scarring.', 'Biasanya butuh eksisi tangensial dan cangkok kulit tebal-terbelah tipis (lembaran, tidak dimesh pada wajah), atau pengganti dermis dengan cangkok tipis. Dikerjakan dini, pada 7 sampai 10 hari pertama, sebelum infeksi dan parut.'], donor: ['scalp or thigh for a split graft', 'kulit kepala atau paha untuk cangkok terbelah'] },
    { roles: ['PS'], t: ['Small areas on the eyelids, nose or lips: a full-thickness graft matches colour and texture better and contracts less.', 'Area kecil pada kelopak mata, hidung atau bibir: cangkok tebal penuh cocok warna dan teksturnya dan kurang berkontraksi.'], donor: ['postauricular, preauricular or supraclavicular skin', 'kulit retroaurikular, preaurikular atau supraklavikular'] },
  ] },
  4: { name: ['Full thickness', 'Ketebalan penuh'], look: ['White, leathery or charred, painless, no refill, does not blanch.', 'Putih, seperti kulit atau hangus, tidak nyeri, tanpa pengisian kapiler, tidak memucat.'], plan: [
    { roles: ['PS', 'ICU'], t: ['Excision and cover. Full-thickness graft for the face when the area allows; sheet split graft for large areas. Escharotomy if a tight eschar threatens the airway or the neck.', 'Eksisi dan penutupan. Cangkok tebal penuh untuk wajah bila luasnya memungkinkan; cangkok terbelah lembaran untuk area luas. Eskarotomi bila eskar yang kencang mengancam jalan napas atau leher.'], donor: ['supraclavicular, postauricular, preauricular or upper inner arm (full thickness); scalp or thigh (split)', 'supraklavikular, retroaurikular, preaurikular atau lengan atas dalam (tebal penuh); kulit kepala atau paha (terbelah)'] },
    { roles: ['PS'], t: ['A flap is chosen over a graft when cartilage, bone, tendon or the eyelid framework is exposed, or when the bed will not take a graft: local flaps (nasolabial, paramedian forehead, cervicofacial), regional (supraclavicular artery island), and rarely a free flap.', 'Flap dipilih dibanding cangkok bila tulang rawan, tulang, tendon atau rangka kelopak terbuka, atau bila dasar luka tidak akan menerima cangkok: flap lokal (nasolabial, dahi paramedian, servikofasial), regional (pulau arteri supraklavikular), dan jarang flap bebas.'], donor: ['flap: forehead, nasolabial fold, neck and shoulder (supraclavicular); free: forearm (radial) or anterolateral thigh', 'flap: dahi, lipatan nasolabial, leher dan bahu (supraklavikular); bebas: lengan bawah (radial) atau paha anterolateral'] },
  ] },
};

const SITE: Record<Unit, Block['items']> = {
  forehead: [{ roles: ['PS'], t: ['Cover whole aesthetic units where possible, so the graft edge falls on the brow line or hairline; a forehead graft can be expanded later.', 'Tutup unit estetik utuh bila mungkin, agar tepi cangkok jatuh pada garis alis atau garis rambut; cangkok dahi dapat diekspansi kemudian.'] }],
  eyelid: [{ roles: ['OPH', 'PS'], t: ['Protect the cornea first: lubrication, and early release if the lid pulls away (ectropion). Eyelid skin is thin: a full-thickness graft, with the lid kept open to the sky as little as possible; tarsorrhaphy only as a bridge.', 'Lindungi kornea lebih dulu: pelumas, dan pelepasan dini bila kelopak tertarik keluar (ektropion). Kulit kelopak tipis: cangkok tebal penuh, dengan kelopak dibiarkan terbuka sesedikit mungkin; tarsorafi hanya sebagai jembatan.'], donor: ['upper eyelid of the other side, postauricular or supraclavicular skin', 'kelopak atas sisi lain, kulit retroaurikular atau supraklavikular'] }],
  nose: [{ roles: ['PS'], t: ['Nasal tip and alae have cartilage close under the skin: exposed cartilage needs a flap (nasolabial or paramedian forehead) or a dermal substitute with a graft. Cover the nose by aesthetic subunits.', 'Ujung hidung dan ala punya tulang rawan dekat di bawah kulit: tulang rawan terbuka butuh flap (nasolabial atau dahi paramedian) atau pengganti dermis dengan cangkok. Tutup hidung menurut subunit estetik.'], donor: ['full-thickness graft: postauricular or supraclavicular; flap: forehead or nasolabial fold', 'cangkok tebal penuh: retroaurikular atau supraklavikular; flap: dahi atau lipatan nasolabial'] }],
  lip: [{ roles: ['PS'], t: ['Lips: splint the mouth early to keep the opening (microstomia). The vermilion is replaced by mucosal advancement; skin by a full-thickness graft; a severe loss may need a cross-lip flap.', 'Bibir: pasang bidai mulut dini untuk mempertahankan bukaan (mikrostomia). Vermilion diganti dengan advancement mukosa; kulit dengan cangkok tebal penuh; kehilangan berat mungkin butuh flap bibir silang.'], donor: ['mucosa of the cheek or lip; skin from supraclavicular or postauricular; cross-lip (Abbé) flap from the other lip', 'mukosa pipi atau bibir; kulit dari supraklavikular atau retroaurikular; flap bibir silang (Abbé) dari bibir lain'] }],
  cheek: [{ roles: ['PS'], t: ['Large cheek areas: a full-thickness graft from the supraclavicular region matches best; a thin split graft for very large areas. Tissue expansion and a cervicofacial flap help later reconstruction.', 'Area pipi luas: cangkok tebal penuh dari regio supraklavikular paling cocok; cangkok terbelah tipis untuk area sangat luas. Ekspansi jaringan dan flap servikofasial membantu rekonstruksi kemudian.'], donor: ['preauricular or supraclavicular skin', 'kulit preaurikular atau supraklavikular'] }],
  chin: [{ roles: ['PS'], t: ['Chin and lower face next to the neck: release any contracture pulling the lip down, then a full-thickness graft or a cervicofacial flap.', 'Dagu dan wajah bawah di sebelah leher: lepaskan kontraktur yang menarik bibir ke bawah, lalu cangkok tebal penuh atau flap servikofasial.'], donor: ['supraclavicular skin', 'kulit supraklavikular'] }],
  other: [{ roles: ['PS', 'ICU'], t: ['Ear: cartilage exposure and chondritis are the danger; topical mafenide is used on ears. Coverage with a temporoparietal fascia flap and a graft. Neck: a tight band is released and covered with a full-thickness graft or a flap (supraclavicular), then splinted.', 'Telinga: bahaya adalah tulang rawan terbuka dan kondritis; mafenide topikal dipakai pada telinga. Penutupan dengan flap fasia temporoparietal dan cangkok. Leher: pita yang kencang dilepaskan dan ditutup dengan cangkok tebal penuh atau flap (supraklavikular), lalu dibidai.'], donor: ['temporoparietal fascia (scalp); supraclavicular skin', 'fasia temporoparietal (kulit kepala); kulit supraklavikular'] }],
};

const TEAM: Block = { title: ['The team', 'Tim'], items: [
  { roles: ['ICU'], t: ['First hours: airway (singed hair, soot or hoarseness suggest inhalation injury, so early intubation is considered), fluids, pain, infection control, nutrition.', 'Jam pertama: jalan napas (rambut hangus, jelaga atau suara serak mengarah ke cedera inhalasi, sehingga intubasi dini dipertimbangkan), cairan, nyeri, kontrol infeksi, nutrisi.'] },
  { roles: ['PS'], t: ['Plans excision, grafts, flaps and the later reconstruction (contracture release, tissue expansion, scar treatment).', 'Merencanakan eksisi, cangkok, flap dan rekonstruksi kemudian (pelepasan kontraktur, ekspansi jaringan, terapi parut).'] },
  { roles: ['OPH'], t: ['Cornea and eyelids from the first day.', 'Kornea dan kelopak mata sejak hari pertama.'] },
  { roles: ['REH'], t: ['Splints, positioning, pressure garments and exercises to keep the mouth, neck and eyelids moving and to shape the scar.', 'Bidai, posisi, pakaian tekan dan latihan untuk menjaga gerak mulut, leher dan kelopak mata serta membentuk parut.'] },
] };

export function burnHtml(): string {
  const lead = `<div class="mv-badge photo">${T('Photo is enough to outline; depth is a clinical finding', 'Foto cukup untuk kontur; kedalaman adalah temuan klinis')}</div>`;
  const L = lang() === 'id' ? 1 : 0;
  let area = '';
  if (st.les && st.frame) {
    const cm2 = st.les.areaPx / (st.frame.scale * st.frame.scale) / 100;
    const faceCm2 = Math.PI * 0.5 * 0.5 * (Math.abs(st.lm![454][0] - st.lm![234][0]) / st.frame.scale / 10) * (Math.abs(st.lm![152][1] - st.lm![10][1]) / st.frame.scale / 10);
    area = `<section class="mv-card"><h5>${T('Outlined area', 'Area terkontur')}</h5>
      <div class="ns-row"><div><b>${T('Area', 'Luas')}</b><span>${T('from the iris scale (11.7 mm, about ±5%)', 'dari skala iris (11,7 mm, sekitar ±5%)')}</span></div><strong>${num(cm2, 1)} cm²</strong></div>
      <div class="ns-row"><div><b>${T('Share of the front face', 'Bagian dari wajah tampak depan')}</b><span>${T('face taken as an ellipse', 'wajah dianggap elips')}</span></div><strong>${num(Math.min(100, (cm2 / Math.max(1, faceCm2)) * 100), 0)}%</strong></div>
      <div class="ns-row"><div><b>${T('Facial units touched', 'Unit wajah yang terkena')}</b><span>${T('boxes placed with the landmarks, approximate', 'kotak yang dipasang dengan landmark, perkiraan')}</span></div><strong style="font-size:0.9rem;text-align:right">${esc(st.units.map(u => UNIT_NAME[u][L]).join(', ') || '-')}</strong></div>
      <p class="fine">${T('Burn area for the body uses the rule of nines or Lund-Browder charts, not a front photograph of the face.', 'Luas luka bakar tubuh memakai aturan sembilan atau bagan Lund-Browder, bukan foto depan wajah.')}</p></section>`;
  }
  const depthBtn = ([1, 2, 3, 4] as Depth[]).map(d => `<button type="button" class="chipbtn" data-depth="${d}" aria-pressed="${st.depth === d}"><b>${d}</b> ${esc(DEPTH[d].name[L])}</button>`).join('');
  const picked = st.depth ? DEPTH[st.depth] : null;
  const plan = picked ? refHtml([`${DEPTH[st.depth!].name[0]}: what is usually done`, `${DEPTH[st.depth!].name[1]}: apa yang lazim dikerjakan`], [
    { title: [`How it looks: ${picked.look[0]}`, `Tampilannya: ${picked.look[1]}`], items: picked.plan },
    ...(st.units.length && st.depth! >= 3 ? [{ title: ['By site', 'Menurut lokasi'] as [string, string], items: st.units.flatMap(u => SITE[u]) }] : []),
    TEAM,
  ], ['Healing time and timing of excision vary by centre and by the patient. Burn depth changes over the first days, so it is judged again at each dressing change. Sources: standard burn and reconstructive surgery texts (ABA, ISBI guidance). ', 'Waktu penyembuhan dan waktu eksisi bervariasi antar pusat dan pasien. Kedalaman luka bakar berubah pada hari-hari pertama, jadi dinilai ulang pada setiap ganti balutan. Sumber: buku ajar bedah luka bakar dan rekonstruksi (panduan ABA, ISBI). ']) : '';
  return `${lead}${area}
    <section class="mv-card"><h5>${T('Depth (your finding)', 'Kedalaman (temuan Anda)')}</h5><div class="chipbtns">${depthBtn}</div>
      <p class="fine">${T('Depth cannot be measured from a photograph. Judge it by sensation, blanching, refill and how it behaves over days, then choose it here.', 'Kedalaman tidak bisa diukur dari foto. Nilai dari sensasi, pemucatan, pengisian kapiler dan perilakunya dalam beberapa hari, lalu pilih di sini.')}</p></section>
    ${plan}
    ${donorMap()}`;
}

/* ------------------------------------------------------------------ donor site map */
interface Donor { photo?: string; id: string; x: number; y: number; kind: 'STSG' | 'FTSG' | 'FLAP' | 'FREE'; name: [string, string]; note: [string, string] }
const DONORS: Donor[] = [
  { id: 'scalp', x: 100, y: 28, kind: 'STSG', name: ['Scalp', 'Kulit kepala'], note: ['Split graft; heals in about a week, hair covers the scar, can be harvested again. Thin scalp in older people limits it.', 'Cangkok terbelah; sembuh sekitar seminggu, rambut menutupi parut, bisa diambil lagi. Kulit kepala tipis pada orang tua membatasinya.'] },
  { id: 'preaur', x: 78, y: 62, kind: 'FTSG', name: ['Preauricular', 'Preaurikular'], note: ['Full-thickness; small, good colour for the cheek and eyelid; closes directly.', 'Tebal penuh; kecil, warna baik untuk pipi dan kelopak mata; ditutup langsung.'] },
  { id: 'postaur', x: 128, y: 58, kind: 'FTSG', name: ['Postauricular', 'Retroaurikular'], note: ['Full-thickness; thin and well matched for the eyelid and nose; hidden behind the ear.', 'Tebal penuh; tipis dan cocok untuk kelopak mata dan hidung; tersembunyi di belakang telinga.'] },
  { id: 'eyelid', x: 100, y: 58, kind: 'FTSG', name: ['Upper eyelid (other side)', 'Kelopak atas (sisi lain)'], note: ['Very small full-thickness graft for the other eyelid; closes along the lid crease.', 'Cangkok tebal penuh sangat kecil untuk kelopak lain; ditutup sepanjang lipatan kelopak.'] },
  { id: 'nasolab', x: 96, y: 78, kind: 'FLAP', name: ['Nasolabial fold', 'Lipatan nasolabial'], note: ['Local flap for the nose and lip; the scar hides in the fold.', 'Flap lokal untuk hidung dan bibir; parut tersembunyi di lipatan.'] },
  { id: 'forehead', x: 100, y: 44, kind: 'FLAP', name: ['Forehead (paramedian)', 'Dahi (paramedian)'], note: ['Flap for the nose on the supratrochlear artery; two stages.', 'Flap untuk hidung pada arteri supratroklear; dua tahap.'] },
  { id: 'supra', x: 148, y: 118, kind: 'FTSG', name: ['Supraclavicular', 'Supraklavikular'], note: ['Full-thickness graft, large, the best colour and texture match for the face; closes directly. The same area gives the supraclavicular artery island flap for the neck and lower face.', 'Cangkok tebal penuh, besar, kecocokan warna dan tekstur terbaik untuk wajah; ditutup langsung. Area yang sama memberi flap pulau arteri supraklavikular untuk leher dan wajah bawah.'] },
  { id: 'arm', x: 202, y: 190, kind: 'FTSG', name: ['Upper inner arm', 'Lengan atas bagian dalam'], note: ['Full-thickness; thin, hairless, reasonable colour; a hidden scar.', 'Tebal penuh; tipis, tanpa rambut, warna cukup; parut tersembunyi.'] },
  { id: 'forearm', x: 222, y: 270, kind: 'FREE', name: ['Radial forearm', 'Lengan bawah radial'], note: ['Free flap: thin and pliable; for the cheek, lip or neck when a graft will not do.', 'Flap bebas: tipis dan lentur; untuk pipi, bibir atau leher bila cangkok tidak cukup.'] },
  { photo: 'huid_verwijderdt_voor_transplantatie.jpg', id: 'thigh', x: 120, y: 380, kind: 'STSG', name: ['Thigh (anterior or lateral)', 'Paha (anterior atau lateral)'], note: ['The usual split graft donor: wide and flat, heals in about 10 to 14 days, can be harvested again. Free flap: the anterolateral thigh for a large defect.', 'Donor cangkok terbelah yang lazim: lebar dan datar, sembuh sekitar 10 sampai 14 hari, bisa diambil lagi. Flap bebas: paha anterolateral untuk defek besar.'] },
  { id: 'buttock', x: 70, y: 300, kind: 'STSG', name: ['Buttock or hip', 'Bokong atau pinggul'], note: ['Split graft, hidden by clothes.', 'Cangkok terbelah, tertutup pakaian.'] },
];
const COL: Record<Donor['kind'], string> = { STSG: '#5fe8c8', FTSG: '#f2c14b', FLAP: '#ff8f6e', FREE: '#c4a6ff' };

function donorMap(): string {
  const L = lang() === 'id' ? 1 : 0;
  const legend = ([['STSG', ['Split-thickness graft', 'Cangkok terbelah']], ['FTSG', ['Full-thickness graft', 'Cangkok tebal penuh']], ['FLAP', ['Local or regional flap', 'Flap lokal atau regional']], ['FREE', ['Free flap', 'Flap bebas']]] as Array<[Donor['kind'], [string, string]]>)
    .map(([k, n]) => `<span class="dkey"><i style="background:${COL[k]}"></i>${esc(n[L])}</span>`).join('');
  const dots = DONORS.map(d => `<g class="dot" data-donor="${d.id}" tabindex="0" role="button" aria-label="${esc(d.name[L])}"><circle cx="${d.x}" cy="${d.y}" r="7.5" fill="${COL[d.kind]}" fill-opacity="0.9" stroke="#0a0b0d" stroke-width="1.5"/><circle class="ring" cx="${d.x}" cy="${d.y}" r="12" fill="none" stroke="${COL[d.kind]}" stroke-width="1.5"/></g>`).join('');
  const svg = `<svg viewBox="0 0 280 440" class="donor-svg" role="img" aria-label="${T('Body map of donor sites', 'Peta tubuh lokasi donor')}">
    <g fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.4" stroke-linejoin="round">
      <ellipse cx="100" cy="52" rx="34" ry="42"/><path d="M84 92 L84 112 M116 92 L116 112"/>
      <path d="M84 112 C60 116 44 124 40 148 L36 200 L28 292 L44 296 L56 214 L62 166"/><path d="M116 112 C140 116 156 124 160 148 L164 200 L172 292 L156 296 L144 214 L138 166"/>
      <path d="M62 166 L64 300 C66 330 74 340 80 372 L82 430 L110 430 L108 372 C112 346 114 330 100 300"/><path d="M138 166 L136 300 C134 330 126 340 120 372 L118 430 L146 430 L148 372"/>
      <path d="M100 300 L100 160"/><path d="M224 148 L214 200 L206 292 L222 296 L232 214"/>
    </g>${dots}</svg>`;
  return `<section class="mv-card"><h5>${T('Where the tissue comes from', 'Dari mana jaringan diambil')}</h5>
    <div class="dkeys">${legend}</div><div class="donor-wrap">${svg}<div class="donor-info" id="donor-info"><p class="fine">${T('Tap a dot to read about that donor site.', 'Ketuk satu titik untuk membaca tentang lokasi donor itu.')}</p></div></div>
    <p class="fine">${T('Schematic, not to scale. Donor-site pain, scarring and healing time are part of the choice.', 'Skematik, tidak sesuai skala. Nyeri, parut dan waktu penyembuhan lokasi donor ikut menentukan pilihan.')}</p></section>`;
}

export function wireBurn(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-depth]').forEach(b => b.addEventListener('click', () => { st.depth = Number(b.dataset.depth) as Depth; st.onChange(); }));
  const info = root.querySelector<HTMLElement>('#donor-info'), L = lang() === 'id' ? 1 : 0;
  const show = (id: string) => {
    const d = DONORS.find(x => x.id === id); if (!d || !info) return;
    root.querySelectorAll('.donor-svg .dot').forEach(g => g.classList.toggle('on', g.getAttribute('data-donor') === id));
    info.innerHTML = `<h5 style="color:${COL[d.kind]}">${esc(d.name[L])}</h5><p>${esc(d.note[L])}</p>${d.photo ? `<img class="donor-photo" src="/real/${esc(d.photo)}" alt=""><p class="fine">${T('A real photograph of a split-graft donor site on the thigh just after harvest (Wikimedia Commons, CC BY-SA 3.0).', 'Foto nyata lokasi donor cangkok terbelah pada paha tepat setelah pengambilan (Wikimedia Commons, CC BY-SA 3.0).')}</p>` : ''}`;
  };
  root.querySelectorAll<SVGGElement>('.donor-svg .dot').forEach(g => { g.addEventListener('click', () => show(g.dataset.donor!)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(g.dataset.donor!); } }); });
}
export const hasBurn = (): boolean => !!st.img;
