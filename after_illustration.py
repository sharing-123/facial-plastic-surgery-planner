"""Schematic 'after management' illustration: the wound area filled with surrounding skin (inpainting), the closure line
along the repair axis and the stitches at the planned positions, shown next to the 'before' view.

THIS IS AN ILLUSTRATION OF THE PLAN, NOT A PREDICTION OF THE COSMETIC RESULT. The skin texture is synthesised, the scar
is drawn as a thin line, swelling, dog-ears, tissue mismatch and scar maturation are not modelled, and the real outcome
depends on the patient, the surgeon and healing. Only plans that end in a simple linear closure are drawn (primary
closure and fusiform excision); flaps, Z-plasty, W-plasty, graft, non-surgical and non-linear plans return None.
"""
import cv2
import numpy as np

import markings as mk

NOTE = "ILUSTRASI SKEMATIK pasca penjahitan. Bukan prediksi hasil kosmetik."


def drawable(plan, report, mask):
    if mask is None or not report.get("linear", True) or not plan.get("rencana_jahitan"):
        return None
    name = plan["teknik"][0]["nama"] if plan["teknik"] else ""
    if name.startswith("Penutupan primer"):
        return "primary"
    if name.startswith("Eksisi elips") or name.startswith("Undermining"):
        return "ellipse"
    return None


def _text(img, t, org, scale, col, th=1):
    cv2.putText(img, t, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), th + 3, cv2.LINE_AA)
    cv2.putText(img, t, org, cv2.FONT_HERSHEY_SIMPLEX, scale, col, th, cv2.LINE_AA)


def render(image_bgr, frame, mask, centerline_px, plan, report, geometry, out_path, margin_mm=26.0, width=1700):
    """Returns the mode drawn ('primary' or 'ellipse') or None when not applicable. geometry: the dict from marking_render."""
    mode = drawable(plan, report, mask)
    if mode is None:
        return None
    h, w = image_bgr.shape[:2]
    ys, xs = np.nonzero(mask)
    m = int(margin_mm * frame.scale)
    x0, x1 = max(0, xs.min() - m), min(w, xs.max() + m)
    y0, y1 = max(0, ys.min() - m), min(h, ys.max() + m)
    crop = image_bgr[y0:y1, x0:x1].copy()
    mk_crop = mask[y0:y1, x0:x1].astype(np.uint8)
    off = np.array([x0, y0], float)

    fill = mk_crop.copy()
    if mode == "ellipse" and "ellipse" in geometry:
        e = np.round(frame.to_px(geometry["ellipse"]) - off).astype(np.int32)
        cv2.fillPoly(fill, [e.reshape(-1, 1, 2)], 1)
    fill = cv2.dilate(fill, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(1.2 * frame.scale) | 1,) * 2))
    after = cv2.inpaint(crop, fill, max(3, int(1.5 * frame.scale)), cv2.INPAINT_TELEA)
    before = crop.copy()
    cs, _ = cv2.findContours(mk_crop, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(before, cs, -1, (60, 220, 60), max(2, crop.shape[1] // 500), cv2.LINE_AA)

    # closure line: the wound centre line (primary) or the ellipse long axis (fusiform excision)
    Q = frame.to_mm(np.asarray(centerline_px, float))
    if mode == "ellipse" and "ellipse" in geometry:
        e = geometry["ellipse"]
        ctr = e.mean(axis=0)
        ax = np.array(plan_axis(e))
        half = float(np.max(np.linalg.norm(e - ctr, axis=1)))
        Qc = np.array([ctr - ax * half, ctr + ax * half])
    else:
        Qc = Q
    line_px = frame.to_px(Qc) - off
    th = max(1, int(0.9 * frame.scale))
    cv2.polylines(after, [np.round(line_px).astype(np.int32).reshape(-1, 1, 2)], False, (70, 70, 190), th, cv2.LINE_AA)      # fine closed line
    guide = mk.suture_guide(Qc, spacing_mm=plan["rencana_jahitan"]["jarak_antar_jahitan_kulit_mm"], bite_mm=2.0)
    for s in guide:                                                              # stitches: small bridges across the line with knots
        a, b = frame.to_px(s["a"][None])[0] - off, frame.to_px(s["b"][None])[0] - off
        cv2.line(after, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), (30, 30, 30), max(1, th // 2 + 1), cv2.LINE_AA)
        cv2.circle(after, tuple(np.round(a).astype(int)), max(1, th // 2 + 1), (20, 20, 20), -1, cv2.LINE_AA)

    f = max(1.0, width / 2 / crop.shape[1])
    pair = [cv2.resize(x, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) for x in (before, after)]
    k = pair[0].shape[1] / 700.0
    _text(pair[0], "SEBELUM", (int(12 * k), int(30 * k)), 0.8 * k, (255, 255, 255), 2)
    _text(pair[1], "SESUDAH (ilustrasi)", (int(12 * k), int(30 * k)), 0.8 * k, (255, 255, 255), 2)
    out = np.hstack(pair)
    bar = np.full((int(78 * k), out.shape[1], 3), 24, np.uint8)
    _text(bar, NOTE, (int(12 * k), int(28 * k)), 0.6 * k, (0, 200, 255), 1)
    _text(bar, "Tekstur kulit disintesis; bengkak, dog-ear, dan pematangan parut tidak dimodelkan.", (int(12 * k), int(58 * k)), 0.5 * k, (200, 200, 200), 1)
    cv2.imwrite(str(out_path), np.vstack([out, bar]))
    return mode


def plan_axis(ellipse_pts):
    """Unit long-axis direction of an elliptical polyline (principal component)."""
    c = ellipse_pts - ellipse_pts.mean(axis=0)
    _, v = np.linalg.eigh(c.T @ c)
    return v[:, -1]
