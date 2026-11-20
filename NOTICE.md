# Pemberitahuan pihak ketiga

Berkas model dan data berikut tidak ditulis oleh proyek ini. Periksa ketentuan terkini sebelum memakai di luar riset.

- **MediaPipe Face Landmarker** (Google): Apache-2.0. Model diunduh oleh `scripts/download_models.py`. `test_data/canonical_face_cm.npy` adalah
  mesh wajah kanonik yang diekstrak dari paket model tersebut, dipakai hanya sebagai fixture uji.
- **MobileSAM** (Zhang dkk.): Apache-2.0. Konversi ONNX oleh Acly (Hugging Face `Acly/MobileSAM`): MIT. Diunduh oleh `scripts/download_models.py`.
- **Open Targets Platform**: data asosiasi gen-penyakit (snapshot bertanggal di `bioinfo/data/opentargets_snapshot.json`), CC0. https://platform.opentargets.org
- **Reactome** (melalui pustaka Enrichr `Reactome_2022`): Reactome dilisensikan CC BY 4.0; mohon atribusi. https://reactome.org dan https://maayanlab.cloud/Enrichr
- **Human Phenotype Ontology (HPO)**: ID istilah diverifikasi dari API resmi; lihat ketentuan atribusi di https://hpo.jax.org
- **ICD-10 (WHO)**: kode kategori; konfirmasikan dengan edisi yang dipakai institusi Anda.
- **FHIR R4B**: model validasi dari paket `fhir.resources`.

Foto yang dipakai untuk pengujian selama pengembangan berasal dari Wikimedia Commons (domain publik atau Creative Commons) dan **tidak** disertakan di repositori.
