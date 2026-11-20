"""Full-face zone atlas: every pixel inside the face oval gets exactly one zone label.

Purpose: no silent gaps. Each analysis module (lines, acne, colour, wound ...) reports per zone,
and `coverage()` lists which zones were analysed, which were not and why, plus the parts of the
head that are OUTSIDE the atlas altogether (ears, neck, scalp/hairline, anything beyond the
landmark face oval). A zone that was not analysed is reported as not analysed, never as normal.

Zones are built from MediaPipe landmarks in the face-aligned mm frame (roll removed, y up,
midline x = 0) and are approximate aesthetic units, not an anatomical dissection.
R / L = patient right / left (image-left / image-right).
"""
import cv2
import numpy as np

import wound_planner as wp

# (name, group, skin). skin=False zones are not skin and are excluded from skin analyses.
ZONES = [
    ("forehead_central", "forehead", True), ("forehead_R", "forehead", True), ("forehead_L", "forehead", True),
    ("glabella", "forehead", True), ("temple_R", "temple", True), ("temple_L", "temple", True),
    ("brow_R", "brow", False), ("brow_L", "brow", False),
    ("upper_lid_R", "periorbital", True), ("upper_lid_L", "periorbital", True),
    ("eye_R", "eye", False), ("eye_L", "eye", False),
    ("infraorbital_R", "periorbital", True), ("infraorbital_L", "periorbital", True),
    ("crows_feet_R", "periorbital", True), ("crows_feet_L", "periorbital", True),
    ("nose_dorsum", "nose", True), ("nose_tip", "nose", True), ("nose_ala_R", "nose", True), ("nose_ala_L", "nose", True),
    ("cheek_medial_R", "cheek", True), ("cheek_medial_L", "cheek", True),
    ("cheek_lateral_R", "cheek", True), ("cheek_lateral_L", "cheek", True),
    ("nasolabial_R", "perioral", True), ("nasolabial_L", "perioral", True),
    ("upper_lip_skin", "perioral", True), ("vermilion_upper", "lip", False), ("vermilion_lower", "lip", False),
    ("chin", "chin", True), ("marionette_R", "perioral", True), ("marionette_L", "perioral", True),
    ("jawline_R", "jaw", True), ("jawline_L", "jaw", True),
]
NAMES = [z[0] for z in ZONES]
GROUP = {z[0]: z[1] for z in ZONES}
IS_SKIN = {z[0]: z[2] for z in ZONES}
ID = {n: i + 1 for i, n in enumerate(NAMES)}          # 0 = outside the face oval

NOT_IN_ATLAS = ["ears", "neck", "scalp and hairline (upper third above the oval)", "beard/moustache hair as such",
                "inside the mouth (teeth, palate)", "3D contour and volume (needs 3D or multi-view)",
                "pores and skin texture quality", "everything outside the landmark face oval"]


