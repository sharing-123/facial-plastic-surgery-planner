"""Annotated overlay: landmark mesh, colour-coded regions, boxes, guide lines and a
colour-coded findings panel.

Colours (traffic light) mean "differs from the cited reference by more than a screening
tolerance", NOT "needs surgery". The tolerances below are arbitrary screening thresholds
chosen for this prototype, not clinical cut-offs. Accuracy is limited by MediaPipe landmark
placement (typically a few pixels), so zoom in and check the points before trusting a flag.
"""
import math

import cv2
import numpy as np
from mediapipe.tasks.python import vision

import face_proportions as fp

C = vision.FaceLandmarksConnections
GREEN, YELLOW, RED = (80, 190, 60), (0, 200, 240), (60, 60, 230)      # BGR
STATUS_NAME = {GREEN: "within tolerance", YELLOW: "borderline", RED: "outside tolerance"}

REGIONS = {                                  # name: (connections, BGR colour)
    "brow R": (C.FACE_LANDMARKS_RIGHT_EYEBROW, (0, 140, 255)),
    "brow L": (C.FACE_LANDMARKS_LEFT_EYEBROW, (0, 140, 255)),
    "eye R": (C.FACE_LANDMARKS_RIGHT_EYE, (255, 200, 0)),
    "eye L": (C.FACE_LANDMARKS_LEFT_EYE, (255, 200, 0)),
    "nose": (C.FACE_LANDMARKS_NOSE, (0, 230, 230)),
    "mouth": (C.FACE_LANDMARKS_LIPS, (200, 60, 230)),
    "face": (C.FACE_LANDMARKS_FACE_OVAL, (240, 240, 240)),
}
BOXES = ("eye R", "eye L", "nose", "mouth", "face")

# label, getter(ratios, tilt), reference centre, screening tolerance
CANON = [
    ("Middle : lower third", lambda r, t: r["middle_to_lower_third"], 1.0, 0.10),
    ("Upper lip : lower face (1:2)", lambda r, t: r["upper_lip_to_lower_face"], 0.5, 0.08),
    ("Alar : intercanthal", lambda r, t: r["alar_to_intercanthal"], 1.0, 0.10),
    ("Eye R : intercanthal", lambda r, t: r["eye_width_to_intercanthal"]["image_left"], 1.0, 0.10),
    ("Eye L : intercanthal", lambda r, t: r["eye_width_to_intercanthal"]["image_right"], 1.0, 0.10),
    ("Mouth : alar", lambda r, t: r["mouth_to_alar"], 1.5, 0.15),
    ("Lower : upper vermilion", lambda r, t: r["lower_to_upper_vermilion"], 1.55, 0.20),
    ("Canthal tilt R (deg)", lambda r, t: t["image_left"], 6.0, 3.0),
    ("Canthal tilt L (deg)", lambda r, t: t["image_right"], 6.0, 3.0),
] + [(f"Fifth: {n}", (lambda n: lambda r, t: r["fifths_of_bizygomatic"][n])(n), 0.20, 0.03)
     for n in ("outer_left", "eye_left", "intercanthal", "eye_right", "outer_right")]


def status(dev, tol):
    return GREEN if dev <= tol else YELLOW if dev <= 2 * tol else RED


def asym_status(mm):
    return GREEN if mm < 1.5 else YELLOW if mm < 3.0 else RED


def findings(report):
    """List of (label, value, reference, colour) from a report with frontal_proportions."""
    fpr = report["frontal_proportions"]
    rows = []
    for label, get, centre, tol in CANON:
        v = get(fpr["ratios"], fpr["canthal_tilt_deg"])
        if v is not None:
            rows.append((label, v, centre, status(abs(v - centre), tol)))
    for name, side in (("smile", "Smile"), ("brow_raise", "Brow raise"), ("eye_closure", "Eye closure")):
        t = report.get("tasks", {}).get(name)
        if t and t["excursion_symmetry_ratio"] is not None:
            ratio = t["excursion_symmetry_ratio"]
            rows.append((f"{side} symmetry (weaker: {t['weaker_side'].split('(')[1][:-1]})",
                         ratio, 1.0, status(1 - ratio, 0.15)))
    return rows


