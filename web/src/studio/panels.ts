import { lang, num, t } from '../i18n';
import { CLIN_QUESTIONS, DX_NAME, type L2 } from '../clinical/classify';
import { REFERENCES } from '../clinical/face';
import type { Msg } from '../clinical/planner';
import { STAGE_COUNT, type SurgeryMode } from './surgery3d';
import { state } from './store';

export const T = (en: string, id: string): string => (lang() === 'id' ? id : en);
export const pick = (o: L2): string => { const s = o[lang()]; return lang() === 'id' ? s.replace(/(\d)\.(\d)/g, '$1,$2') : s; };
export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const msg = (m: Msg): string => esc(t(m.k, m.p).replace(/(\d)\.(\d)/g, lang() === 'id' ? '$1,$2' : '$1.$2'));

const GATE_TEXT: Record<string, L2> = {
  no_face: { en: 'No face was detected. Use a frontal photograph with the whole face in view.', id: 'Wajah tidak terdeteksi. Pakai foto frontal dengan seluruh wajah terlihat.' },
  degenerate: { en: 'The face geometry is not plausible.', id: 'Geometri wajah tidak masuk akal.' },
  yaw: { en: 'The head is turned to the side; repeat facing the camera.', id: 'Kepala menoleh ke samping; ulangi menghadap lurus.' },
  roll: { en: 'The head is tilted sideways; straighten it.', id: 'Kepala miring ke samping; luruskan.' },
  pitch: { en: 'The head is tilted up or down, or landmarks are off; repeat with the chin level.', id: 'Kepala menengadah atau menunduk, atau titik meleset; ulangi dengan dagu sejajar.' },
  pitch_soft: { en: 'The vertical head position is slightly off.', id: 'Posisi kepala vertikal agak miring.' },
  small: { en: 'The face is too small in the picture; move closer or use a higher resolution.', id: 'Wajah terlalu kecil di gambar; dekatkan kamera atau pakai resolusi lebih tinggi.' },
  small_soft: { en: 'The face is small in the picture; numbers will be less precise.', id: 'Wajah agak kecil di gambar; angka kurang presisi.' },
  aspect: { en: 'The landmark shape is not plausible (covered face, mask, distortion, or a bad fit).', id: 'Bentuk titik wajah tidak masuk akal (tertutup, masker, distorsi, atau titik meleset).' },
  iris_small: { en: 'The iris is too small to calibrate millimetres.', id: 'Iris terlalu kecil untuk kalibrasi skala mm.' },
  iris_small_soft: { en: 'The iris is small; the millimetre scale is less reliable.', id: 'Iris kecil; skala mm kurang andal.' },
  scale: { en: 'Iris size is not plausible against eye width; the millimetre scale cannot be trusted.', id: 'Ukuran iris tidak wajar terhadap lebar mata; skala mm tidak dapat dipercaya.' },
  scale_marginal: { en: 'The iris looks small or large for the eye width (squint, drooping lid, head down); the scale is less reliable.', id: 'Iris tampak kecil atau besar terhadap lebar mata (menyipit, kelopak turun, kepala menunduk); skala kurang andal.' },
  eyes_closed: { en: 'Both eyes are closed or nearly closed; the iris scale is unreliable. Use eyes open, looking straight.', id: 'Kedua mata tertutup atau hampir tertutup; skala iris tidak andal. Foto harus mata terbuka menatap lurus.' },
  eye_narrow: { en: 'One eye is narrow: this may be a real finding (ptosis, lagophthalmos) or a squint; confirm.', id: 'Satu mata sempit: bisa temuan nyata (ptosis, lagoftalmos) atau menyipit; konfirmasi.' },
  mouth: { en: 'The mouth is open; ask the patient to close the lips (neutral expression).', id: 'Mulut terbuka; minta pasien merapatkan bibir (ekspresi netral).' },
  cropped: { en: 'The face is cut off at the edge of the picture.', id: 'Wajah terpotong di tepi gambar.' },
  blur: { en: 'The image is blurred; repeat with better focus and light.', id: 'Gambar buram; ulangi dengan fokus dan cahaya lebih baik.' },
  exposure: { en: 'The lighting is too dark or too bright.', id: 'Pencahayaan terlalu gelap atau terang.' },
};

