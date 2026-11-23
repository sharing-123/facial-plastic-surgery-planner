# FaceStudio

Facial analysis and surgical planning from one photograph, as a full-stack site: a WebGL landing world, a photo workbench
and a FastAPI backend. Decision support for clinicians; not a diagnosis, no beauty score, no verdict on surgery.

* **web/**: Vite + TypeScript + Three.js + GSAP + Lenis. MediaPipe Face Landmarker (478 points) runs in the browser, so photographs
  never leave the device. Clinical rules are TypeScript ports of the prototype in `smile_symmetry` (RSTL, 34-zone atlas, wound
  geometry, markings, planner, quality gate, proportions).
* **server/**: FastAPI, saved cases per browser workspace (SQLite, or PostgreSQL via `DATABASE_URL`), optional MobileSAM
  segmentation (503 when the weights are absent), health check, serves `web/dist`.
* **tools/**, **scripts/**: asset preparation (head anatomy cut from Ecorche, canonical face export, fixture download).

```powershell
cd web; npm ci; npm run build; npm test; cd ..
pip install -r server/requirements.txt; python -m pytest server/tests -q
python server/run.py        # http://127.0.0.1:8780
docker compose up --build   # with PostgreSQL, http://127.0.0.1:8781
```

See `deploy/DEPLOY.md` for Docker, Hugging Face Spaces and licences. The weights and datasets with non-commercial terms are
never committed.

## Honest limits
Scale without a reference object is an estimate; depth cannot be measured from a photograph (the app shows a range); a photograph
cannot exclude malignancy; the RSTL field is a coarse rule-based approximation; the layered anatomy is an illustration fitted to
the landmarks, not a scan; the differential and plan are rule-based and have not been validated against clinicians.
