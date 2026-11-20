"""Facial line mapping v2: fine lines and deep folds per atlas zone.

Pipeline: skin mask (colour) -> illumination-normalised green channel -> multi-scale Hessian ridge
filter for DARK thin lines, two scale bands (fine lines 0.35-0.7 mm, folds 1.0-2.2 mm) ->
non-maximum suppression -> reject (a) hair (bright thin ridges and their dilation),
(b) short fragments and (c) tortuous scribbles (skin texture / pores) -> length and density per zone.

Every skin zone of face_zones gets a status: analysed, low_confidence (much of the zone is hair,
shadow or non-skin) or not_analysed, with the reason. Density uses only the USABLE skin area.

It is a MEASUREMENT of visible lines, not an age estimate, not a treatment decision. Lighting,
make-up, beards, stubble, pores and compression still create or hide lines; compare photos only
under identical camera, distance and lighting. Calibrated on synthetic skin and eyeballed on a few
real photos; NOT validated against clinical wrinkle scales (Glogau, Fitzpatrick, Allergan).
"""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi

import face_zones as fz
import wound_planner as wp

MIN_PX_PER_MM = 3.0
WARN_PX_PER_MM = 4.5
FINE = (0.35, 0.5, 0.7)
FOLD = (1.0, 1.5, 2.2)
CONTRAST_C = 0.02
THRESH = 0.12            # fine-line ridge strength threshold (blank synthetic skin: 0 false lines)
FOLD_THRESH = 0.45       # broad ridges also respond to soft shading blotches, so the fold band needs a high bar
MIN_FINE_MM, MIN_FOLD_MM = 6.0, 14.0
MAX_TORTUOSITY = 2.0          # path length / straight extent; skin-texture scribbles exceed this
HAIR_THRESH = 0.25
MIN_ZONE_CM2 = 0.3
USABLE_OK, USABLE_LOW = 0.6, 0.25
OPTIONS = {
    "dynamic upper-face lines (forehead, glabella, crow's feet)": "commonly addressed with neuromodulator when mainly dynamic",
    "static folds with volume loss (nasolabial, marionette)": "commonly addressed with volume/filler or lifting approaches",
    "fine lines (infraorbital, upper lip)": "commonly addressed with skin-quality/resurfacing approaches",
}
DYNAMIC_ZONES = {"forehead_central", "forehead_R", "forehead_L", "glabella", "crows_feet_R", "crows_feet_L"}
SKIN_ZONES = [n for n in fz.NAMES if fz.IS_SKIN[n]]


SKIN_SEED_ZONES = ("cheek_medial_R", "cheek_medial_L", "forehead_central", "nose_dorsum", "chin", "temple_R", "temple_L")


