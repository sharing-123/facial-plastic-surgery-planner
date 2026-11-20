"""Rule-based repair planning for facial wounds and scars (decision SUPPORT for a surgeon).

Input: the measured geometry (wound_planner.plan or geometry_noface) and the clinical context the
photograph cannot show (mechanism, depth, contamination, tissue loss, hours, scar type and age).
Output: red flags, preparation checklist, a ranked closure/technique list with the reason for each, a
layered suture plan with counts, and which marking layers to draw.

WHAT THIS IS: an encoding of commonly taught principles (RSTL alignment, aesthetic-unit respect, layered
closure, 3-4:1 fusiform excision, Z-plasty gain table, W-plasty and geometric broken line for long scars,
timing of scar revision). Materials, sizes and removal days are typical textbook values, not orders.
WHAT THIS IS NOT: a consultant. It cannot see depth, vascularity, contamination, bone or nerve injury
from a photo, it has not been validated against surgeons, and the surgeon always decides. Every
recommendation carries the measured value or the stated context it came from, so it can be checked.
"""
import math

ELLIPSE_MAX_FACTOR = 2.0   # ellipse half-length over wound half-length; above this too much skin is discarded

REGION_ID = {"forehead": "dahi", "glabella": "glabela", "brow": "alis", "periorbital": "periorbital (kelopak dan sekitar mata)",
             "nose": "hidung", "lip": "bibir", "perioral": "perioral", "chin": "dagu", "cheek": "pipi",
             "outside_face_oval": "tepi wajah (rahang, telinga, pelipis)"}

# per-region cautions and technical points (textbook level)
REGION_RULES = {
    "alis": {"flags": [], "points": ["Jangan mencukur alis; tepi luka jangan dipotong tegak lurus, ikuti arah rambut (potong sejajar folikel).",
                                     "Jahitan pertama pada tepi alis untuk mensejajarkan garis rambut."]},
    "periorbital (kelopak dan sekitar mata)": {
        "flags": ["Periksa bola mata, tepi kelopak, levator, dan sistem lakrimal (kanalikulus) sebelum penutupan; cedera dekat kantus medial atau menembus tepi kelopak perlu penanganan khusus.",
                  "Kulit kelopak sangat tipis dan tegang; hindari eksisi kulit berlebihan (risiko ektropion)."],
        "points": ["Kulit kelopak umumnya 6-0 atau 7-0 monofilamen; lepas 3 sampai 5 hari.",
                   "Penutupan tepi kelopak berlapis (tarsus, tepi bulu mata) oleh yang berpengalaman."]},
    "hidung": {"flags": ["Bila tulang rawan terlihat: tutup perikondrium atau kulit di atasnya; hindari jahitan menembus tulang rawan tanpa indikasi.",
                         "Periksa hematoma septum pada trauma hidung."],
               "points": ["Sejajarkan tepi alar dan batas unit estetik (dorsum, sidewall, alar, tip) sebelum jahitan lain."]},
    "bibir": {"flags": ["Luka menembus (through-and-through): tutup tiga lapis (mukosa, otot orbikularis oris, kulit)."],
              "points": ["Jahitan pertama tepat di batas vermilion (garis putih); ketidaksejajaran sekitar 1 mm sudah terlihat.",
                         "Otot orbikularis dijahit dengan absorbable 4-0 atau 5-0 sebelum kulit."]},
    "pipi": {"flags": ["Laserasi pipi lateral yang dalam: periksa fungsi gerak wajah SEBELUM anestesi dan eksplorasi duktus parotis (garis dari tragus ke tengah bibir atas) bila dalam."],
             "points": []},
    "perioral": {"flags": [], "points": ["Perhatikan batas vermilion dan sudut mulut; sudut mulut perlu penyejajaran presisi."]},
    "dahi": {"flags": ["Laserasi dahi dalam atau dengan kelainan tulang teraba: pertimbangkan pencitraan (fraktur sinus frontal)."],
             "points": ["Garis RSTL dahi horizontal; laserasi vertikal cenderung melebar bila tegang."]},
    "glabela": {"flags": [], "points": ["Garis RSTL glabela vertikal; laserasi horizontal di sini sejajar RSTL."]},
    "dagu": {"flags": ["Laserasi dagu pada anak: pertimbangkan cedera tulang dagu dan gigi."], "points": []},
    "tepi wajah (rahang, telinga, pelipis)": {"flags": ["Tepi wajah: periksa cabang marginal mandibula dan temporal N. VII bila dalam."], "points": []},
}


