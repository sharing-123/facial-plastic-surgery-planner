"""Laceration / scar planner: geometry of a marked wound against the face.

The clinician marks the wound by clicking along it (accurate and clinician-controlled; no
detector is trained here). From the facial landmarks the tool reports where the wound is,
how long it is (mm), how it lies relative to approximate relaxed skin tension lines (RSTL),
which critical borders it touches (vermilion, brow, eyelid margin, alar rim), and draws
candidate repair geometry: an RSTL-aligned elliptical excision and a Z-plasty.

LIMITS, read before use:
- The RSTL field here is a coarse rule-based approximation of the schematic maps (Kraissl,
  Borges). Real RSTL vary with age, sex and individual skin; use clinical judgement.
- Drawn lines are decision-support sketches, not a surgical plan. Nothing here predicts how
  a scar will turn out, and there is no "beauty score".
- mm values come from the iris scale (11.7 mm, about +-5%) on a 2D frontal photo.
"""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from mediapipe.tasks.python import vision

import face_proportions as fp
import smile_symmetry as ss

C = vision.FaceLandmarksConnections


def _idx(conns):
    return sorted({i for c in conns for i in (c.start, c.end)})


NOSE_IDX = _idx(C.FACE_LANDMARKS_NOSE)
LIPS_IDX = _idx(C.FACE_LANDMARKS_LIPS)
LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
        148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]       # image-left
EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]    # image-right
BROW_R = [70, 63, 105, 66, 107]
BROW_L = [300, 293, 334, 296, 336]
ALAR_RIM = [129, 64, 98, 97, 2, 326, 327, 294, 358]

ELLIPSE_LW_RATIO = 3.5      # commonly taught elliptical excision length:width 3-4:1
Z_GAIN = {30: 25, 45: 50, 60: 75}   # classic Z-plasty theoretical length gain, percent
FAV, UNFAV = 30.0, 60.0     # alignment bands in degrees (commonly taught)


class FaceFrame:
    """Pixel <-> face-aligned millimetre frame (roll removed, y up, midline at x = 0)."""

    def __init__(self, f):
        a, b = f[ss.OUTER_EYE_A], f[ss.OUTER_EYE_B]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        c, s = math.cos(-ang), math.sin(-ang)
        self.rot = np.array([[c, -s], [s, c]])
        self.origin = f[ss.INNER_EYE_A].copy()
        self.scale = ss._px_per_mm(f)
        q = ((f - self.origin) @ self.rot.T) / self.scale
        self.midx = 0.5 * (q[ss.INNER_EYE_A, 0] + q[ss.INNER_EYE_B, 0])

    def to_mm(self, P):
        q = ((np.asarray(P, float) - self.origin) @ self.rot.T) / self.scale
        q[..., 1] *= -1
        q[..., 0] -= self.midx
        return q

    def to_px(self, Q):
        q = np.array(Q, float)
        q[..., 0] += self.midx
        q[..., 1] *= -1
        return (q * self.scale) @ self.rot + self.origin


def _densify(Q, step=0.5):
    out = [Q[0]]
    for a, b in zip(Q[:-1], Q[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        out += [a + (b - a) * k / n for k in range(1, n + 1)]
    return np.array(out)


def _seg_dist(p, poly, closed=False):
    pts = np.vstack([poly, poly[:1]]) if closed else poly
    a, b = pts[:-1], pts[1:]
    ab = b - a
    t = np.clip(np.einsum("ij,ij->i", p - a, ab) / np.maximum(np.einsum("ij,ij->i", ab, ab), 1e-9), 0, 1)
    return float(np.min(np.linalg.norm(a + ab * t[:, None] - p, axis=1)))


def _in_poly(p, poly):
    return cv2.pointPolygonTest(np.asarray(poly, np.float32).reshape(-1, 1, 2), (float(p[0]), float(p[1])), False) >= 0


def _segments_cross(p1, p2, poly, closed=False):
    pts = np.vstack([poly, poly[:1]]) if closed else poly

    def ccw(a, b, c):
        return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])
    for q1, q2 in zip(pts[:-1], pts[1:]):
        if ccw(p1, q1, q2) != ccw(p2, q1, q2) and ccw(p1, p2, q1) != ccw(p1, p2, q2):
            return True
    return False


