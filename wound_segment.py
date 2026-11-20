"""Precise wound / scar contour from a rough clinician outline (semi-automatic GrabCut).

The clinician clicks a rough polygon AROUND the wound (does not need to be exact). GrabCut then
snaps the boundary to the colour edge, the contour is smoothed, and the tool reports area,
perimeter, length x width and colour composition, drawn like a labelled segmentation overlay.

LIMITS:
- GrabCut follows colour contrast. Dark/red wounds on pale skin work well; faint, flat or
  skin-coloured scars do not: the contour then falls back to the clinician's polygon
  (reported in `refined`). ALWAYS check the green line against the wound.
- There is NO wound score here. Scores such as PWAT need a model trained and validated on
  scored wounds; the numbers below are measurements, not a grade.
- mm come from the iris scale (about +-5%) or --mm-per-px; 2D photo, curved surfaces distort.
"""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np

MIN_IOU_WITH_SEED = 0.35        # below this the GrabCut result is rejected as unreliable
DARK_DL, RED_DA = 25.0, 12.0    # relative-to-skin Lab thresholds for the composition split (arbitrary)


def _poly_mask(shape, poly):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(np.asarray(poly, float)).astype(np.int32).reshape(-1, 1, 2)], 1)
    return m


def _iou(a, b):
    u = (a | b).sum()
    return float((a & b).sum() / u) if u else 0.0


def segment(image_bgr, seed_poly_px, px_per_mm, iters=6):
    """Return (mask bool HxW, refined: bool). Falls back to the seed polygon when GrabCut is unreliable."""
    h, w = image_bgr.shape[:2]
    seed = _poly_mask((h, w), seed_poly_px).astype(bool)
    if seed.sum() < 50:
        return seed, False
    ys, xs = np.nonzero(seed)
    pad = int(10 * px_per_mm)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
    roi = image_bgr[y0:y1, x0:x1]
    s = seed[y0:y1, x0:x1].astype(np.uint8)
    r_eq = math.sqrt(s.sum() / math.pi)
    k = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, int(2 * r) | 1),) * 2)
    sure_fg = cv2.erode(s, k(0.55 * r_eq))
    ring = cv2.dilate(s, k(6 * px_per_mm))
    gc = np.full(s.shape, cv2.GC_BGD, np.uint8)
    gc[ring > 0] = cv2.GC_PR_BGD
    gc[s > 0] = cv2.GC_PR_FGD
    gc[sure_fg > 0] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    try:
        cv2.grabCut(roi, gc, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return seed, False
    m = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8)
    n, lab = cv2.connectedComponents(m)
    if n > 1:                                                    # keep the component overlapping the seed most
        best = max(range(1, n), key=lambda i: int(((lab == i) & (s > 0)).sum()))
        m = (lab == best).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k(0.8 * px_per_mm))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k(0.6 * px_per_mm))
    from scipy import ndimage as ndi
    m = ndi.binary_fill_holes(m).astype(np.uint8)
    sm = cv2.GaussianBlur(m.astype(np.float32), (0, 0), max(1.0, 0.5 * px_per_mm)) > 0.5      # smooth boundary
    if _iou(sm, s > 0) < MIN_IOU_WITH_SEED or sm.sum() < 20:
        return seed, False
    full = np.zeros((h, w), bool)
    full[y0:y1, x0:x1] = sm
    return full, True


def measure(image_bgr, mask, px_per_mm):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
    L, Wd = max(rw, rh) / px_per_mm, min(rw, rh) / px_per_mm
    area = float(mask.sum()) / px_per_mm ** 2
    perim = cv2.arcLength(c, True) / px_per_mm
    out = {"area_mm2": round(area, 1), "perimeter_mm": round(perim, 1),
           "length_mm": round(L, 1), "width_mm": round(Wd, 1),
           "circularity": round(4 * math.pi * area / perim ** 2, 2) if perim > 0 else None}
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * 10 * px_per_mm) | 1,) * 2)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * 4 * px_per_mm) | 1,) * 2)
    m8 = mask.astype(np.uint8)
    ring = (cv2.dilate(m8, k) > 0) & ~(cv2.dilate(m8, k2) > 0)
    if ring.any():
        lab = cv2.cvtColor(image_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
        skin = lab[ring].mean(axis=0)
        inside = lab[mask]
        d = inside - skin
        dark = d[:, 0] < -DARK_DL
        red = (d[:, 1] > RED_DA) & ~dark
        n = len(inside)
        out["colour_vs_surrounding_skin"] = {
            "delta_E_mean": round(float(np.linalg.norm(inside.mean(axis=0) - skin)), 1),
            "dark_fraction": round(float(dark.sum() / n), 2), "red_fraction": round(float(red.sum() / n), 2),
            "other_fraction": round(float((~dark & ~red).sum() / n), 2),
            "note": "relative to the skin ring in the same photo; thresholds are arbitrary prototype values; not a PWAT score"}
    out["axis_endpoints_px"] = _axis_endpoints(mask)
    return out, c


def _axis_endpoints(mask):
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs, ys], 1).astype(float)
    c = pts.mean(axis=0)
    _, vec = np.linalg.eigh(np.cov((pts - c).T))
    v = vec[:, -1]
    t = (pts - c) @ v
    return [[round(float(x), 1) for x in c + v * t.min()], [round(float(x), 1) for x in c + v * t.max()]]