def geometry_noface(points_px, ppm, rstl_deg, region="cheek"):
    """Wound geometry when no face is detected: length, angle to a clinician-set RSTL direction, ellipse and Z-plasty.
    Axes are image axes (0 = horizontal) with y up; no region logic, borders unknown."""
    import numpy as np
    import wound_planner as wp

    Q = np.asarray(points_px, float) / ppm
    Q[:, 1] *= -1
    length = float(sum(np.linalg.norm(b - a) for a, b in zip(Q[:-1], Q[1:])))
    chord = float(np.linalg.norm(Q[-1] - Q[0]))
    ang = math.degrees(math.atan2(Q[-1][1] - Q[0][1], Q[-1][0] - Q[0][0])) % 180
    dd = wp._diff(ang, rstl_deg)
    ec, a, b, tissue = wp.ellipse_for(Q[0], Q[-1], rstl_deg)
    return {"length_mm": round(length, 1), "chord_mm": round(chord, 1), "tortuosity": round(length / chord, 2) if chord > 0 else None,
            "regions_crossed": [region], "mean_angle_to_rstl_deg": round(dd, 1),
            "alignment": ("favourable (near parallel to RSTL)" if dd <= wp.FAV else "unfavourable (near perpendicular to RSTL)" if dd >= wp.UNFAV else "intermediate"),
            "critical_borders": [], "rstl_source": "clinician override (no face detected)",
            "elliptical_excision": {"axis_deg": round(rstl_deg, 1), "half_length_mm": round(a, 1), "half_width_mm": round(b, 1),
                                    "length_to_width": wp.ELLIPSE_LW_RATIO, "tissue_sacrifice_factor_vs_wound_half_length": round(tissue, 2)},
            "no_face": True}


def _suture_numbers(length_mm, spacing=4.0, deep_spacing=7.0):
    half_up = lambda x: int(math.floor(x + 0.5))             # half-up rounding (Python's round() is half-to-even), same as the JS port
    return {"jarak_antar_jahitan_kulit_mm": spacing, "perkiraan_jumlah_jahitan_kulit": max(1, half_up(length_mm / spacing)),
            "jarak_antar_jahitan_dalam_mm": deep_spacing, "perkiraan_jumlah_jahitan_dalam": max(1, half_up(length_mm / deep_spacing))}