def build(P, ff, shape):
    """P: (478,2) landmarks in mm; ff: wound_planner.FaceFrame; shape: (h, w). Returns label map int16."""
    h, w = shape
    lab = np.zeros((h, w), np.int16)
    px = lambda Q: np.round(ff.to_px(np.asarray(Q, float))).astype(np.int32)

    def fill(name, poly):
        m = np.zeros((h, w), np.uint8)
        cv2.fillPoly(m, [px(poly)], 1)
        lab[(m > 0) & (oval > 0)] = ID[name]
        return m > 0

    def fill_mask(name, m):
        lab[m & (oval > 0)] = ID[name]

    def rect(x0, x1, y0, y1):
        return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

    oval = np.zeros((h, w), np.uint8)
    cv2.fillPoly(oval, [px(P[wp.OVAL])], 1)
    ov = oval > 0
    # base layer: lateral cheek by side
    yy, xx = np.mgrid[0:h, 0:w]
    side_L = _side_is_L(ff, xx, yy)
    lab[ov & ~side_L] = ID["cheek_lateral_R"]
    lab[ov & side_L] = ID["cheek_lateral_L"]

    brow_all = P[wp.BROW_R + wp.BROW_L]
    brow_top, brow_bot = float(brow_all[:, 1].max()), float(brow_all[:, 1].min())
    hair = float(P[10][1]) + 4
    zy = float(P[0][1])
    out_x = {"R": P[33][0], "L": P[263][0]}
    in_x = {"R": P[133][0], "L": P[362][0]}
    low = {"R": float(P[145][1]), "L": float(P[374][1])}
    up = {"R": float(P[159][1]), "L": float(P[386][1])}
    mouth_c = 0.5 * (P[13] + P[14])
    ll_y = float(P[17][1])
    comm = {"R": P[61], "L": P[291]}
    alar = {"R": P[129], "L": P[358]}

    # medial cheek: between the infraorbital line and the mouth corner height
    for s, sg in (("R", -1), ("L", 1)):
        fill(f"cheek_medial_{s}", rect(*sorted((sg * 8, sg * 40)), comm[s][1] - 6, low[s] - 3))
    # forehead above the brows
    fill("forehead_central", rect(-18, 18, brow_top + 2, hair + 60))
    fill("forehead_R", rect(-120, -18, brow_top + 2, hair + 60))
    fill("forehead_L", rect(18, 120, brow_top + 2, hair + 60))
    for s, sg in (("R", -1), ("L", 1)):
        fill(f"temple_{s}", rect(*sorted((out_x[s] + sg * 4, sg * 120)), brow_bot - 14, brow_top + 10))
    fill("glabella", rect(-9, 9, P[9][1] - 8, P[9][1] + 14))
    for s, sg in (("R", -1), ("L", 1)):
        fill(f"upper_lid_{s}", rect(*sorted((in_x[s], out_x[s])), up[s], brow_bot - 0.5))
        fill(f"infraorbital_{s}", rect(*sorted((in_x[s], out_x[s] + sg * 4)), low[s] - 14, low[s]))
        fill(f"crows_feet_{s}", rect(*sorted((out_x[s] + sg * 2, out_x[s] + sg * 28)), up[s] - 16, up[s] + 8))
    # nose
    nose_hull = cv2.convexHull(P[wp.NOSE_IDX].astype(np.float32)).reshape(-1, 2)
    nose_m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(nose_m, [px(nose_hull)], 1)
    nose_m = nose_m > 0
    fill_mask("nose_dorsum", nose_m)
    tip_c = P[1]
    tip = np.zeros((h, w), np.uint8)
    cv2.circle(tip, tuple(px(tip_c[None])[0]), int(9 * ff.scale), 1, -1)
    fill_mask("nose_tip", nose_m & (tip > 0))
    for s, sg in (("R", -1), ("L", 1)):
        a = np.zeros((h, w), np.uint8)
        cv2.fillPoly(a, [px(rect(*sorted((sg * 7, sg * 30)), P[2][1] - 4, P[1][1] + 2))], 1)
        fill_mask(f"nose_ala_{s}", nose_m & (a > 0) & (lab != ID["nose_tip"]))
    # perioral skin
    for s in ("R", "L"):
        a, c = alar[s], comm[s]
        d = (c - a) / max(np.linalg.norm(c - a), 1e-6)
        m = np.zeros((h, w), np.uint8)
        cv2.polylines(m, [px(np.array([a, c + d * 10]))], False, 1, max(1, int(12 * ff.scale)))
        fill_mask(f"nasolabial_{s}", (m > 0) & ~nose_m)
    fill("upper_lip_skin", rect(-14, 14, P[0][1] + 1, P[2][1] - 2))
    fill("chin", rect(-30, 30, P[152][1] - 4, ll_y - 3))
    for s in ("R", "L"):
        m = np.zeros((h, w), np.uint8)
        cv2.polylines(m, [px(np.array([comm[s], comm[s] + np.array([0.0, -20.0])]))], False, 1, max(1, int(10 * ff.scale)))
        fill_mask(f"marionette_{s}", m > 0)
    # jawline band along the lower oval edge
    dist = cv2.distanceTransform(oval, cv2.DIST_L2, 3) / ff.scale
    for s, sg in (("R", -1), ("L", 1)):
        band = (dist <= 12) & (dist > 0) & _below(ff, yy, xx, ll_y - 10) & (side_L == (s == "L"))
        fill_mask(f"jawline_{s}", band & (lab != ID["chin"]))
    # non-skin features last
    lips = cv2.convexHull(P[wp.LIPS_IDX].astype(np.float32)).reshape(-1, 2)
    lm = np.zeros((h, w), np.uint8)
    cv2.fillPoly(lm, [px(lips)], 1)
    below = _below(ff, yy, xx, float(mouth_c[1]))
    fill_mask("vermilion_upper", (lm > 0) & ~below)
    fill_mask("vermilion_lower", (lm > 0) & below)
    for s, idx in (("R", wp.EYE_R), ("L", wp.EYE_L)):
        m = np.zeros((h, w), np.uint8)
        cv2.fillPoly(m, [px(P[idx])], 1)
        fill_mask(f"eye_{s}", m > 0)
    for s, idx in (("R", wp.BROW_R), ("L", wp.BROW_L)):
        b = P[idx]
        poly = np.vstack([b + [0, 2.5], b[::-1] + [0, -2.5]])
        m = np.zeros((h, w), np.uint8)
        cv2.fillPoly(m, [px(poly)], 1)
        fill_mask(f"brow_{s}", m > 0)
    return _smooth(lab, ff.scale)


