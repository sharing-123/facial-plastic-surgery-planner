"""Before / after comparison for reconstruction or aesthetic surgery.

Method (what is done, in order):
 1. QUALITY: both photos go through the quality gate; if either is refused nothing is compared.
 2. REGISTRATION: the post photo is mapped onto the pre photo with a similarity transform (rotation,
    uniform scale, shift) fitted by RANSAC on stable landmarks (eye corners, nasion). Non-rigid change
    (the surgery itself, expression, swelling) is deliberately NOT registered away.
 3. MEASUREMENT: the same measurements are taken on both photos in the face-aligned mm frame
    (rest symmetry, proportions, nasal index, canthal tilt, midline deviation, mirror asymmetry).
 4. NOISE FLOOR: each photo's landmarks are jittered 60 times (and a practical per-metric floor from re-detection drift is applied) (about 0.15% of face width, a typical
    landmark error) and every measurement re-computed. A change is only called a change when it is
    larger than 2x the combined jitter spread. This quantifies sensitivity to landmark error ONLY: it
    does not capture pose, expression, lighting or lens differences between visits. Real test-retest
    repeatability needs repeated photos of the same person (two photos on the same day).
 5. VISUAL: pre | registered post | 50% blend | colour-difference heat map. Valid only for similar
    lighting, distance and expression.
 6. Optional lines/acne deltas, only for zones analysed in BOTH photos and only if the two photos are
    comparable in sharpness and brightness.

The tool states what changed and whether it exceeds the noise floor. It does NOT say that the result
is good or beautiful, and it makes no claim about cause (surgery vs swelling vs expression).
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

import smile_symmetry as ss

STABLE = [33, 133, 263, 362, 168]            # eye corners and nasion: unaffected by most face surgery
SYMMETRY_KEYS = {                              # smaller is better: improvement = |post| < |pre|
    "mouth_corner_height_diff_mm", "brow_height_diff_mm", "fissure_height_diff_mm", "nose_tip_dev_mm",
    "mouth_centre_dev_mm", "chin_dev_mm", "alar_level_diff_mm", "mirror_mean_mm"}
NOISE_SIGMA_FRAC = 0.0015
N_TRIALS = 60
K_NOISE = 2.0
# Practical floors: re-running the detector on a slightly different image drifts more than landmark jitter alone
# (observed on a real photo with a simulated local warp: spurious shifts of ~1.5 mm, ~0.02-0.04 in ratios, ~2 in nasal
# index). A change smaller than this is never called a change. Set from ONE experiment: replace with real test-retest data.
FLOORS = {"_mm": 1.5, "_deg": 1.5, "fifth_": 0.025, "middle_to_lower_third": 0.05, "alar_to_intercanthal": 0.05,
          "mouth_to_alar": 0.05, "lower_to_upper_vermilion": 0.4, "nasal_index": 4.0, "bigonial_to_bizygomatic": 0.04}


def practical_floor(key):
    for pat, v in FLOORS.items():
        if (pat.startswith("_") and key.endswith(pat)) or (not pat.startswith("_") and key.startswith(pat)):
            return v
    return 0.0


def flatten(report):
    """Scalar measurements from ss.analyze_photo(...)."""
    s, f = report["static_rest"], report["frontal_proportions"]
    R, L = ss.SIDES
    md = s["midline_deviation_mm(+=toward_image_right)"]
    flat = {
        "mouth_corner_height_diff_mm": s["mouth_corner_height_diff_mm"],
        "brow_height_diff_mm": abs(s["brow_height_above_lid_mm"][R] - s["brow_height_above_lid_mm"][L]),
        "fissure_height_diff_mm": abs(s["palpebral_fissure_height_mm"][R] - s["palpebral_fissure_height_mm"][L]),
        "nose_tip_dev_mm": abs(md["nose_tip"]), "mouth_centre_dev_mm": abs(md["mouth_centre"]), "chin_dev_mm": abs(md["chin"]),
        "alar_level_diff_mm": f["nose_frontal"]["alar_level_diff_mm"], "mirror_mean_mm": f["mirror_asymmetry"]["mean_mm"],
        "canthal_tilt_R_deg": f["canthal_tilt_deg"]["image_left"], "canthal_tilt_L_deg": f["canthal_tilt_deg"]["image_right"],
        "middle_to_lower_third": f["ratios"]["middle_to_lower_third"], "alar_to_intercanthal": f["ratios"]["alar_to_intercanthal"],
        "mouth_to_alar": f["ratios"]["mouth_to_alar"], "lower_to_upper_vermilion": f["ratios"]["lower_to_upper_vermilion"] or float("nan"),
        "nasal_index": f["nose_frontal"]["nasal_index"], "alar_width_mm": f["nose_frontal"]["alar_width_mm"],
        "mouth_width_mm": s["mouth_corner_to_midline_mm"][ss.SIDES[0]] + s["mouth_corner_to_midline_mm"][ss.SIDES[1]],
        "bigonial_to_bizygomatic": f["ratios"]["bigonial_to_bizygomatic"],
    }
    for k in ("outer_left", "eye_left", "intercanthal", "eye_right", "outer_right"):
        flat[f"fifth_{k}"] = f["ratios"]["fifths_of_bizygomatic"][k]
    return flat


def measure(lm_px):
    return flatten(ss.analyze_photo(lm_px[None] if lm_px.ndim == 2 else lm_px))


def noise_floor(lm_px, n=N_TRIALS, seed=0):
    """Standard deviation of every measurement under landmark jitter."""
    rng = np.random.default_rng(seed)
    width = np.linalg.norm(lm_px[234] - lm_px[454])
    runs = []
    for _ in range(n):
        runs.append(measure(lm_px + rng.normal(0, NOISE_SIGMA_FRAC * width, lm_px.shape)))
    return {k: float(np.nanstd([r[k] for r in runs])) for k in runs[0]}


def similarity(src_lm, dst_lm):
    """Similarity transform mapping src landmarks onto dst landmarks (RANSAC). Returns (2x3, inlier rms px)."""
    a, b = src_lm[STABLE].astype(np.float32), dst_lm[STABLE].astype(np.float32)
    M, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=3.0)
    res = np.linalg.norm(a @ M[:, :2].T + M[:, 2] - b, axis=1)
    return M, float(np.sqrt((res ** 2).mean()))


def compare_measurements(pre, post, noise_pre, noise_post):
    out = {}
    for k in pre:
        a, b = pre[k], post[k]
        if a is None or b is None or np.isnan(a) or np.isnan(b):
            continue
        d = b - a
        floor = max(K_NOISE * float(np.hypot(noise_pre[k], noise_post[k])), practical_floor(k)) / K_NOISE
        beyond = abs(d) > K_NOISE * floor
        entry = {"pre": round(a, 2), "post": round(b, 2), "delta": round(d, 2), "noise_floor_sd": round(floor, 3),
                 "beyond_landmark_noise": bool(beyond)}
        if not beyond:
            entry["verdict"] = "no change beyond landmark noise"
        elif k in SYMMETRY_KEYS:
            entry["verdict"] = "more symmetric" if abs(b) < abs(a) else "less symmetric"
        else:
            entry["verdict"] = "changed (direction is not good/bad by itself)"
        out[k] = entry
    return out


def visual(pre_img, post_img_registered, out_path, tile=900):
    lab = lambda im: cv2.cvtColor(im.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
    de = np.linalg.norm(lab(pre_img) - lab(post_img_registered), axis=2)
    de = cv2.GaussianBlur(de, (0, 0), 3)
    heat = cv2.applyColorMap(np.clip(de / 30.0 * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
    blend = cv2.addWeighted(pre_img, 0.5, post_img_registered, 0.5, 0)
    s = tile / pre_img.shape[0]
    panels = [cv2.resize(x, None, fx=s, fy=s) for x in (pre_img, post_img_registered, blend, heat)]
    for p, t in zip(panels, ("PRE", "POST (registered)", "50% blend", "colour difference")):
        cv2.putText(p, t, (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(p, t, (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(str(out_path), np.hstack(panels))
    return float(de.mean())


def comparable(pre_img, post_img):
    """Sharpness and brightness similarity needed before lines/acne can be compared."""
    g = lambda im: cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    sharp = lambda im: float(cv2.Laplacian(cv2.resize(g(im), (800, 800)), cv2.CV_64F).var())
    sa, sb = sharp(pre_img), sharp(post_img)
    ba, bb = float(g(pre_img).mean()), float(g(post_img).mean())
    ok = 0.5 <= sa / max(sb, 1e-6) <= 2.0 and abs(ba - bb) / max(ba, bb) <= 0.2
    return ok, {"sharpness_ratio": round(sa / max(sb, 1e-6), 2), "brightness_pre": round(ba), "brightness_post": round(bb)}


def run(pre_img, pre_lm, post_img, post_lm, out_dir=None, lines=False, acne=False):
    from quality_gate import REFUSE, assess
    gp, gq = assess(pre_lm[None], image=pre_img), assess(post_lm[None], image=post_img)
    if REFUSE in (gp["status"], gq["status"]):
        return {"status": "CANNOT_COMPARE", "pre_gate": gp, "post_gate": gq}
    M, rms = similarity(post_lm, pre_lm)
    registered = cv2.warpAffine(post_img, M, (pre_img.shape[1], pre_img.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    post_lm_reg = post_lm @ M[:, :2].T + M[:, 2]
    a, b = measure(pre_lm), measure(post_lm_reg)
    rep = {"status": "OK", "registration_rms_px": round(rms, 2),
           "measurements": compare_measurements(a, b, noise_floor(pre_lm), noise_floor(post_lm_reg, seed=1)),
           "pre_gate": gp["status"], "post_gate": gq["status"]}
    ok, info = comparable(pre_img, registered)
    rep["photos_comparable_for_texture"] = {"comparable": ok, **info}
    if out_dir:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        rep["mean_colour_difference_dE"] = round(visual(pre_img, registered, out / "compare_visual.png"), 2)
    if lines and ok:
        import wrinkle_analysis as wa
        ra, _ = wa.analyse(pre_img, pre_lm)
        rb, _ = wa.analyse(registered, post_lm_reg)
        rep["lines"] = {z: {"pre_fine": ra["zones"][z]["fine_density_mm_per_cm2"], "post_fine": rb["zones"][z]["fine_density_mm_per_cm2"]}
                        for z in wa.SKIN_ZONES if ra["zones"][z]["status"] == "analysed" and rb["zones"][z]["status"] == "analysed"}
    if acne and ok:
        import acne_lesions as ac
        ra, _ = ac.analyse(pre_img, pre_lm)
        rb, _ = ac.analyse(registered, post_lm_reg)
        rep["acne_totals"] = {"pre": ra["totals"], "post": rb["totals"]}
    if (lines or acne) and not ok:
        rep["texture_comparison"] = "skipped: photos differ in sharpness or brightness"
    rep["caveats"] = ["Landmark-noise floor only; real repeatability needs repeated photos of the same person.",
                      "Pose, expression, lighting and swelling differences are not removed.",
                      "No claim that the result is good or beautiful, and no claim about cause of change."]
    return rep


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("pre")
    ap.add_argument("post")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--out", default="compare_output")
    ap.add_argument("--lines", action="store_true")
    ap.add_argument("--acne", action="store_true")
    args = ap.parse_args()
    (la, ia), (lb, ib) = ss.extract_landmarks_image(args.pre, args.model), ss.extract_landmarks_image(args.post, args.model)
    rep = run(ia, la[0], ib, lb[0], args.out, args.lines, args.acne)
    Path(args.out).mkdir(parents=True, exist_ok=True)
    (Path(args.out) / "compare.json").write_text(json.dumps(rep, indent=2, default=float), encoding="utf-8")
    if rep["status"] != "OK":
        print("TIDAK DAPAT DIBANDINGKAN:", rep["status"])
        return
    for k, v in rep["measurements"].items():
        if v["beyond_landmark_noise"]:
            print(f"{k}: {v['pre']} -> {v['post']} ({v['verdict']})")


if __name__ == "__main__":
    main()
