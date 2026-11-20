"""Facial symmetry prototype for plastic/reconstructive follow-up (pre- and post-op).

One frontal video, protocol: relaxed ~1 s -> raise brows -> close eyes gently -> smile.
MediaPipe FaceMesh landmarks -> (a) static symmetry at rest, (b) excursion per side
in mm for brow, eyelid and mouth corner, measured from the patient's own rest position.
Two videos (pre/post-op) can be compared.

RESEARCH PROTOTYPE. Not validated against clinician grading (eFACE, Sunnybrook).
Not a medical device. Frontal 2D video only.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np

from face_proportions import annotate, frontal_proportions

# MediaPipe FaceMesh (478 points with iris). "image_left" = patient's right side.
OUTER_EYE_A, OUTER_EYE_B = 33, 263      # outer canthi, define the roll axis
INNER_EYE_A, INNER_EYE_B = 133, 362     # inner canthi, define the midline
IRIS_A_EDGES = (469, 471)               # horizontal iris edges
IRIS_B_EDGES = (474, 476)
IRIS_DIAMETER_MM = 11.7  # population mean horizontal visible iris diameter; ~+-5% error

# (image_left_idx, image_right_idx)
MOUTH = (61, 291)       # oral commissures
BROW = (105, 334)       # mid-brow
LID_UP = (159, 386)     # upper eyelid margin
LID_LOW = (145, 374)    # lower eyelid margin
ALAR = (129, 358)       # alar rim
NOSE_TIP, CHIN = 1, 152
LIP_IN = (13, 14)       # inner upper/lower lip, mouth centre

REGIONS = {"smile": MOUTH, "brow_raise": BROW, "eye_closure": LID_UP}
SIDES = ("image_left(patient_right)", "image_right(patient_left)")


def extract_landmarks(video_path, model_path, max_frames=None):
    """Return (T, 478, 2) pixel landmarks and fps. NaN rows where no face.

    Needs MediaPipe's face_landmarker.task model file (478 points incl. iris).
    """
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    if not Path(model_path).is_file():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    opts = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO, num_faces=1)
    frames = []
    with vision.FaceLandmarker.create_from_options(opts) as mesh:
        while True:
            ok, img = cap.read()
            if not ok or (max_frames and len(frames) >= max_frames):
                break
            h, w = img.shape[:2]
            rgb = mp.Image(image_format=mp.ImageFormat.SRGB,
                           data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            res = mesh.detect_for_video(rgb, int(len(frames) * 1000 / fps))
            if res.face_landmarks:
                frames.append(np.array([[p.x * w, p.y * h] for p in res.face_landmarks[0]]))
            else:
                frames.append(np.full((478, 2), np.nan))
    cap.release()
    return np.stack(frames), fps


def _align(frame):
    """Rotate so the outer-canthi line is horizontal; origin at inner canthus A."""
    a, b = frame[OUTER_EYE_A], frame[OUTER_EYE_B]
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    c, s = math.cos(-ang), math.sin(-ang)
    rot = np.array([[c, -s], [s, c]])
    return (frame - frame[INNER_EYE_A:INNER_EYE_A + 1]) @ rot.T


def _px_per_mm(frame):
    d1 = abs(frame[IRIS_A_EDGES[0], 0] - frame[IRIS_A_EDGES[1], 0])
    d2 = abs(frame[IRIS_B_EDGES[0], 0] - frame[IRIS_B_EDGES[1], 0])
    return np.nanmean([d1, d2]) / IRIS_DIAMETER_MM


def _mm_frames(landmarks):
    """Aligned, mm-scaled points per frame: (T, 478, 2) with y pointing UP.
    Midline (mean x of inner canthi) is moved to x = 0."""
    out = np.full(landmarks.shape, np.nan)
    for t, f in enumerate(landmarks):
        if np.isnan(f).any():
            continue
        pts = _align(f) / _px_per_mm(f)
        pts[:, 1] *= -1
        pts[:, 0] -= 0.5 * (pts[INNER_EYE_A, 0] + pts[INNER_EYE_B, 0])
        out[t] = pts
    return out


def _rest_slice(T, rest_fraction):
    return slice(0, max(3, int(T * rest_fraction)))


def static_rest_metrics(mm, rest_fraction=0.1):
    """Symmetry at rest, from the median of the first frames (midline x = 0)."""
    p = np.nanmedian(mm[_rest_slice(len(mm), rest_fraction)], axis=0)
    a, b = 0, 1  # image_left, image_right

    def pair(idx):
        return p[idx[a]], p[idx[b]]

    ml, mr = pair(MOUTH)
    bl, br = pair(BROW)
    ul, ur = pair(LID_UP)
    ll, lr = pair(LID_LOW)
    al, ar = pair(ALAR)
    mouth_c = 0.5 * (p[LIP_IN[0]] + p[LIP_IN[1]])
    r = lambda v: round(float(v), 2)
    return {
        "mouth_corner_height_diff_mm": r(abs(ml[1] - mr[1])),
        "brow_height_above_lid_mm": {SIDES[0]: r(bl[1] - ul[1]), SIDES[1]: r(br[1] - ur[1])},
        "palpebral_fissure_height_mm": {SIDES[0]: r(ul[1] - ll[1]), SIDES[1]: r(ur[1] - lr[1])},
        "alar_to_midline_mm": {SIDES[0]: r(abs(al[0])), SIDES[1]: r(abs(ar[0]))},
        "mouth_corner_to_midline_mm": {SIDES[0]: r(abs(ml[0])), SIDES[1]: r(abs(mr[0]))},
        "midline_deviation_mm(+=toward_image_right)": {
            "nose_tip": r(p[NOSE_TIP][0]), "mouth_centre": r(mouth_c[0]), "chin": r(p[CHIN][0])},
    }


def region_excursion(mm, pair, fps, rest_fraction=0.1):
    """Excursion of one landmark pair from the patient's own rest, plus peak summary."""
    T = len(mm)
    tr = np.stack([mm[:, pair[0]], mm[:, pair[1]]], axis=1)       # (T, 2, 2)
    rest = np.nanmedian(tr[_rest_slice(T, rest_fraction)], axis=0)
    disp = tr - rest
    mag = np.linalg.norm(disp, axis=2)                            # (T, 2)
    total = np.convolve(np.nan_to_num(mag.sum(axis=1)), np.ones(5) / 5, mode="same")
    peak = int(np.argmax(total))
    lo, hi = mag[peak]
    angle = [math.degrees(math.atan2(disp[peak, i, 1], disp[peak, i, 0])) for i in range(2)]
    summary = {
        "peak_frame": peak,
        "peak_time_s": round(peak / fps, 2),
        "excursion_mm": {SIDES[0]: round(float(lo), 2), SIDES[1]: round(float(hi), 2)},
        "angle_deg": {SIDES[0]: round(angle[0], 1), SIDES[1]: round(angle[1], 1)},
        "excursion_symmetry_ratio": round(float(min(lo, hi) / max(lo, hi)), 3) if max(lo, hi) > 0 else None,
        "weaker_side": SIDES[0] if lo < hi else SIDES[1],
        "height_diff_at_peak_mm": round(float(abs(tr[peak, 0, 1] - tr[peak, 1, 1])), 2),
        "height_diff_at_rest_mm": round(float(abs(rest[0, 1] - rest[1, 1])), 2),
    }
    return mag, summary


