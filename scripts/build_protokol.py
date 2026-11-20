"""Builds Protokol_Validasi_Analisis_Wajah.docx (run once; the docx is the deliverable)."""
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.3)
sec.top_margin, sec.bottom_margin = Cm(2.2), Cm(2.2)

base = doc.styles["Normal"]
base.font.name = "Calibri"
base.font.size = Pt(10.5)
base.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
base.paragraph_format.space_after = Pt(5)
base.paragraph_format.line_spacing = 1.12
for name, size, color in (("Heading 1", 15, "1F3A5F"), ("Heading 2", 12, "1F3A5F"), ("Heading 3", 10.5, "333333")):
    st = doc.styles[name]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = RGBColor.from_string(color)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    st.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 9)
    st.paragraph_format.space_after = Pt(4)
    st.paragraph_format.keep_with_next = True


def shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def H(text, level=1):
    return doc.add_heading(text, level=level)


def P(text="", bold=False, italic=False, size=None, align=None, after=None):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold, r.italic = bold, italic
    if size:
        r.font.size = Pt(size)
    if align:
        p.alignment = align
    if after is not None:
        p.paragraph_format.space_after = Pt(after)
    return p


def B(items, style="List Bullet"):
    for t in items:
        p = doc.add_paragraph(style=style)
        if isinstance(t, tuple):
            r = p.add_run(t[0]); r.bold = True
            p.add_run(t[1])
        else:
            p.add_run(t)
        p.paragraph_format.space_after = Pt(2)


def T(header, rows, widths, font=9, head_fill="1F3A5F"):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.width = Cm(widths[i])
        c.text = ""
        r = c.paragraphs[0].add_run(h)
        r.bold, r.font.size = True, Pt(font)
        r.font.color.rgb = RGBColor(255, 255, 255)
        shade(c, head_fill)
    trPr = t.rows[0]._tr.get_or_add_trPr()
    th = OxmlElement("w:tblHeader"); th.set(qn("w:val"), "true"); trPr.append(th)
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].width = Cm(widths[i])
            cells[i].text = ""
            para = cells[i].paragraphs[0]
            para.paragraph_format.space_after = Pt(0)
            r = para.add_run(str(v))
            r.font.size = Pt(font)
            if i == 0:
                r.bold = True
            if ri % 2 == 1:
                shade(cells[i], "F2F5F9")
    for row in t.rows:                                  # do not split a row across pages
        trPr = row._tr.get_or_add_trPr()
        cs = OxmlElement("w:cantSplit"); cs.set(qn("w:val"), "true"); trPr.append(cs)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


# footer with page numbers
fp = sec.footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = fp.add_run("Protokol validasi analisis wajah, draf 1.0   |   halaman ")
run.font.size = Pt(8.5)
for tag, txt in (("begin", None), (None, "PAGE"), ("end", None)):
    r = fp.add_run(); r.font.size = Pt(8.5)
    if tag:
        f = OxmlElement("w:fldChar"); f.set(qn("w:fldCharType"), tag); r._r.append(f)
    else:
        it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = txt; r._r.append(it)

# ---------------- title ----------------
P("PROTOKOL VALIDASI", bold=True, size=11, align=WD_ALIGN_PARAGRAPH.LEFT, after=0).runs[0].font.color.rgb = RGBColor.from_string("666666")
P("Perangkat Lunak Analisis Wajah untuk Bedah Plastik", bold=True, size=21, after=2).runs[0].font.color.rgb = RGBColor.from_string("1F3A5F")
P("Keterulangan, ketepatan, kesesuaian dengan penilaian klinisi, dan kepekaan terhadap perubahan", italic=True, size=11.5, after=8)
T(["Keterangan", "Isi"], [
    ["Status", "Draf versi 1.0 untuk telaah tim peneliti, ahli statistik, dan komite etik"],
    ["Tanggal", "20 November 2026"],
    ["Jenis studi", "Validasi pengukuran dan akurasi, bertahap (Fase 0 sampai 4), prospektif, dengan penilai dibutakan"],
    ["Perangkat lunak", "Prototipe riset (modul: gerbang kualitas, proporsi dan simetri, gerak wajah, hidung, garis dan kerutan, bintik merah, luka dan parut, cleft lip, perbandingan sebelum dan sesudah)"],
    ["Peringatan", "Ambang penerimaan dan ukuran sampel di bawah adalah usulan. Tim klinis dan ahli statistik perlu menetapkannya sebelum protokol didaftarkan dan sebelum data validasi pertama dikumpulkan."],
], [3.2, 13.2], font=9.5)