export function gateHtml(): string {
  const g = state.gate;
  if (!g) return '';
  const cls = g.status === 'PASS' ? 'ok' : g.status === 'PASS_WITH_WARNINGS' ? 'warn' : 'bad';
  const label = g.status === 'PASS' ? T('Fit to measure', 'Layak diukur') : g.status === 'PASS_WITH_WARNINGS' ? T('Measurable, with warnings', 'Bisa diukur, dengan peringatan') : T('Cannot assess this photo', 'Foto ini tidak bisa dinilai');
  const items = [...g.failures, ...g.warnings].map(i => `<li>${esc(pick(GATE_TEXT[i.code] ?? { en: i.code, id: i.code }))}</li>`).join('');
  return `<div class="chip ${cls}">${label}</div>${items ? `<ul class="plain">${items}</ul>` : ''}<p class="fine">${T('Thresholds are screening values, not validated cut-offs. A pass does not prove the numbers are right.', 'Ambang adalah nilai penyaring, bukan batas klinis tervalidasi. Lolos bukan bukti angka benar.')}</p>`;
}

export function scaleHtml(): string {
  if (!state.frame) return '';
  const manual = state.ppm != null;
  return `<div class="kv"><span>${T('Scale', 'Skala')}</span><b>${num(state.frame.scale, 2)} px/mm</b></div>
  <p class="fine">${manual ? T('Manual calibration from a length you marked.', 'Kalibrasi manual dari panjang yang Anda tandai.') : T('From the iris (11.7 mm, about ±5%). Without a reference object on the skin this is an estimate; curved surfaces distort it.', 'Dari iris (11,7 mm, sekitar ±5%). Tanpa benda acuan di kulit ini hanya perkiraan; permukaan melengkung menyebabkan distorsi.')}</p>
  <button class="btn ghost small" data-act="calibrate">${T('Calibrate with a known length', 'Kalibrasi dengan panjang yang diketahui')}</button>${manual ? `<button class="btn ghost small" data-act="scale-reset">${T('Back to iris scale', 'Kembali ke skala iris')}</button>` : ''}`;
}

const REF_L2: Record<string, L2> = {
  middle_to_lower_third: { en: 'canon 1.0 (glabella-subnasale : subnasale-menton)', id: 'kanon 1,0 (glabela-subnasale : subnasale-menton)' },
  upper_lip_to_lower_face: { en: 'canon 1:2 (subnasale-stomion : stomion-menton)', id: 'kanon 1:2 (subnasale-stomion : stomion-menton)' },
  alar_to_intercanthal: { en: 'canon about 1.0', id: 'kanon sekitar 1,0' }, eye_width_to_intercanthal: { en: 'canon about 1.0', id: 'kanon sekitar 1,0' },
  mouth_to_alar: { en: 'commonly cited about 1.5', id: 'umum dikutip sekitar 1,5' }, lower_to_upper_vermilion: { en: 'commonly cited 1.5 to 1.6; varies with ethnicity and age', id: 'umum dikutip 1,5 sampai 1,6; bervariasi menurut etnis dan usia' },
  bigonial_to_bizygomatic: { en: 'no universal canon; for tracking change', id: 'tidak ada kanon universal; untuk memantau perubahan' },
};

