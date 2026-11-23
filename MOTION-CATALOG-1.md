# MOTION-CATALOG-1: FaceStudio landing, effects and transitions

Katalog semua elemen visual, transisi, dan motion di landing FaceStudio, dengan lokasi kode (path relatif `web/src/`, nomor baris per commit `a840ed2`) dan resep pakai ulang.
Stack: Vite + TypeScript, Three.js 0.187, postprocessing, GSAP (+ SplitText, ScrollTrigger), Lenis.

---

## 0. Prinsip yang membuatnya terasa mahal

1. **Satu dunia 3D yang menetap**, bukan banyak scene. Kamera, cahaya, material, dan objek berubah antar bab.
2. **Dunia adalah fungsi murni dari posisi scroll** (`evaluate`). Scroll mundur memutar balik semuanya, tidak ada animasi yang "berjalan sendiri".
3. **Plateau + lengkung kamera.** Tiap bab menahan posisi sejenak, dan perpindahan kamera berupa kurva, bukan dolly lurus.
4. **Semua efek berat dikendalikan satu objek keadaan** (`HeroState`) yang di-lerp per bab, sehingga efek bisa dicampur bebas.
5. **Smoothing berlapis:** Lenis di scroll, lalu `smooth()` di tiap nilai dunia (yaw/pitch lebih lambat, k=4.2; lainnya k=9; kamera/fov k=7.5).
6. **Cahaya ikut bab** (key, rim, beam, bloom, floor, pool, dial), bukan statis.
7. **Reaksi ke kecepatan scroll:** aberrasi kromatik naik, parallax kursor meredup (`calm`), teks miring (skew).
8. **Mulai dengan momen sinematik** (intro scan 3,8 detik) sebelum teks muncul.
9. **Aksesibel:** `prefers-reduced-motion` mematikan smoothing, skew, sweep, scramble, reticle; layar sentuh mengurangi partikel.

---

## 1. Mesin dunia scroll

| Elemen | Berkas:baris | Catatan |
|---|---|---|
| Definisi 10 bab (`CHAPTERS`) | `world/chapters.ts:28-48` | tiap bab: `cam`, `target`, `fov`, `shift`, `hero`, `light`, `drive?`, `hud` |
| `evaluate(layout, scrollY, vh, portrait)` | `world/chapters.ts:70` | murni dan reversibel; bab dipusatkan pada kotak layout-nya |
| `plateau(f)` smootherstep dengan dwell 18% di tiap ujung | `world/chapters.ts:59` | transisi hanya terjadi di 64% tengah |
| `sm(a,b,x)` smoothstep | `world/chapters.ts:22` | dipakai di `drive` |
| `drive(sub)` per bab | `chapters.ts:32,36,44` | `sub` = progres scroll di dalam bab (0..1), untuk scan/rebuild/peel |
| Lengkung kamera saat terbang | `chapters.ts:95-96` | `sin(t·π)` menambah y 0,18 dan x 0,22 (bergantian arah) |
| `shift` (subjek geser kiri/kanan layar) | `chapters.ts:102`, `index.ts:102` | pakai `camera.setViewOffset`, jadi teks dan wajah bergantian sisi |
| Mode portrait (HP) | `chapters.ts:91,98,101`; `index.ts:65` | kamera ×1,42 lebih jauh, fov ×1,12, shift 0 |
| `smooth()` pada state | `world/index.ts:73,88,95-96` | exponential smoothing per frame dengan `dt` |
| Parallax kursor | `world/index.ts:89-98` | yaw/pitch + posisi kamera, diredam oleh `calm` saat scroll cepat |
| Napas halus | `world/index.ts:91` | `sin(time·0.25)·0.03` pada yaw |
| Lenis smooth scroll | `landing.ts:39-41` | `lerp: 0.11`, disambung ke `ScrollTrigger.update` |
| Ticker GSAP menggerakkan semuanya | `landing.ts:130-165` | `lenis.raf` + `world.update` + `fx`; `lagSmoothing(0)` |
| Lompat bab dengan Lenis | `landing.ts:126,174-180` | `scrollTo(..., { duration: 1.6 })` |

### Tabel bab (cam / efek utama)
0 hero (cloud + cincin) → 1 capture (laser menyapu, `scanY` didrive) → 2 rebuild (wire + kulit dibangun) → 3 landmarks (dot + wave) → 4 proportions (grid) → 5 zones (atlas 34 zona) → 6 rstl (pita tinta) → 7 layers (peel + explode) → 8 plan (rencana + elips) → 9 studio (kembali ke cincin + cloud).