# ---------------- 1 ----------------
H("1. Tujuan dan batas klaim")
P("Perangkat lunak yang divalidasi mengukur simetri, proporsi, gerak wajah, garis dan kerutan, bintik merah, luka dan parut, serta perubahan sebelum dan sesudah tindakan, dari foto atau video. Sampai sekarang pengujiannya memakai data buatan dan sejumlah foto publik yang juga dipakai untuk menyetel ambangnya. Belum ada bukti bahwa angkanya cocok dengan pengukuran langsung atau dengan penilaian dokter.")
P("Tujuan utama:", bold=True, after=1)
B([("Keterulangan: ", "apakah foto yang sama orang yang sama, diambil dua kali, memberi angka yang sama."),
   ("Ketepatan: ", "apakah angka dalam milimeter dan rasio cocok dengan standar acuan (kaliper dan penandaan manual)."),
   ("Kesesuaian klinis: ", "apakah angka berkorelasi dengan penilaian klinisi terlatih pada kondisi nyata."),
   ("Kepekaan terhadap perubahan: ", "apakah perubahan yang dilaporkan sesuai dengan perubahan yang dinilai klinisi, dan tidak muncul pada foto ulang tanpa perubahan."),
   ("Ketahanan: ", "apakah hasil bertahan pada warna kulit, kamera, cahaya, dan posisi kepala yang realistis, dan apakah gerbang kualitas menolak foto yang memang tidak layak.")])
P("Pertanyaan yang tidak dijawab protokol ini: apakah hasil operasi indah, apakah pasien puas, apakah alat memperbaiki keputusan klinis atau luaran pasien. Itu memerlukan studi lain. Perangkat lunak tidak menghasilkan skor kecantikan, grade keparahan, diagnosis, atau prediksi hasil, dan tidak ada satu pun dari itu yang diuji di sini.")

# ---------------- 2 ----------------
H("2. Prinsip desain")
B([("Pra-registrasi. ", "Rencana analisis dan ambang penerimaan didaftarkan (misalnya di OSF) sebelum data validasi dilihat."),
   ("Pemisahan data. ", "Semua foto yang pernah dipakai untuk menyetel ambang atau memperbaiki kode, termasuk foto publik pada tahap pengembangan, tidak boleh masuk set validasi. Set validasi baru dikumpulkan oleh tim yang tidak ikut menyetel ambang."),
   ("Perangkat lunak dibekukan. ", "Sebelum Fase 1 dicatat nilai SHA-256 semua berkas kode, versi model MediaPipe, dan versi pustaka. Perubahan setelah itu berarti validasi modul yang terdampak diulang."),
   ("Penilai dibutakan. ", "Klinisi tidak melihat keluaran perangkat lunak dan tidak melihat penilaian penilai lain. Urutan foto diacak. Analis menghitung hasil dengan skrip yang dikunci."),
   ("Penolakan gerbang dihitung sebagai hasil. ", "Foto yang ditolak gerbang kualitas dilaporkan sebagai angka (tingkat penolakan, alasan), tidak dibuang diam-diam. Analisis utama memakai prinsip semua yang dinilai ikut dihitung."),
   ("Pelaporan. ", "GRRAS untuk keterulangan dan kesepakatan, STARD 2015 untuk akurasi diagnostik, COSMIN untuk sifat ukur, serta TRIPOD+AI dan CLAIM untuk pelaporan komponen berbasis model.")])