def skin_mask(image_bgr, lab_map=None):
    """Adaptive skin mask: colour statistics are sampled from the patient's own cheeks/forehead (all skin
    tones work), and pixels whose chroma is close to that sample are skin. Hair, hats, clothes and white
    hair differ in chroma or lightness and drop out. Falls back to a fixed YCrCb range without an atlas."""
    if lab_map is None:
        ycc = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2YCrCb)
        m = ((ycc[..., 1] >= 130) & (ycc[..., 1] <= 185) & (ycc[..., 2] >= 70) & (ycc[..., 2] <= 140) & (ycc[..., 0] >= 35))
    else:
        lab = cv2.cvtColor(image_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
        seed = np.zeros(lab_map.shape, bool)
        for n in SKIN_SEED_ZONES:
            seed |= lab_map == fz.ID[n]
        samp = lab[seed]
        med = np.median(samp, axis=0)
        mad = np.median(np.abs(samp - med), axis=0) + 1e-6
        chroma = np.hypot(lab[..., 1] - med[1], lab[..., 2] - med[2])
        c_lim = max(12.0, 4.0 * 1.48 * float(np.hypot(mad[1], mad[2])))
        m = (chroma <= c_lim) & (lab[..., 0] >= med[0] - 40) & (lab[..., 0] <= med[0] + 32)
    m = m.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0


def _ridge(g, ppm, sigmas):
    best = np.zeros_like(g)
    ang = np.zeros_like(g)
    for smm in sigmas:
        s = max(1.0, smm * ppm)
        hxx = ndi.gaussian_filter(g, s, order=(0, 2)) * s * s
        hyy = ndi.gaussian_filter(g, s, order=(2, 0)) * s * s
        hxy = ndi.gaussian_filter(g, s, order=(1, 1)) * s * s
        tmp = np.sqrt(((hxx - hyy) / 2) ** 2 + hxy ** 2)
        l1, l2 = (hxx + hyy) / 2 + tmp, (hxx + hyy) / 2 - tmp
        rb = np.abs(l2) / (np.abs(l1) + 1e-9)
        S = np.sqrt(l1 ** 2 + l2 ** 2)
        v = np.exp(-(rb ** 2) / (2 * 0.5 ** 2)) * (1 - np.exp(-(S ** 2) / (2 * CONTRAST_C ** 2)))
        v[l1 <= 0] = 0
        upd = v > best
        best[upd] = v[upd]
        ang[upd] = 0.5 * np.arctan2(2 * hxy, hxx - hyy)[upd]
    return best, ang


def _nms(strength, angle, thr):
    h, w = strength.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny = np.cos(angle), np.sin(angle)
    a = ndi.map_coordinates(strength, [yy + ny, xx + nx], order=1, mode="nearest")
    b = ndi.map_coordinates(strength, [yy - ny, xx - nx], order=1, mode="nearest")
    return (strength >= a) & (strength >= b) & (strength > thr)


def _step(angle):
    phi = angle + math.pi / 2
    return 1.0 / np.maximum(np.abs(np.cos(phi)), np.abs(np.sin(phi)))


def _filter_components(keep, angle, ppm, min_mm, max_tort=None):
    """Drop short fragments and tortuous scribbles. Returns (mask, per-component stats)."""
    lab, n = ndi.label(keep, structure=np.ones((3, 3)))
    out = np.zeros_like(keep)
    step = _step(angle)
    kept = 0
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        m = lab[sl] == i
        length = float(step[sl][m].sum()) / ppm
        if length < min_mm:
            continue
        ys, xs = np.nonzero(m)
        pts = np.stack([xs, ys], 1).astype(float)
        if len(pts) > 2:
            c = pts - pts.mean(axis=0)
            _, v = np.linalg.eigh(c.T @ c)
            extent = (c @ v[:, -1]).max() - (c @ v[:, -1]).min()
            extent = max(extent / ppm, 1e-6)
            if length / extent > (max_tort or MAX_TORTUOSITY):
                continue
        out[sl] |= m
        kept += 1
    return out, kept


def detect(image_bgr, ppm, lab_map=None):
    """Returns dict of boolean maps: fine, fold, hair, plus the skin mask and ridge strengths."""
    g = image_bgr[..., 1].astype(np.float32) / 255.0
    g = g / (ndi.gaussian_filter(g, 12.0 * ppm) + 1e-3)
    sk = skin_mask(image_bgr, lab_map)
    # hair: bright thin ridges (invert the image and reuse the dark-ridge filter)
    hs, ha = _ridge(2.0 - g, ppm, FINE)
    fs, fa = _ridge(g, ppm, FINE)
    gs, ga = _ridge(g, ppm, FOLD)
    # hair = LONG thin ridges with hair-like contrast: clearly brighter (white hair) or far darker (black hair)
    # than the skin. Pores, speckle, highlights and wrinkle shadows are short or low contrast and are kept.
    hb, _ = _filter_components(_nms(hs, ha, HAIR_THRESH) & (g > 1.22), ha, ppm, 4.0, 2.5)
    hd, _ = _filter_components(_nms(fs, fa, 0.2) & (g < 0.40), fa, ppm, 4.0, 2.5)
    hair = cv2.dilate((hb | hd).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    fine, _ = _filter_components(_nms(fs, fa, THRESH) & (fs > gs) & ~hair & sk, fa, ppm, MIN_FINE_MM)   # the scale band with the larger response owns the ridge
    fold, _ = _filter_components(_nms(gs, ga, FOLD_THRESH) & (gs >= fs) & ~hair & sk, ga, ppm, MIN_FOLD_MM)
    return {"fine": fine, "fold": fold, "hair": hair, "skin": sk, "fine_angle": fa, "fold_angle": ga,
            "fine_strength": fs, "fold_strength": gs}


def analyse(image_bgr, landmarks_px):
    """Per-zone fine-line and fold length (mm) and density (mm per cm2) with a status per zone."""
    ff = wp.FaceFrame(landmarks_px)
    ppm = ff.scale
    if ppm < MIN_PX_PER_MM:
        return {"status": "CANNOT_ASSESS", "reason": f"Resolusi terlalu rendah ({ppm:.1f} px/mm); perlu minimal {MIN_PX_PER_MM} px/mm."}, None
    P = ff.to_mm(landmarks_px)
    lab = fz.build(P, ff, image_bgr.shape[:2])
    d = detect(image_bgr, ppm, lab)
    fstep, gstep = _step(d["fine_angle"]), _step(d["fold_angle"])
    zones, status = {}, {}
    for name in SKIN_ZONES:
        m = lab == fz.ID[name]
        area = float(m.sum()) / ppm ** 2 / 100
        usable_m = m & d["skin"] & ~d["hair"]
        usable = float(usable_m.sum()) / ppm ** 2 / 100
        frac = usable / area if area > 0 else 0.0
        if area < MIN_ZONE_CM2:
            st = "not_analysed:zone too small"
        elif frac < USABLE_LOW:
            st = f"not_analysed:only {int(frac * 100)}% usable skin (hair, shadow, non-skin colour or occlusion)"
        elif frac < USABLE_OK:
            st = f"low_confidence:only {int(frac * 100)}% usable skin"
        else:
            st = "analysed"
        fl = float(fstep[d["fine"] & usable_m].sum()) / ppm
        gl = float(gstep[d["fold"] & usable_m].sum()) / ppm
        zones[name] = {"zone_area_cm2": round(area, 2), "usable_skin_cm2": round(usable, 2), "usable_fraction": round(frac, 2),
                       "fine_length_mm": round(fl, 1), "fold_length_mm": round(gl, 1),
                       "fine_density_mm_per_cm2": round(fl / usable, 1) if usable > 0.2 else None,
                       "fold_density_mm_per_cm2": round(gl / usable, 1) if usable > 0.2 else None,
                       "status": st}
        status[name] = st
    ok = [z for z in SKIN_ZONES if zones[z]["status"] == "analysed" and zones[z]["fine_density_mm_per_cm2"] is not None]
    rep = {"status": "PASS_WITH_WARNINGS" if ppm < WARN_PX_PER_MM else "PASS", "px_per_mm": round(ppm, 2), "zones": zones,
           "ranking_fine_density": sorted(ok, key=lambda z: -zones[z]["fine_density_mm_per_cm2"]),
           "module_status": status, "options_to_discuss": OPTIONS,
           "caveats": ["Lighting, hair, make-up, pores and compression change the result; compare only like with like.",
                       "Zones marked not_analysed or low_confidence are NOT reported as normal.",
                       "No age norms; not validated against clinical wrinkle scales. Not an age estimate or treatment decision."]}
    return rep, {"d": d, "lab": lab, "ff": ff}


def compare_dynamic(rest_rep, expr_rep):
    """Lines present only in expression (dynamic) vs already at rest (static), analysed zones only."""
    out = {}
    for z in SKIN_ZONES:
        a, b = rest_rep["zones"][z], expr_rep["zones"][z]
        if a["status"] != "analysed" or b["status"] != "analysed":
            out[z] = {"status": "not_comparable:" + (a["status"] if a["status"] != "analysed" else b["status"])}
            continue
        r, e = a["fine_density_mm_per_cm2"], b["fine_density_mm_per_cm2"]
        if r is None or e is None:
            continue
        add = max(0.0, e - r)
        out[z] = {"rest_density": r, "expression_density": e, "dynamic_added_density": round(add, 1),
                  "dynamic_share": round(add / e, 2) if e > 0 else None}
    return out


def draw_heatmap(image_bgr, landmarks_px, report, maps, out_path, min_width=1600):
    from overlay import _pt
    f = max(1.0, min_width / image_bgr.shape[1])
    img = cv2.resize(image_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) if f > 1 else image_bgr.copy()
    sz = (img.shape[1], img.shape[0])
    up = lambda m: cv2.resize(m.astype(np.uint8), sz, interpolation=cv2.INTER_NEAREST) > 0
    lab = cv2.resize(maps["lab"].astype(np.uint8), sz, interpolation=cv2.INTER_NEAREST)
    k = img.shape[0] / 1000.0
    for name in SKIN_ZONES:
        st = report["zones"][name]["status"]
        colour = (80, 190, 60) if st == "analysed" else (0, 200, 240) if st.startswith("low") else (150, 150, 150)
        cnts, _ = cv2.findContours((lab == fz.ID[name]).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(img, cnts, -1, colour, max(1, int(k)))
    hair = up(maps["d"]["hair"]) & (lab > 0)
    img[hair] = (0.6 * img[hair] + 0.4 * np.array([255, 200, 0])).astype(np.uint8)       # hair removed from analysis
    drawn = np.zeros(lab.shape, bool)                      # draw lines ONLY inside zones that were analysed
    for name in SKIN_ZONES:
        if not report["zones"][name]["status"].startswith("not_analysed"):
            drawn |= lab == fz.ID[name]
    for key, col in (("fold", (0, 140, 255)), ("fine", (40, 40, 255))):
        m = (cv2.dilate(up(maps["d"][key]).astype(np.uint8), np.ones((2, 2), np.uint8)) > 0) & drawn
        img[m] = col
    pw = int(img.shape[0] * 0.66)
    H = max(img.shape[0], int(1250 * k))
    panel = np.full((H, pw, 3), 28, np.uint8)
    if H > img.shape[0]:
        img = cv2.copyMakeBorder(img, 0, H - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(28, 28, 28))
    y = int(46 * k)
    _pt(panel, "LINES BY ZONE (relative, not age)", (int(16 * k), y), 0.72 * k, (255, 255, 255), max(1, int(k)))
    y += int(28 * k)
    _pt(panel, "red = fine lines, orange = folds, cyan tint = hair removed", (int(16 * k), y), 0.42 * k, (180, 180, 180))
    y += int(22 * k)
    _pt(panel, "zone outline: green analysed / yellow low confidence / grey NOT analysed", (int(16 * k), y), 0.42 * k, (180, 180, 180))
    y += int(34 * k)
    top = max([(report["zones"][z]["fine_density_mm_per_cm2"] or 0) + (report["zones"][z]["fold_density_mm_per_cm2"] or 0) for z in SKIN_ZONES] + [1])
    order = report["ranking_fine_density"] + [z for z in SKIN_ZONES if z not in report["ranking_fine_density"]]
    for z in order:
        v = report[ "zones"][z]
        col = (230, 230, 230) if v["status"] == "analysed" else (0, 200, 240) if v["status"].startswith("low") else (140, 140, 140)
        fd, gd = v["fine_density_mm_per_cm2"], v["fold_density_mm_per_cm2"]
        txt = f"{z}: " + (f"fine {fd}  fold {gd} mm/cm2" if fd is not None else "-") + ("" if v["status"] == "analysed" else "  [" + v["status"].split(":")[0] + "]")
        _pt(panel, txt[:70], (int(16 * k), y), 0.4 * k, col)
        if fd is not None:
            x0 = int(16 * k)
            cv2.rectangle(panel, (x0, y + int(5 * k)), (x0 + int(300 * k * fd / top), y + int(11 * k)), (40, 40, 255), -1)
            cv2.rectangle(panel, (x0 + int(300 * k * fd / top), y + int(5 * k)), (x0 + int(300 * k * (fd + (gd or 0)) / top), y + int(11 * k)), (0, 140, 255), -1)
        y += int(30 * k)
    cv2.imwrite(str(out_path), np.hstack([img, panel]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image")
    ap.add_argument("--expression", help="second photo in expression (brow raise, smile)")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--out", default="wrinkle_output")
    ap.add_argument("--force", action="store_true", help="continue even if the quality gate refuses")
    args = ap.parse_args()
    import smile_symmetry as ss
    from quality_gate import REFUSE, assess

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    reps = {}
    for label, path in (("rest", args.image), ("expression", args.expression)):
        if not path:
            continue
        lm, img = ss.extract_landmarks_image(path, args.model)
        gate = assess(lm, image=img)
        if gate["status"] == REFUSE and not args.force:
            print("TIDAK DAPAT DINILAI:", *[g["message"] for g in gate["failures"]], sep="\n  - ")
            return
        rep, maps = analyse(img, lm[0])
        if maps is None:
            print(rep["reason"])
            return
        rep["quality_gate"] = gate
        reps[label] = rep
        draw_heatmap(img, lm[0], rep, maps, out / f"{label}_wrinkles.png")
        (out / f"{label}_wrinkles.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
    if "expression" in reps:
        dyn = compare_dynamic(reps["rest"], reps["expression"])
        (out / "dynamic_vs_static.json").write_text(json.dumps(dyn, indent=2), encoding="utf-8")
        print(json.dumps(dyn, indent=2))
    else:
        print(json.dumps({z: (v["fine_density_mm_per_cm2"], v["fold_density_mm_per_cm2"], v["status"]) for z, v in reps["rest"]["zones"].items()}, indent=2))


if __name__ == "__main__":
    main()
