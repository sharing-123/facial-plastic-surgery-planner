"""Optional point-prompted segmentation with MobileSAM (ONNX, CPU). The weights are NOT in the repository: place
`mobile_sam_image_encoder.onnx` and `sam_mask_decoder_single.onnx` (Acly/MobileSAM on Hugging Face, MIT) in server/models,
or set FACESTUDIO_MODELS. Without them the endpoint answers 503 and the browser falls back to its own region growing.

A generic segmenter trained on everyday objects, not on wounds: it can leak into similar colours or stop at a scab. The
clinician always checks the outline."""
import base64
import io
import os
from pathlib import Path

SIDE = 1024


def model_dir() -> Path:
    return Path(os.environ.get("FACESTUDIO_MODELS", Path(__file__).resolve().parents[1] / "models"))


def files() -> tuple[Path, Path]:
    d = model_dir()
    return d / "mobile_sam_image_encoder.onnx", d / "sam_mask_decoder_single.onnx"


def available() -> bool:
    enc, dec = files()
    return enc.is_file() and dec.is_file()


class MobileSAM:
    def __init__(self):
        import onnxruntime as ort

        enc, dec = files()
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self.enc = ort.InferenceSession(str(enc), opts, providers=["CPUExecutionProvider"])
        self.dec = ort.InferenceSession(str(dec), opts, providers=["CPUExecutionProvider"])

    def predict(self, image_rgb, point):
        import cv2
        import numpy as np

        h, w = image_rgb.shape[:2]
        scale = SIDE / max(h, w)
        small = cv2.resize(image_rgb, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA).astype(np.float32)
        emb = self.enc.run(None, {"input_image": small})[0]
        coords = np.asarray([[point[0], point[1]], [0, 0]], np.float32)[None] * scale
        labels = np.asarray([[1, -1]], np.float32)
        out = self.dec.run(None, {"image_embeddings": emb, "point_coords": coords, "point_labels": labels,
                                  "mask_input": np.zeros((1, 1, 256, 256), np.float32), "has_mask_input": np.zeros(1, np.float32),
                                  "orig_im_size": np.asarray([h, w], np.float32)})
        return out[0][0, 0] > 0.0, float(out[1][0, 0])


_MODEL: MobileSAM | None = None


def segment(image_b64: str, point: tuple[float, float]) -> dict:
    """Decode a (small) image, run one point prompt, return a PNG mask as base64."""
    global _MODEL
    import numpy as np
    from PIL import Image

    raw = base64.b64decode(image_b64.split(",", 1)[-1], validate=False)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(img.size) > 1600:
        img.thumbnail((1600, 1600))
    if _MODEL is None:
        _MODEL = MobileSAM()
    mask, iou = _MODEL.predict(np.asarray(img), point)
    buf = io.BytesIO()
    Image.fromarray((mask * 255).astype("uint8")).save(buf, format="PNG")
    return {"mask_b64": base64.b64encode(buf.getvalue()).decode(), "width": img.size[0], "height": img.size[1], "predicted_iou": round(iou, 3)}