# ---------------- 3 ----------------
H("3. Apa yang divalidasi")
T(["Modul", "Keluaran yang diklaim", "Standar acuan", "Fase"], [
    ["Gerbang kualitas", "Menolak foto yang tidak layak diukur", "Penilaian layak atau tidak oleh 2 klinisi, dibutakan", "1, 2"],
    ["Landmark dan skala mm", "Titik wajah; skala dari lebar iris (11,7 mm)", "Penandaan manual 2 penilai; kaliper; kartu skala", "1"],
    ["Proporsi dan simetri frontal", "Rasio proporsi, asimetri pasangan titik (mm), canthal tilt", "Pengukuran manual 2 penilai pada foto yang sama; kaliper", "1"],
    ["Hidung", "Indeks nasal (frontal); sudut profil dan rasio Goode (titik diklik)", "Kaliper; 2 penilai menandai titik profil", "1, 2"],
    ["Gerak wajah (video)", "Simpangan sudut mulut, alis, kelopak; rasio simetri", "eFACE, Sunnybrook, House-Brackmann oleh 3 klinisi", "2"],
    ["Garis dan kerutan", "Panjang dan kepadatan garis halus dan lipatan per zona", "Skor keparahan kerutan per zona oleh 2 klinisi", "2"],
    ["Bintik merah (jerawat)", "Jumlah kandidat lesi merah per zona", "Penandaan lesi oleh 2 dermatolog", "2"],
    ["Luka dan parut", "Kontur, luas, panjang, sudut terhadap RSTL, warna", "Kontur manual 2 klinisi; garis RSTL oleh ahli bedah plastik; POSAS atau VSS", "2"],
    ["Cleft lip", "Rasio simetri nasolabial dari 12 titik diklik", "Skor Asher-McDade oleh penilai terlatih; klik ulang titik", "2"],
    ["Perbandingan sebelum dan sesudah", "Perubahan yang melewati lantai derau", "Penilaian perubahan global oleh klinisi dan pasien", "3"],
], [3.3, 5.0, 6.4, 1.7])
P("Tidak divalidasi karena tidak diklaim: skor kecantikan (tidak ada), grade jerawat, kelas keparahan cleft, diagnosis, prediksi hasil operasi, analisis 3D, dan bercak gelap (pendeteksi dimatikan karena tidak andal pada pengujian awal).", italic=True)

# ---------------- 4 ----------------
H("4. Ringkasan fase")
T(["Fase", "Peserta", "Jumlah", "Tujuan", "Luaran utama"], [
    ["0. Persiapan", "Uji coba 5 orang", "5", "Pembekuan kode, pra-registrasi, SOP, uji alur data", "Daftar masalah SOP; hash kode"],
    ["1. Relawan sehat", "Dewasa sehat, 3 kelompok warna kulit", "45 (15 per kelompok)", "Keterulangan, ketepatan, ketahanan, gerbang", "ICC, bias, batas kesepakatan 95%, MDC"],
    ["2. Pasien per kondisi", "Palsi wajah; cleft lip; luka atau parut; jerawat aktif; rentang usia untuk kerutan", "35; 35; 40; 40; 40", "Kesesuaian dengan klinisi per modul", "Korelasi, AUC, Dice, sensitivitas dan PPV (Bagian 7)"],
    ["3. Longitudinal", "Pasien yang menjalani tindakan wajah", "30", "Kepekaan terhadap perubahan", "Kesepakatan dengan penilaian perubahan global"],
    ["4. Penerapan (opsional)", "Alur klinik atau poli", "Sesuai alur", "Tingkat penolakan; kesalahan rasa aman palsu", "Hasil tinjauan kasus"],
], [2.6, 4.4, 2.6, 3.8, 3.0], font=8.8)
P("Relawan sehat pada Fase 1 sekaligus menjadi kelompok kontrol normal untuk analisis AUC pada Fase 2, sehingga tidak perlu merekrut kontrol baru.")

# ---------------- 5 ----------------
H("5. SOP pengambilan foto dan video")
T(["Aspek", "Ketentuan"], [
    ["Kamera", "Dua ponsel berbeda kelas (atas dan menengah) dan satu kamera mirrorless atau DSLR pada subset. Minimal 12 MP. Tanpa filter kecantikan, tanpa penghalusan kulit, tanpa HDR otomatis. Fokus dan eksposur dikunci. Catat model, lensa, dan format berkas."],
    ["Jarak dan tinggi", "1,0 sampai 1,5 m, tripod, lensa setara 50 sampai 85 mm, kamera setinggi mata. Lebar wajah di gambar minimal 1000 piksel."],
    ["Cahaya", "Dua lampu difus pada sudut sekitar 45 derajat kiri dan kanan dengan intensitas seimbang, latar abu netral, tanpa flash langsung. Ambil satu foto kartu abu 18% pada tiap sesi."],
    ["Skala", "Kartu ukur cetak dengan panjang yang diketahui diletakkan dekat dagu pada subset, untuk menguji skala dari iris."],
    ["Posisi kepala", "Garis Frankfort horizontal, menatap lensa, bibir rapat, ekspresi netral, mata terbuka. Rambut dijauhkan dari dahi dan alis. Tanpa kacamata (kacamata hanya pada uji ketahanan). Tanpa riasan untuk modul kerutan dan jerawat."],
    ["Video gerak", "30 fps, 1080p. Urutan baku: rileks 2 detik, angkat alis, tutup mata pelan, senyum, kembali rileks."],
    ["Foto profil", "Lateral kiri dan kanan, kepala sejajar Frankfort, bibir netral."],
    ["Metadata wajib", "ID pseudonim, sesi, kamera, jarak, tata cahaya, kelompok warna kulit (Fitzpatrick, dinilai 2 orang), usia, jenis kelamin, kacamata, janggut, kondisi kulit."],
], [3.2, 13.2])