CAVEATS = [
    "2D frontal video only; head turn/tilt in depth changes the numbers.",
    "mm scale assumes iris diameter 11.7 mm (about +-5% error).",
    "MediaPipe tends to pull faces toward symmetry, which can understate asymmetry.",
    "Not validated against clinician grading. Not for clinical decisions.",
]


def compute_metrics(landmarks, fps, rest_fraction=0.1):
    """Smile-only view (kept for compatibility): (mag, summary)."""
    mm = _mm_frames(landmarks)
    mag, s = region_excursion(mm, MOUTH, fps, rest_fraction)
    s["valid_frames"] = int((~np.isnan(mag).any(axis=1)).sum())
    s["total_frames"] = len(landmarks)
    s["caveats"] = CAVEATS
    return mag, s


def compute_all(landmarks, fps, rest_fraction=0.1):
    """Static rest metrics + brow, eyelid and smile excursion. Returns (mags, report)."""
    mm = _mm_frames(landmarks)
    mags, report = {}, {"static_rest": static_rest_metrics(mm, rest_fraction), "tasks": {}}
    for name, pair in REGIONS.items():
        mags[name], report["tasks"][name] = region_excursion(mm, pair, fps, rest_fraction)
    rest_pts = np.nanmedian(mm[_rest_slice(len(mm), rest_fraction)], axis=0)
    report["frontal_proportions"] = frontal_proportions(rest_pts)
    ok = ~np.isnan(mm).any(axis=(1, 2))
    report["valid_frames"], report["total_frames"] = int(ok.sum()), len(landmarks)
    report["caveats"] = CAVEATS
    return mags, report


