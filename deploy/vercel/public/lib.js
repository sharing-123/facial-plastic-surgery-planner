/* Client-side port of markings.py, the ellipse/Z-plasty geometry of wound_planner.py and surgical_planner.py.
   Runs entirely in the browser (and in Node for the parity tests). No network access, no photo ever leaves the device.
   RESEARCH PROTOTYPE: decision support only; the surgeon decides. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FP = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const FAV = 30, UNFAV = 60, ELLIPSE_LW = 3.5, ELLIPSE_MAX_FACTOR = 2.0;
  const Z_GAIN = { 30: 25, 45: 50, 60: 75 };
  const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, s) => [a[0] * s, a[1] * s];
  const norm = a => Math.hypot(a[0], a[1]);
  const r1 = x => Math.round(x * 10) / 10;

  function diff(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
  function arc(Q) { const cum = [0], d = []; for (let i = 0; i < Q.length - 1; i++) { const l = norm(sub(Q[i + 1], Q[i])); d.push(l); cum.push(cum[i] + l); } return { cum, d }; }
  function pointAt(Q, s) {
    const { cum, d } = arc(Q); s = Math.min(Math.max(s, 0), cum[cum.length - 1]);
    let i = 0; while (i < cum.length - 2 && cum[i + 1] <= s) i++;
    const t = d[i] > 0 ? (s - cum[i]) / d[i] : 0; const p = add(Q[i], mul(sub(Q[i + 1], Q[i]), t));
    const tan = mul(sub(Q[i + 1], Q[i]), 1 / Math.max(d[i], 1e-9)); return { p, tan };
  }
  function bisectionOrder(n) {
    const order = [], queue = [[0, n - 1]];
    while (queue.length) { const [lo, hi] = queue.shift(); if (lo > hi) continue; const mid = Math.floor((lo + hi) / 2); order.push(mid); queue.push([lo, mid - 1], [mid + 1, hi]); }
    const rank = new Array(n).fill(0); order.forEach((idx, r) => { rank[idx] = r + 1; }); return rank;
  }
  function sutureGuide(Q, spacing = 4, bite = 3) {
    const L = arc(Q).cum.slice(-1)[0]; const n = Math.max(1, Math.round(L / spacing)); const step = L / n; const rank = bisectionOrder(n);
    return Array.from({ length: n }, (_, i) => { const s = (i + 0.5) * step; const { p, tan } = pointAt(Q, s); const nrm = [-tan[1], tan[0]];
      return { index: i + 1, order: rank[i], centre: p, a: add(p, mul(nrm, bite)), b: sub(p, mul(nrm, bite)), arc_mm: r1(s) }; });
  }
  function zPlasty(p1, p2, alpha) {
    const v = sub(p2, p1), L = norm(v), u = mul(v, 1 / L), al = rad(alpha);
    const rot = a => [Math.cos(a) * u[0] - Math.sin(a) * u[1], Math.sin(a) * u[0] + Math.cos(a) * u[1]];
    return { central: [p1, p2], arm_1: [p1, add(p1, mul(rot(al), L))], arm_2: [p2, add(p2, mul(rot(-al), L))], limb_mm: r1(L), gain_percent: Z_GAIN[Math.abs(alpha)] };
  }
  function zSeries(Q, alpha = 60, limb = 15, maxN = 6) {
    const L = arc(Q).cum.slice(-1)[0]; const n = Math.min(maxN, Math.max(1, Math.round(L / limb))); const out = [];
    for (let i = 0; i < n; i++) out.push(zPlasty(pointAt(Q, L * i / n).p, pointAt(Q, L * (i + 1) / n).p, i % 2 === 0 ? alpha : -alpha));
    return out;
  }
  function wPlasty(Q, limb = 6) {
    const L = arc(Q).cum.slice(-1)[0], h = limb * Math.sin(rad(60)); const lines = [];
    for (const [sign, shift] of [[1, 0], [-1, 0.5]]) {
      const pts = []; let i = 0;
      for (;;) { const s = (i + shift) * limb; if (s > L) break; const { p, tan } = pointAt(Q, s); const nrm = [-tan[1], tan[0]]; pts.push(i % 2 === 1 ? add(p, mul(nrm, sign * h)) : p); i++; }
      lines.push([pointAt(Q, 0).p, ...pts, pointAt(Q, L).p]);
    }
    return lines;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gblc(Q, seed = 7, seg = [5, 9], amp = [2.5, 5]) {   // irregular broken line (own PRNG; shape differs from the Python version, properties are the same)
    const rnd = mulberry(seed), L = arc(Q).cum.slice(-1)[0]; const pts = [pointAt(Q, 0).p]; let s = 0, side = 1;
    while (s < L - 3) { s = Math.min(L, s + seg[0] + rnd() * (seg[1] - seg[0])); const { p, tan } = pointAt(Q, s); const nrm = [-tan[1], tan[0]]; pts.push(s < L ? add(p, mul(nrm, side * (amp[0] + rnd() * (amp[1] - amp[0])))) : p); side *= -1; }
    pts.push(pointAt(Q, L).p); return pts;
  }
  function ellipseFor(p1, p2, axisDeg, k = ELLIPSE_LW) {
    const c = mul(add(p1, p2), 0.5), d = 0.5 * norm(sub(p2, p1)); if (d < 1e-6) return { c, a: 0, b: 0, factor: 1 };
    const ang = deg(Math.atan2(p2[1] - p1[1], p2[0] - p1[0])); const th = rad(diff(ang, axisDeg));
    const a = d * Math.sqrt(Math.cos(th) ** 2 + (k * Math.sin(th)) ** 2); return { c, a, b: a / k, factor: a / d };
  }
  function ellipsePoints(c, a, b, axisDeg, n = 90) {
    const r = rad(axisDeg); return Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / (n - 1), x = a * Math.cos(t), y = b * Math.sin(t);
      return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]; });
  }
  /* geometry from a wound polyline in millimetres (x right, y UP) and a clinician-set RSTL angle (0 = horizontal) */
  function geometry(Qmm, rstlDeg, region = 'cheek') {
    const L = arc(Qmm).cum.slice(-1)[0], chord = norm(sub(Qmm[Qmm.length - 1], Qmm[0]));
    const ang = ((deg(Math.atan2(Qmm[Qmm.length - 1][1] - Qmm[0][1], Qmm[Qmm.length - 1][0] - Qmm[0][0])) % 180) + 180) % 180;
    const dd = diff(ang, rstlDeg); const e = ellipseFor(Qmm[0], Qmm[Qmm.length - 1], rstlDeg);
    return { length_mm: r1(L), chord_mm: r1(chord), tortuosity: chord > 0 ? Math.round(L / chord * 100) / 100 : null, regions_crossed: [region],
      mean_angle_to_rstl_deg: r1(dd), alignment: dd <= FAV ? 'favourable' : dd >= UNFAV ? 'unfavourable' : 'intermediate', critical_borders: [],
      elliptical_excision: { axis_deg: r1(rstlDeg), half_length_mm: r1(e.a), half_width_mm: r1(e.b), length_to_width: ELLIPSE_LW, tissue_sacrifice_factor_vs_wound_half_length: Math.round(e.factor * 100) / 100 } };
  }
  /* shape of a filled polygon (clinician contour), in mm: area, principal extents, elongation, solidity */
  function shapeOf(polyMm) {
    const n = polyMm.length; let A = 0, cx = 0, cy = 0; for (let i = 0; i < n; i++) { const [x0, y0] = polyMm[i], [x1, y1] = polyMm[(i + 1) % n]; const cr = x0 * y1 - x1 * y0; A += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr; }
    A /= 2; if (Math.abs(A) < 1e-9) return null; cx /= 6 * A; cy /= 6 * A; A = Math.abs(A);
    let sxx = 0, sxy = 0, syy = 0; polyMm.forEach(p => { const x = p[0] - cx, y = p[1] - cy; sxx += x * x; sxy += x * y; syy += y * y; });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), u = [Math.cos(th), Math.sin(th)], v = [-u[1], u[0]];
    const pr = (a) => polyMm.map(p => (p[0] - cx) * a[0] + (p[1] - cy) * a[1]); const pu = pr(u), pv = pr(v);
    const major = Math.max(...pu) - Math.min(...pu), minor = Math.max(...pv) - Math.min(...pv);
    const hull = convexHull(polyMm); let H = 0; for (let i = 0; i < hull.length; i++) { const [x0, y0] = hull[i], [x1, y1] = hull[(i + 1) % hull.length]; H += x0 * y1 - x1 * y0; } H = Math.abs(H) / 2;
    const elong = major / Math.max(minor, 1e-6), solidity = H > 0 ? A / H : 0;
    return { area_mm2: r1(A), major_mm: r1(major), minor_mm: r1(minor), elongation: Math.round(elong * 100) / 100, solidity: Math.round(solidity * 100) / 100, linear: elong >= 2.5 && solidity >= 0.6 };
  }
  function convexHull(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  /* ---------------- surgical planner (port of surgical_planner.plan) ---------------- */
  const REGION_ID = { forehead: 'dahi', glabella: 'glabela', brow: 'alis', periorbital: 'periorbital (kelopak dan sekitar mata)', nose: 'hidung', lip: 'bibir', perioral: 'perioral', chin: 'dagu', cheek: 'pipi', outside_face_oval: 'tepi wajah (rahang, telinga, pelipis)' };
  const REGION_RULES = {
    'alis': { flags: [], points: ['Jangan mencukur alis; tepi luka jangan dipotong tegak lurus, ikuti arah rambut (potong sejajar folikel).', 'Jahitan pertama pada tepi alis untuk mensejajarkan garis rambut.'] },
    'periorbital (kelopak dan sekitar mata)': { flags: ['Periksa bola mata, tepi kelopak, levator, dan sistem lakrimal (kanalikulus) sebelum penutupan; cedera dekat kantus medial atau menembus tepi kelopak perlu penanganan khusus.', 'Kulit kelopak sangat tipis dan tegang; hindari eksisi kulit berlebihan (risiko ektropion).'], points: ['Kulit kelopak umumnya 6-0 atau 7-0 monofilamen; lepas 3 sampai 5 hari.', 'Penutupan tepi kelopak berlapis (tarsus, tepi bulu mata) oleh yang berpengalaman.'] },
    'hidung': { flags: ['Bila tulang rawan terlihat: tutup perikondrium atau kulit di atasnya; hindari jahitan menembus tulang rawan tanpa indikasi.', 'Periksa hematoma septum pada trauma hidung.'], points: ['Sejajarkan tepi alar dan batas unit estetik (dorsum, sidewall, alar, tip) sebelum jahitan lain.'] },
    'bibir': { flags: ['Luka menembus (through-and-through): tutup tiga lapis (mukosa, otot orbikularis oris, kulit).'], points: ['Jahitan pertama tepat di batas vermilion (garis putih); ketidaksejajaran sekitar 1 mm sudah terlihat.', 'Otot orbikularis dijahit dengan absorbable 4-0 atau 5-0 sebelum kulit.'] },
    'pipi': { flags: ['Laserasi pipi lateral yang dalam: periksa fungsi gerak wajah SEBELUM anestesi dan eksplorasi duktus parotis (garis dari tragus ke tengah bibir atas) bila dalam.'], points: [] },
    'perioral': { flags: [], points: ['Perhatikan batas vermilion dan sudut mulut; sudut mulut perlu penyejajaran presisi.'] },
    'dahi': { flags: ['Laserasi dahi dalam atau dengan kelainan tulang teraba: pertimbangkan pencitraan (fraktur sinus frontal).'], points: ['Garis RSTL dahi horizontal; laserasi vertikal cenderung melebar bila tegang.'] },
    'glabela': { flags: [], points: ['Garis RSTL glabela vertikal; laserasi horizontal di sini sejajar RSTL.'] },
    'dagu': { flags: ['Laserasi dagu pada anak: pertimbangkan cedera tulang dagu dan gigi.'], points: [] },
    'tepi wajah (rahang, telinga, pelipis)': { flags: ['Tepi wajah: periksa cabang marginal mandibula dan temporal N. VII bila dalam.'], points: [] },
  };
  const FLAPS = { nose: ['flap bilobed (defek kecil di ujung atau ala)', 'flap nasolabial', 'cangkok kulit penuh (preaurikular atau retroaurikular)'], cheek: ['flap kemajuan atau rotasi (servikofasial untuk defek lebih besar)', 'flap transposisi rhomboid (Limberg)', 'cangkok kulit penuh'], lip: ['flap Abbe atau Estlander untuk defek bibir lebih dari sepertiga', 'penutupan baji (wedge) untuk defek kecil', 'flap Karapandzic'], periorbital: ['flap Tenzel atau cangkok kulit penuh sesuai lamela yang hilang', 'flap Hughes untuk kelopak bawah'], forehead: ['flap kemajuan atau rotasi lokal', 'cangkok kulit penuh'], chin: ['flap kemajuan atau transposisi lokal'], brow: ['flap kemajuan lokal dengan penyejajaran rambut'], glabella: ['flap rotasi atau transposisi lokal'] };
  function plan(report, ctx) {
    const kind = ctx.kind || 'laserasi_baru', mech = ctx.mechanism || 'tajam', depth = ctx.depth || 'tidak_diketahui', contam = ctx.contamination || 'bersih', loss = ctx.tissue_loss || 'tidak';
    const hours = +ctx.hours || 0, scarType = ctx.scar_type || 'linear_melebar', scarMonths = +ctx.scar_months || 0, age = (ctx.age_years === null || ctx.age_years === undefined || ctx.age_years === '') ? null : +ctx.age_years;
    const crossed = report.regions_crossed && report.regions_crossed.length ? report.regions_crossed : ['cheek'];
    const regionKey = ['lip', 'periorbital', 'nose', 'brow', 'perioral'].find(r => crossed.includes(r)) || crossed[0];
    const region = REGION_ID[regionKey] || regionKey, L = report.length_mm, ang = report.mean_angle_to_rstl_deg;
    const flags = [], notes = [], techniques = []; let prep = []; let marking = ['suture_guide'];
    const rr = REGION_RULES[region] || { flags: [], points: [] };
    if (kind === 'laserasi_baru') {
      if (depth === 'otot_fascia' || depth === 'tulang_tulang_rawan') flags.push('Struktur dalam terlibat (otot, fasia, tulang rawan atau tulang): eksplorasi dan penutupan berlapis; pertimbangkan pencitraan untuk fraktur.');
      if (depth === 'tidak_diketahui') notes.push('Kedalaman belum diisi. Foto tidak dapat menunjukkan kedalaman; eksplorasi luka sebelum menentukan penutupan.');
      if (mech === 'gigitan') flags.push('Luka gigitan: irigasi banyak; pertimbangkan profilaksis antibiotik dan evaluasi rabies dan tetanus; penutupan primer pada wajah umumnya dapat dilakukan setelah irigasi bila tidak ada infeksi atau kontaminasi berat.');
      if (mech === 'tumpul_remuk') notes.push('Cedera tumpul atau remuk: tepi sering tidak viable dan memar; debridemen seminimal mungkin dan rencanakan kemungkinan revisi.');
      if (contam === 'berat' || hours > 24) flags.push('Kontaminasi berat atau lebih dari sekitar 24 jam: pertimbangkan penutupan tertunda atau penutupan longgar setelah debridemen dan irigasi.');
      if (loss === 'bermakna') flags.push('Kehilangan jaringan bermakna: jangan memaksa penutupan dengan tegangan; rencanakan flap atau cangkok kulit.');
      flags.push(...rr.flags);
      prep = ['Foto dan ukur sebelum tindakan (skala di gambar).', 'Status tetanus dan riwayat alergi anestesi.', 'Anestesi lokal; irigasi banyak dengan larutan fisiologis; debridemen seminimal mungkin pada wajah.', 'Periksa fungsi saraf wajah, gerak bola mata, gigitan, dan sensasi sebelum anestesi bila relevan.'];
    } else {
      prep = ['Dokumentasi foto standar dan pengukuran sebelum rencana revisi.', 'Tentukan keluhan utama (fungsi, kontraktur, estetik) dan harapan pasien.'];
      if (scarMonths && scarMonths < 6) notes.push(`Parut berusia ${+scarMonths.toPrecision(12)} bulan: umumnya revisi ditunda sampai parut matang (sekitar 6 sampai 12 bulan), kecuali ada kontraktur yang mengganggu fungsi.`);
    }
    const linear = report.linear !== false;
    if (!linear) notes.push(`Lesi tidak linear (elongasi ${report.elongation ?? '?'}, solidity ${report.solidity ?? '?'}): garis jahitan, garis tengah, Z-plasty dan W-plasty tidak dapat dibuat otomatis. Gunakan kontur dan ukuran; marking ditentukan ahli bedah.`);
    const ell = report.elliptical_excision, ellOk = ell.tissue_sacrifice_factor_vs_wound_half_length <= ELLIPSE_MAX_FACTOR;
    const ellSize = `Elips sekitar ${Math.round(2 * ell.half_length_mm)} x ${Math.round(2 * ell.half_width_mm)} mm, sumbu ${Math.round(ell.axis_deg)} derajat.`;
    if (!linear && !['keloid', 'hipertrofik'].includes(scarType)) {
      techniques.push({ nama: 'Lesi tidak linear: marking manual oleh ahli bedah', peringkat: 1, alasan: 'Bentuk bercabang, melebar atau berlobus: marking otomatis berbasis garis tengah tidak valid. Kontur dan ukuran tersedia untuk perencanaan eksisi fusiform, flap atau cangkok.', marking: [] }); marking = [];
    } else if (kind === 'laserasi_baru') {
      if (loss === 'bermakna') { techniques.push({ nama: 'Rekonstruksi defek (flap lokal atau cangkok kulit)', peringkat: 1, alasan: 'Kehilangan jaringan bermakna: penutupan primer akan menimbulkan tegangan dan distorsi.', pilihan_per_region: FLAPS[regionKey] || ['flap lokal sesuai unit estetik', 'cangkok kulit penuh bila flap tidak memadai'], marking: [] }); marking = []; }
      else techniques.push({ nama: 'Penutupan primer berlapis', peringkat: 1, alasan: `Luka segar dengan tepi viable; sudut terhadap RSTL ${Math.round(ang)} derajat.`, marking: ['suture_guide'] });
      if (loss === 'kecil' && !ellOk) notes.push(`Eksisi elips tidak disarankan: luka ${Math.round(ang)} derajat terhadap RSTL membuat elips sejajar RSTL menjadi ${Math.round(2 * ell.half_length_mm)} mm, jauh lebih panjang dari luka. Gunakan undermining dan penutupan tanpa tegangan; revisi (Z-plasty, W-plasty, geometric broken line) menyusul bila parut melebar.`);
      if (loss === 'kecil' && ellOk) { techniques.push({ nama: 'Undermining dan eksisi elips minimal (rasio panjang:lebar 3 sampai 4:1, sudut apeks maksimal 30 derajat)', peringkat: 2, alasan: 'Kehilangan kecil atau tepi tidak viable: ubah menjadi elips sejajar RSTL.', ukuran: ellSize, marking: ['ellipse'] }); marking.push('ellipse'); }
      if (ang >= 60 && loss !== 'bermakna') notes.push(`Luka hampir tegak lurus terhadap RSTL (${Math.round(ang)} derajat): risiko parut melebar. Pada luka segar yang bersih tetap tutup primer dengan penutupan tanpa tegangan; revisi parut (elips, Z-plasty, W-plasty atau geometric broken line) dipertimbangkan setelah parut matang bila melebar.`);
      if (report.critical_borders && report.critical_borders.length) notes.push(`Luka menyentuh atau melintasi landmark kritis (${report.critical_borders.map(c => c.structure).join(', ')}): jahitan pertama pada landmark itu untuk penyejajaran.`);
    } else if (scarType === 'kontraktur_web') {
      techniques.push({ nama: 'Z-plasty', peringkat: 1, alasan: 'Parut kontraktur atau berbentuk web memerlukan pemanjangan dan reorientasi.', ukuran: 'Sudut 60 derajat memberi pertambahan panjang teoretis sekitar 75% (45 derajat sekitar 50%, 30 derajat sekitar 25%). Panjang lengan sama dengan lengan tengah.', marking: ['z_plasty'] }); marking.push('z_plasty');
    } else if (scarType === 'keloid') { techniques.push({ nama: 'Terapi non-bedah dahulu (injeksi steroid intralesi, silikon, tekanan)', peringkat: 1, alasan: 'Eksisi saja pada keloid berisiko kambuh tinggi; eksisi hanya sebagai bagian terapi kombinasi yang diputuskan spesialis.', marking: [] }); marking = [];
    } else if (scarType === 'hipertrofik') { techniques.push({ nama: 'Silikon, tekanan, injeksi steroid; revisi bedah bila tegang atau menghalangi fungsi', peringkat: 1, alasan: 'Parut hipertrofik tetap di dalam batas luka awal; revisi hanya bila perlu dan setelah matang.', marking: [] }); marking = [];
    } else if (scarType === 'cekung') { techniques.push({ nama: 'Subsisi atau pengisi, atau eksisi elips dan penutupan berlapis', peringkat: 1, alasan: 'Parut cekung karena perlekatan atau hilangnya volume.', marking: ellOk ? ['ellipse'] : [] }); marking = ellOk ? ['ellipse'] : [];
    } else {
      if (L >= 30 && ang >= 30) {
        techniques.push({ nama: 'W-plasty atau geometric broken line', peringkat: 1, alasan: `Parut panjang (${Math.round(L)} mm) yang melintasi RSTL (${Math.round(ang)} derajat): memecah garis lurus agar kurang terlihat.`, ukuran: 'W-plasty: gigi segitiga sama sisi 5 sampai 7 mm; geometric broken line: segmen 5 sampai 9 mm dengan sudut acak.', marking: ['w_plasty', 'gblc'] }); marking = ['w_plasty', 'gblc'];
        if (ellOk) { techniques.push({ nama: 'Eksisi elips dan penutupan ulang sepanjang RSTL', peringkat: 2, alasan: 'Alternatif sederhana bila parut pendek atau pasien menolak pola zig-zag.', ukuran: ellSize, marking: ['ellipse'] }); marking.push('ellipse'); }
      } else if (ang >= 30 && !ellOk) { techniques.push({ nama: 'Z-plasty', peringkat: 1, alasan: `Parut (${Math.round(L)} mm) hampir tegak lurus RSTL (${Math.round(ang)} derajat): elips sejajar RSTL akan ${Math.round(2 * ell.half_length_mm)} mm dan membuang terlalu banyak kulit; Z-plasty mereorientasi tanpa membuang kulit.`, ukuran: 'Sudut 60 derajat: pertambahan panjang teoretis sekitar 75%.', marking: ['z_plasty'] }); marking = ['z_plasty'];
      } else if (ang >= 30) { techniques.push({ nama: 'Eksisi elips dan penutupan ulang sepanjang RSTL', peringkat: 1, alasan: `Parut pendek (${Math.round(L)} mm) dan tidak sejajar RSTL (${Math.round(ang)} derajat): reorientasi ke garis tegangan kulit.`, ukuran: ellSize, marking: ['ellipse'] }); marking = ['ellipse', 'suture_guide']; techniques.push({ nama: 'Z-plasty', peringkat: 2, alasan: 'Bila perlu reorientasi dan sedikit pemanjangan tanpa membuang kulit.', ukuran: 'Sudut 60 derajat: pertambahan panjang teoretis sekitar 75%.', marking: ['z_plasty'] });
      } else { techniques.push({ nama: 'Observasi, perawatan parut, atau eksisi sederhana dan penutupan ulang', peringkat: 1, alasan: `Parut sudah sejajar RSTL (${Math.round(ang)} derajat); keuntungan revisi bedah terbatas.`, marking: [] }); marking = ['suture_guide']; }
      if (!ellOk && ell.tissue_sacrifice_factor_vs_wound_half_length > ELLIPSE_MAX_FACTOR) notes.push('Elips menjadi panjang karena parut jauh dari sumbu RSTL: banyak kulit terbuang; pertimbangkan Z-plasty atau W-plasty, atau bertahap.');
    }
    const primary = techniques.length ? techniques[0].nama : '';
    const startsAny = (s, arr) => arr.some(p => s.startsWith(p));
    const noSutures = !linear || startsAny(primary, ['Observasi', 'Terapi non-bedah', 'Silikon', 'Lesi tidak linear']) || (kind === 'parut' && !marking.includes('suture_guide') && !techniques.some(t => startsAny(t.nama, ['Eksisi', 'Z-plasty', 'W-plasty'])));
    if (noSutures) marking = marking.filter(m => m !== 'suture_guide');
    let sut = null;
    if ((marking.length || kind === 'laserasi_baru') && !noSutures) {
      let skin = '6-0 monofilamen non-absorbable (mis. nilon atau polipropilen), jahitan terputus sederhana atau jelujur';
      if (age !== null && age < 12) skin = '5-0 atau 6-0 absorbable cepat (mis. fast-absorbing gut), mengurangi kebutuhan lepas jahitan pada anak';
      if (regionKey === 'periorbital') skin = '6-0 atau 7-0 monofilamen';
      const layers = [{ lapis: 'Dalam (dermis dalam, bila ada tegangan)', bahan: 'absorbable 4-0 atau 5-0 (mis. poliglaktin atau poliglekaprol), simpul terbenam (buried)', tujuan: 'Menghilangkan tegangan pada kulit dan mengevertkan tepi sedikit.' }, { lapis: 'Kulit', bahan: skin, tujuan: 'Penyejajaran tepi tepat; tusukan 2 sampai 3 mm dari tepi, simpul tidak terlalu erat.' }];
      if (regionKey === 'lip') layers.unshift({ lapis: 'Mukosa (bila menembus)', bahan: 'absorbable 5-0', tujuan: 'Penutupan mukosa; kemudian otot orbikularis.' });
      sut = { lapisan: layers, jarak_antar_jahitan_kulit_mm: 4, perkiraan_jumlah_jahitan_kulit: Math.max(1, Math.round(L / 4)), jarak_antar_jahitan_dalam_mm: 7, perkiraan_jumlah_jahitan_dalam: Math.max(1, Math.round(L / 7)),
        urutan: 'Jahitan pertama di landmark kritis (batas vermilion, tepi alis, rim alar, garis rambut) atau di tengah luka; lalu belah dua (halving) segmen yang tersisa agar tepi sejajar tanpa dog-ear.', lepas_jahitan: regionKey === 'periorbital' ? '3 sampai 5 hari (kelopak)' : '5 sampai 7 hari (wajah)', catatan_wilayah: rr.points };
    }
    techniques.sort((a, b) => a.peringkat - b.peringkat);
    return { wilayah: region, jenis: kind, peringatan_merah: flags, persiapan: prep, teknik: techniques, rencana_jahitan: sut, marking_layers: [...new Set(marking)],
      perawatan_lanjutan: ['Perawatan luka dan tabir surya pada parut selama minimal 6 sampai 12 bulan.', 'Silikon topikal atau pita setelah epitelisasi pada parut berisiko.', 'Evaluasi parut pada 6 dan 12 bulan; revisi dipertimbangkan setelah parut matang.'], catatan: notes,
      hal_yang_tidak_diketahui_dari_foto: ['Foto tidak menunjukkan kedalaman, vaskularisasi, kontaminasi, serta cedera saraf atau tulang.', 'Arah RSTL pada alat adalah pendekatan; periksa terhadap peta baku atau garis yang Anda gambar sendiri.', 'Ukuran milimeter berasal dari skala iris atau kalibrasi manual pada foto 2D; permukaan melengkung menyebabkan distorsi.'],
      status: 'Dukungan keputusan berbasis aturan, belum divalidasi terhadap ahli bedah. Ahli bedah memutuskan.' };
  }
  /* ---------------- surgeon agreement metrics (port of surgeon_compare) ---------------- */
  function lineAngle(p1, p2) { return ((deg(Math.atan2(p2[1] - p1[1], p2[0] - p1[0])) % 180) + 180) % 180; }
  function hungarian(cost) {            // small O(n^3) assignment for matching sutures (n <= ~60)
    const n = cost.length, m = cost[0].length, N = Math.max(n, m), a = Array.from({ length: N + 1 }, (_, i) => Array.from({ length: N + 1 }, (_, j) => (i && j && i <= n && j <= m) ? cost[i - 1][j - 1] : 0));
    const u = new Array(N + 1).fill(0), v = new Array(N + 1).fill(0), p = new Array(N + 1).fill(0), way = new Array(N + 1).fill(0);
    for (let i = 1; i <= N; i++) { p[0] = i; let j0 = 0; const minv = new Array(N + 1).fill(Infinity), used = new Array(N + 1).fill(false);
      do { used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0; for (let j = 1; j <= N; j++) if (!used[j]) { const cur = a[i0][j] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
        for (let j = 0; j <= N; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; j0 = j1; } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0); }
    const out = []; for (let j = 1; j <= N; j++) if (p[j] && p[j] <= n && j <= m) out.push([p[j] - 1, j - 1]); return out;
  }
  function matchSutures(tool, surg, ppm) {
    if (!tool.length || !surg.length) return { n_tool: tool.length, n_surgeon: surg.length, count_difference: surg.length - tool.length, matched: 0, median_distance_mm: null, max_distance_mm: null, mean_distance_mm: null };
    const D = tool.map(a => surg.map(b => Math.hypot(a[0] - b[0], a[1] - b[1]) / ppm)); const pairs = hungarian(D); const d = pairs.map(([i, j]) => D[i][j]).sort((x, y) => x - y);
    const med = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
    return { n_tool: tool.length, n_surgeon: surg.length, count_difference: surg.length - tool.length, matched: d.length, median_distance_mm: Math.round(med * 100) / 100, max_distance_mm: Math.round(d[d.length - 1] * 100) / 100, mean_distance_mm: Math.round(d.reduce((s, x) => s + x, 0) / d.length * 100) / 100 };
  }
  return { diff, arc, pointAt, bisectionOrder, sutureGuide, zPlasty, zSeries, wPlasty, gblc, ellipseFor, ellipsePoints, geometry, shapeOf, plan, lineAngle, matchSutures, hungarian, convexHull };
});