# ---------------- 6 ----------------
H("6. Fase 1: relawan sehat")
H("6.1 Peserta", 2)
P("45 dewasa sehat berusia 18 sampai 70 tahun, 15 orang pada tiap kelompok warna kulit (Fitzpatrick I sampai III, IV, V sampai VI), dengan campuran jenis kelamin dan usia. Eksklusi: operasi atau trauma wajah sebelumnya, palsi wajah, dan kondisi kulit aktif yang luas (untuk modul kulit).")
H("6.2 Keterulangan", 2)
P("Setiap peserta difoto pada dua sesi di hari yang sama. Di antara sesi peserta berdiri dan duduk kembali dan diposisikan ulang, jeda minimal 10 menit, fotografer yang sama. Subset 20 orang difoto lagi 7 sampai 14 hari kemudian. Dari sini dihitung ICC, SEM, dan MDC95, yang juga menjadi dasar lantai derau pada perbandingan sebelum dan sesudah.")
H("6.3 Ketepatan terhadap kaliper", 2)
P("Pada 10 jarak (antar-kantus, lebar mata kanan dan kiri, lebar alar, lebar mulut, tinggi glabela ke subnasale, subnasale ke menton, lebar bizigomatik, lebar bigonial, tinggi hidung nasion ke subnasale) dua penilai mengukur dengan kaliper geser digital setelah titik ditandai dengan penanda kulit. Tiap jarak diukur dua kali oleh tiap penilai, urutan diacak, dibutakan terhadap angka perangkat lunak. Standar acuan adalah rata-rata empat pengukuran. Foto untuk perangkat lunak diambil sebelum penanda dipasang. Pada subset 20 orang dibuat juga pemindaian 3D (VECTRA atau fotogrametri ponsel) bila tersedia, sebagai acuan kedua.")
H("6.4 Kesalahan landmark", 2)
P("Dua penilai menandai 25 landmark pada 20 foto. Dihitung jarak titik perangkat lunak terhadap rata-rata titik penilai (mm), dan kesepakatan antar-penilai sebagai batas atas kemampuan yang masuk akal.")
H("6.5 Ketahanan dan gerbang", 2)
P("Pada subset 20 orang satu faktor diubah tiap kali: tata cahaya (difus, samping, dari atas), jarak (1,0 dan 2,0 m), putaran kepala (0, 5, 10, 15 derajat), kacamata, ekspresi tidak netral (senyum, mulut terbuka), jenis kamera, dan kompresi tinggi. Diukur perubahan tiap metrik dan tingkat penolakan gerbang. Dua klinisi menilai tiap foto sebagai layak atau tidak layak untuk pengukuran, dibutakan. Dihitung sensitivitas gerbang menolak foto yang memang tidak layak dan proporsi foto layak yang ikut ditolak. Ambang gerbang yang sekarang adalah nilai buatan prototipe, dan hasil bagian ini yang menggantinya dengan ambang berbasis data.")

