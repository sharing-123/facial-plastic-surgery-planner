"""Downloads the model files that are NOT stored in the repository (size and licences). Run once after cloning:

    python scripts/download_models.py

 - face_landmarker.task : MediaPipe Face Landmarker (Google, Apache-2.0), about 3.7 MB
 - mobile_sam_image_encoder.onnx, sam_mask_decoder_single.onnx : MobileSAM converted to ONNX
   (Hugging Face Acly/MobileSAM, MIT; original MobileSAM is Apache-2.0), about 28 MB and 16 MB
"""
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    ("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", ROOT / "face_landmarker.task", 3_000_000),
    ("https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx", ROOT / "models" / "mobile_sam_image_encoder.onnx", 20_000_000),
    ("https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx", ROOT / "models" / "sam_mask_decoder_single.onnx", 10_000_000),
]


def main():
    for url, dest, min_size in FILES:
        if dest.exists() and dest.stat().st_size >= min_size:
            print("ok (exists):", dest.name)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        print("downloading", dest.name, "...", flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "download-models/1.0"})
        with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
            f.write(r.read())
        if dest.stat().st_size < min_size:
            dest.unlink()
            sys.exit(f"download of {dest.name} looks incomplete; try again")
        print("  saved", dest.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
