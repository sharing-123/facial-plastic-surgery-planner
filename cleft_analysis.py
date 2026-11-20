"""Unilateral cleft lip: frontal nasolabial symmetry from clicked landmarks.

MediaPipe is not trained on clefts and mis-places points around the lip and nose, so the
cleft landmarks are CLICKED by the clinician. MediaPipe is used only for roll correction and
the mm scale (iris, 11.7 mm, about +-5%), which the cleft does not distort; if no face is found
give --mm-per-px instead.

Output is measurements and left/right symmetry ratios (1.0 = symmetric), plus a before/after
comparison. There is NO severity grade, NO aesthetic score and NO surgical recommendation:
established cleft scales (e.g. Asher-McDade) are rated by trained clinicians, and nothing here
has been validated against them. Research prototype.

Side naming: R / L = the PATIENT's right / left (R is on the image-left of a frontal photo).
"""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np

# click order; every point is on a frontal photograph
POINTS = [
    ("nasion", "nasion (midline between the eyes)"),
    ("prn", "pronasale (nasal tip)"),
    ("sn", "subnasale (columella base)"),
    ("sbal_R", "subalare, patient RIGHT (alar base attachment)"),
    ("sbal_L", "subalare, patient LEFT"),
    ("al_R", "alare, patient RIGHT (most lateral alar point)"),
    ("al_L", "alare, patient LEFT"),
    ("cph_R", "cupid's bow peak (crista philtri at vermilion border), patient RIGHT"),
    ("cph_L", "cupid's bow peak, patient LEFT"),
    ("ls", "labiale superius (centre of the cupid's bow)"),
    ("ch_R", "cheilion (mouth corner), patient RIGHT"),
    ("ch_L", "cheilion (mouth corner), patient LEFT"),
]
KEYS = [k for k, _ in POINTS]

# (green_limit, yellow_limit) screening bands; arbitrary prototype values, not clinical cut-offs
RATIO_BANDS = (0.90, 0.80)             # min/max ratio: >= green, >= yellow
MM_BANDS = {"cupid_bow_level_diff_mm": (1.0, 2.0), "commissure_level_diff_mm": (1.0, 2.0),
            "alar_base_level_diff_mm": (1.0, 2.0), "nasal_tip_deviation_mm": (2.0, 4.0),
            "columella_deviation_deg": (5.0, 10.0), "cupid_bow_tilt_deg": (3.0, 6.0)}


def measure(pts_mm):
    """pts_mm: dict key -> (x, y) in mm, face-aligned (y up, x = 0 on the midline)."""
    p = {k: np.asarray(v, float) for k, v in pts_mm.items()}
    d = lambda a, b: float(np.linalg.norm(p[a] - p[b]))
    rl = lambda name, r, l: {"R": round(r, 2), "L": round(l, 2),
                             "ratio_min_over_max": round(min(r, l) / max(r, l), 3) if max(r, l) > 0 else None}

    lip_h = rl("lateral_lip_height", d("sbal_R", "cph_R"), d("sbal_L", "cph_L"))
    alar_dist = rl("alar_base_to_midline", abs(p["sbal_R"][0]), abs(p["sbal_L"][0]))
    alar_w = rl("alare_to_subnasale", abs(p["al_R"][0] - p["sn"][0]), abs(p["al_L"][0] - p["sn"][0]))
    comm_dist = rl("commissure_to_midline", abs(p["ch_R"][0]), abs(p["ch_L"][0]))
    bow_h = rl("cupid_bow_peak_to_subnasale", d("cph_R", "sn"), d("cph_L", "sn"))

    cph_dx = p["cph_L"][0] - p["cph_R"][0]
    tilt = math.degrees(math.atan2(p["cph_L"][1] - p["cph_R"][1], cph_dx))
    col = p["prn"] - p["sn"]
    out = {
        "lateral_lip_height_mm": lip_h,
        "cupid_bow_peak_to_subnasale_mm": bow_h,
        "alar_base_to_midline_mm": alar_dist,
        "alare_to_subnasale_mm": alar_w,
        "commissure_to_midline_mm": comm_dist,
        "cupid_bow_width_mm": round(abs(cph_dx), 2),
        "cupid_bow_tilt_deg": round(tilt, 1),
        "cupid_bow_level_diff_mm": round(abs(p["cph_L"][1] - p["cph_R"][1]), 2),
        "cupid_bow_centre_offset_mm": round(float(p["ls"][0]), 2),
        "commissure_level_diff_mm": round(abs(p["ch_L"][1] - p["ch_R"][1]), 2),
        "alar_base_level_diff_mm": round(abs(p["sbal_L"][1] - p["sbal_R"][1]), 2),
        "nasal_tip_deviation_mm": round(float(p["prn"][0]), 2),
        "columella_deviation_deg": round(math.degrees(math.atan2(col[0], col[1])), 1),
        "subnasale_offset_mm": round(float(p["sn"][0]), 2),
        "shorter_lip_side": "R" if lip_h["R"] < lip_h["L"] else "L",
        "note_shorter_lip_side": "side with the shorter lateral lip height; the clinician confirms which side is the cleft",
    }
    return out