# ---------------- 7 ----------------
H("7. Fase 2: pasien per kondisi")
T(["Modul", "Peserta", "Penilai dan acuan", "Luaran utama", "Kriteria penerimaan (usulan)"], [
    ["Palsi wajah", "35 pasien; kontrol dari Fase 1", "3 klinisi terlatih menilai video yang sama: eFACE, Sunnybrook, House-Brackmann; dibutakan", "Spearman antara rasio simetri atau simpangan dan eFACE atau Sunnybrook; AUC palsi vs normal", "rho 0,70 atau lebih; AUC 0,85 atau lebih dengan batas bawah CI 95% 0,75 atau lebih"],
    ["Proporsi dan hidung", "45 relawan Fase 1; 35 pasien profil", "Kaliper; 2 penilai menandai titik profil", "Bias dan batas kesepakatan 95%; ICC", "Bias 0,5 mm atau kurang; batas kesepakatan dalam 2 mm; ICC 0,90 atau lebih"],
    ["Garis dan kerutan", "40 peserta usia 25 sampai 75, semua kelompok kulit", "2 klinisi memberi skor keparahan kerutan per zona (skala 0 sampai 4 yang diseragamkan), dibutakan; foto ulang hari yang sama", "Spearman per zona; ICC foto ulang", "rho 0,60 atau lebih per zona; ICC ulang 0,80 atau lebih"],
    ["Bintik merah (jerawat)", "40 pasien jerawat aktif, minimal 150 lesi", "2 dermatolog menandai lesi inflamasi pada foto; selisih diselesaikan konsensus", "Sensitivitas dan PPV per lesi (cocok bila jarak 2,5 mm atau kurang); Bland-Altman jumlah per wajah", "Sensitivitas dan PPV 0,70 atau lebih; batas kesepakatan jumlah dilaporkan"],
    ["Luka dan parut", "40 luka atau parut wajah dari minimal 30 pasien", "2 klinisi menggambar kontur; 2 ahli bedah plastik menggambar arah RSTL pada foto; POSAS atau VSS oleh 2 penilai", "Dice dan selisih luas; selisih sudut RSTL perangkat vs ahli dibanding antar-ahli; korelasi warna dengan POSAS", "Dice median 0,85 atau lebih; selisih sudut RSTL median tidak lebih dari selisih antar-ahli ditambah 10 derajat"],
    ["Cleft lip", "35 pasien unilateral, pra atau pasca perbaikan; izin orang tua untuk anak", "2 penilai terlatih memberi skor Asher-McDade pada foto yang sama; titik diklik ulang oleh 2 orang", "ICC klik; Spearman rasio simetri vs skor", "ICC klik 0,85 atau lebih; rho 0,60 atau lebih"],
    ["Gerbang pada pasien", "Semua peserta Fase 2", "Tinjauan 100% foto ditolak dan 20% foto lolos oleh klinisi", "Tingkat penolakan; foto lolos dengan titik wajah salah", "Foto lolos dengan titik salah 5% atau kurang"],
], [2.5, 3.0, 4.2, 3.6, 3.2], font=8.3)
P("Penting untuk modul luka: arah garis tegangan kulit (RSTL) pada perangkat lunak adalah pendekatan buatan prototipe yang belum dicocokkan dengan atlas baku. Pembandingan dengan garis yang digambar ahli bedah plastik pada bagian ini merupakan validasi pertama untuk komponen itu, dan hasilnya dapat membuat komponen tersebut diganti atau dibatasi.")

# ---------------- 8 ----------------
H("8. Fase 3: perubahan sebelum dan sesudah tindakan")
P("Sebanyak 30 pasien yang menjalani tindakan wajah (reanimasi, rekonstruksi, atau tindakan estetik seperti rinoplasti dan blefaroplasti) difoto dan direkam dengan SOP yang sama sebelum tindakan dan pada 3 bulan sesudahnya (tambahan 6 dan 12 bulan bila tersedia). Pasangan foto diacak urutannya. Dua klinisi, dibutakan terhadap urutan, menilai per area apakah ada perubahan dan ke arah mana (lebih baik, tetap, lebih buruk). Pasien mengisi penilaian perubahan global sendiri.")
B(["Luaran utama: kesepakatan arah perubahan antara perangkat lunak (melewati lantai derau) dan klinisi, dengan kappa berbobot.",
   "Kontrol negatif: pasangan foto sesi ulang hari yang sama dari Fase 1. Proporsi metrik yang dilaporkan berubah pada pasangan tanpa perubahan harus 5% atau kurang.",
   "Responsivitas: AUC perubahan perangkat lunak untuk membedakan pasangan yang dinilai klinisi berubah dari yang tetap.",
   "Lantai derau sekarang dihitung dari goyangan landmark dan satu eksperimen simulasi. Fase 1 menggantinya dengan MDC95 dari keterulangan sebenarnya."])