def _smooth(lab, px_per_mm, sigma_mm=1.6):
    """Soft-assignment smoothing: each pixel takes the zone with the largest blurred mask.
    Rounds off the blocky rectangle corners. Pixels outside the face oval stay 0."""
    inside = lab > 0
    best = np.full(lab.shape, -1.0, np.float32)
    out = np.zeros_like(lab)
    k = max(3, int(sigma_mm * px_per_mm * 6) | 1)
    for i in np.unique(lab[inside]):
        b = cv2.GaussianBlur((lab == i).astype(np.float32), (k, k), sigma_mm * px_per_mm)
        upd = b > best
        best[upd] = b[upd]
        out[upd] = i
    out[~inside] = 0
    return out


def _side_is_L(ff, xx, yy):
    q = ff.to_mm(np.stack([xx, yy], -1).astype(float))
    return q[..., 0] > 0


def _below(ff, yy, xx, y_mm):
    q = ff.to_mm(np.stack([xx, yy], -1).astype(float))
    return q[..., 1] < y_mm


def masks(lab):
    return {n: lab == ID[n] for n in NAMES}


def skin_mask(lab):
    m = np.zeros(lab.shape, bool)
    for n in NAMES:
        if IS_SKIN[n]:
            m |= lab == ID[n]
    return m


def coverage(lab, px_per_mm, module_status):
    """module_status: {module: {zone: 'analysed'|'low_confidence'|'not_analysed:<reason>'}}.
    Returns a report listing area per zone, per-module status and explicit gaps."""
    areas = {n: round(float((lab == ID[n]).sum()) / px_per_mm ** 2 / 100, 2) for n in NAMES}
    inside = int((lab > 0).sum())
    out = {"oval_area_cm2": round(inside / px_per_mm ** 2 / 100, 1), "zone_area_cm2": areas, "modules": module_status,
           "not_in_atlas": NOT_IN_ATLAS, "gaps": []}
    for mod, st in module_status.items():
        for z in NAMES:
            s = st.get(z, "not_analysed:non-skin structure (eye, brow or lip), not part of skin analysis" if not IS_SKIN[z] else "not_analysed:module did not report this zone")
            if not s.startswith("analysed"):
                out["gaps"].append({"module": mod, "zone": z, "status": s})
    return out


def colour_map(lab):
    """BGR image of the atlas, distinct hue per zone."""
    rng = np.random.default_rng(7)
    pal = np.zeros((len(NAMES) + 1, 3), np.uint8)
    for i in range(1, len(NAMES) + 1):
        hsv = np.uint8([[[(i * 37) % 180, 190 + rng.integers(0, 60), 200 + rng.integers(0, 55)]]])
        pal[i] = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0, 0]
    return pal[lab]