export function proportionsHtml(): string {
  const p = state.props;
  if (!p) return '';
  const r = p.ratios;
  const row = (label: string, v: number | null, ref?: string, canon?: number): string => {
    const dev = v != null && canon ? Math.abs(v - canon) / canon : 0;
    const bar = canon && v != null ? `<i class="dev" style="--d:${Math.min(1, dev * 2.5).toFixed(2)}"></i>` : '';
    return `<tr><td>${label}</td><td class="n">${v == null ? '-' : num(v, 2)}</td><td class="ref">${ref ? esc(pick(REF_L2[ref] ?? { en: '', id: '' })) : ''} ${bar}</td></tr>`;
  };
  const L = p.lengths;
  return `<table class="tbl"><tbody>
  ${row(T('Middle : lower third', 'Sepertiga tengah : bawah'), r.middle_to_lower_third, 'middle_to_lower_third', 1)}
  ${row(T('Upper lip : lower face', 'Bibir atas : wajah bawah'), r.upper_lip_to_lower_face, 'upper_lip_to_lower_face', 0.5)}
  ${row(T('Alar : intercanthal', 'Alar : interkantal'), r.alar_to_intercanthal, 'alar_to_intercanthal', 1)}
  ${row(T('Mouth : alar', 'Mulut : alar'), r.mouth_to_alar, 'mouth_to_alar', 1.5)}
  ${row(T('Lower : upper vermilion', 'Vermilion bawah : atas'), r.lower_to_upper_vermilion, 'lower_to_upper_vermilion', 1.55)}
  ${row(T('Bigonial : bizygomatic', 'Bigonial : bizigomatik'), r.bigonial_to_bizygomatic, 'bigonial_to_bizygomatic')}
  </tbody></table>
  <div class="kv"><span>${T('Bizygomatic width', 'Lebar bizigomatik')}</span><b>${num(L.bizygomatic_width, 1)} mm</b></div>
  <div class="kv"><span>${T('Face height (glabella to menton)', 'Tinggi wajah (glabela ke menton)')}</span><b>${num(L.face_height, 1)} mm</b></div>
  <div class="kv"><span>${T('Nasal index', 'Indeks hidung')}</span><b>${num(p.nose.index, 1)} (${esc(p.nose.klass)})</b></div>
  <div class="kv"><span>${T('Canthal tilt', 'Kemiringan kantus')}</span><b>${num(p.tilt.left, 1)}° / ${num(p.tilt.right, 1)}°</b></div>
  <div class="kv"><span>${T('Mean mirror asymmetry', 'Rerata asimetri cermin')}</span><b>${num(p.mirror.mean, 1)} mm</b></div>
  <p class="fine">${T('Colour and bars show distance from a cited canon, not a verdict. Canons differ by sex, age and ethnicity. Neoclassical canons and Martin and Saller nasal classes are descriptive, not targets.', 'Warna dan batang menunjukkan jarak dari kanon yang dikutip, bukan vonis. Kanon berbeda menurut jenis kelamin, usia, dan etnis. Kanon neoklasik dan kelas hidung Martin dan Saller bersifat deskriptif, bukan target.')} <span class="mono">${esc(REFERENCES.fifths_each)}</span></p>`;
}

