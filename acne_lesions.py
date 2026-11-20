"""Acne and skin-mark mapper: counts red inflamed lesions, pustule-like lesions and dark marks per zone.

REAL-PHOTO CALIBRATION RESULT (read this): a colour-only detector cannot separate acne from other red spots.
On six normal real faces it still returned 0-30 "red lesions" each (sun damage, freckles, rosy skin), versus
35-45 on two acne photos. Treat the output as a CANDIDATE RED SPOT COUNT for tracking the same patient under the
same lighting, never as an acne diagnosis or grade. Dark marks are not reported at all.

Method: Lab colour; redness residual (a* minus a smooth local skin baseline, computed only over
skin pixels) -> multi-scale normalised Laplacian-of-Gaussian blob detector (0.6-2.7 mm) ->
non-maximum suppression -> per-lesion centre, radius (mm) and contrast. A second pass on lightness
finds dark macules (post-inflammatory marks) that are NOT red.

It COUNTS and LOCATES colour blobs. It does not grade acne (no GAGS / IGA score: lesion TYPE such as
comedone vs papule vs nodule cannot be read from colour), and it cannot see depth, cysts or comedones
that are skin-coloured. Classes are colour heuristics, not histology. Sunburn, rosacea, flushing,
razor bumps, insect bites and lighting can all look like lesions. Calibrated on synthetic skin;
NOT validated against dermatologist counts.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi

import face_zones as fz
import wound_planner as wp

SIGMAS_MM = (0.9, 1.3, 1.9, 2.7)
RED_T = 4.0          # normalised LoG response on the a* residual (calibrated on 6 normal real faces + 2 acne photos)
RED_CONTRAST = 8.0   # minimum a* rise over the local skin baseline at the blob centre
DETECT_DARK = False  # dark macules: 50-500 false detections per NORMAL face (pores, stubble, shadow); disabled until a trained model exists
DARK_T = 8.0
MIN_DIST_MM = 2.0
BASE_SIGMA_MM = 9.0
MIN_PX_PER_MM = 2.0
SKIN_ZONES = [n for n in fz.NAMES if fz.IS_SKIN[n]]
SKIN_SEED = ("cheek_medial_R", "cheek_medial_L", "forehead_central", "nose_dorsum", "chin")


def skin_from_atlas(image_bgr, lab_map):
    lab = cv2.cvtColor(image_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
    seed = np.zeros(lab_map.shape, bool)
    for n in SKIN_SEED:
        seed |= lab_map == fz.ID[n]
    med = np.median(lab[seed], axis=0)
    # use the ROBUST spread of the seed region; acne itself is a minority so it stays inside the tolerance
    mad = np.median(np.abs(lab[seed] - med), axis=0) + 1e-6
    chroma = np.hypot(lab[..., 1] - med[1], lab[..., 2] - med[2])
    lim = max(22.0, 6.0 * 1.48 * float(np.hypot(mad[1], mad[2])))      # wide: red lesions must not be dropped as 'non-skin'
    m = (chroma <= lim) & (lab[..., 0] >= med[0] - 40) & (lab[..., 0] <= med[0] + 32)
    return cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0


def skin_fallback(image_bgr):
    ycc = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2YCrCb)
    m = (ycc[..., 1] >= 128) & (ycc[..., 1] <= 190) & (ycc[..., 2] >= 70) & (ycc[..., 2] <= 140) & (ycc[..., 0] >= 35)
    return cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0


def _blobs(resid, valid, ppm, thr):
    """Multi-scale normalised LoG maxima on a residual map. Returns (y, x, sigma_px, response)."""
    best = np.zeros(resid.shape, np.float32)
    which = np.zeros(resid.shape, np.int8)
    for i, smm in enumerate(SIGMAS_MM):
        s = smm * ppm
        r = -(s * s) * ndi.gaussian_laplace(resid, s)
        r[~valid] = 0
        upd = r > best
        best[upd] = r[upd]
        which[upd] = i
    k = max(3, int(MIN_DIST_MM * ppm) | 1)
    peak = (ndi.maximum_filter(best, size=k) == best) & (best > thr)
    ys, xs = np.nonzero(peak)
    return [(y, x, SIGMAS_MM[which[y, x]] * ppm, float(best[y, x])) for y, x in zip(ys, xs)]


def detect(image_bgr, skin, ppm):
    lab = cv2.cvtColor(image_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    w = skin.astype(np.float32)
    s = BASE_SIGMA_MM * ppm

    def baseline(ch):
        return ndi.gaussian_filter(ch * w, s) / (ndi.gaussian_filter(w, s) + 1e-6)
    ra = (a - baseline(a)) * w
    rl = (L - baseline(L)) * w
    # erode so lesion rims at the mask edge do not create phantom blobs
    inner = cv2.erode(skin.astype(np.uint8), np.ones((int(1.5 * ppm) | 1,) * 2, np.uint8)) > 0
    red = [t for t in _blobs(ra, inner, ppm, RED_T) if ra[t[0], t[1]] >= RED_CONTRAST]
    dark = _blobs(-rl, inner, ppm, DARK_T) if DETECT_DARK else []
    out = []
    for y, x, sg, resp in red:
        r = int(max(2, sg * 1.41))
        ys, xs = slice(max(0, y - r), min(L.shape[0], y + r + 1)), slice(max(0, x - r), min(L.shape[1], x + r + 1))
        yy, xx = np.mgrid[ys, xs]
        d2 = (yy - y) ** 2 + (xx - x) ** 2
        core, ring = d2 <= (0.6 * r) ** 2, (d2 > (1.4 * r) ** 2) & (d2 <= (2.2 * r) ** 2)
        if not core.any() or not ring.any():
            continue
        dL = float(L[ys, xs][core].mean() - L[ys, xs][ring].mean())
        db = float(b[ys, xs][core].mean() - b[ys, xs][ring].mean())
        cls = "pustule_like" if (dL > 4 and db > 3) else "red_inflamed"
        out.append({"x": int(x), "y": int(y), "radius_mm": round(sg * 1.41 / ppm, 2), "redness_contrast": round(float(ra[y, x]), 1),
                    "response": round(resp, 2), "class": cls})
    for y, x, sg, resp in dark:
        if ra[max(0, y - 2):y + 3, max(0, x - 2):x + 3].max() > 4:       # red as well: already counted as inflamed
            continue
        out.append({"x": int(x), "y": int(y), "radius_mm": round(sg * 1.41 / ppm, 2), "darkness_contrast": round(float(-rl[y, x]), 1),
                    "response": round(resp, 2), "class": "dark_macule"})
    return out, ra


def analyse(image_bgr, landmarks_px=None, mm_per_px=None):
    """With landmarks: per-zone counts with the face atlas. Without: whole-image counts (scale assumed)."""
    if landmarks_px is not None:
        ff = wp.FaceFrame(landmarks_px)
        ppm = ff.scale
        P = ff.to_mm(landmarks_px)
        lab_map = fz.build(P, ff, image_bgr.shape[:2])
        skin = skin_from_atlas(image_bgr, lab_map)
        zone_ok = np.zeros(lab_map.shape, bool)
        for n in SKIN_ZONES:
            zone_ok |= lab_map == fz.ID[n]
        mode = "atlas"
    else:
        ppm = 1.0 / mm_per_px if mm_per_px else image_bgr.shape[1] / 150.0
        lab_map, ff = None, None
        skin = skin_fallback(image_bgr)
        zone_ok = skin
        mode = "no_face_whole_image" + ("" if mm_per_px else "_scale_assumed")
    if ppm < MIN_PX_PER_MM:
        return {"status": "CANNOT_ASSESS", "reason": f"Resolusi terlalu rendah ({ppm:.1f} px/mm)."}, None
    lesions, ra = detect(image_bgr, skin, ppm)
    lesions = [l for l in lesions if zone_ok[l["y"], l["x"]]]
    rep = {"mode": mode, "px_per_mm": round(ppm, 2), "totals": {c: sum(1 for l in lesions if l["class"] == c) for c in ("red_inflamed", "pustule_like", "dark_macule")},
           "lesions": lesions, "zones": {}, "module_status": {}}
    if lab_map is not None:
        for n in SKIN_ZONES:
            m = lab_map == fz.ID[n]
            area = float(m.sum()) / ppm ** 2 / 100
            usable = float((m & skin).sum()) / ppm ** 2 / 100
            frac = usable / area if area > 0 else 0
            st = "not_analysed:zone too small" if area < 0.3 else \
                 f"not_analysed:only {int(frac * 100)}% skin-coloured" if frac < 0.25 else \
                 f"low_confidence:only {int(frac * 100)}% skin-coloured" if frac < 0.6 else "analysed"
            ls = [l for l in lesions if m[l["y"], l["x"]]]
            rep["zones"][n] = {"area_cm2": round(area, 2), "usable_cm2": round(usable, 2), "status": st,
                               "red_inflamed": sum(l["class"] == "red_inflamed" for l in ls),
                               "pustule_like": sum(l["class"] == "pustule_like" for l in ls),
                               "dark_macule": sum(l["class"] == "dark_macule" for l in ls),
                               "inflamed_per_cm2": round(sum(l["class"] != "dark_macule" for l in ls) / usable, 2) if usable > 0.3 else None}
            rep["module_status"][n] = st
    rep["caveats"] = ["Counts colour blobs; no acne grade (lesion type cannot be read from colour).",
                      "Rosacea, flushing, sunburn, razor bumps, insect bites and lighting can mimic lesions.",
                      "Skin-coloured comedones and deep cysts are not seen. Not validated against dermatologist counts."]
    return rep, {"lab": lab_map, "skin": skin, "ra": ra, "ff": ff}


def draw(image_bgr, rep, maps, out_path, min_width=1600):
    from overlay import _pt
    f = max(1.0, min_width / image_bgr.shape[1])
    img = cv2.resize(image_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) if f > 1 else image_bgr.copy()
    k = img.shape[0] / 1000.0
    col = {"red_inflamed": (60, 60, 230), "pustule_like": (0, 215, 255), "dark_macule": (255, 150, 30)}
    if maps["lab"] is not None:
        lab = cv2.resize(maps["lab"].astype(np.uint8), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
        for n in SKIN_ZONES:
            st = rep["zones"][n]["status"]
            c = (80, 190, 60) if st == "analysed" else (0, 200, 240) if st.startswith("low") else (150, 150, 150)
            cnts, _ = cv2.findContours((lab == fz.ID[n]).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(img, cnts, -1, c, max(1, int(k)))
    for l in rep["lesions"]:
        r = max(4, int(round(l["radius_mm"] * rep["px_per_mm"] * f * 1.6)))
        cv2.circle(img, (int(l["x"] * f), int(l["y"] * f)), r, col[l["class"]], max(1, int(1.6 * k)), cv2.LINE_AA)
    pw = int(img.shape[0] * 0.55)
    H = max(img.shape[0], int(900 * k))
    panel = np.full((H, pw, 3), 28, np.uint8)
    if H > img.shape[0]:
        img = cv2.copyMakeBorder(img, 0, H - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(28, 28, 28))
    y = int(46 * k)
    _pt(panel, "ACNE / SKIN MARKS (colour blobs)", (int(16 * k), y), 0.7 * k, (255, 255, 255), max(1, int(k)))
    y += int(30 * k)
    _pt(panel, "counts only, no grade; mode: " + rep["mode"], (int(16 * k), y), 0.42 * k, (180, 180, 180))
    y += int(40 * k)
    for c, n in rep["totals"].items():
        cv2.circle(panel, (int(26 * k), y - int(6 * k)), int(8 * k), col[c], -1)
        _pt(panel, f"{c.replace('_', ' ')}: {n}", (int(46 * k), y), 0.55 * k, (230, 230, 230))
        y += int(34 * k)
    y += int(14 * k)
    if rep["zones"]:
        for n, v in sorted(rep["zones"].items(), key=lambda kv: -(kv[1]["red_inflamed"] + kv[1]["pustule_like"])):
            if v["status"].startswith("not_analysed"):
                _pt(panel, f"{n}: NOT analysed ({v['status'].split(':')[1]})", (int(16 * k), y), 0.38 * k, (140, 140, 140))
            else:
                _pt(panel, f"{n}: red {v['red_inflamed']}  pustule {v['pustule_like']}  dark {v['dark_macule']}" + ("  [low conf]" if v["status"].startswith("low") else ""),
                    (int(16 * k), y), 0.4 * k, (230, 230, 230))
            y += int(26 * k)
    cv2.imwrite(str(out_path), np.hstack([img, panel]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image")
    ap.add_argument("--mm-per-px", type=float, help="scale; needed for mm when no face is detected")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--out", default="acne_output")
    args = ap.parse_args()
    import smile_symmetry as ss
    img = cv2.imread(args.image)
    try:
        lm, _ = ss.extract_landmarks_image(args.image, args.model)
        rep, maps = analyse(img, lm[0])
    except ValueError:                       # no face: whole-image fallback
        rep, maps = analyse(img, None, args.mm_per_px)
    if maps is None:
        print(rep["reason"])
        return
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    draw(img, rep, maps, out / "acne.png")
    (out / "acne.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(json.dumps({"mode": rep["mode"], "totals": rep["totals"]}, indent=2))


if __name__ == "__main__":
    main()