def _poly(img, pts, conns, colour, th):
    for c in conns:
        a, b = pts[c.start], pts[c.end]
        cv2.line(img, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), colour, th, cv2.LINE_AA)


def _text(img, s, org, scale, colour, th=1, outline=True):
    if outline:
        cv2.putText(img, s, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), th + 2, cv2.LINE_AA)
    cv2.putText(img, s, org, cv2.FONT_HERSHEY_SIMPLEX, scale, colour, th, cv2.LINE_AA)


def _pt(img, s, org, scale, colour, th=1):
    _text(img, s, org, scale, colour, th, outline=False)


def _guide_lines(img, pts, k, th):
    """Thirds (horizontal) and fifths (vertical), aligned to the outer-canthal line."""
    a, b = pts[fp.EYE["image_left"][1]], pts[fp.EYE["image_right"][1]]
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    ux, uy = math.cos(ang), math.sin(ang)          # along canthal line
    vx, vy = -uy, ux                               # perpendicular (downwards)
    L = img.shape[1]
    for idx, name in ((fp.GLABELLA, "glabella"), (fp.SUBNASALE, "subnasale"), (fp.MENTON, "menton")):
        x, y = pts[idx]
        p1 = (int(x - ux * L * .5), int(y - uy * L * .5)); p2 = (int(x + ux * L * .5), int(y + uy * L * .5))
        cv2.line(img, p1, p2, (200, 200, 120), th, cv2.LINE_AA)
        _text(img, name, (int(x - 0.45 * L * .5), int(y - 6 * k)), 0.45 * k, (200, 200, 120))
    H = img.shape[0]
    for idx in (fp.ZYGOMA[0], fp.EYE["image_left"][1], fp.EYE["image_left"][0],
                fp.EYE["image_right"][0], fp.EYE["image_right"][1], fp.ZYGOMA[1]):
        x, y = pts[idx]
        p1 = (int(x - vx * H * .45), int(y - vy * H * .45)); p2 = (int(x + vx * H * .45), int(y + vy * H * .45))
        cv2.line(img, p1, p2, (170, 170, 255), th, cv2.LINE_AA)
    mx = 0.5 * (pts[fp.EYE["image_left"][0]] + pts[fp.EYE["image_right"][0]])
    cv2.line(img, (int(mx[0] - vx * H * .5), int(mx[1] - vy * H * .5)),
             (int(mx[0] + vx * H * .5), int(mx[1] + vy * H * .5)), (255, 255, 255), th + 1, cv2.LINE_AA)


