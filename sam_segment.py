"""Precise wound/scar contour with MobileSAM (ONNX, runs locally on CPU, no torch needed).

Prompted by the clinician's rough outline: a box from the outline, positive points inside it and negative points in a
ring just outside, so the model snaps to the real tissue edge. Falls back to GrabCut (wound_segment) if the model
files are missing. Weights: Acly/MobileSAM on Hugging Face (MIT), converted from MobileSAM (Apache-2.0).

LIMITS: a generic segmenter trained on everyday objects, not on wounds. It can leak into similar colours, merge a
wound with a nearby bruise or blood smear, or stop at a scab. Always check the contour; the clinician can add positive
or negative points and run again. Accuracy on clinical wounds is not validated.
"""
from pathlib import Path

import cv2
import numpy as np

MODEL_DIR = Path(__file__).parent / "models"
ENC, DEC = MODEL_DIR / "mobile_sam_image_encoder.onnx", MODEL_DIR / "sam_mask_decoder_single.onnx"
SIDE = 1024


def available():
    return ENC.is_file() and DEC.is_file()


class MobileSAM:
    def __init__(self):
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        self.enc = ort.InferenceSession(str(ENC), opts, providers=["CPUExecutionProvider"])
        self.dec = ort.InferenceSession(str(DEC), opts, providers=["CPUExecutionProvider"])
        self._key, self.emb, self.size, self.scale = None, None, None, 1.0

    def set_image(self, image_bgr):
        key = (image_bgr.shape, int(image_bgr[::97, ::89].sum()))
        if key == self._key:
            return
        h, w = image_bgr.shape[:2]
        self.scale = SIDE / max(h, w)
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        small = cv2.resize(rgb, (round(w * self.scale), round(h * self.scale)), interpolation=cv2.INTER_AREA).astype(np.float32)
        self.emb = self.enc.run(None, {"input_image": small})[0]
        self.size, self._key = (h, w), key

    def predict(self, pos=(), neg=(), box=None):
        """Points in original image px (x, y). Returns (mask bool HxW, predicted IoU)."""
        pts, lab = [], []
        for p in pos:
            pts.append(p); lab.append(1)
        for p in neg:
            pts.append(p); lab.append(0)
        if box is not None:
            x0, y0, x1, y1 = box
            pts += [(x0, y0), (x1, y1)]; lab += [2, 3]
        else:
            pts.append((0, 0)); lab.append(-1)
        coords = (np.asarray(pts, np.float32) * self.scale)[None]
        out = self.dec.run(None, {"image_embeddings": self.emb, "point_coords": coords, "point_labels": np.asarray(lab, np.float32)[None],
                                  "mask_input": np.zeros((1, 1, 256, 256), np.float32), "has_mask_input": np.zeros(1, np.float32),
                                  "orig_im_size": np.asarray(self.size, np.float32)})
        return out[0][0, 0] > 0.0, float(out[1][0, 0])


_MODEL = None


def model():
    global _MODEL
    if _MODEL is None:
        _MODEL = MobileSAM()
    return _MODEL


def segment(image_bgr, outline_px, extra_pos=(), extra_neg=(), min_overlap=0.5):
    """outline_px: rough polygon (n x 2) around the wound. Returns (mask, info). Falls back to the outline itself
    when the segmentation disagrees strongly with it (a sign the model leaked or missed)."""
    h, w = image_bgr.shape[:2]
    poly = np.asarray(outline_px, np.float32)
    seed = np.zeros((h, w), np.uint8)
    cv2.fillPoly(seed, [np.round(poly).astype(np.int32).reshape(-1, 1, 2)], 1)
    seed = seed > 0
    ys, xs = np.nonzero(seed)
    box = (xs.min(), ys.min(), xs.max(), ys.max())
    m = model()
    m.set_image(image_bgr)
    # positive points: centroid and the deepest interior points of the outline; negative: just outside the outline
    dist = cv2.distanceTransform(seed.astype(np.uint8), cv2.DIST_L2, 3)
    cy, cx = np.unravel_index(int(dist.argmax()), dist.shape)
    pos = [(cx, cy)] + [tuple(p) for p in extra_pos]
    r = max(6, int(0.15 * np.sqrt(seed.sum())))
    ring = cv2.dilate(seed.astype(np.uint8), np.ones((2 * r + 1, 2 * r + 1), np.uint8)) > 0
    outside = ring & ~cv2.dilate(seed.astype(np.uint8), np.ones((r + 1, r + 1), np.uint8)).astype(bool)
    oy, ox = np.nonzero(outside)
    rng = np.random.default_rng(0)
    neg = [tuple(p) for p in extra_neg]
    if len(ox):
        for i in rng.choice(len(ox), size=min(4, len(ox)), replace=False):
            neg.append((ox[i], oy[i]))
    mask, iou = m.predict(pos, neg, box)
    inter = (mask & seed).sum()
    overlap = inter / max(seed.sum(), 1)
    cover = inter / max(mask.sum(), 1)
    ok = overlap >= min_overlap and cover >= 0.35
    info = {"method": "mobilesam" if ok else "outline_fallback", "predicted_iou": round(iou, 3),
            "overlap_with_outline": round(float(overlap), 3), "mask_inside_outline": round(float(cover), 3)}
    if not ok:
        info["note"] = "SAM disagreed with the outline (leak or miss); the clinician outline is used. Add positive or negative points and retry."
        return seed, info
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    return mask, info


def segment_consensus(image_bgr, outline_px, extra_pos=(), extra_neg=(), n=7, seed=0):
    """Majority vote over n prompts perturbed around the clinician's outline. Returns (mask, info) where info carries a
    stability score: the mean IoU of each member with the consensus (1.0 = identical regardless of small prompt changes).
    A low stability means the contour depends on exactly where you clicked: do not trust it, add positive/negative points."""
    h, w = image_bgr.shape[:2]
    poly = np.asarray(outline_px, np.float32)
    ctr = poly.mean(axis=0)
    rng = np.random.default_rng(seed)
    members, infos = [], []
    for i in range(n):
        sc = 1.0 if i == 0 else rng.uniform(0.92, 1.12)
        jit = np.zeros_like(poly) if i == 0 else rng.normal(0, 0.01 * max(h, w) / 4, poly.shape)
        o = ctr + (poly - ctr) * sc + jit
        m, info = segment(image_bgr, o, extra_pos, extra_neg)
        members.append(m)
        infos.append(info)
    votes = np.mean([m.astype(np.float32) for m in members], axis=0)
    cons = votes >= 0.5
    ious = [float((m & cons).sum() / max((m | cons).sum(), 1)) for m in members]
    used = sum(1 for i in infos if i["method"] == "mobilesam")
    info = {"method": "mobilesam_consensus" if used >= n // 2 + 1 else "outline_fallback", "members_used_sam": used, "members": n,
            "stability": round(float(np.mean(ious)), 3), "min_member_iou": round(float(min(ious)), 3),
            "predicted_iou_mean": round(float(np.mean([i["predicted_iou"] for i in infos])), 3)}
    if used < n // 2 + 1:
        seed_mask = np.zeros((h, w), np.uint8)
        cv2.fillPoly(seed_mask, [np.round(poly).astype(np.int32).reshape(-1, 1, 2)], 1)
        info["note"] = "SAM disagreed with the outline in most runs; the clinician outline is used."
        return seed_mask > 0, info
    if info["stability"] < 0.75:
        info["warning"] = "Kontur tidak stabil terhadap perubahan kecil prompt. Tambahkan titik positif (di jaringan luka) dan negatif (di kulit sehat), lalu ulangi; periksa kontur secara manual."
    return cons, info