export function findingsHtml(): string {
  const c = state.cls, les = state.lesion;
  if (!c || !les) return `<p class="muted">${T('Tap the lesion in the photo. The outline, size, differential and plan fill in on their own.', 'Ketuk lesi di foto. Kontur, ukuran, diagnosis banding, dan rencana terisi sendiri.')}</p>`;
  const top = c.differential[0];
  const tier = c.malignancy.tier;
  const rows = c.differential.map(d => `<div class="dx"><div class="dxh"><span>${esc(pick(DX_NAME[d.id]))}</span><b>${Math.round(d.share * 100)}%</b></div><i class="bar" style="--w:${(d.share * 100).toFixed(0)}%"></i>${d.why.length ? `<small>${esc([...new Set(d.why.map(pick))].slice(0, 3).join('; '))}</small>` : ''}</div>`).join('');
  const qs = CLIN_QUESTIONS.map(q => `<label class="check"><input type="checkbox" data-clin="${q.key}" ${state.clin[q.key] ? 'checked' : ''}><span>${esc(pick(q.q))}</span></label>`).join('');
  return `<div class="dxmain"><h3>${esc(pick(DX_NAME[top.id]))}, ${esc(pick(c.siteName))}</h3><p>${esc(pick(c.grade))}</p><p class="mono">${esc(pick(c.one))}</p>
  <p class="tag-est">${T('Size and depth are estimates from a 2D photograph. Depth cannot be measured from a photo; the range shows how uncertain it is.', 'Ukuran dan kedalaman adalah perkiraan dari foto 2D. Kedalaman tidak bisa diukur dari foto; kisaran menunjukkan ketidakpastiannya.')}</p></div>
  <h4>${T('Differential, ranked', 'Diagnosis banding, berperingkat')}</h4>${rows}
  <h4>${T('Malignancy screen', 'Skrining keganasan')} <span class="chip ${tier === 'high' ? 'bad' : tier === 'intermediate' ? 'warn' : 'ok'}">${tier === 'high' ? T('high', 'tinggi') : tier === 'intermediate' ? T('intermediate', 'sedang') : T('low', 'rendah')}</span></h4>
  ${c.hold ? `<div class="banner bad">${T('Biopsy first. Do not reconstruct, graft or flap until histology is back.', 'Biopsi dulu. Jangan rekonstruksi, cangkok, atau flap sebelum histologi keluar.')}</div>` : ''}
  ${c.malignancy.reasons.length ? `<ul class="plain">${c.malignancy.reasons.map(r => `<li>${esc(pick(r))}</li>`).join('')}</ul>` : `<p class="muted">${T('No warning features found. A photograph still cannot exclude malignancy.', 'Tidak ada tanda peringatan. Foto tetap tidak dapat menyingkirkan keganasan.')}</p>`}
  ${c.malignancy.neoplasm.length ? `<h5>${T('Possible neoplasms', 'Kemungkinan tumor')}</h5>${c.malignancy.neoplasm.map(n => `<p><b>${esc(pick(n.name))}</b><br><small>${esc(pick(n.why))}</small></p>`).join('')}` : ''}
  <details class="qs" open><summary>${T('Optional questions that change the ranking', 'Pertanyaan opsional yang mengubah peringkat')}</summary>${qs}</details>`;
}