def draw_overlay(image_bgr, landmarks_px, report, out_path, min_width=1600):
    """Write a PNG: annotated face (left) + findings panel (right). Returns the findings."""
    f = max(1.0, min_width / image_bgr.shape[1])
    img = cv2.resize(image_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC) if f > 1 else image_bgr.copy()
    pts = landmarks_px * f
    k = img.shape[0] / 1000.0
    th = max(1, int(round(1.2 * k)))

    mesh = img.copy()
    _poly(mesh, pts, C.FACE_LANDMARKS_TESSELATION, (255, 255, 255), 1)
    img = cv2.addWeighted(mesh, 0.22, img, 0.78, 0)
    for p in pts:
        cv2.circle(img, (int(p[0]), int(p[1])), max(1, int(round(1.1 * k))), (255, 255, 255), -1, cv2.LINE_AA)

    _guide_lines(img, pts, k, th)
    for name, (conns, colour) in REGIONS.items():
        _poly(img, pts, conns, colour, th + 1)
    for name in BOXES:                                    # precise bounding boxes
        idx = {i for c in REGIONS[name][0] for i in (c.start, c.end)}
        xy = pts[list(idx)]
        pad = 6 * k
        x0, y0 = xy.min(axis=0) - pad; x1, y1 = xy.max(axis=0) + pad
        cv2.rectangle(img, (int(x0), int(y0)), (int(x1), int(y1)), REGIONS[name][1], th, cv2.LINE_AA)
        _text(img, name, (int(x0), int(y0 - 5 * k)), 0.5 * k, REGIONS[name][1])

    asym = report["frontal_proportions"]["mirror_asymmetry"]["per_pair_mm"]
    for name, (a, b) in fp.MIRROR_PAIRS.items():          # colour-coded pair links
        colour = asym_status(asym[name])
        pa_, pb_ = pts[a], pts[b]
        cv2.line(img, (int(pa_[0]), int(pa_[1])), (int(pb_[0]), int(pb_[1])), colour, th + 1, cv2.LINE_AA)
        for p in (pa_, pb_):
            cv2.circle(img, (int(p[0]), int(p[1])), int(4 * k) + 1, colour, -1, cv2.LINE_AA)
        mid = 0.5 * (pa_ + pb_)
        _text(img, f"{asym[name]:.1f}", (int(mid[0]), int(mid[1] - 8 * k)), 0.5 * k, colour, th)

    rows = findings(report)
    pw = int(img.shape[0] * 0.62)                          # panel width
    H2 = max(img.shape[0], int(1420 * k))
    panel = np.full((H2, pw, 3), 28, np.uint8)
    if H2 > img.shape[0]:
        img = cv2.copyMakeBorder(img, 0, H2 - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(28, 28, 28))
    y = int(50 * k)
    _pt(panel, "FINDINGS vs cited reference", (int(16 * k), y), 0.8 * k, (255, 255, 255), th)
    y += int(34 * k)
    _pt(panel, "screening colours, not a surgical recommendation", (int(16 * k), y), 0.5 * k, (180, 180, 180))
    y += int(36 * k)
    gate = report.get("quality_gate")
    if gate:                                               # quality banner
        colour = GREEN if gate["status"] == "PASS" else YELLOW if gate["status"] == "PASS_WITH_WARNINGS" else RED
        _pt(panel, f"IMAGE QUALITY: {gate['status']}", (int(16 * k), y), 0.6 * k, colour, th)
        y += int(24 * k)
        for item in (gate["failures"] + gate["warnings"])[:4]:
            _pt(panel, item["message"][:62], (int(16 * k), y), 0.42 * k, colour)
            y += int(20 * k)
        if gate["status"] == "CANNOT_ASSESS":
            _pt(panel, "OVERRIDDEN with --force: do not rely on numbers", (int(16 * k), y), 0.45 * k, RED, th)
            y += int(22 * k)
    y += int(20 * k)
    for label, v, centre, colour in rows:
        cv2.rectangle(panel, (int(16 * k), y - int(18 * k)), (int(36 * k), y + int(2 * k)), colour, -1)
        _pt(panel, f"{label}", (int(48 * k), y), 0.56 * k, (255, 255, 255))
        _pt(panel, f"{v:.2f}  (ref {centre:g})", (int(48 * k), y + int(22 * k)), 0.5 * k, colour)
        y += int(52 * k)
    y += int(8 * k)
    _pt(panel, "Pair asymmetry (mm) on face:", (int(16 * k), y), 0.55 * k, (255, 255, 255))
    y += int(28 * k)
    for colour, txt in ((GREEN, "< 1.5"), (YELLOW, "1.5 to 3"), (RED, ">= 3")):
        cv2.rectangle(panel, (int(16 * k), y - int(14 * k)), (int(32 * k), y + int(2 * k)), colour, -1)
        _pt(panel, txt, (int(44 * k), y), 0.5 * k, (230, 230, 230))
        y += int(26 * k)
    y += int(10 * k)
    for line in ("Check landmark placement before", "trusting any flag. Thresholds are", "screening values, not clinical."):
        _pt(panel, line, (int(16 * k), y), 0.45 * k, (170, 170, 170))
        y += int(22 * k)
    cv2.imwrite(str(out_path), np.hstack([img, panel]))
    return rows
