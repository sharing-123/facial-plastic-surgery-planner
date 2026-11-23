/**
 * Ranked differential, tiered malignancy screen, depth estimate, care setting and management for one facial lesion.
 * Rule-based decision support built from the appearance features in segment.ts, the site from the landmarks, and optional
 * answers the clinician may add. Not validated against clinicians. A photograph cannot exclude malignancy, cannot measure
 * depth and cannot replace a biopsy; every number says what it came from.
 */
import type { Region } from './rstl';
import type { LesionFeatures } from './segment';

export type L2 = { en: string; id: string };
export const L = (en: string, id: string): L2 => ({ en, id });

export type DxId = 'laceration' | 'abrasion' | 'scar' | 'hypertrophic' | 'burn' | 'nevus' | 'melanoma' | 'bcc' | 'scc' | 'sk' | 'cyst' | 'acne' | 'ulcer' | 'other';
export type ClinKey = 'recent' | 'trauma' | 'burnCause' | 'bite' | 'growing' | 'bleeding' | 'pearly' | 'scaly' | 'pigmented' | 'painful' | 'oldScar' | 'immuno' | 'radiation' | 'chronic';
export type Clin = Partial<Record<ClinKey, boolean>>;

export const CLIN_QUESTIONS: Array<{ key: ClinKey; q: L2 }> = [
  { key: 'trauma', q: L('Caused by a cut, fall or other injury', 'Akibat sayatan, jatuh, atau cedera lain') },
  { key: 'recent', q: L('Appeared within the last 4 weeks', 'Muncul dalam 4 minggu terakhir') },
  { key: 'bite', q: L('Bite, or injury with dirt or other contamination', 'Gigitan, atau cedera dengan tanah atau kontaminasi lain') },
  { key: 'burnCause', q: L('Caused by heat, chemical or electricity', 'Akibat panas, bahan kimia, atau listrik') },
  { key: 'growing', q: L('Growing or changing in shape or colour', 'Membesar atau berubah bentuk atau warna') },
  { key: 'pigmented', q: L('Brown or black pigment', 'Pigmen cokelat atau hitam') },
  { key: 'pearly', q: L('Pearly or rolled raised border, small vessels on it', 'Tepi mutiara atau menggulung dan menonjol, dengan pembuluh kecil di atasnya') },
  { key: 'bleeding', q: L('Bleeds easily or has crusted', 'Mudah berdarah atau berkrusta') },
  { key: 'scaly', q: L('Rough, scaly patch', 'Bercak kasar dan bersisik') },
  { key: 'chronic', q: L('Not healed after 6 weeks of good care', 'Tidak sembuh setelah 6 minggu perawatan baik') },
  { key: 'painful', q: L('Painful, warm or swollen', 'Nyeri, hangat, atau bengkak') },
  { key: 'oldScar', q: L('Arises on an old scar, burn or radiotherapy field', 'Muncul pada parut, luka bakar, atau area radioterapi lama') },
  { key: 'immuno', q: L('Immunosuppressed or transplant recipient', 'Imunosupresi atau penerima transplantasi') },
];

export interface DxRow { id: DxId; share: number; why: L2[] }
export const DX_NAME: Record<DxId, L2> = {
  laceration: L('Laceration', 'Laserasi'), abrasion: L('Abrasion or superficial wound', 'Abrasi atau luka superfisial'),
  scar: L('Mature linear scar', 'Parut linear matang'), hypertrophic: L('Hypertrophic scar or keloid', 'Parut hipertrofik atau keloid'),
  burn: L('Burn', 'Luka bakar'), nevus: L('Melanocytic naevus (benign pigmented lesion)', 'Nevus melanositik (lesi berpigmen jinak)'),
  melanoma: L('Pigmented lesion suspicious for melanoma', 'Lesi berpigmen mencurigakan melanoma'), bcc: L('Basal cell carcinoma', 'Karsinoma sel basal'),
  scc: L('Squamous cell carcinoma or actinic keratosis', 'Karsinoma sel skuamosa atau keratosis aktinik'), sk: L('Seborrhoeic keratosis', 'Keratosis seboroik'),
  cyst: L('Epidermoid cyst or abscess', 'Kista epidermoid atau abses'), acne: L('Acne lesion or acne scar', 'Lesi atau parut akne'),
  ulcer: L('Chronic ulcer or infected wound', 'Ulkus kronik atau luka terinfeksi'), other: L('Unclassified lesion', 'Lesi tidak terklasifikasi'),
};