class Ctx:
    """Face geometry in mm used by region and RSTL rules."""

    def __init__(self, P):
        self.P = P
        self.oval = P[OVAL]
        self.nose_hull = cv2.convexHull(P[NOSE_IDX].astype(np.float32)).reshape(-1, 2)
        self.lip_hull = cv2.convexHull(P[LIPS_IDX].astype(np.float32)).reshape(-1, 2)
        self.brows = (P[BROW_R], P[BROW_L])
        self.eyes = (P[EYE_R], P[EYE_L])
        self.brow_y = (min(P[BROW_R + BROW_L][:, 1]), max(P[BROW_R + BROW_L][:, 1]))
        self.mouth_c = 0.5 * (P[fp.UPPER_IN] + P[fp.LOWER_IN])
        self.lower_lip_y = P[fp.LOWER_LIP_BOTTOM][1]


def region_of(p, cx):
    P = cx.P
    if _in_poly(p, cx.lip_hull):
        return "lip"
    if _in_poly(p, cx.nose_hull):
        return "nose"
    if min(_seg_dist(p, b) for b in cx.brows) <= 4:
        return "brow"
    if abs(p[0]) <= 10 and cx.brow_y[0] - 2 <= p[1] <= cx.brow_y[1] + 14:
        return "glabella"
    if min(_seg_dist(p, e, True) for e in cx.eyes) <= 10:
        return "periorbital"
    if np.linalg.norm(p - cx.mouth_c) <= 20 and p[1] > cx.lower_lip_y - 8:
        return "perioral"
    if _in_poly(p, cx.oval):
        if p[1] < cx.lower_lip_y - 8 and abs(p[0]) <= 30:
            return "chin"
        if p[1] > cx.brow_y[1] + 2:
            return "forehead"
        return "cheek"
    return "outside_face_oval"


def rstl_angle(region, p, cx):
    """Approximate RSTL direction in degrees (0 = horizontal, 90 = vertical) in [0, 180)."""
    P = cx.P
    side = 0 if p[0] < 0 else 1
    if region == "forehead" or region == "chin":
        return 0.0
    if region in ("glabella", "nose", "lip"):
        return 90.0
    if region == "brow":
        b = cx.brows[side]
        i = int(np.argmin([_seg_dist(p, b[k:k + 2]) for k in range(len(b) - 1)]))
        d = b[i + 1] - b[i]
        return math.degrees(math.atan2(d[1], d[0])) % 180
    if region == "periorbital":
        outer = P[33] if side == 0 else P[263]
        eye_c = cx.eyes[side].mean(axis=0)
        if abs(p[0]) > abs(outer[0]) and abs(p[1] - eye_c[1]) < 12:     # crow's feet: radial
            d = p - outer
            return math.degrees(math.atan2(d[1], d[0])) % 180
        return 0.0
    if region == "perioral":
        d = p - cx.mouth_c
        return math.degrees(math.atan2(d[1], d[0])) % 180
    if region == "cheek":
        alar = P[129]; comm = P[61]
        v = comm - alar
        theta = math.degrees(math.atan2(v[1], v[0])) % 180
        w = float(np.clip((abs(p[0]) - abs(alar[0])) / max(abs(P[234][0]) - abs(alar[0]), 1e-6), 0, 1))
        target = 0.0 if theta < 90 else 180.0
        a = (1 - w) * theta + w * target
        return a % 180 if side == 0 else (180 - a) % 180
    o = cx.oval                                             # outside oval: along the contour
    i = int(np.argmin(np.linalg.norm(o - p, axis=1)))
    d = o[(i + 1) % len(o)] - o[i - 1]
    return math.degrees(math.atan2(d[1], d[0])) % 180


def _diff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def ellipse_for(p1, p2, axis_deg, k=ELLIPSE_LW_RATIO):
    """Smallest ellipse (length:width = k) with long axis along axis_deg that contains both
    wound endpoints. Returns centre, a, b (half axes, mm), tissue factor a/d."""
    c = 0.5 * (p1 + p2)
    d = 0.5 * float(np.linalg.norm(p2 - p1))
    if d < 1e-6:
        return c, 0.0, 0.0, 1.0
    th = math.radians(_diff(math.degrees(math.atan2(*(p2 - p1)[::-1])), axis_deg))
    a = d * math.sqrt(math.cos(th) ** 2 + (k * math.sin(th)) ** 2)
    return c, a, a / k, a / d


def ellipse_points(c, a, b, axis_deg, n=90):
    t = np.linspace(0, 2 * math.pi, n)
    r = math.radians(axis_deg)
    x, y = a * np.cos(t), b * np.sin(t)
    return np.stack([c[0] + x * math.cos(r) - y * math.sin(r), c[1] + x * math.sin(r) + y * math.cos(r)], axis=1)