def plan(report, ctx):
    """report: geometry dict; ctx: clinician-entered context. Returns a plan dict."""
    kind = ctx.get("kind", "laserasi_baru")
    mech = ctx.get("mechanism", "tajam")
    depth = ctx.get("depth", "tidak_diketahui")
    contam = ctx.get("contamination", "bersih")
    loss = ctx.get("tissue_loss", "tidak")
    hours = float(ctx.get("hours", 0) or 0)
    scar_type = ctx.get("scar_type", "linear_melebar")
    scar_months = float(ctx.get("scar_months", 0) or 0)
    age = ctx.get("age_years")
    crossed = report.get("regions_crossed") or ["cheek"]
    # the most delicate region crossed decides the region-specific rules (lip and eyelid before general skin)
    region_key = next((r for r in ("lip", "periorbital", "nose", "brow", "perioral") if r in crossed), crossed[0])
    region = REGION_ID.get(region_key, region_key)
    L = float(report["length_mm"])
    ang = float(report["mean_angle_to_rstl_deg"])
    why = lambda s: s
    flags, prep, techniques, notes, layers = [], [], [], [], []
    marking = ["suture_guide"]
    rr = REGION_RULES.get(region, {"flags": [], "points": []})

    # ---- red flags -------------------------------------------------------------------------------
    if kind == "laserasi_baru":
        if depth in ("otot_fascia", "tulang_tulang_rawan"):
            flags.append("Struktur dalam terlibat (otot, fasia, tulang rawan atau tulang): eksplorasi dan penutupan berlapis; pertimbangkan pencitraan untuk fraktur.")
        if depth == "tidak_diketahui":
            notes.append("Kedalaman belum diisi. Foto tidak dapat menunjukkan kedalaman; eksplorasi luka sebelum menentukan penutupan.")
        if mech == "gigitan":
            flags.append("Luka gigitan: irigasi banyak; pertimbangkan profilaksis antibiotik dan evaluasi rabies dan tetanus; penutupan primer pada wajah umumnya dapat dilakukan setelah irigasi bila tidak ada infeksi atau kontaminasi berat.")
        if mech == "tumpul_remuk":
            notes.append("Cedera tumpul atau remuk: tepi sering tidak viable dan memar; debridemen seminimal mungkin dan rencanakan kemungkinan revisi.")
        if contam == "berat" or hours > 24:
            flags.append("Kontaminasi berat atau lebih dari sekitar 24 jam: pertimbangkan penutupan tertunda atau penutupan longgar setelah debridemen dan irigasi.")
        if loss == "bermakna":
            flags.append("Kehilangan jaringan bermakna: jangan memaksa penutupan dengan tegangan; rencanakan flap atau cangkok kulit.")
        flags += rr["flags"]
        prep = ["Foto dan ukur sebelum tindakan (skala di gambar).", "Status tetanus dan riwayat alergi anestesi.",
                "Anestesi lokal; irigasi banyak dengan larutan fisiologis; debridemen seminimal mungkin pada wajah.",
                "Periksa fungsi saraf wajah, gerak bola mata, gigitan, dan sensasi sebelum anestesi bila relevan."]
    else:
        prep = ["Dokumentasi foto standar dan pengukuran sebelum rencana revisi.",
                "Tentukan keluhan utama (fungsi, kontraktur, estetik) dan harapan pasien."]
        if scar_months and scar_months < 6:
            notes.append(f"Parut berusia {scar_months:g} bulan: umumnya revisi ditunda sampai parut matang (sekitar 6 sampai 12 bulan), kecuali ada kontraktur yang mengganggu fungsi.")

    linear = report.get("linear", True)
    if not linear:
        notes.append(f"Lesi tidak linear (elongasi {report.get('elongation', '?')}, solidity {report.get('solidity', '?')}): garis jahitan, garis tengah, Z-plasty dan W-plasty tidak dapat dibuat otomatis. Gunakan kontur dan ukuran; marking ditentukan ahli bedah.")

    # ---- technique ranking -----------------------------------------------------------------------
    ell = report["elliptical_excision"]
    ell_ok = ell["tissue_sacrifice_factor_vs_wound_half_length"] <= ELLIPSE_MAX_FACTOR      # else the ellipse would be impractically long
    if not linear and scar_type not in ("keloid", "hipertrofik"):
        techniques.append({"nama": "Lesi tidak linear: marking manual oleh ahli bedah", "peringkat": 1,
                           "alasan": "Bentuk bercabang, melebar atau berlobus: marking otomatis berbasis garis tengah tidak valid. Kontur dan ukuran tersedia untuk perencanaan eksisi fusiform, flap atau cangkok.", "marking": []})
        marking = []
    elif kind == "laserasi_baru":
        if loss == "bermakna":
            techniques.append({"nama": "Rekonstruksi defek (flap lokal atau cangkok kulit)", "peringkat": 1,
                               "alasan": "Kehilangan jaringan bermakna: penutupan primer akan menimbulkan tegangan dan distorsi.",
                               "pilihan_per_region": _flap_options(region_key), "marking": []})
            marking = []
        else:
            techniques.append({"nama": "Penutupan primer berlapis", "peringkat": 1,
                               "alasan": f"Luka segar dengan tepi viable; sudut terhadap RSTL {ang:.0f} derajat.",
                               "marking": ["suture_guide"]})
        if loss == "kecil" and not ell_ok:
            notes.append(f"Eksisi elips tidak disarankan: luka {ang:.0f} derajat terhadap RSTL membuat elips sejajar RSTL menjadi {2 * ell['half_length_mm']:.0f} mm, jauh lebih panjang dari luka. Gunakan undermining dan penutupan tanpa tegangan; revisi (Z-plasty, W-plasty, geometric broken line) menyusul bila parut melebar.")
        if loss == "kecil" and ell_ok:
            techniques.append({"nama": "Undermining dan eksisi elips minimal (rasio panjang:lebar 3 sampai 4:1, sudut apeks maksimal 30 derajat)",
                               "peringkat": 2, "alasan": "Kehilangan kecil atau tepi tidak viable: ubah menjadi elips sejajar RSTL.",
                               "ukuran": f"Elips sekitar {2 * ell['half_length_mm']:.0f} x {2 * ell['half_width_mm']:.0f} mm, sumbu {ell['axis_deg']:.0f} derajat.",
                               "marking": ["ellipse"]})
            marking.append("ellipse")
        if ang >= 60 and loss != "bermakna":
            notes.append(f"Luka hampir tegak lurus terhadap RSTL ({ang:.0f} derajat): risiko parut melebar. Pada luka segar yang bersih tetap tutup primer dengan penutupan tanpa tegangan; revisi parut (elips, Z-plasty, W-plasty atau geometric broken line) dipertimbangkan setelah parut matang bila melebar.")
        if report.get("critical_borders"):
            names = ", ".join(c["structure"] for c in report["critical_borders"])
            notes.append(f"Luka menyentuh atau melintasi landmark kritis ({names}): jahitan pertama pada landmark itu untuk penyejajaran.")
    else:
        if scar_type == "kontraktur_web":
            techniques.append({"nama": "Z-plasty", "peringkat": 1,
                               "alasan": "Parut kontraktur atau berbentuk web memerlukan pemanjangan dan reorientasi.",
                               "ukuran": "Sudut 60 derajat memberi pertambahan panjang teoretis sekitar 75% (45 derajat sekitar 50%, 30 derajat sekitar 25%). Panjang lengan sama dengan lengan tengah.",
                               "marking": ["z_plasty"]})
            marking.append("z_plasty")
        elif scar_type in ("keloid",):
            techniques.append({"nama": "Terapi non-bedah dahulu (injeksi steroid intralesi, silikon, tekanan)", "peringkat": 1,
                               "alasan": "Eksisi saja pada keloid berisiko kambuh tinggi; eksisi hanya sebagai bagian terapi kombinasi yang diputuskan spesialis.",
                               "marking": []})
            marking = []
        elif scar_type == "hipertrofik":
            techniques.append({"nama": "Silikon, tekanan, injeksi steroid; revisi bedah bila tegang atau menghalangi fungsi", "peringkat": 1,
                               "alasan": "Parut hipertrofik tetap di dalam batas luka awal; revisi hanya bila perlu dan setelah matang.", "marking": []})
            marking = []
        elif scar_type == "cekung":
            techniques.append({"nama": "Subsisi atau pengisi, atau eksisi elips dan penutupan berlapis", "peringkat": 1,
                               "alasan": "Parut cekung karena perlekatan atau hilangnya volume.", "marking": ["ellipse"] if ell_ok else []})
            marking = ["ellipse"] if ell_ok else []
        else:   # linear melebar / trapdoor / lain
            if L >= 30 and ang >= 30:
                techniques.append({"nama": "W-plasty atau geometric broken line", "peringkat": 1,
                                   "alasan": f"Parut panjang ({L:.0f} mm) yang melintasi RSTL ({ang:.0f} derajat): memecah garis lurus agar kurang terlihat.",
                                   "ukuran": "W-plasty: gigi segitiga sama sisi 5 sampai 7 mm; geometric broken line: segmen 5 sampai 9 mm dengan sudut acak.",
                                   "marking": ["w_plasty", "gblc"]})
                marking = ["w_plasty", "gblc"]
                if ell_ok:
                    techniques.append({"nama": "Eksisi elips dan penutupan ulang sepanjang RSTL", "peringkat": 2,
                                       "alasan": "Alternatif sederhana bila parut pendek atau pasien menolak pola zig-zag.",
                                       "ukuran": f"Elips sekitar {2 * ell['half_length_mm']:.0f} x {2 * ell['half_width_mm']:.0f} mm, sumbu {ell['axis_deg']:.0f} derajat.", "marking": ["ellipse"]})
                    marking.append("ellipse")
            elif ang >= 30 and not ell_ok:
                techniques.append({"nama": "Z-plasty", "peringkat": 1,
                                   "alasan": f"Parut ({L:.0f} mm) hampir tegak lurus RSTL ({ang:.0f} derajat): elips sejajar RSTL akan {2 * ell['half_length_mm']:.0f} mm dan membuang terlalu banyak kulit; Z-plasty mereorientasi tanpa membuang kulit.",
                                   "ukuran": "Sudut 60 derajat: pertambahan panjang teoretis sekitar 75%.", "marking": ["z_plasty"]})
                marking = ["z_plasty"]
            elif ang >= 30:
                techniques.append({"nama": "Eksisi elips dan penutupan ulang sepanjang RSTL", "peringkat": 1,
                                   "alasan": f"Parut pendek ({L:.0f} mm) dan tidak sejajar RSTL ({ang:.0f} derajat): reorientasi ke garis tegangan kulit.",
                                   "ukuran": f"Elips sekitar {2 * ell['half_length_mm']:.0f} x {2 * ell['half_width_mm']:.0f} mm, sumbu {ell['axis_deg']:.0f} derajat.", "marking": ["ellipse"]})
                marking = ["ellipse", "suture_guide"]
                techniques.append({"nama": "Z-plasty", "peringkat": 2, "alasan": "Bila perlu reorientasi dan sedikit pemanjangan tanpa membuang kulit.",
                                   "ukuran": "Sudut 60 derajat: pertambahan panjang teoretis sekitar 75%.", "marking": ["z_plasty"]})
            else:
                techniques.append({"nama": "Observasi, perawatan parut, atau eksisi sederhana dan penutupan ulang", "peringkat": 1,
                                   "alasan": f"Parut sudah sejajar RSTL ({ang:.0f} derajat); keuntungan revisi bedah terbatas.", "marking": []})
                marking = ["suture_guide"]
        if linear and scar_type not in ("kontraktur_web", "keloid", "hipertrofik", "cekung") and not ell_ok:
            notes.append("Elips menjadi panjang karena parut jauh dari sumbu RSTL: banyak kulit terbuang; pertimbangkan Z-plasty atau W-plasty, atau bertahap.")

    # ---- layered suture plan ---------------------------------------------------------------------
    primary = techniques[0]["nama"] if techniques else ""
    no_sutures = (not linear) or primary.startswith(("Observasi", "Terapi non-bedah", "Silikon", "Lesi tidak linear")) or (kind == "parut" and "suture_guide" not in marking and not any(
        t["nama"].startswith(("Eksisi", "Z-plasty", "W-plasty")) for t in techniques))
    if no_sutures:
        marking = [m for m in marking if m not in ("suture_guide",)]
    if (marking or kind == "laserasi_baru") and not no_sutures:
        skin = "6-0 monofilamen non-absorbable (mis. nilon atau polipropilen), jahitan terputus sederhana atau jelujur"
        if age is not None and float(age) < 12:
            skin = "5-0 atau 6-0 absorbable cepat (mis. fast-absorbing gut), mengurangi kebutuhan lepas jahitan pada anak"
        if region_key == "periorbital":
            skin = "6-0 atau 7-0 monofilamen"
        layers = [{"lapis": "Dalam (dermis dalam, bila ada tegangan)", "bahan": "absorbable 4-0 atau 5-0 (mis. poliglaktin atau poliglekaprol), simpul terbenam (buried)",
                   "tujuan": "Menghilangkan tegangan pada kulit dan mengevertkan tepi sedikit."},
                  {"lapis": "Kulit", "bahan": skin, "tujuan": "Penyejajaran tepi tepat; tusukan 2 sampai 3 mm dari tepi, simpul tidak terlalu erat."}]
        if region_key == "lip":
            layers.insert(0, {"lapis": "Mukosa (bila menembus)", "bahan": "absorbable 5-0", "tujuan": "Penutupan mukosa; kemudian otot orbikularis."})
    removal = "3 sampai 5 hari (kelopak)" if region_key == "periorbital" else "5 sampai 7 hari (wajah)"
    sut = None if no_sutures else {"lapisan": layers, **_suture_numbers(L), "urutan": "Jahitan pertama di landmark kritis (batas vermilion, tepi alis, rim alar, garis rambut) atau di tengah luka; lalu belah dua (halving) segmen yang tersisa agar tepi sejajar tanpa dog-ear.",
           "lepas_jahitan": removal, "catatan_wilayah": rr["points"]}

    aftercare = ["Perawatan luka dan tabir surya pada parut selama minimal 6 sampai 12 bulan.", "Silikon topikal atau pita setelah epitelisasi pada parut berisiko.",
                 "Evaluasi parut pada 6 dan 12 bulan; revisi dipertimbangkan setelah parut matang."]
    unknowns = ["Foto tidak menunjukkan kedalaman, vaskularisasi, kontaminasi, serta cedera saraf atau tulang.",
                "Arah RSTL pada alat adalah pendekatan; periksa terhadap peta baku atau garis yang Anda gambar sendiri.",
                "Ukuran milimeter berasal dari skala iris atau kalibrasi manual pada foto 2D; permukaan melengkung menyebabkan distorsi."]
    return {"wilayah": region, "jenis": kind, "peringatan_merah": flags, "persiapan": prep, "teknik": sorted(techniques, key=lambda t: t["peringkat"]),
            "rencana_jahitan": sut, "marking_layers": list(dict.fromkeys(marking)), "perawatan_lanjutan": aftercare,
            "catatan": notes, "hal_yang_tidak_diketahui_dari_foto": unknowns,
            "status": "Dukungan keputusan berbasis aturan, belum divalidasi terhadap ahli bedah. Ahli bedah memutuskan."}


def _flap_options(region_key):
    t = {"nose": ["flap bilobed (defek kecil di ujung atau ala)", "flap nasolabial", "cangkok kulit penuh (preaurikular atau retroaurikular)"],
         "cheek": ["flap kemajuan atau rotasi (servikofasial untuk defek lebih besar)", "flap transposisi rhomboid (Limberg)", "cangkok kulit penuh"],
         "lip": ["flap Abbe atau Estlander untuk defek bibir lebih dari sepertiga", "penutupan baji (wedge) untuk defek kecil", "flap Karapandzic"],
         "periorbital": ["flap Tenzel atau cangkok kulit penuh sesuai lamela yang hilang", "flap Hughes untuk kelopak bawah"],
         "forehead": ["flap kemajuan atau rotasi lokal", "cangkok kulit penuh"], "chin": ["flap kemajuan atau transposisi lokal"],
         "brow": ["flap kemajuan lokal dengan penyejajaran rambut"], "glabella": ["flap rotasi atau transposisi lokal"]}
    return t.get(region_key, ["flap lokal sesuai unit estetik", "cangkok kulit penuh bila flap tidak memadai"])