# ---------------- 9 ----------------
H("9. Rencana analisis statistik")
B([("Keterulangan: ", "ICC(2,1) kesepakatan absolut dengan CI 95%; SEM = SD dikali akar (1 dikurangi ICC); MDC95 = 1,96 dikali akar 2 dikali SEM. Hasil dilaporkan per metrik dan per kelompok warna kulit."),
   ("Ketepatan: ", "bias dan batas kesepakatan 95% (Bland-Altman) dengan CI tiap batas, koefisien korelasi konkordansi Lin, plot selisih terhadap rerata, dan pemeriksaan proporsional bias."),
   ("Kesesuaian klinis: ", "korelasi Spearman dengan CI; kappa berbobot kuadratik untuk data ordinal; AUC dengan CI (DeLong); titik potong ditentukan pada data pengembangan, bukan pada data validasi."),
   ("Segmentasi: ", "Dice dan IoU per kasus, median dan rentang interkuartil; selisih luas relatif."),
   ("Deteksi lesi: ", "pencocokan titik perangkat lunak dengan titik dermatolog dalam radius 2,5 mm (pencocokan satu ke satu), sensitivitas dan PPV dengan CI Wilson."),
   ("Sudut RSTL: ", "selisih sudut mutlak dalam derajat (0 sampai 90), dibandingkan dengan selisih antar-ahli."),
   ("Faktor pengaruh: ", "model campuran dengan intersep acak per peserta untuk menilai pengaruh warna kulit, kamera, cahaya, jarak, putaran kepala, dan kacamata terhadap galat."),
   ("Data hilang: ", "penolakan gerbang dilaporkan sebagai hasil dan dianalisis tersendiri. Tidak ada pengecualian foto setelah data dilihat."),
   ("Subkelompok: ", "semua luaran utama dilaporkan per kelompok warna kulit. Klaim dibatasi pada kelompok yang memenuhi kriteria penerimaan.")])

# ---------------- 10 ----------------
H("10. Ukuran sampel")
P("Perhitungan berbasis ketepatan estimasi (lebar interval kepercayaan), bukan uji hipotesis. Asumsi diambil dari literatur umum dan dari prototipe, sehingga perlu dikonfirmasi pada uji coba Fase 0.")
T(["Tujuan", "Asumsi", "Hasil perhitungan", "Keputusan"], [
    ["ICC keterulangan (2 sesi)", "ICC dugaan 0,85; lebar penuh CI 95% 0,20; rumus Bonett (2002)", "31 peserta", "45 (cadangan penolakan gerbang dan stratifikasi 3 kelompok kulit)"],
    ["ICC keterulangan, harapan lebih tinggi", "ICC 0,90; lebar penuh CI 0,15", "26 peserta", "Terpenuhi oleh 45"],
    ["Batas kesepakatan Bland-Altman", "SD selisih 1,0 mm; setengah lebar CI 95% tiap batas 0,6 mm; SE batas = SD kali akar (1/n + 1,96 kuadrat / (2(n-1)))", "35 peserta (setengah lebar 0,55 mm pada n 40)", "45 (setengah lebar sekitar 0,52 mm)"],
    ["AUC palsi vs normal", "AUC 0,90; setengah lebar CI 95% 0,08; rumus Hanley-McNeil, kelompok sama besar", "32 per kelompok", "35 pasien; kontrol dari 45 relawan"],
    ["Deteksi lesi jerawat", "Sensitivitas 0,80; setengah lebar CI Wilson 0,064", "150 lesi", "40 pasien dengan total minimal 150 lesi yang ditandai"],
    ["Segmentasi, kerutan, cleft", "Estimasi korelasi dan Dice dengan CI yang cukup sempit pada 35 sampai 40 kasus", "Pertimbangan praktis", "35 sampai 40 per kondisi; luka dari minimal 30 pasien agar kasus tidak dihitung ganda"],
    ["Perubahan sebelum dan sesudah", "Kappa berbobot dugaan 0,6 pada 30 pasangan beberapa area", "Estimasi kasar; CI akan lebar", "30 pasien, dilaporkan sebagai studi awal"],
], [3.4, 5.5, 3.6, 3.9], font=8.5)
P("Angka pada kolom perhitungan dihitung dengan skrip dan dapat diulang. Fase 3 sengaja dinyatakan sebagai studi awal karena 30 pasien tidak memberi presisi yang tinggi untuk kappa.", italic=True)

