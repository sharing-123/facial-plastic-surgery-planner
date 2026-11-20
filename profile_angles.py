"""Profile (lateral) angles for rhinoplasty / chin planning, from manually clicked points.

MediaPipe is trained on frontal and near-frontal faces and is unreliable on a true profile,
so points are placed by the user. Angles need no scale; E-line distances need --mm-per-px
(photograph a ruler or a known length at the same distance).

Reference ranges are commonly cited values, not targets; they vary by sex and ethnicity.
Research prototype, not for clinical decisions.
"""
import argparse
import json
import math

import numpy as np

# Click order. The patient faces image-left or image-right; the angles do not care.
POINTS = ["glabella", "nasion", "pronasale", "columella", "subnasale", "alar_crease",
          "labrale_superius", "labrale_inferius", "labiomental_sulcus", "pogonion"]

REFERENCES = {
    "nasofrontal_deg": "commonly cited about 115 to 130",
    "nasofacial_deg": "commonly cited about 30 to 40",
    "nasolabial_deg": "commonly cited about 95 to 110 (female), 90 to 95 (male)",
    "mentolabial_deg": "commonly cited about 110 to 130",
    "tip_projection_goode": "Goode ratio = horizontal projection of the tip from the alar crease / nasion-tip length; commonly cited ideal about 0.55 to 0.60; lower values mean low projection (head level, Frankfort horizontal)",
    "e_line_mm": "Ricketts E-line: upper lip roughly -4, lower lip roughly -2 (negative = behind the line); age dependent",
}


def _angle(a, vertex, b):
    v1, v2 = np.asarray(a, float) - vertex, np.asarray(b, float) - vertex
    c = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _line_angle(p1, p2, q1, q2):
    """Acute angle between lines p1-p2 and q1-q2."""
    u = np.asarray(p2, float) - p1
    v = np.asarray(q2, float) - q1
    c = abs(np.dot(u, v)) / (np.linalg.norm(u) * np.linalg.norm(v))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _signed_dist(pt, a, b):
    """Signed distance of pt from line a-b (positive on the left of a->b)."""
    a, b, pt = (np.asarray(x, float) for x in (a, b, pt))
    d = b - a
    return float((d[0] * (pt[1] - a[1]) - d[1] * (pt[0] - a[0])) / np.linalg.norm(d))


def angles_from_points(pts, mm_per_px=None):
    g = {k: np.asarray(pts[k], float) for k in POINTS}
    out = {
        "nasofrontal_deg": round(_angle(g["glabella"], g["nasion"], g["pronasale"]), 1),
        "nasofacial_deg": round(_line_angle(g["glabella"], g["pogonion"], g["nasion"], g["pronasale"]), 1),
        "nasolabial_deg": round(_angle(g["columella"], g["subnasale"], g["labrale_superius"]), 1),
        "mentolabial_deg": round(_angle(g["labrale_inferius"], g["labiomental_sulcus"], g["pogonion"]), 1),
    }
    length = float(np.linalg.norm(g["pronasale"] - g["nasion"]))
    proj = abs(float(g["pronasale"][0] - g["alar_crease"][0]))        # horizontal in a level-head lateral photo
    out["tip_projection_goode"] = round(proj / length, 3) if length > 0 else None
    out["nasal_length_vs_projection_note"] = "needs a level-head (Frankfort horizontal) lateral photo"
    if mm_per_px:
        # E-line runs pronasale -> pogonion; "behind the line" = on the side of the face
        side = _signed_dist(g["subnasale"], g["pronasale"], g["pogonion"])
        sign = 1.0 if side > 0 else -1.0     # subnasale lies behind the line by construction
        out["e_line_mm"] = {
            k: round(-sign * _signed_dist(g[k], g["pronasale"], g["pogonion"]) * mm_per_px, 1)
            for k in ("labrale_superius", "labrale_inferius")}
    out["references_not_targets"] = REFERENCES
    return out


def click_points(image_path):
    """Open the image and let the user click the points in POINTS order."""
    import cv2

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(image_path)
    clicks = []

    def on_mouse(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN and len(clicks) < len(POINTS):
            clicks.append((x, y))
            cv2.circle(img, (x, y), 4, (0, 255, 0), -1)

    cv2.namedWindow("profile")
    cv2.setMouseCallback("profile", on_mouse)
    while len(clicks) < len(POINTS):
        shown = img.copy()
        cv2.putText(shown, f"click: {POINTS[len(clicks)]}", (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.imshow("profile", shown)
        if cv2.waitKey(20) == 27:      # Esc
            cv2.destroyAllWindows()
            raise SystemExit("cancelled")
    cv2.destroyAllWindows()
    return dict(zip(POINTS, clicks))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image", help="lateral photograph (Frankfort horizontal, neutral lips)")
    ap.add_argument("--mm-per-px", type=float, help="scale for E-line distances")
    args = ap.parse_args()
    print(json.dumps(angles_from_points(click_points(args.image), args.mm_per_px), indent=2))


if __name__ == "__main__":
    main()