def draw(image_bgr, mask, contour, report, out_path, refined, min_width=1600, ppm=None):
    if ppm:                                           # zoom to the wound like a close-up
        ys, xs = np.nonzero(mask)
        m = int(22 * ppm)
        x0, x1 = max(0, xs.min() - m), min(mask.shape[1], xs.max() + m)
        y0, y1 = max(0, ys.min() - m), min(mask.shape[0], ys.max() + m)
        image_bgr, mask = image_bgr[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    f = max(1.0, min_width / image_bgr.shape[1])
    img = cv2.resize(image_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) if f > 1 else image_bgr.copy()
    big = cv2.resize(mask.astype(np.float32), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    cnts, _ = cv2.findContours((cv2.GaussianBlur(big, (0, 0), 1.2) > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    k = img.shape[0] / 1000.0
    cv2.polylines(img, cnts, True, (0, 255, 0), max(2, int(round(2.2 * k))), cv2.LINE_AA)
    lines = [f"Area: {report['area_mm2']} mm2", f"Length x width: {report['length_mm']} x {report['width_mm']} mm",
             f"Perimeter: {report['perimeter_mm']} mm"]
    cs = report.get("colour_vs_surrounding_skin")
    if cs:
        lines.append(f"Dark {int(cs['dark_fraction'] * 100)}% | Red {int(cs['red_fraction'] * 100)}% | dE {cs['delta_E_mean']}")
    lines.append("Contour: " + ("snapped to edge (check it)" if refined else "clinician outline (no refinement)"))
    scale = 0.62 * k
    (tw, th), _ = cv2.getTextSize(max(lines, key=len), cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    pad, lh = int(10 * k), int(th + 12 * k)
    bw, bh = tw + 2 * pad, lh * len(lines) + pad
    x1, y1 = img.shape[1] - int(12 * k), img.shape[0] - int(12 * k)
    x0, y0 = x1 - bw, y1 - bh
    ov = img.copy()
    cv2.rectangle(ov, (x0, y0), (x1, y1), (255, 255, 255), -1)
    img = cv2.addWeighted(ov, 0.88, img, 0.12, 0)
    cv2.rectangle(img, (x0, y0), (x1, y1), (60, 60, 60), 1)
    for i, t in enumerate(lines):
        cv2.putText(img, t, (x0 + pad, y0 + pad // 2 + lh * (i + 1) - int(4 * k)), cv2.FONT_HERSHEY_SIMPLEX, scale,
                    (20, 20, 20), 1, cv2.LINE_AA)
    cv2.imwrite(str(out_path), img)


def click_polygon(image_path):
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(image_path)
    pts = []

    def on_mouse(ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN:
            pts.append((x, y))

    cv2.namedWindow("outline wound")
    cv2.setMouseCallback("outline wound", on_mouse)
    while True:
        shown = img.copy()
        if pts:
            cv2.polylines(shown, [np.array(pts, np.int32).reshape(-1, 1, 2)], len(pts) > 2, (0, 255, 0), 2)
        cv2.putText(shown, "click a rough outline AROUND the wound, Enter = done, Backspace = undo, Esc = cancel",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        cv2.imshow("outline wound", shown)
        key = cv2.waitKey(20)
        if key == 27:
            cv2.destroyAllWindows()
            raise SystemExit("cancelled")
        if key == 8 and pts:
            pts.pop()
        if key in (10, 13) and len(pts) >= 3:
            cv2.destroyAllWindows()
            return np.array(pts, float)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image")
    ap.add_argument("--polygon", help='rough outline px "x1,y1;x2,y2;..." (otherwise click)')
    ap.add_argument("--mm-per-px", type=float, help="scale; otherwise from the iris of a detected face")
    ap.add_argument("--no-refine", action="store_true", help="use the clinician outline as is")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--out", default="segment_output")
    args = ap.parse_args()

    img = cv2.imread(args.image)
    if args.mm_per_px:
        ppm = 1.0 / args.mm_per_px
    else:
        import smile_symmetry as ss
        lm, _ = ss.extract_landmarks_image(args.image, args.model)
        ppm = ss._px_per_mm(lm[0])
    poly = (np.array([[float(v) for v in p.split(",")] for p in args.polygon.split(";")])
            if args.polygon else click_polygon(args.image))
    if args.no_refine:
        mask, refined = _poly_mask(img.shape[:2], poly).astype(bool), False
    else:
        mask, refined = segment(img, poly, ppm)
    report, contour = measure(img, mask, ppm)
    report["refined"] = refined
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    draw(img, mask, contour, report, out / "wound_contour.png", refined, ppm=ppm)
    (out / "wound_segment.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