# ---------------- 11 ----------------
H("11. Aturan keputusan")
B([("Lolos: ", "semua kriteria utama modul terpenuhi pada seluruh kelompok warna kulit dan kamera yang diuji. Modul boleh dipakai untuk riset dan pemantauan dengan batasan yang dilaporkan."),
   ("Lolos bersyarat: ", "kriteria terpenuhi pada sebagian kelompok atau kondisi. Klaim dibatasi (misalnya hanya foto frontal dengan cahaya difus, atau hanya kelompok warna kulit tertentu), dan gerbang diperketat untuk kondisi lain."),
   ("Tidak lolos: ", "kriteria utama tidak terpenuhi. Modul dinonaktifkan atau diganti, dan validasi modul itu diulang pada data baru setelah perubahan. Contoh sudah ada: pendeteksi bercak gelap dimatikan pada tahap pengembangan."),
   ("Aturan berhenti keselamatan: ", "bila pada tinjauan kasus ditemukan foto yang lolos gerbang tetapi hasilnya salah sehingga memberi rasa aman palsu pada temuan klinis yang nyata, modul itu ditangguhkan sampai penyebabnya jelas.")])

# ---------------- 12 ----------------
H("12. Keselamatan selama validasi")
B(["Keluaran perangkat lunak tidak dipakai untuk keputusan klinis selama validasi dan tidak ditunjukkan kepada klinisi penilai.",
   "Bila pada foto tampak temuan yang mungkin penting secara klinis (misalnya lesi kulit yang mencurigakan), peneliti klinis menghubungi peserta dan merujuk sesuai praktik biasa.",
   "Peserta Fase 2 dan 3 mendapat tata laksana sesuai standar, tidak dipengaruhi oleh keikutsertaan.",
   "Bila perangkat lunak kelak dipakai untuk keputusan klinis, termasuk di poli atau IGD, perlu ditinjau lebih dulu status regulasinya (BPOM dan Kemenkes) dan dilakukan Fase 4."])

# ---------------- 13 ----------------
H("13. Etika dan perlindungan data")
B(["Persetujuan etik dari komite etik penelitian kesehatan institusi sebelum rekrutmen.",
   "Persetujuan tertulis setelah penjelasan. Untuk anak (misalnya cleft lip) persetujuan orang tua atau wali dan persetujuan anak bila usia memungkinkan. Peserta boleh mundur tanpa konsekuensi.",
   "Foto wajah adalah data pribadi yang melekat pada identitas. Menutup mata tidak membuat foto anonim. Perlakukan sesuai Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022) dan kebijakan institusi.",
   "ID pseudonim; tabel penghubung identitas disimpan terpisah dan terenkripsi. Foto disimpan pada penyimpanan terenkripsi dengan akses terbatas.",
   "Foto tidak diunggah ke layanan awan atau layanan pihak ketiga. Pemrosesan dijalankan secara lokal.",
   "Persetujuan terpisah untuk penggunaan gambar pada publikasi atau presentasi. Tanpa persetujuan itu gambar tidak dipublikasikan.",
   "Masa simpan dan pemusnahan data ditetapkan sebelum rekrutmen. Kebijakan berbagi data anonim ditetapkan di protokol final."])

# ---------------- 14 ----------------
H("14. Manajemen data dan mutu")
B(["Formulir data (Lampiran A) diisi pada hari pengambilan. Dua orang memeriksa 10% data secara acak.",
   "Berkas mentah tidak diubah. Setiap keluaran perangkat lunak disimpan bersama versi kode dan nilai hash.",
   "Analisis dijalankan dengan skrip yang dikunci sebelum data dibuka. Perubahan pada rencana dicatat sebagai amandemen dengan tanggal dan alasan.",
   "Pelatihan dan kalibrasi penilai sebelum penilaian: 10 kasus latihan, lalu pemeriksaan kesepakatan antar-penilai. Kalibrasi ulang bila kesepakatan turun."])

# ---------------- 15 ----------------
H("15. Risiko metodologis dan mitigasi")
T(["Risiko", "Mitigasi"], [
    ["Kebocoran data dari set pengembangan ke validasi", "Set validasi dikumpulkan baru; foto pengembangan tidak dipakai; kode dibekukan dan di-hash"],
    ["Bias spektrum (hanya kasus jelas atau hanya wajah ideal)", "Rekrutmen berurutan; sertakan kasus ringan; catat alasan eksklusi"],
    ["Kelompok warna kulit kurang terwakili", "Kuota 15 per kelompok; hasil per kelompok; klaim dibatasi bila gagal"],
    ["Perbedaan cahaya dan kamera antar kunjungan", "SOP, kartu abu, pencatatan; analisis ketahanan; perbandingan tekstur hanya bila sebanding"],
    ["Kegagalan landmark pada wajah patologis", "Ulasan 100% foto ditolak dan 20% foto lolos; laporkan kegagalan titik; cleft memakai titik diklik"],
    ["Penolakan gerbang menyisihkan kasus sulit", "Penolakan dihitung sebagai hasil; analisis semua yang dinilai"],
    ["Pergeseran penilai", "Pelatihan dan kalibrasi; kesepakatan antar-penilai dihitung berkala; urutan diacak"],
    ["Peneliti terlalu mengenal perangkat lunak", "Penilai klinis tidak ikut mengembangkan; analis dibutakan bila memungkinkan"],
], [6.2, 10.2])