---

## 2. Intro scan (pembukaan)

| Elemen | Berkas:baris |
|---|---|
| Timeline intro `world.intro.v` 0→1, 3,8 d, `power2.inOut` | `landing.ts:184-193` |
| Judul hero naik dari mask, delay 1,5 d | `landing.ts:193` |
| Sapuan scan atas→bawah, kulit dibangun di belakang laser, cloud mengendap | `world/index.ts:76-87` |
| `sweepY = 1 − 2·ease(ph)`; fade ke keadaan bab di 80-100% | `world/index.ts:78-86` |
| Wireframe berdenyut `sin(π·iv/0.8)` saat sapuan | `world/index.ts:84` |
| HUD persen dan jumlah titik ikut sapuan | `world/index.ts:113-114` |
| `solidBehind(front)`: kulit solid di belakang garis sapuan | `world/chapters.ts:26` |

---

## 3. Elemen 3D

| Elemen | Berkas:baris | Teknik |
|---|---|---|
| Wajah dari mesh kanonik MediaPipe 468 titik + subdivisi + shell | `world/hero.ts:55` (`Hero`), `face/*` | PN-style Hermite midpoint, lubang diisi dan dicekungkan |
| Material kulit | `world/skin.ts:30` | pori prosedural, rim SSS hangat, dissolve (`uDissolve`), tint zona (`uZone`), `uSolid` untuk build atas→bawah |
| Rim material yang mengikuti bidang build | `world/skin.ts:110` | shell belakang tidak bocor saat reveal |
| Point cloud permukaan, cincin laser, wireframe, cincin giroskop | `world/scan.ts:43` (`ScanSet`) | titik disampel merata luas permukaan (`scan.ts:9`) |
| Satelit bercahaya di cincin | `world/scan.ts` (patch `scripts/patch_world_fx.py`) | 2 bola per cincin, kecepatan bergantian arah |
| Pita tinta (garis landmark/RSTL/grid) | `world/ink.ts:17` (`InkLines`) | ribbon shader, `DoubleSide` agar tidak terpotong |
| Titik tinta + gelombang menyala dari tengah | `world/ink.ts:108` (`InkDots`, `uWave` di baris ~144) | titik terbang dari tebaran (`uAssemble`) |
| Layer anatomi lemak/otot/tulang | `world/layers.ts:30`, `world/anatomy.ts:25` | Ecorche (CC BY-SA 4.0); `setExplode`, peel dengan slider |
| Label layer dengan garis penunjuk | `landing.ts` (~baris 90), `styles/landing.css:95` | `.tag.leader::after` gradient |
| Lantai Reflector + dial instrumen + kolam cahaya | `world/studio.ts:49` | resolusi RT 0,7× layar (`index.ts:67`) |
| Dust | `world/studio.ts:132` | titik sangat kecil (bukan bola kabur) |
| 3 beam lampu dengan tint berbeda | `world/studio.ts:176`; `index.ts:38-41` | volumetrik palsu |
| God-ray planes | `world/studio.ts:231` | 4 bidang, intensitas ikut `light.beam` |
| Sparks naik dari dial | `world/studio.ts:262` | partikel `life = fract(...)`, memudar dengan `sin(life·π)` |
| Backdrop gelap + env map studio | `world/studio.ts:207,12` | `environmentIntensity 0.6` |

---

## 4. Post-processing (`world/stage.ts`)

| Efek | Baris | Nilai |
|---|---|---|
| Bloom mipmap blur | 47 | threshold 0,9; smoothing 0,25; radius 0,7; intensitas per bab (`index.ts:108`) |
| Aberrasi kromatik radial | 48 | offset naik dengan kecepatan scroll (`index.ts:119`) |
| Tone mapping AgX di composer | 52 | renderer `NoToneMapping` (35) agar pantulan tetap linear |
| SMAA | 55 | dimatikan di perangkat `coarse` |
| Vignette, Noise | impor 5-6 | dipakai bersama pass lain |
| HalfFloat buffer | impor 2 | menjaga highlight untuk bloom |

---

## 5. Motion antarmuka