def extract_landmarks_image(image_path, model_path):
    """Landmarks of one still photo: (1, 478, 2) pixels, plus the BGR image."""
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Cannot open image: {image_path}")
    opts = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.IMAGE, num_faces=1)
    h, w = img.shape[:2]
    with vision.FaceLandmarker.create_from_options(opts) as mesh:
        res = mesh.detect(mp.Image(image_format=mp.ImageFormat.SRGB,
                                   data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    if not res.face_landmarks:
        raise ValueError("No face detected in the photo")
    pts = np.array([[p.x * w, p.y * h] for p in res.face_landmarks[0]])
    return pts[None], img


def analyze_photo(landmarks):
    """Static report for one frontal photo (no movement): rest symmetry + proportions."""
    mm = _mm_frames(landmarks)
    return {"static_rest": static_rest_metrics(mm, 1.0),
            "frontal_proportions": frontal_proportions(mm[0]),
            "caveats": CAVEATS + ["Photo must be frontal, neutral expression, head level "
                                  "(Frankfort horizontal), eyes open and looking ahead."]}


def compare(pre, post):
    """Change between two reports (post minus pre), per task."""
    out = {}
    for task in pre["tasks"]:
        a, b = pre["tasks"][task], post["tasks"][task]
        d = {f"excursion_change_mm[{s}]": round(b["excursion_mm"][s] - a["excursion_mm"][s], 2)
             for s in SIDES}
        ra, rb = a["excursion_symmetry_ratio"], b["excursion_symmetry_ratio"]
        d["symmetry_ratio_change"] = None if ra is None or rb is None else round(rb - ra, 3)
        out[task] = d
    return out


def save_outputs(mags, report, fps, outdir, label):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    T = len(next(iter(mags.values())))
    t = np.arange(T) / fps
    cols = [t] + [mags[k][:, i] for k in mags for i in range(2)]
    head = "time_s," + ",".join(f"{k}_{s}_mm" for k in mags for s in ("image_left", "image_right"))
    np.savetxt(outdir / f"{label}_excursion.csv", np.column_stack(cols),
               delimiter=",", header=head, comments="")
    (outdir / f"{label}_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    fig, axes = plt.subplots(len(mags), 1, figsize=(7, 2.6 * len(mags)), sharex=True)
    for ax, (name, mag) in zip(np.atleast_1d(axes), mags.items()):
        s = report["tasks"][name]
        ax.plot(t, mag[:, 0], label="image-left (patient right)")
        ax.plot(t, mag[:, 1], label="image-right (patient left)")
        ax.axvline(s["peak_time_s"], ls="--", c="gray")
        ax.set_ylabel("mm from rest")
        ax.set_title(f"{name}: symmetry ratio {s['excursion_symmetry_ratio']}", fontsize=9)
    np.atleast_1d(axes)[0].legend(fontsize=7)
    np.atleast_1d(axes)[-1].set_xlabel("time (s)")
    fig.tight_layout()
    fig.savefig(outdir / f"{label}_plot.png", dpi=150)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("video", help="video: relaxed, brow raise, eye close, smile "
                                  "(or a frontal photo with --photo)")
    ap.add_argument("--pre", help="optional pre-op video for comparison")
    ap.add_argument("--photo", action="store_true",
                    help="input is one frontal photo: proportions and rest symmetry only")
    ap.add_argument("--model", default="face_landmarker.task",
                    help="path to MediaPipe face_landmarker.task")
    ap.add_argument("--out", default="output")
    ap.add_argument("--force", action="store_true",
                    help="measure even if the quality gate says CANNOT_ASSESS (flagged in the report)")
    args = ap.parse_args()
    from quality_gate import REFUSE, assess

    def refuse(label, gate):
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{label}_report.json").write_text(
            json.dumps({"quality_gate": gate, "measurements": None}, indent=2), encoding="utf-8")
        print(f"[{label}] TIDAK DAPAT DINILAI (CANNOT_ASSESS). Tidak ada angka yang dikeluarkan.")
        for f in gate["failures"]:
            print("  -", f["message"])
        print("  Perbaiki pengambilan gambar dan ulangi, atau pakai --force bila Anda paham risikonya.")

    if args.photo:
        lm, img = extract_landmarks_image(args.video, args.model)
        gate = assess(lm, image=img)
        if gate["status"] == REFUSE and not args.force:
            refuse("photo", gate)
            return
        report = analyze_photo(lm)
        report["quality_gate"] = gate
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        from overlay import draw_overlay
        draw_overlay(img, lm[0], report, out / "photo_overlay.png")
        (out / "photo_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return

    results = {}
    for label, path in (("pre", args.pre), ("post" if args.pre else "video", args.video)):
        if not path:
            continue
        lm, fps = extract_landmarks(path, args.model)
        import cv2
        from overlay import draw_overlay
        cap = cv2.VideoCapture(str(path))
        ok, first = cap.read()
        cap.release()
        gate = assess(lm, image=first if ok else None)
        if gate["status"] == REFUSE and not args.force:
            refuse(label, gate)
            return
        mags, report = compute_all(lm, fps)
        report["quality_gate"] = gate
        save_outputs(mags, report, fps, args.out, label)
        if ok:    # overlay on the first frame using the median rest landmarks
            rest_lm = np.nanmedian(lm[_rest_slice(len(lm), 0.1)], axis=0)
            draw_overlay(first, rest_lm, report, Path(args.out) / f"{label}_overlay.png")
        results[label] = report
        print(label, json.dumps(report, indent=2))
    if "pre" in results:
        print("change", json.dumps(compare(results["pre"], results["post"]), indent=2))


if __name__ == "__main__":
    main()
