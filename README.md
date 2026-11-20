# Analisis Wajah dan Marking Bedah Plastik (prototipe riset)

Alat pendukung keputusan untuk bedah plastik wajah: mengukur simetri dan proporsi, gerak wajah (palsi), kerutan, kandidat lesi merah,
luka dan parut, lalu membuat **marking** (kontur, garis tegangan kulit/RSTL, jahitan bernomor, elips eksisi, Z-plasty, W-plasty,
geometric broken line) dan ilustrasi skematik setelah penutupan. Ada modul bioinformatika (kode ICD-10 dan HPO, ekspor FHIR,
pengayaan jalur) untuk konteks riset.

> **Status: prototipe riset. Belum divalidasi terhadap ahli bedah atau pada pasien nyata. Bukan alat medis.**
> Saran teknik dan jahitan adalah aturan buku ajar yang dikodekan; ahli bedah yang memutuskan. Lihat `docs/Protokol_Validasi_Analisis_Wajah.docx`
> untuk rencana validasi bertahap.

## Privasi
Foto wajah adalah data pribadi. Versi Python berjalan **hanya di komputer Anda** (`127.0.0.1`). Versi Vercel menghitung **seluruhnya di browser**;
tidak ada foto yang diunggah (CSP `connect-src 'none'`). Jangan menaruh foto pasien di repositori; `.gitignore` sudah mengecualikan gambar.

## Dua versi
| | Python lokal (lengkap) | Browser untuk Vercel (`deploy/vercel`) |
|---|---|---|
| Deteksi wajah, skala iris, atlas zona | ya (MediaPipe) | tidak (kalibrasi manual) |
| Kontur luka | AI (MobileSAM) atau manual | manual |
| Perencana, marking, jahitan, ilustrasi | ya | ya (port JS, diuji paritas dengan Python) |
| Kerutan, jerawat, simetri, cleft | ya | tidak |
| Bioinformatika | ya | tidak |

## Menjalankan versi lokal
```bash
pip install -r requirements.txt
python scripts/download_models.py     # model wajah dan MobileSAM (tidak disimpan di repo)
python app/server.py                  # lalu buka http://127.0.0.1:8791   (Windows: start_app.bat)
```

## Tes
```bash
python test_surgical_planner.py      # aturan, geometri marking
python test_wound_planner.py         # geometri luka pada wajah rata-rata MediaPipe
python test_bioinfo.py               # statistik pengayaan, FHIR valid, kode
python test_surgeon_compare.py       # metrik kesepakatan dengan ahli
python test_app_robustness.py        # masukan buruk tidak boleh membuat galat tak terkendali (set FACE_TEST_PHOTOS)
python deploy/vercel/tests/make_golden.py && node --test deploy/vercel/tests/parity.test.mjs   # port JS == Python
```
Tes lain: `test_smile_symmetry.py`, `test_cleft_analysis.py`, `test_wound_segment.py`, `test_face_zones.py`, `test_compare_prepost.py`,
`test_wrinkle_analysis.py`, `test_acne_lesions.py`.

## Deploy ke Vercel (versi browser)
1. Dorong repositori ini ke GitHub.
2. Di Vercel: **Add New Project**, pilih repositori ini, **Root Directory = `deploy/vercel`**, Framework Preset = *Other*. Tidak ada build step; `vercel.json` menetapkan `public/` dan header keamanan.
3. Uji dulu secara lokal: `python -m http.server 8792 --directory deploy/vercel/public`, lalu buka `http://127.0.0.1:8792`.
Versi Python lengkap sengaja tidak dideploy ke Vercel: tumpukan MediaPipe/OpenCV/ONNX melebihi batas fungsi serverless dan akan
mengirim foto pasien ke cloud.

## Yang sudah dan belum terbukti
Terbukti pada data buatan dan beberapa foto publik: geometri, aturan, paritas Python dan JS, ketahanan masukan, statistik pengayaan
(positif dan negatif kontrol), validitas FHIR. **Belum terbukti:** akurasi kontur dan marking pada luka klinis nyata, kecocokan dengan
ahli bedah, arah RSTL (pendekatan kasar; dapat ditimpa), pendeteksi jerawat dan kerutan pada kulit nyata (tidak spesifik).

## Sumber data dan lisensi pihak ketiga
Lihat `NOTICE.md`. Repositori ini belum memiliki lisensi; pilih lisensi sebelum membukanya untuk umum.