export interface Malignancy { tier: 'low' | 'intermediate' | 'high'; points: number; reasons: L2[]; neoplasm: Array<{ name: L2; why: L2 }> }
export interface DepthEst { mm: number; loMm: number; hiMm: number; layer: 'dermis' | 'subcutis' | 'deep'; skinMm: number; fatMm: number; measurable: boolean }
export interface Setting { level: 'ed' | 'clinic' | 'refer'; label: L2; why: L2[] }
export interface Section { id: string; title: L2; tone?: 'alert'; items: L2[] }
export interface Classification {
  differential: DxRow[]; top: DxId; malignancy: Malignancy; depth: DepthEst; grade: L2; one: L2;
  setting: Setting; sections: Section[]; hold: 'histology' | null; sizeMm: { long: number; short: number }; siteName: L2;
}

const SITE: Record<Region, L2> = {
  forehead: L('forehead', 'dahi'), glabella: L('glabella', 'glabela'), brow: L('brow', 'alis'), periorbital: L('periorbital region and eyelids', 'region periorbital dan kelopak'),
  nose: L('nose', 'hidung'), lip: L('lip', 'bibir'), perioral: L('perioral region', 'region perioral'), chin: L('chin', 'dagu'), cheek: L('cheek', 'pipi'),
  outside_face_oval: L('facial edge (jaw, ear, temple)', 'tepi wajah (rahang, telinga, pelipis)'),
};
// textbook orders of magnitude only; real thickness varies with age, sex, site and the individual
const SKIN_MM: Record<Region, number> = { forehead: 1.8, glabella: 1.8, brow: 1.8, periorbital: 0.8, nose: 2.0, lip: 1.2, perioral: 1.5, chin: 2.0, cheek: 1.8, outside_face_oval: 2.0 };
const FAT_MM: Record<Region, number> = { forehead: 4, glabella: 3, brow: 3, periorbital: 2, nose: 4, lip: 3, perioral: 5, chin: 6, cheek: 10, outside_face_oval: 6 };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function classify(f: LesionFeatures, mmPerPx: number, lesionLongPx: number, lesionShortPx: number, region: Region, clin: Clin, ageYears: number | null): Classification {
  const longMm = lesionLongPx * mmPerPx, shortMm = lesionShortPx * mmPerPx;
  const sc: Record<DxId, number> = { laceration: 0, abrasion: 0, scar: 0, hypertrophic: 0, burn: 0, nevus: 0, melanoma: 0, bcc: 0, scc: 0, sk: 0, cyst: 0, acne: 0, ulcer: 0, other: 0.25 };
  const why: Record<DxId, L2[]> = { laceration: [], abrasion: [], scar: [], hypertrophic: [], burn: [], nevus: [], melanoma: [], bcc: [], scc: [], sk: [], cyst: [], acne: [], ulcer: [], other: [] };
  const add = (id: DxId, v: number, r: L2) => { sc[id] += v; why[id].push(r); };
  const linear = f.elongation >= 3, pigmented = f.deltaL < -14 && f.deltaB > 3;
  if (linear) { add('laceration', 0.8, L('Long, narrow shape', 'Bentuk panjang dan sempit')); add('scar', 0.7, L('Long, narrow shape', 'Bentuk panjang dan sempit')); }
  if (f.redFrac > 0.4 || f.deltaA > 7) { add('laceration', 0.5, L('Red against the surrounding skin', 'Merah dibanding kulit sekitar')); add('abrasion', 0.4, L('Red against the surrounding skin', 'Merah dibanding kulit sekitar')); add('burn', 0.2, L('Red against the surrounding skin', 'Merah dibanding kulit sekitar')); add('ulcer', 0.2, L('Red against the surrounding skin', 'Merah dibanding kulit sekitar')); }
  if (f.deltaE < 11 && linear) add('scar', 0.9, L('Colour close to the skin, as in a matured scar', 'Warna dekat kulit, seperti parut matang'));
  if (f.deltaE >= 11 && f.deltaE < 25 && f.deltaA > 5 && !linear) add('hypertrophic', 0.5, L('Pink to red, compact, a little darker than skin', 'Merah muda sampai merah, kompak, sedikit lebih gelap dari kulit'));
  if (pigmented) { add('nevus', 0.9, L('Brown pigment, darker than the skin', 'Pigmen cokelat, lebih gelap dari kulit')); add('melanoma', 0.3, L('Brown or black pigment', 'Pigmen cokelat atau hitam')); add('sk', 0.5, L('Brown pigment', 'Pigmen cokelat')); }
  if (pigmented && f.solidity > 0.9 && f.asymmetry < 0.2 && f.variegation < 9) add('nevus', 0.7, L('Round, even and uniform in colour', 'Bulat, rata, dan seragam warnanya'));
  if (pigmented && (f.asymmetry > 0.3 || f.compactness > 1.5 || f.variegation > 12)) add('melanoma', 0.9, L('Asymmetric, irregular or varied in colour', 'Tidak simetris, tidak teratur, atau warnanya bervariasi'));
  if (f.yellowFrac > 0.25) { add('ulcer', 0.5, L('Yellow slough or crust over part of the surface', 'Slough atau krusta kuning pada sebagian permukaan')); add('scc', 0.3, L('Yellow crust over part of the surface', 'Krusta kuning pada sebagian permukaan')); add('abrasion', 0.2, L('Crust over part of the surface', 'Krusta pada sebagian permukaan')); }
  if (f.darkFrac > 0.3 && !pigmented) add('burn', 0.2, L('Dark areas', 'Area gelap'));
  if (f.variegation > 14 && f.redFrac > 0.2) add('burn', 0.4, L('Patchy, mixed colours', 'Warna campur dan berbercak'));
  if (longMm < 8 && !linear && f.deltaE >= 8) add('acne', 0.5, L(`Small round lesion (${r1(longMm)} mm)`, `Lesi bulat kecil (${r1(longMm)} mm)`));
  if (f.deltaL > -3 && f.deltaA > 4 && !linear && f.solidity > 0.9) add('cyst', 0.4, L('Round, pink to red dome-like area', 'Area bulat merah muda sampai merah, seperti kubah'));
  if (clin.trauma) { const old = clin.recent === false; add('laceration', old ? 0.2 : 1.4, L('Injury reported', 'Cedera dilaporkan')); add('abrasion', old ? 0.1 : 0.7, L('Injury reported', 'Cedera dilaporkan')); }
  if (clin.recent) { add('laceration', 0.6, L('Appeared recently', 'Muncul baru-baru ini')); add('burn', 0.3, L('Appeared recently', 'Muncul baru-baru ini')); add('cyst', 0.3, L('Appeared recently', 'Muncul baru-baru ini')); }
  if (clin.trauma && clin.recent === false) add('scar', 1.6, L('Old injury, no longer recent', 'Cedera lama, bukan lagi baru'));
  if (clin.bite) add('laceration', 0.6, L('Bite or contaminated injury', 'Gigitan atau cedera terkontaminasi'));
  if (clin.burnCause) add('burn', 2.2, L('Heat, chemical or electrical cause', 'Penyebab panas, kimia, atau listrik'));
  if (clin.growing) { add('melanoma', 0.8, L('Growing or changing', 'Membesar atau berubah')); add('bcc', 0.5, L('Growing', 'Membesar')); add('scc', 0.5, L('Growing', 'Membesar')); add('hypertrophic', 0.4, L('Growing beyond the original wound', 'Tumbuh melewati batas luka awal')); }
  if (clin.pigmented) { add('nevus', 0.4, L('Pigmented', 'Berpigmen')); add('melanoma', 0.6, L('Pigmented', 'Berpigmen')); add('sk', 0.3, L('Pigmented', 'Berpigmen')); }
  if (clin.pearly) add('bcc', 2.0, L('Pearly rolled border with small vessels', 'Tepi mutiara menggulung dengan pembuluh kecil'));
  if (clin.bleeding) { add('scc', 0.7, L('Bleeds or crusts easily', 'Mudah berdarah atau berkrusta')); add('bcc', 0.6, L('Bleeds easily', 'Mudah berdarah')); }
  if (clin.scaly) add('scc', 1.2, L('Rough, scaly surface', 'Permukaan kasar dan bersisik'));
  if (clin.chronic) { add('ulcer', 0.7, L('Not healed after 6 weeks', 'Tidak sembuh setelah 6 minggu')); add('bcc', 0.5, L('Does not heal', 'Tidak sembuh')); add('scc', 0.5, L('Does not heal', 'Tidak sembuh')); }
  if (clin.painful) { add('cyst', 1.0, L('Painful, warm or swollen', 'Nyeri, hangat, atau bengkak')); add('ulcer', 0.7, L('Painful, warm or swollen', 'Nyeri, hangat, atau bengkak')); }
  if (clin.oldScar) { add('scc', 0.6, L('On an old scar or radiotherapy field', 'Pada parut atau area radioterapi lama')); add('hypertrophic', 0.5, L('On an old scar', 'Pada parut lama')); }
  const ranked = (Object.keys(sc) as DxId[]).sort((a, b) => sc[b] - sc[a]);
  const T = 0.55;
  const exps = ranked.map(id => Math.exp(sc[id] / T));
  const tot = exps.reduce((s, v) => s + v, 0);
  const differential: DxRow[] = ranked.map((id, i) => ({ id, share: exps[i] / tot, why: why[id] })).filter(r => r.share >= 0.04).slice(0, 5);
  const top = differential[0].id;

  // ---- tiered malignancy screen: points from ABCDE-style features, evolution and risk context
  let pts = 0; const mr: L2[] = [];
  const mp = (v: number, r: L2) => { pts += v; mr.push(r); };
  if (pigmented || clin.pigmented) {
    if (f.asymmetry > 0.3) mp(0.8, L('Asymmetric shape', 'Bentuk tidak simetris'));
    if (f.compactness > 1.5 || f.solidity < 0.85) mp(0.7, L('Irregular border', 'Tepi tidak teratur'));
    if (f.variegation > 12) mp(0.8, L('More than one shade', 'Lebih dari satu corak warna'));
    if (longMm >= 6) mp(0.6, L(`Diameter ${r1(longMm)} mm (6 mm or more)`, `Diameter ${r1(longMm)} mm (6 mm atau lebih)`));
  }
  if (clin.growing) mp(1.2, L('Growing or changing', 'Membesar atau berubah'));
  if (clin.pearly) mp(1.4, L('Pearly rolled border', 'Tepi mutiara menggulung'));
  if (clin.bleeding) mp(0.7, L('Bleeds easily or crusts', 'Mudah berdarah atau berkrusta'));
  if (clin.scaly) mp(0.7, L('Rough, scaly patch', 'Bercak kasar dan bersisik'));
  if (clin.chronic) mp(0.8, L('Not healed after 6 weeks of good care', 'Tidak sembuh setelah 6 minggu perawatan baik'));
  if (clin.oldScar) mp(1.2, L('Arises on an old scar or radiotherapy field', 'Muncul pada parut atau area radioterapi lama'));
  if (clin.immuno) mp(0.8, L('Immunosuppressed', 'Imunosupresi'));
  if (ageYears != null && ageYears >= 55 && !linear) mp(0.3, L('Age 55 or older', 'Usia 55 tahun atau lebih'));
  if (f.yellowFrac > 0.25 && !linear && !clin.trauma) mp(0.3, L('Crust or slough on a non-linear lesion', 'Krusta atau slough pada lesi tidak linear'));
  if (top === 'melanoma' || top === 'bcc' || top === 'scc') pts += 0.6;
  const tier: Malignancy['tier'] = pts >= 3 ? 'high' : pts >= 1.6 ? 'intermediate' : 'low';
  const neo = [
    { name: L('Melanoma (including amelanotic)', 'Melanoma (termasuk amelanotik)'), v: (pigmented || clin.pigmented ? 2 : 0) + (f.asymmetry > 0.3 ? 0.6 : 0) + (clin.growing ? 0.6 : 0), why: L('Pigment that is growing or changing with an irregular edge needs an excisional biopsy, not a shave.', 'Pigmen yang membesar atau berubah dengan tepi tidak teratur perlu biopsi eksisional, bukan shave.') },
    { name: L('Basal cell carcinoma', 'Karsinoma sel basal'), v: (clin.pearly ? 2 : 0) + (clin.chronic ? 0.5 : 0) + (clin.bleeding ? 0.4 : 0) + 0.4, why: L('Pearly rolled border on sun-exposed skin that does not heal.', 'Tepi mutiara menggulung pada kulit terpapar matahari yang tidak sembuh.') },
    { name: L('Squamous cell carcinoma', 'Karsinoma sel skuamosa'), v: (clin.scaly ? 1.2 : 0) + (clin.bleeding ? 0.8 : 0) + (clin.chronic ? 0.5 : 0) + (clin.oldScar ? 0.6 : 0) + (clin.immuno ? 0.5 : 0), why: L('Rough, crusted or tender growth on sun-exposed skin or a chronic wound.', 'Pertumbuhan kasar, berkrusta, atau nyeri pada kulit terpapar matahari atau luka kronik.') },
    { name: L('Marjolin ulcer (carcinoma in a chronic wound or scar)', 'Ulkus Marjolin (karsinoma pada luka kronik atau parut)'), v: clin.oldScar ? 2.2 : 0, why: L('An old scar, burn or ulcer that has started to break down or grow.', 'Parut, luka bakar, atau ulkus lama yang mulai pecah atau tumbuh.') },
    { name: L('Merkel cell carcinoma or lymphoma', 'Karsinoma sel Merkel atau limfoma'), v: 0.2 + (pts >= 3 ? 0.3 : 0), why: L('A rapid, firm, painless nodule; only histology separates these.', 'Nodul cepat tumbuh, keras, tidak nyeri; hanya histologi yang membedakan.') },
  ];
  const malignancy: Malignancy = { tier, points: r1(pts), reasons: mr, neoplasm: tier === 'low' ? [] : neo.sort((a, b) => b.v - a.v).slice(0, 3).map(({ name, why: w }) => ({ name, why: w })) };
  const hold = tier === 'high' || top === 'melanoma' || top === 'bcc' || top === 'scc' ? 'histology' as const : null;

  // ---- depth estimate: from the type, appearance and site; a photograph cannot measure it
  const skinMm = SKIN_MM[region], fatMm = FAT_MM[region];
  const neoplastic = ['melanoma', 'bcc', 'scc', 'nevus', 'sk', 'cyst'].includes(top);
  let mid: number;
  if (top === 'abrasion') mid = skinMm * 0.45;
  else if (top === 'laceration') mid = f.yellowFrac > 0.1 || f.darkFrac > 0.25 ? skinMm + fatMm * 0.3 : skinMm * 0.9;
  else if (top === 'burn') mid = f.darkFrac > 0.3 ? skinMm : skinMm * 0.55;
  else if (top === 'ulcer') mid = skinMm + fatMm * 0.25;
  else if (neoplastic) mid = Math.min(skinMm + fatMm * 0.3, 0.8 + 0.12 * Math.min(shortMm, 20));
  else mid = skinMm * 0.7;
  const depth: DepthEst = { mm: r1(mid), loMm: r1(mid * 0.55), hiMm: r1(mid * 1.6), skinMm, fatMm, measurable: false, layer: mid <= skinMm ? 'dermis' : mid <= skinMm + fatMm ? 'subcutis' : 'deep' };

  const site = SITE[region];
  const grade: L2 = top === 'laceration' || top === 'abrasion'
    ? (depth.layer === 'dermis' ? L('partial thickness (dermis)', 'ketebalan parsial (dermis)') : L('full thickness (into subcutis)', 'ketebalan penuh (hingga subkutis)'))
    : top === 'burn' ? (depth.layer === 'dermis' && f.darkFrac < 0.3 ? L('superficial to superficial partial thickness; re-judge at 48 to 72 hours', 'superfisial sampai parsial superfisial; nilai ulang pada 48 sampai 72 jam') : L('deep partial to full thickness likely', 'kemungkinan parsial dalam sampai ketebalan penuh'))
    : top === 'melanoma' || top === 'bcc' || top === 'scc' ? L(`${tier === 'high' ? 'high' : tier === 'intermediate' ? 'intermediate' : 'lower'} suspicion: histology decides the diagnosis and thickness`, `kecurigaan ${tier === 'high' ? 'tinggi' : tier === 'intermediate' ? 'sedang' : 'lebih rendah'}: histologi menentukan diagnosis dan ketebalan`)
    : L('grade cannot be assigned from the photograph', 'derajat tidak dapat ditentukan dari foto');
  const cm = (v: number) => (v / 10).toFixed(1);
  const one = L(`${cm(longMm)} x ${cm(shortMm)} cm, about ${cm(depth.mm)} cm deep (estimate, range ${cm(depth.loMm)} to ${cm(depth.hiMm)} cm)`, `${cm(longMm)} x ${cm(shortMm)} cm, kedalaman sekitar ${cm(depth.mm)} cm (perkiraan, kisaran ${cm(depth.loMm)} sampai ${cm(depth.hiMm)} cm)`);

  // ---- where this should be handled
  const swhy: L2[] = [];
  let level: Setting['level'] = 'clinic';
  const eyeLipNose = region === 'periorbital' || region === 'lip' || region === 'nose';
  if ((top === 'laceration' || top === 'abrasion') && (clin.recent || clin.trauma)) {
    level = 'ed'; swhy.push(L('A fresh facial wound should be seen the same day for irrigation, closure within the window, and tetanus.', 'Luka wajah segar sebaiknya dilihat hari yang sama untuk irigasi, penutupan dalam jendela waktu, dan tetanus.'));
    if (eyeLipNose) swhy.push(L('The eyelid, lip or nose is involved: structures behind the skin must be checked before closure.', 'Kelopak, bibir, atau hidung terlibat: struktur di balik kulit harus diperiksa sebelum penutupan.'));
  }
  if (top === 'burn' || clin.burnCause) { level = 'ed'; swhy.push(L('A facial burn needs same-day assessment of depth, airway signs, eyes and tetanus; face burns go to a burn service.', 'Luka bakar wajah perlu penilaian hari yang sama: kedalaman, tanda jalan napas, mata, dan tetanus; luka bakar wajah dirujuk ke layanan luka bakar.')); }
  if (top === 'ulcer' && clin.painful) { level = 'ed'; swhy.push(L('Painful, warm or swollen: possible infection or abscess that needs drainage or antibiotics now.', 'Nyeri, hangat, atau bengkak: kemungkinan infeksi atau abses yang perlu drainase atau antibiotik sekarang.')); }
  if (level === 'clinic' && (hold || tier !== 'low')) { level = 'refer'; swhy.push(L('Possible malignancy: biopsy and referral before any reconstruction.', 'Kemungkinan keganasan: biopsi dan rujuk sebelum rekonstruksi apa pun.')); }
  if (level === 'clinic' && (top === 'hypertrophic' || longMm > 40)) { level = 'refer'; swhy.push(L('Scar or defect management beyond a simple clinic procedure: refer to plastic surgery.', 'Penanganan parut atau defek di luar tindakan sederhana di poli: rujuk ke bedah plastik.')); }
  if (!swhy.length) swhy.push(L('Stable looking lesion with no warning features: manageable in the clinic.', 'Lesi tampak stabil tanpa tanda peringatan: dapat ditangani di poli.'));
  const setting: Setting = { level, label: level === 'ed' ? L('Emergency department now', 'IGD sekarang') : level === 'refer' ? L('Refer to plastic surgery or dermatologic surgery', 'Rujuk ke bedah plastik atau bedah kulit') : L('Outpatient clinic', 'Poli rawat jalan'), why: swhy };

  return { differential, top, malignancy, depth, grade, one, setting, sections: sectionsFor(top, tier, level, clin, eyeLipNose), hold, sizeMm: { long: r1(longMm), short: r1(shortMm) }, siteName: site };
}