def z_plasty(p1, p2, alpha):
    """Z-plasty limbs: central limb p1-p2, two arms of equal length at +alpha / -alpha."""
    v = p2 - p1
    L = float(np.linalg.norm(v))
    u = v / L
    rot = lambda ang: np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]]) @ u
    al = math.radians(alpha)
    return {"central": [p1, p2], "arm_1": [p1, p1 + L * rot(al)], "arm_2": [p2, p2 + L * rot(-al)],
            "theoretical_length_gain_percent": Z_GAIN.get(alpha), "limb_length_mm": round(L, 1)}


def scar_color(image_bgr, wound_px, px_per_mm):
    """Lab difference between the marked line and a surrounding skin ring (same photo)."""
    h, w = image_bgr.shape[:2]
    line = np.zeros((h, w), np.uint8)
    cv2.polylines(line, [np.round(wound_px).astype(np.int32).reshape(-1, 1, 2)], False, 255,
                  max(1, int(round(3 * px_per_mm))))
    k = lambda mm: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * mm * px_per_mm) | 1,) * 2)
    ring = cv2.dilate(line, k(10)) & ~cv2.dilate(line, k(5))
    if line.sum() == 0 or ring.sum() == 0:
        return None
    lab = cv2.cvtColor(image_bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
    a, b = lab[line > 0].mean(axis=0), lab[ring > 0].mean(axis=0)
    d = a - b
    return {"delta_E": round(float(np.linalg.norm(d)), 1), "delta_L": round(float(d[0]), 1),
            "delta_a_redness": round(float(d[1]), 1),
            "note": "relative to surrounding skin in the same photo; lighting and white balance affect this"}


def plan(landmarks_px, wound_px, image=None, z_angle=60, rstl_override_deg=None, ppm_override=None):
    """Full wound analysis. landmarks_px: (478, 2) px; wound_px: (n >= 2, 2) clicked px."""
    ff = FaceFrame(landmarks_px)
    if ppm_override:                       # manual calibration (ruler or known length) beats the iris assumption
        ff.midx *= ff.scale / ppm_override
        ff.scale = float(ppm_override)
    P = ff.to_mm(landmarks_px)
    cx = Ctx(P)
    Q = ff.to_mm(np.asarray(wound_px, float))
    dense = _densify(Q)
    length = float(sum(np.linalg.norm(b - a) for a, b in zip(Q[:-1], Q[1:])))
    chord = float(np.linalg.norm(Q[-1] - Q[0]))

    segs, wsum, dsum = [], 0.0, 0.0
    Qs = _densify(Q, 5.0)                  # region and RSTL are judged every ~5 mm, not only between clicked points
    for a, b in zip(Qs[:-1], Qs[1:]):
        m, ln = 0.5 * (a + b), float(np.linalg.norm(b - a))
        if ln == 0:
            continue
        reg = region_of(m, cx)
        r = rstl_override_deg % 180 if rstl_override_deg is not None else rstl_angle(reg, m, cx)
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180
        dd = _diff(ang, r)
        segs.append({"region": reg, "length_mm": round(ln, 1), "wound_deg": round(ang, 1),
                     "rstl_deg": round(r, 1), "angle_to_rstl_deg": round(dd, 1)})
        wsum += ln * dd; dsum += ln
    mean_diff = wsum / dsum if dsum else 0.0
    worst = max(segs, key=lambda s: s["angle_to_rstl_deg"])
    cls = ("favourable (near parallel to RSTL)" if mean_diff <= FAV else
           "unfavourable (near perpendicular to RSTL; commonly associated with wider scars)"
           if mean_diff >= UNFAV else "intermediate")

    borders = {"vermilion_border": (P[LIPS_OUTER], True), "brow_R": (P[BROW_R], False),
               "brow_L": (P[BROW_L], False), "eyelid_margin_R": (P[EYE_R], True),
               "eyelid_margin_L": (P[EYE_L], True), "alar_rim": (P[ALAR_RIM], False)}
    crit = []
    for name, (poly, closed) in borders.items():
        dmin = min(_seg_dist(p, poly, closed) for p in dense)
        crosses = any(_segments_cross(a, b, poly, closed) for a, b in zip(Q[:-1], Q[1:]))
        if crosses or dmin <= 4.0:
            crit.append({"structure": name, "min_distance_mm": round(dmin, 1), "crosses": crosses,
                         "advice": "align the edges at this landmark first"})

    centre_axis = (rstl_override_deg % 180 if rstl_override_deg is not None
                   else rstl_angle(region_of(Q.mean(axis=0), cx), Q.mean(axis=0), cx))
    ec, a_, b_, tissue = ellipse_for(Q[0], Q[-1], centre_axis)
    ell = {"axis_deg": round(centre_axis, 1), "half_length_mm": round(a_, 1), "half_width_mm": round(b_, 1),
           "length_to_width": ELLIPSE_LW_RATIO,
           "tissue_sacrifice_factor_vs_wound_half_length": round(tissue, 2)}
    if tissue > 2.0:
        ell["warning"] = "wound is far from the RSTL axis: the ellipse becomes long. Consider Z-/W-plasty or staging."
    z = z_plasty(Q[0], Q[-1], z_angle)

    out = {"length_mm": round(length, 1), "chord_mm": round(chord, 1),
           "tortuosity": round(length / chord, 2) if chord > 0 else None,
           "regions_crossed": list(dict.fromkeys(s["region"] for s in segs)),
           "mean_angle_to_rstl_deg": round(mean_diff, 1), "alignment": cls,
           "worst_segment": worst, "segments": segs, "critical_borders": crit,
           "elliptical_excision": ell,
           "z_plasty": {k: (v if k.endswith("percent") or k.endswith("mm") else [list(np.round(x, 1)) for x in v])
                        for k, v in z.items()},
           "rstl_source": "clinician override" if rstl_override_deg is not None else "coarse rule-based approximation (unverified against a published atlas)",
           "caveats": ["RSTL are a coarse rule-based approximation, not a measured field.",
                       "Drawn lines are decision-support sketches; the surgeon decides.",
                       "mm from iris scale (about +-5%), 2D frontal photo only.",
                       "No outcome or beauty prediction is made."]}
    if image is not None:
        out["scar_colour"] = scar_color(image, np.asarray(wound_px, float), ff.scale)
    return out, {"ff": ff, "Q": Q, "ellipse": ellipse_points(ec, a_, b_, centre_axis), "z": z,
                 "axis": centre_axis, "centre": Q.mean(axis=0), "crit": crit}


def draw_plan(image_bgr, landmarks_px, report, geo, out_path, min_width=1600):
    from overlay import _pt, _text
    f = max(1.0, min_width / image_bgr.shape[1])
    img = cv2.resize(image_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) if f > 1 else image_bgr.copy()
    ff, k = geo["ff"], img.shape[0] / 1000.0
    th = max(2, int(round(2 * k)))
    px = lambda Q: np.round(ff.to_px(Q) * f).astype(np.int32).reshape(-1, 1, 2)
    P = ff.to_mm(landmarks_px)
    for poly, closed in ((P[LIPS_OUTER], True), (P[BROW_R], False), (P[BROW_L], False),
                         (P[EYE_R], True), (P[EYE_L], True), (P[OVAL], True)):
        cv2.polylines(img, [px(poly)], closed, (200, 200, 200), max(1, th // 2), cv2.LINE_AA)
    r = math.radians(geo["axis"])
    d = np.array([math.cos(r), math.sin(r)])
    for s in np.linspace(-1, 1, 25):                                   # dashed RSTL axis
        if int(round((s + 1) * 12)) % 2 == 0:
            q = geo["centre"] + d * 30 * s
            cv2.circle(img, tuple(px(q[None])[0, 0]), th, (80, 200, 60), -1, cv2.LINE_AA)
    cv2.polylines(img, [px(geo["ellipse"])], True, (255, 200, 0), th, cv2.LINE_AA)
    zc = geo["z"]
    for key in ("central", "arm_1", "arm_2"):
        cv2.polylines(img, [px(np.array(zc[key]))], False, (200, 60, 230), th, cv2.LINE_AA)
    cv2.polylines(img, [px(geo["Q"])], False, (60, 60, 240), th + 1, cv2.LINE_AA)
    for q in geo["Q"]:
        cv2.circle(img, tuple(px(q[None])[0, 0]), th + 2, (60, 60, 240), -1, cv2.LINE_AA)

    pw = int(img.shape[0] * 0.62)
    H = max(img.shape[0], int(1000 * k))
    panel = np.full((H, pw, 3), 28, np.uint8)
    if H > img.shape[0]:
        img = cv2.copyMakeBorder(img, 0, H - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(28, 28, 28))
    rows = [("WOUND PLAN (decision support only)", (255, 255, 255), 0.8),
            (f"Regions: {', '.join(report['regions_crossed'])}", (230, 230, 230), 0.55),
            (f"Length {report['length_mm']} mm  (chord {report['chord_mm']} mm)", (230, 230, 230), 0.55),
            (f"Angle to RSTL (mean): {report['mean_angle_to_rstl_deg']} deg", (230, 230, 230), 0.55),
            (report["alignment"].split(" (")[0].upper(), (60, 60, 240) if report["mean_angle_to_rstl_deg"] >= UNFAV
             else (0, 200, 240) if report["mean_angle_to_rstl_deg"] > FAV else (80, 190, 60), 0.5),
            ("", None, 0),
            (f"Ellipse (cyan): axis {report['elliptical_excision']['axis_deg']} deg, "
             f"{2 * report['elliptical_excision']['half_length_mm']:.0f} x "
             f"{2 * report['elliptical_excision']['half_width_mm']:.0f} mm", (255, 200, 0), 0.5),
            (f"Z-plasty (magenta): limb {report['z_plasty']['limb_length_mm']} mm, gain "
             f"{report['z_plasty']['theoretical_length_gain_percent']}% (theoretical)", (200, 60, 230), 0.5),
            (("RSTL axis (green dots): " + ("clinician-set" if report["rstl_source"].startswith("clinician") else "approximate, unverified")), (80, 200, 60), 0.5), ("", None, 0)]
    for c in report["critical_borders"]:
        rows.append((f"! {c['structure']}: {c['min_distance_mm']} mm" + (" CROSSED" if c["crosses"] else ""),
                     (0, 140, 255), 0.5))
    if report["critical_borders"]:
        rows.append(("  align edges at these landmarks first", (0, 140, 255), 0.45))
    if report.get("scar_colour"):
        sc = report["scar_colour"]
        rows += [("", None, 0), (f"Colour vs skin: dE {sc['delta_E']}  redness(da) {sc['delta_a_redness']}", (230, 230, 230), 0.5)]
    rows += [("", None, 0), ("RSTL approximate. Surgeon decides.", (170, 170, 170), 0.45),
             ("No outcome or beauty prediction.", (170, 170, 170), 0.45)]
    y = int(50 * k)
    for text, colour, sz in rows:
        if text:
            _pt(panel, text, (int(16 * k), y), sz * k, colour, max(1, int(k)))
        y += int(34 * k)
    cv2.imwrite(str(out_path), np.hstack([img, panel]))


def click_wound(image_path):
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(image_path)
    pts = []

    def on_mouse(ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN:
            pts.append((x, y))

    cv2.namedWindow("mark wound")
    cv2.setMouseCallback("mark wound", on_mouse)
    while True:
        shown = img.copy()
        for p in pts:
            cv2.circle(shown, p, 4, (0, 0, 255), -1)
        if len(pts) > 1:
            cv2.polylines(shown, [np.array(pts, np.int32).reshape(-1, 1, 2)], False, (0, 0, 255), 2)
        cv2.putText(shown, "click along the wound, Enter = done, Backspace = undo, Esc = cancel",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        cv2.imshow("mark wound", shown)
        key = cv2.waitKey(20)
        if key == 27:
            cv2.destroyAllWindows()
            raise SystemExit("cancelled")
        if key == 8 and pts:
            pts.pop()
        if key in (10, 13) and len(pts) >= 2:
            cv2.destroyAllWindows()
            return np.array(pts, float)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image", help="frontal photo")
    ap.add_argument("--points", help='wound points in px "x1,y1;x2,y2;..." (otherwise click on the image)')
    ap.add_argument("--z", type=int, default=60, choices=(30, 45, 60), help="Z-plasty arm angle")
    ap.add_argument("--rstl-deg", type=float, help="clinician-set RSTL direction in degrees (0 = horizontal, 90 = vertical, face-aligned); overrides the built-in approximation")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--out", default="wound_output")
    ap.add_argument("--force", action="store_true", help="continue even if the quality gate refuses")
    args = ap.parse_args()
    from quality_gate import REFUSE, assess

    lm, img = ss.extract_landmarks_image(args.image, args.model)
    gate = assess(lm, image=img)
    if gate["status"] == REFUSE and not args.force:
        print("TIDAK DAPAT DINILAI:", *[f["message"] for f in gate["failures"]], sep="\n  - ")
        print("Cedera/bengkak dapat mengganggu deteksi; gunakan --force hanya bila titik wajah sudah Anda periksa.")
        return
    wound = (np.array([[float(v) for v in p.split(",")] for p in args.points.split(";")])
             if args.points else click_wound(args.image))
    report, geo = plan(lm[0], wound, image=img, z_angle=args.z, rstl_override_deg=args.rstl_deg)
    report["quality_gate"] = gate
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    draw_plan(img, lm[0], report, geo, out / "wound_plan.png")
    (out / "wound_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("length_mm", "regions_crossed", "mean_angle_to_rstl_deg",
                                              "alignment", "critical_borders")}, indent=2))


if __name__ == "__main__":
    main()
