# Deploying FaceStudio

FaceStudio is one container: the FastAPI server plus the built web app. Landmarks, measurements and plans run in the
visitor's browser, so the server only stores what a visitor saves (numbers and a small thumbnail). Photographs are never
uploaded.

## Local, no Docker
```powershell
cd web; npm ci; npm run build; cd ..
pip install -r server/requirements.txt
python server/run.py            # http://127.0.0.1:8780
```
Set `DATABASE_URL=postgresql://user:pass@host:5432/db` to use PostgreSQL; without it a SQLite file is used.

## Docker with a real PostgreSQL
```powershell
docker compose up --build       # http://127.0.0.1:8781
```

## Hugging Face Space (Docker)
1. Create a Space with SDK "Docker" (public or private) and note its id, for example `your-name/facestudio`.
2. Create a write token at https://huggingface.co/settings/tokens.
3. Run, with your own token:
```powershell
$env:HF_TOKEN = "hf_xxx"; python deploy/push_hf.py your-name/facestudio
```
4. For persistence set the Space secret `DATABASE_URL` to a PostgreSQL URL (Neon, Supabase, or similar). Without it the
   SQLite file lives in the container and is lost on restart. The script excludes weights, fixtures and local databases.

## Optional segmentation weights
`/api/segment` uses MobileSAM (MIT). Put `mobile_sam_image_encoder.onnx` and `sam_mask_decoder_single.onnx` from
`Acly/MobileSAM` in `server/models` (or point `FACESTUDIO_MODELS` at a folder). Without them the endpoint answers 503 and
the browser outlines lesions itself. Weights are never committed.

## Licences you must keep
* `web/public/models/head_anatomy.glb` is derived from Ecorche (CC BY-SA 4.0; BodyParts3D CC BY; Z-Anatomy CC BY-SA). Keep the credit
  in the page footer and `NOTICE-head_anatomy.txt`; share the mesh under the same licence.
* `web/public/models/face_landmarker.task` is the MediaPipe Face Landmarker model (Apache-2.0).
* `web/public/samples/` are public-domain official portraits; see `ATTRIBUTION.json`.