function sectionsFor(top: DxId, tier: Malignancy['tier'], level: Setting['level'], clin: Clin, sensitive: boolean): Section[] {
  const S: Section[] = [];
  const alerts: L2[] = [];
  alerts.push(L('A photograph cannot exclude malignancy and cannot measure depth. Anything suspicious needs a biopsy before reconstruction.', 'Foto tidak dapat menyingkirkan keganasan dan tidak dapat mengukur kedalaman. Yang mencurigakan perlu biopsi sebelum rekonstruksi.'));
  if (tier === 'high') alerts.unshift(L('High suspicion: biopsy first. Do not reconstruct, graft or flap until histology is back.', 'Kecurigaan tinggi: biopsi dulu. Jangan rekonstruksi, cangkok, atau flap sebelum histologi keluar.'));
  S.push({ id: 'alerts', title: L('Check first', 'Periksa dulu'), tone: 'alert', items: alerts });
  const trauma = top === 'laceration' || top === 'abrasion';
  if (trauma) {
    S.push({ id: 'ed', title: L('In the emergency department now', 'Di IGD sekarang'), items: [
      L('Stop bleeding with pressure; photograph with a scale before anything is cleaned.', 'Hentikan perdarahan dengan penekanan; foto dengan skala sebelum dibersihkan.'),
      L('Irrigate generously with saline; remove foreign material; debride as little as possible on the face.', 'Irigasi banyak dengan larutan fisiologis; angkat benda asing; debridemen seminimal mungkin pada wajah.'),
      L('Test facial movement, eye movement, bite and sensation BEFORE local anaesthesia.', 'Periksa gerak wajah, gerak mata, gigitan, dan sensasi SEBELUM anestesi lokal.'),
      L(`Explore for depth, foreign body, bone and ${sensitive ? 'lid margin, lacrimal system, lip vermilion or alar rim' : 'parotid duct and nerve branches'}; image if bone injury is possible.`, `Eksplorasi kedalaman, benda asing, tulang, dan ${sensitive ? 'tepi kelopak, sistem lakrimal, vermilion bibir, atau rim alar' : 'duktus parotis dan cabang saraf'}; pencitraan bila cedera tulang mungkin.`),
      L('Close in layers with the plan below; facial wounds can often be closed primarily even beyond 12 to 24 hours after thorough irrigation if there is no infection.', 'Tutup berlapis sesuai rencana di bawah; luka wajah sering dapat ditutup primer bahkan lebih dari 12 sampai 24 jam setelah irigasi menyeluruh bila tidak ada infeksi.'),
    ] });
    S.push({ id: 'abx', title: L('Antibiotics and tetanus', 'Antibiotik dan tetanus'), items: [
      L('Check tetanus status and give a booster or immunoglobulin as your protocol says.', 'Periksa status tetanus dan beri booster atau imunoglobulin sesuai protokol.'),
      L(clin.bite ? 'Bite or contaminated wound: antibiotic prophylaxis and rabies risk assessment.' : 'Clean wound after irrigation: antibiotics are usually not needed.', clin.bite ? 'Gigitan atau luka terkontaminasi: profilaksis antibiotik dan penilaian risiko rabies.' : 'Luka bersih setelah irigasi: antibiotik biasanya tidak diperlukan.'),
    ] });
    S.push({ id: 'clinic', title: L('In the outpatient clinic', 'Di poli rawat jalan'), items: [L('Suture removal at 5 to 7 days on the face (3 to 5 on the eyelid), earlier in children with non-absorbable skin sutures.', 'Lepas jahitan pada hari 5 sampai 7 di wajah (3 sampai 5 di kelopak).'), L('Check for infection, hematoma and dehiscence at 48 to 72 hours.', 'Periksa infeksi, hematoma, dan dehisensi pada 48 sampai 72 jam.'), L('Sunscreen and scar care for at least 6 to 12 months.', 'Tabir surya dan perawatan parut minimal 6 sampai 12 bulan.')] });
  } else if (top === 'burn') {
    S.push({ id: 'ed', title: L('In the emergency department now', 'Di IGD sekarang'), items: [
      L('Cool the burn with running water for 20 minutes if within 3 hours; remove rings and jewellery.', 'Dinginkan luka dengan air mengalir 20 menit bila dalam 3 jam; lepas cincin dan perhiasan.'),
      L('Look for singed nasal hair, soot, hoarseness and eye involvement: airway and ophthalmic review.', 'Cari bulu hidung hangus, jelaga, suara serak, dan keterlibatan mata: penilaian jalan napas dan mata.'),
      L('Analgesia, tetanus, clean non-adherent dressing. Face burns go to a burn service.', 'Analgesia, tetanus, dressing bersih tidak lengket. Luka bakar wajah dirujuk ke layanan luka bakar.'),
    ] });
  } else if (top === 'melanoma' || top === 'bcc' || top === 'scc' || tier !== 'low') {
    S.push({ id: 'clinic', title: L('Next step', 'Langkah berikutnya'), items: [
      L('Dermoscopy and a full skin and nodal examination.', 'Dermoskopi serta pemeriksaan kulit dan kelenjar getah bening menyeluruh.'),
      L(top === 'melanoma' ? 'Excisional biopsy with a narrow margin, orientated, not a shave or incision through the lesion.' : 'Punch or shave biopsy for BCC and SCC; excisional if melanoma is possible.', top === 'melanoma' ? 'Biopsi eksisional dengan margin sempit, berorientasi, bukan shave atau insisi menembus lesi.' : 'Biopsi punch atau shave untuk BCC dan SCC; eksisional bila melanoma mungkin.'),
      L('Plan reconstruction only after margins are clear on histology; mark and photograph the site first.', 'Rencanakan rekonstruksi hanya setelah margin bebas pada histologi; tandai dan foto lokasi lebih dulu.'),
    ] });
  } else {
    S.push({ id: 'clinic', title: L('In the outpatient clinic', 'Di poli rawat jalan'), items: [
      L('Measure and photograph with a scale at every visit to document change.', 'Ukur dan foto dengan skala setiap kunjungan untuk mendokumentasikan perubahan.'),
      L(top === 'hypertrophic' ? 'Silicone, pressure and intralesional steroid first; surgery alone risks recurrence in keloid.' : top === 'cyst' ? 'If inflamed: drain; if quiet: complete excision with the capsule once calm.' : 'Observe, protect from sun, and treat the cause if there is one.', top === 'hypertrophic' ? 'Silikon, tekanan, dan steroid intralesi dahulu; operasi saja berisiko kambuh pada keloid.' : top === 'cyst' ? 'Bila meradang: drainase; bila tenang: eksisi lengkap dengan kapsul setelah tenang.' : 'Observasi, lindungi dari matahari, dan obati penyebabnya bila ada.'),
    ] });
  }
  S.push({ id: 'refer', title: L('When to refer', 'Kapan merujuk'), items: [
    L('Suspected malignancy, any structure behind the skin involved, loss of tissue that needs a flap or graft, or a lid, lip or nose margin involved.', 'Dugaan keganasan, struktur di balik kulit terlibat, kehilangan jaringan yang perlu flap atau cangkok, atau tepi kelopak, bibir, atau hidung terlibat.'),
  ] });
  S.push({ id: 'flags', title: L('Red flags', 'Tanda bahaya'), tone: 'alert', items: [
    L('Spreading redness, pus, fever; new facial weakness; vision change or eye pain; rapidly growing or bleeding lesion; a wound on an old scar that stops healing.', 'Kemerahan meluas, nanah, demam; kelemahan wajah baru; gangguan penglihatan atau nyeri mata; lesi cepat membesar atau berdarah; luka di atas parut lama yang berhenti sembuh.'),
  ] });
  void level;
  return S;
}