| Elemen | Berkas:baris | Perilaku |
|---|---|---|
| Rail navigasi bab (garis + tick + label) | `fx.ts:14-22`, CSS `landing.css:103-109` | isi garis = progres `u/(n-1)`; tick aktif; label geser masuk saat hover; disembunyikan <860px |
| Angka hantu raksasa 00-09 | `fx.ts:24-31,82-86`, CSS `landing.css:112-113` | parallax `y = -top·0.18`, kiri/kanan bergantian |
| Sweep line tiap ganti bab | `fx.ts:33-37,72-76`, CSS `landing.css:114` | 0,95 d `power2.inOut`, arah mengikuti arah scroll |
| Scramble teks HUD | `fx.ts:38-46,75-76` | 0,55 d, huruf acak mengunci satu per satu |
| Reticle kursor | `fx.ts:48-58`, CSS `landing.css:115-119` | `quickTo` 0,35 d; membesar 1,7× dan berwarna tinta di atas tombol/tautan |
| Tombol magnetik | `fx.ts:59-64` | bergeser 22% X, 30% Y dari offset kursor |
| Skew copy karena kecepatan | `fx.ts:80-88` | `skewY = clamp(velocity·0.0016, ±2.5°)` |
| Reveal heading naik dari mask | `landing.ts:~90-104` | `SplitText` per baris + mask; `yPercent 115→0`, `expo.out`, stagger 0,09 |
| Reveal paragraf/CTA | `landing.ts:96-104` | `opacity 0→1`, `y 14→0`, stagger 0,08, delay 0,25; dipicu ScrollTrigger `top 58%`, sekali |
| Reveal dibuat ulang saat ganti bahasa | `landing.ts:~87` | `onLang` memanggil ulang setup |
| Tag/anotasi 3D menempel ke permukaan | `landing.ts:~55-92` | `hero.hf.lift` memproyeksikan mm wajah ke layar; bergantian per bab |
| HUD (tahap, persen, titik, landmark) | `landing.ts:130-165`, `index.ts:113-114` | scramble + angka hidup |
| Veil transisi landing/studio | `styles/base.css:74-75` | `opacity` + `visibility`, dihilangkan saat route |
| Isyarat scroll | `styles/landing.css:29` | `@keyframes cue` |

---

## 6. Tipografi dan warna

- Latar `#050506`; tinta aquamarine `#5fe8c8`; soft `#c8fff0`; aksen coral `#ff8f6e`; cincin platinum `#d3dbe2`.
- Headline Hanken Grotesk berat 320/380 (tipis, mahal), penekanan kursif Instrument Serif warna krem, data JetBrains Mono.
- Warna sebagai token `:root`; ubah palet cukup dengan skrip substitusi (`scripts/patch_aqua.py` contoh).
- Peringatan: palet sebelumnya (emas di hitam) terlalu mirip WoundScan, jadi diganti ke mutiara/platinum/aquamarine.

---

## 7. Studio dan galeri (setelah landing)

- Overlay 2D (landmark, grid, zona, RSTL, lesi): `studio/view2d.ts`, `studio/draw.ts`.
- Viewer 3D: `studio/viewer3d.ts` (kupas lapisan, fit Horn ke mesh foto), animasi "Putar rencana" `studio/surgery3d.ts`.
- Galeri contoh hasil (modal 3 panel + temuan): `studio/examples.ts`, `scripts/build_sheets.py`, `/api/examples`.

---

## 8. Resep pakai ulang di proyek lain

1. Salin pola `CHAPTERS` + `evaluate` + `plateau` (`chapters.ts`), isi dengan kamera/efek proyek barumu.
2. Buat satu kelas hero berisi semua parameter efek sebagai angka 0..1 (`REST`), lalu `lerp` per kunci di `evaluate`.
3. Baca scroll dari Lenis, hitung `velocity = v·0.85 + Δ/dt·0.15`, pakai untuk aberrasi, skew, dan redaman parallax.
4. Pasang pasca-proses: Bloom (threshold ≈0,9) → Aberration → AgX → SMAA.
5. Tambah 3 elemen "mahal" berbiaya murah: sparks, god-ray, dust halus.
6. UI: rail, angka hantu, sweep, scramble, reticle (`fx.ts` siap salin; ganti `CHAPTERS` dan `t()`).
7. Teks: `SplitText` per baris dengan mask + stagger `expo.out`.
8. Selalu sediakan `reduced-motion` dan versi `coarse`.

---

## 9. Batas dan catatan jujur

- FPS belum diukur di layar nyata. Di panel browser rAF dibatasi sekitar 3 fps, dan loop sinkron terukur sekitar 4 ms/frame di Intel Arc.
- Beberapa efek lanjutan (mis. detail uniform per shader) hanya dirujuk lewat baris awal fungsinya. Buka berkas untuk nilai tepat.
- Nomor baris akan bergeser setelah edit. Cari nama fungsinya bila tidak cocok.