const STAGE_TEXT: Record<SurgeryMode, Array<[string, string]>> = {
  closure: [['Marking', 'Penandaan'], ['Incision', 'Insisi'], ['Undermining', 'Undermining'], ['Excision', 'Eksisi'], ['Deep sutures', 'Jahitan dalam'], ['Dermal closure', 'Penutupan dermis'], ['Skin sutures', 'Jahitan kulit'], ['Dressing', 'Dressing']],
  z: [['Marking', 'Penandaan'], ['Incision', 'Insisi'], ['Undermining', 'Undermining'], ['Swap the flaps', 'Tukar flap'], ['Deep sutures', 'Jahitan dalam'], ['Dermal closure', 'Penutupan dermis'], ['Skin sutures', 'Jahitan kulit'], ['Dressing', 'Dressing']],
  defect: [['Marking', 'Penandaan'], ['Incision', 'Insisi'], ['Prepare the bed', 'Siapkan dasar'], ['Place graft or flap', 'Letakkan cangkok atau flap'], ['Anchor sutures', 'Jahitan penambat'], ['Seal the edge', 'Rapatkan tepi'], ['Edge sutures', 'Jahitan tepi'], ['Negative pressure dressing', 'Dressing tekanan negatif']],
  none: [['Marking', 'Penandaan'], ['Topical treatment', 'Terapi topikal'], ['No incision', 'Tanpa insisi'], ['No excision', 'Tanpa eksisi'], ['No sutures', 'Tanpa jahitan'], ['No closure', 'Tanpa penutupan'], ['Review', 'Evaluasi'], ['Silicone sheet', 'Lembar silikon']],
};
const STAGE_BODY: Record<SurgeryMode, Array<[string, string]>> = {
  closure: [
    ['Draw the planned ellipse and the suture guide on the skin.', 'Gambar elips rencana dan panduan jahitan di kulit.'],
    ['Incise along the marked lines through the dermis. The edges open slightly.', 'Insisi sepanjang garis tanda sampai dermis. Tepi terbuka sedikit.'],
    ['Lift the skin edges off the fat so they can meet without tension.', 'Angkat tepi kulit dari lemak agar bertemu tanpa tegangan.'],
    ['Remove the ellipse of skin and scar; the fat layer shows in the gap.', 'Angkat elips kulit dan parut; lapisan lemak terlihat di celah.'],
    ['Buried absorbable sutures draw the dermis together; the gap narrows.', 'Jahitan terbenam absorbable menarik dermis; celah menyempit.'],
    ['The dermis is closed; the skin edges now meet along one line.', 'Dermis tertutup; tepi kulit kini bertemu pada satu garis.'],
    ['Skin sutures align the surface edges, bites 2 to 3 mm from the edge.', 'Jahitan kulit menyejajarkan tepi permukaan, tusukan 2 sampai 3 mm dari tepi.'],
    ['Cover with adhesive strips or a light dressing.', 'Tutup dengan plester strip atau dressing ringan.'],
  ],
  z: [
    ['Draw the central limb and the two arms at the planned angle.', 'Gambar lengan tengah dan dua lengan samping pada sudut rencana.'],
    ['Incise all three limbs.', 'Insisi ketiga lengan.'],
    ['Undermine both triangular flaps so they move freely.', 'Undermining kedua flap segitiga agar bergerak bebas.'],
    ['Swap the two flaps; the central limb turns and lengthens.', 'Tukar kedua flap; lengan tengah berputar dan memanjang.'],
    ['Buried sutures set the flap tips.', 'Jahitan terbenam menetapkan ujung flap.'],
    ['Close the dermis along the new line.', 'Tutup dermis sepanjang garis baru.'],
    ['Skin sutures along the three limbs.', 'Jahitan kulit sepanjang ketiga lengan.'],
    ['Cover with adhesive strips or a light dressing.', 'Tutup dengan plester strip atau dressing ringan.'],
  ],
  defect: [
    ['Mark the defect with a margin.', 'Tandai defek dengan margin.'],
    ['Incise along the margin.', 'Insisi sepanjang margin.'],
    ['Prepare a clean, bleeding bed; remove dead tissue.', 'Siapkan dasar bersih dan berdarah; angkat jaringan mati.'],
    ['Place the graft or flap in the defect.', 'Letakkan cangkok atau flap pada defek.'],
    ['Anchor with tacking sutures.', 'Tambatkan dengan jahitan tack.'],
    ['Seal the edge circumferentially.', 'Rapatkan tepi secara melingkar.'],
    ['Place the final edge sutures.', 'Pasang jahitan tepi akhir.'],
    ['Negative pressure: foam over the graft, clear drape over the foam, tube to the pump.', 'Tekanan negatif: busa di atas cangkok, drape bening di atas busa, selang ke pompa.'],
  ],
  none: [
    ['The planned lines are marked for reference only.', 'Garis rencana ditandai hanya sebagai acuan.'],
    ['Silicone or the topical treatment starts; nothing is cut.', 'Silikon atau terapi topikal dimulai; tidak ada yang dipotong.'],
    ['No incision in this plan.', 'Tidak ada insisi pada rencana ini.'], ['No excision in this plan.', 'Tidak ada eksisi pada rencana ini.'],
    ['No sutures in this plan.', 'Tidak ada jahitan pada rencana ini.'], ['No closure step.', 'Tidak ada langkah penutupan.'],
    ['Review at 6 and 12 months.', 'Evaluasi pada 6 dan 12 bulan.'], ['Silicone sheet over the scar.', 'Lembar silikon di atas parut.'],
  ],
};
export const stageTitle = (mode: SurgeryMode, i: number): string => T(...STAGE_TEXT[mode][Math.min(i, STAGE_COUNT - 1)]);
export const stageBody = (mode: SurgeryMode, i: number): string => T(...STAGE_BODY[mode][Math.min(i, STAGE_COUNT - 1)]);