def status(name, value):
    """Traffic-light colour name for a measurement, or None if no band applies."""
    if isinstance(value, dict):
        r = value["ratio_min_over_max"]
        if r is None:
            return None
        return "green" if r >= RATIO_BANDS[0] else "yellow" if r >= RATIO_BANDS[1] else "red"
    if name in MM_BANDS:
        g, y = MM_BANDS[name]
        v = abs(value)
        return "green" if v <= g else "yellow" if v <= y else "red"
    return None


def compare(pre, post):
    """Change (post minus pre) in ratios and absolute asymmetries. Positive ratio change = more symmetric."""
    out = {}
    for k, v in pre.items():
        w = post[k]
        if isinstance(v, dict) and "ratio_min_over_max" in v and v["ratio_min_over_max"] is not None:
            out[k] = {"ratio_change": round(w["ratio_min_over_max"] - v["ratio_min_over_max"], 3)}
        elif k in MM_BANDS:
            out[k] = {"pre": v, "post": w, "abs_change": round(abs(w) - abs(v), 2)}
    return out


def analyse(clicks_px, frame):
    """clicks_px: dict key -> (x, y) px. frame: wound_planner.FaceFrame (or anything with
    to_mm). The midline is the vertical line through the clicked nasion in the roll-corrected frame."""
    q = {k: frame.to_mm(np.asarray(clicks_px[k], float)) for k in KEYS}
    mid = q["nasion"][0]
    pts = {k: np.array([v[0] - mid, v[1]]) for k, v in q.items()}
    m = measure(pts)
    m["caveats"] = ["Clicked landmarks: error depends on the clinician and photo quality.",
                    "2D frontal photo; nostril shape, alar flaring and lip projection need base/profile views.",
                    "mm from the iris scale (about +-5%).",
                    "Screening colours only. No severity grade, no aesthetic score, no surgical recommendation."]
    return m, pts


class PlainFrame:
    """Fallback when no face is detected: given scale and roll."""

    def __init__(self, mm_per_px, roll_deg=0.0):
        a = math.radians(roll_deg)
        self.rot = np.array([[math.cos(-a), -math.sin(-a)], [math.sin(-a), math.cos(-a)]])
        self.scale = 1.0 / mm_per_px

    def to_mm(self, P):
        q = (np.asarray(P, float) @ self.rot.T) / self.scale
        q[..., 1] *= -1
        return q