# ---------------- 16 ----------------
H("16. Jadwal dan sumber daya")
T(["Bulan", "Kegiatan"], [
    ["0 sampai 2", "Persiapan, pra-registrasi, persetujuan etik, pengadaan alat, pelatihan penilai, Fase 0"],
    ["3 sampai 4", "Fase 1 (relawan sehat) dan analisis keterulangan awal"],
    ["4 sampai 8", "Fase 2 (pasien per kondisi), paralel antar kondisi"],
    ["6 sampai 11", "Fase 3 (sebelum dan sesudah tindakan, tindak lanjut 3 bulan)"],
    ["10 sampai 12", "Analisis akhir, keputusan per modul, naskah"],
], [3.0, 13.4])
P("Tim: peneliti utama klinis, dua klinisi penilai dan satu cadangan, dua dermatolog, dua ahli bedah plastik untuk garis RSTL dan penilaian luka, satu ahli statistik, satu fotografer terlatih, satu pengembang perangkat lunak yang tidak menilai. Alat: dua ponsel berbeda kelas, satu kamera mirrorless atau DSLR, dua lampu difus dan tripod, kaliper geser digital, kartu abu 18%, kartu skala cetak, penyimpanan terenkripsi.")

# ---------------- 17 ----------------
H("17. Pelaporan dan luaran")
P("Naskah mengikuti GRRAS, STARD 2015, COSMIN, TRIPOD+AI, dan CLAIM. Kode, versi, dan skrip analisis disertakan sebagai lampiran. Hasil negatif dan modul yang gagal dilaporkan sama lengkapnya dengan hasil positif.")

# ---------------- appendices ----------------
H("Lampiran A. Isi formulir data per sesi")
B(["ID pseudonim, tanggal, sesi, nomor pengambilan, nama fotografer.",
   "Usia, jenis kelamin, kelompok warna kulit (penilai 1 dan 2), kacamata, janggut, riasan, kondisi kulit, riwayat tindakan wajah.",
   "Kamera, lensa, jarak, tata cahaya, hasil kartu abu, nama berkas.",
   "Pengukuran kaliper (penilai, ulangan, nilai).",
   "Skor klinisi (skala, penilai, subskor), penilaian layak atau tidak layak, penilaian perubahan.",
   "Catatan kejadian dan alasan eksklusi."])
H("Lampiran B. Daftar periksa sebelum memotret")
B(["Kamera pada mode standar, filter kecantikan mati, fokus dan eksposur terkunci.",
   "Jarak dan tinggi kamera benar; kartu abu difoto.",
   "Kepala sejajar Frankfort; mata terbuka menatap lensa; bibir rapat; rambut dijauhkan dari dahi dan alis.",
   "Tanpa kacamata (kecuali uji ketahanan) dan tanpa riasan (modul kulit).",
   "Metadata diisi; dua foto cadangan diambil.",
   "Video gerak diambil dengan urutan baku bila sesuai."])
H("Lampiran C. Kerangka tabel hasil per modul")
T(["Metrik", "n", "ICC (CI 95%)", "Bias (mm)", "Batas kesepakatan 95%", "MDC95", "Keputusan"], [
    ["Contoh: lebar alar", "", "", "", "", "", ""],
    ["Contoh: rasio simetri senyum", "", "", "", "", "", ""],
], [3.8, 1.2, 2.6, 1.8, 3.0, 1.7, 2.3], font=8.5)
P("Setiap baris diisi per kelompok warna kulit dan keseluruhan. Keputusan diisi dengan lolos, lolos bersyarat, atau tidak lolos menurut Bagian 11.", italic=True)

from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "docs" / "Protokol_Validasi_Analisis_Wajah.docx"
OUT.parent.mkdir(exist_ok=True)
doc.save(str(OUT))
print("saved")