export function planHtml(mode: SurgeryMode, stage: number): string {
  const p = state.plan, r = state.report;
  if (!p || !r) return `<p class="muted">${T('The plan appears once a lesion is outlined.', 'Rencana muncul setelah lesi dikonturkan.')}</p>`;
  const c = state.ctx;
  const sel = (id: string, opts: Array<[string, string, string]>, cur: string) => `<select data-ctx="${id}">${opts.map(([v, en, idn]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${T(en, idn)}</option>`).join('')}</select>`;
  const form = `<details class="ctxf"><summary>${T('Clinical context the photo cannot show', 'Konteks klinis yang tidak terlihat di foto')}</summary>
  <label>${T('Type', 'Jenis')}${sel('kind', [['laceration', 'Fresh laceration', 'Laserasi baru'], ['scar', 'Scar', 'Parut']], c.kind)}</label>
  ${c.kind === 'laceration' ? `<label>${T('Mechanism', 'Mekanisme')}${sel('mechanism', [['sharp', 'Sharp', 'Tajam'], ['blunt', 'Blunt or crush', 'Tumpul atau remuk'], ['bite', 'Bite', 'Gigitan']], c.mechanism)}</label>
  <label>${T('Depth', 'Kedalaman')}${sel('depth', [['unknown', 'Not known', 'Belum diketahui'], ['skin', 'Skin only', 'Kulit saja'], ['muscle', 'Muscle or fascia', 'Otot atau fasia'], ['bone', 'Cartilage or bone', 'Tulang rawan atau tulang']], c.depth)}</label>
  <label>${T('Contamination', 'Kontaminasi')}${sel('contamination', [['clean', 'Clean', 'Bersih'], ['heavy', 'Heavy', 'Berat']], c.contamination)}</label>
  <label>${T('Tissue loss', 'Kehilangan jaringan')}${sel('tissueLoss', [['none', 'None', 'Tidak ada'], ['small', 'Small', 'Kecil'], ['major', 'Significant', 'Bermakna']], c.tissueLoss)}</label>
  <label>${T('Hours since injury', 'Jam sejak cedera')}<input type="number" min="0" max="999" data-ctx="hours" value="${c.hours}"></label>`
    : `<label>${T('Scar type', 'Jenis parut')}${sel('scarType', [['widened', 'Linear, widened', 'Linear melebar'], ['contracture', 'Contracture or web', 'Kontraktur atau web'], ['keloid', 'Keloid', 'Keloid'], ['hypertrophic', 'Hypertrophic', 'Hipertrofik'], ['depressed', 'Depressed', 'Cekung']], c.scarType)}</label>
  <label>${T('Scar age (months)', 'Usia parut (bulan)')}<input type="number" min="0" max="999" data-ctx="scarMonths" value="${c.scarMonths}"></label>`}
  <label>${T('Age (years)', 'Usia (tahun)')}<input type="number" min="0" max="110" data-age value="${state.age ?? ''}"></label>
  <label>${T('RSTL direction (override, degrees)', 'Arah RSTL (ganti manual, derajat)')}<input type="number" min="0" max="179" data-rstl value="${state.rstlDeg ?? ''}" placeholder="${num(r.axis, 0)}"></label></details>`;
  const meas = `<div class="kv"><span>${T('Wound length', 'Panjang luka')}</span><b>${num(r.lengthMm, 1)} mm</b></div>
  <div class="kv"><span>${T('Mean angle to RSTL', 'Sudut rerata terhadap RSTL')}</span><b>${num(r.meanAngle, 0)}° (${r.alignment === 'favourable' ? T('favourable', 'menguntungkan') : r.alignment === 'unfavourable' ? T('unfavourable', 'kurang menguntungkan') : T('intermediate', 'sedang')})</b></div>
  <div class="kv"><span>${T('Ellipse', 'Elips')}</span><b>${num(2 * r.ellipse.halfLengthMm, 0)} x ${num(2 * r.ellipse.halfWidthMm, 0)} mm</b></div>
  ${r.critical.length ? `<div class="kv"><span>${T('Critical landmarks', 'Landmark kritis')}</span><b>${esc(r.critical.map(x => x.structure).join(', '))}</b></div>` : ''}
  <p class="fine">${r.rstlSource === 'override' ? T('RSTL set by you.', 'RSTL ditetapkan oleh Anda.') : T('RSTL come from a coarse rule-based approximation, not a measured field.', 'RSTL berasal dari pendekatan kasar berbasis aturan, bukan medan terukur.')}</p>`;
  const list = (title: string, items: Msg[], cls = '') => items.length ? `<h5>${title}</h5><ul class="plain ${cls}">${items.map(m => `<li>${msg(m)}</li>`).join('')}</ul>` : '';
  const techs = p.techniques.map(tq => `<div class="tech"><b>${tq.rank}. ${msg(tq.name)}</b><p>${msg(tq.why)}</p>${tq.size ? `<p class="mono">${msg(tq.size)}</p>` : ''}${tq.options ? `<ul class="plain">${tq.options.map(o => `<li>${msg(o)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  const s = p.sutures;
  const sut = s ? `<h5>${T('Layered suture plan', 'Rencana jahitan berlapis')}</h5>${s.layers.map(l => `<p><b>${msg(l.layer)}</b>: ${msg(l.material)}<br><small>${msg(l.purpose)}</small></p>`).join('')}
  <div class="kv"><span>${T('Skin sutures (every 4 mm)', 'Jahitan kulit (tiap 4 mm)')}</span><b>~${s.skinCount}</b></div><div class="kv"><span>${T('Deep sutures (every 7 mm)', 'Jahitan dalam (tiap 7 mm)')}</span><b>~${s.deepCount}</b></div>
  <p>${msg(s.order)}</p><div class="kv"><span>${T('Removal', 'Lepas jahitan')}</span><b>${msg(s.removal)}</b></div>${list('', s.regionPoints)}` : `<p class="muted">${T('No suture plan for this technique.', 'Tidak ada rencana jahitan untuk teknik ini.')}</p>`;
  const steps = Array.from({ length: STAGE_COUNT }, (_, i) => `<li class="${i === stage ? 'on' : ''}" data-stage="${i}"><b>${stageTitle(mode, i)}</b><span>${stageBody(mode, i)}</span></li>`).join('');
  return `${form}${meas}<h4>${T('Techniques, ranked', 'Teknik, berperingkat')}</h4>${techs}${sut}
  <h4>${T('Steps, in step with the 3D view', 'Langkah, sinkron dengan tampilan 3D')}</h4><ol class="steps2">${steps}</ol>
  ${list(T('Red flags', 'Peringatan merah'), p.flags, 'alert')}${list(T('Before the procedure', 'Sebelum tindakan'), p.prep)}${list(T('Notes', 'Catatan'), p.notes)}${list(T('Aftercare', 'Perawatan lanjutan'), p.aftercare)}${list(T('What the photo cannot tell', 'Yang tidak bisa dilihat dari foto'), p.unknowns)}
  <p class="fine">${T('Rule-based decision support, not validated against surgeons. The surgeon decides.', 'Dukungan keputusan berbasis aturan, belum divalidasi terhadap dokter bedah. Dokter bedah memutuskan.')}</p>`;
}

export function managementHtml(): string {
  const c = state.cls;
  if (!c) return `<p class="muted">${T('Management appears once a lesion is outlined.', 'Tata laksana muncul setelah lesi dikonturkan.')}</p>`;
  const lv = c.setting.level;
  const sections = c.sections.map(s => `<div class="sec ${s.tone ?? ''}"><h5>${esc(pick(s.title))}</h5><ul class="plain">${s.items.map(i => `<li>${esc(pick(i))}</li>`).join('')}</ul></div>`).join('');
  return `<div class="level ${lv}"><b>${esc(pick(c.setting.label))}</b><ul class="plain">${c.setting.why.map(w => `<li>${esc(pick(w))}</li>`).join('')}</ul></div>${sections}
  <p class="fine">${T('Written for a clinician. Limits: a photograph cannot show depth, vascularity, contamination or malignancy.', 'Ditulis untuk dokter. Batas: foto tidak dapat menunjukkan kedalaman, vaskularisasi, kontaminasi, atau keganasan.')}</p>`;
}