def draw(image_bgr, clicks_px, report, out_path, min_width=1600):
    from overlay import _pt, _text
    f = max(1.0, min_width / image_bgr.shape[1])
    img = cv2.resize(image_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) if f > 1 else image_bgr.copy()
    k, th = img.shape[0] / 1000.0, max(2, int(round(2 * img.shape[0] / 1000.0)))
    P = {n: tuple(int(round(v * f)) for v in clicks_px[n]) for n in KEYS}
    col = {"green": (80, 190, 60), "yellow": (0, 200, 240), "red": (60, 60, 230), None: (230, 230, 230)}
    nx = P["nasion"][0]
    cv2.line(img, (nx, 0), (nx, img.shape[0]), (255, 255, 255), max(1, th // 2), cv2.LINE_AA)
    pairs = (("cph_R", "cph_L", "cupid_bow_level_diff_mm"), ("ch_R", "ch_L", "commissure_level_diff_mm"),
             ("sbal_R", "sbal_L", "alar_base_level_diff_mm"))
    for a, b, key in pairs:
        cv2.line(img, P[a], P[b], col[status(key, report[key])], th, cv2.LINE_AA)
    for a, b, key in (("sbal_R", "cph_R", "lateral_lip_height_mm"), ("sbal_L", "cph_L", "lateral_lip_height_mm")):
        cv2.line(img, P[a], P[b], col[status(key, report[key])], th, cv2.LINE_AA)
    for n in KEYS:
        cv2.circle(img, P[n], th + 3, (255, 200, 0), -1, cv2.LINE_AA)
        _text(img, n, (P[n][0] + 8, P[n][1] - 8), 0.5 * k, (255, 200, 0))
    pw = int(img.shape[0] * 0.62)
    H = max(img.shape[0], int(1100 * k))
    panel = np.full((H, pw, 3), 28, np.uint8)
    if H > img.shape[0]:
        img = cv2.copyMakeBorder(img, 0, H - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(28, 28, 28))
    y = int(50 * k)
    _pt(panel, "CLEFT LIP: nasolabial symmetry", (int(16 * k), y), 0.8 * k, (255, 255, 255), max(1, int(k)))
    y += int(32 * k)
    _pt(panel, "measurements only, no grade or recommendation", (int(16 * k), y), 0.48 * k, (180, 180, 180))
    y += int(44 * k)
    rows = [(n, report[n]) for n in ("lateral_lip_height_mm", "alar_base_to_midline_mm", "commissure_to_midline_mm",
                                      "cupid_bow_peak_to_subnasale_mm")]
    for name, v in rows:
        c = col[status(name, v)]
        cv2.rectangle(panel, (int(16 * k), y - int(16 * k)), (int(34 * k), y + int(2 * k)), c, -1)
        _pt(panel, name.replace("_mm", "").replace("_", " "), (int(46 * k), y), 0.5 * k, (255, 255, 255))
        _pt(panel, f"R {v['R']}  L {v['L']}  ratio {v['ratio_min_over_max']}", (int(46 * k), y + int(22 * k)), 0.5 * k, c)
        y += int(50 * k)
    for name in MM_BANDS:
        v = report[name]
        c = col[status(name, v)]
        cv2.rectangle(panel, (int(16 * k), y - int(16 * k)), (int(34 * k), y + int(2 * k)), c, -1)
        _pt(panel, f"{name.replace('_', ' ')}: {v}", (int(46 * k), y), 0.5 * k, c)
        y += int(36 * k)
    _pt(panel, f"shorter lip side: {report['shorter_lip_side']} (clinician confirms)", (int(16 * k), y + int(10 * k)), 0.5 * k, (230, 230, 230))
    cv2.imwrite(str(out_path), np.hstack([img, panel]))


def click_points(image_path):
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(image_path)
    clicks = []

    def on_mouse(ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN and len(clicks) < len(POINTS):
            clicks.append((x, y))
            cv2.circle(img, (x, y), 4, (0, 255, 0), -1)

    cv2.namedWindow("cleft")
    cv2.setMouseCallback("cleft", on_mouse)
    while len(clicks) < len(POINTS):
        shown = img.copy()
        cv2.putText(shown, f"click: {POINTS[len(clicks)][1]}", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        cv2.imshow("cleft", shown)
        if cv2.waitKey(20) == 27:
            cv2.destroyAllWindows()
            raise SystemExit("cancelled")
    cv2.destroyAllWindows()
    return dict(zip(KEYS, clicks))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image", help="frontal photo, neutral expression, head level")
    ap.add_argument("--pre", help="optional pre-op photo: compares pre and post")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--mm-per-px", type=float, help="scale if no face is detected for the iris scale")
    ap.add_argument("--out", default="cleft_output")
    args = ap.parse_args()
    import smile_symmetry as ss
    from wound_planner import FaceFrame

    def one(path, label):
        img = cv2.imread(str(path))
        try:
            lm, _ = ss.extract_landmarks_image(path, args.model)
            frame = FaceFrame(lm[0])
        except Exception:
            if not args.mm_per_px:
                raise SystemExit("No face found for the scale. Pass --mm-per-px.")
            frame = PlainFrame(args.mm_per_px)
        clicks = click_points(path)
        rep, _ = analyse(clicks, frame)
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        draw(img, clicks, rep, out / f"{label}_cleft.png")
        (out / f"{label}_cleft.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
        return rep

    post = one(args.image, "post" if args.pre else "photo")
    if args.pre:
        pre = one(args.pre, "pre")
        print(json.dumps(compare(pre, post), indent=2))
    else:
        print(json.dumps({k: v for k, v in post.items() if k != "caveats"}, indent=2))


if __name__ == "__main__":
    main()
