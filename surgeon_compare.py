"""Agreement between the tool's marking plan and a surgeon's own marking on the same photo (Phase 2 of the protocol).

The surgeon draws, blinded to the tool's output: the wound/scar contour, an RSTL line, the sutures they would place
(one point per skin suture) and, optionally, an excision outline; and picks a primary technique. This module
measures how closely the tool agrees. It does NOT say who is right: with a single surgeon, agreement is limited by
the surgeon's own variability, so run it with 2 or more surgeons and compare tool-vs-surgeon to surgeon-vs-surgeon.

Metrics (all in mm using the same scale for both):
- contour: Dice and IoU of the two filled outlines
- RSTL: absolute angle difference 0 to 90 degrees (lines are axial)
- sutures: optimal one-to-one matching (Hungarian); median and max matched distance, count difference,
  and spacing difference (mean nearest-neighbour spacing)
- excision outline: IoU when both are given
- technique: exact match of the primary technique, and whether the surgeon's choice is in the tool's top 3
"""
import csv
import math
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment


def _mask(shape, poly):
    import cv2
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(np.asarray(poly, float)).astype(np.int32).reshape(-1, 1, 2)], 1)
    return m > 0


def dice_iou(a, b):
    inter = float((a & b).sum())
    sa, sb = float(a.sum()), float(b.sum())
    union = sa + sb - inter
    return (2 * inter / (sa + sb) if sa + sb else 0.0), (inter / union if union else 0.0)


def axial_angle_diff(a_deg, b_deg):
    d = abs(a_deg - b_deg) % 180
    return min(d, 180 - d)


def line_angle(p1, p2):
    return math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0])) % 180


def match_sutures(tool_px, surgeon_px, px_per_mm):
    """One-to-one matching minimising total distance. Returns dict of matched distances (mm) and count difference."""
    A, B = np.asarray(tool_px, float), np.asarray(surgeon_px, float)
    if len(A) == 0 or len(B) == 0:
        return {"n_tool": len(A), "n_surgeon": len(B), "count_difference": len(B) - len(A), "matched": 0,
                "median_distance_mm": None, "max_distance_mm": None, "mean_distance_mm": None}
    D = np.linalg.norm(A[:, None, :] - B[None, :, :], axis=2) / px_per_mm
    r, c = linear_sum_assignment(D)
    d = D[r, c]
    return {"n_tool": len(A), "n_surgeon": len(B), "count_difference": len(B) - len(A), "matched": int(len(d)),
            "median_distance_mm": round(float(np.median(d)), 2), "max_distance_mm": round(float(d.max()), 2),
            "mean_distance_mm": round(float(d.mean()), 2)}


def mean_spacing_mm(pts_px, px_per_mm):
    P = np.asarray(pts_px, float)
    if len(P) < 2:
        return None
    # order along the principal axis, then mean consecutive distance
    c = P - P.mean(axis=0)
    _, v = np.linalg.eigh(c.T @ c)
    order = np.argsort(c @ v[:, -1])
    Q = P[order]
    return float(np.mean(np.linalg.norm(np.diff(Q, axis=0), axis=1)) / px_per_mm)


def compare(tool, surgeon, shape, px_per_mm):
    """tool / surgeon: dicts with optional keys
       contour_px (polygon) or mask, rstl_angle_deg, suture_px (list of points), excision_px (polygon), technique (str),
       top_techniques (tool only, list of str). Returns metric dict."""
    out = {}
    tm = tool.get("mask")
    if tm is None and tool.get("contour_px") is not None:
        tm = _mask(shape, tool["contour_px"])
    if tm is not None and surgeon.get("contour_px") is not None:
        d, i = dice_iou(np.asarray(tm, bool), _mask(shape, surgeon["contour_px"]))
        out["contour"] = {"dice": round(d, 3), "iou": round(i, 3)}
    if tool.get("rstl_angle_deg") is not None and surgeon.get("rstl_angle_deg") is not None:
        out["rstl_angle_difference_deg"] = round(axial_angle_diff(tool["rstl_angle_deg"], surgeon["rstl_angle_deg"]), 1)
    if tool.get("suture_px") is not None and surgeon.get("suture_px") is not None:
        s = match_sutures(tool["suture_px"], surgeon["suture_px"], px_per_mm)
        ta, sa = mean_spacing_mm(tool["suture_px"], px_per_mm), mean_spacing_mm(surgeon["suture_px"], px_per_mm)
        s["spacing_tool_mm"] = None if ta is None else round(ta, 2)
        s["spacing_surgeon_mm"] = None if sa is None else round(sa, 2)
        s["spacing_difference_mm"] = None if ta is None or sa is None else round(sa - ta, 2)
        out["sutures"] = s
    if tool.get("excision_px") is not None and surgeon.get("excision_px") is not None:
        d, i = dice_iou(_mask(shape, tool["excision_px"]), _mask(shape, surgeon["excision_px"]))
        out["excision"] = {"dice": round(d, 3), "iou": round(i, 3)}
    if surgeon.get("technique") and tool.get("top_techniques"):
        top = [t.lower() for t in tool["top_techniques"]]
        sg = surgeon["technique"].lower()
        out["technique"] = {"primary_match": bool(top and (sg in top[0] or top[0] in sg)),
                            "in_top3": any(sg in t or t in sg for t in top[:3]), "tool_primary": tool["top_techniques"][0],
                            "surgeon": surgeon["technique"]}
    return out


def append_csv(path, case_id, surgeon_id, metrics):
    row = {"case": case_id, "surgeon": surgeon_id,
           "contour_dice": metrics.get("contour", {}).get("dice"), "rstl_diff_deg": metrics.get("rstl_angle_difference_deg"),
           "suture_count_diff": metrics.get("sutures", {}).get("count_difference"),
           "suture_median_dist_mm": metrics.get("sutures", {}).get("median_distance_mm"),
           "spacing_diff_mm": metrics.get("sutures", {}).get("spacing_difference_mm"),
           "excision_iou": metrics.get("excision", {}).get("iou"),
           "technique_primary_match": metrics.get("technique", {}).get("primary_match"),
           "technique_in_top3": metrics.get("technique", {}).get("in_top3")}
    p = Path(path)
    new = not p.exists()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(row))
        if new:
            w.writeheader()
        w.writerow(row)
    return row


def summarize(csv_path):
    """Per-metric median, IQR and the protocol's pass fractions across all rows."""
    import statistics as st
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))

    def col(name):
        return [float(r[name]) for r in rows if r.get(name) not in (None, "", "None")]
    out = {"n_rows": len(rows)}
    for name in ("contour_dice", "rstl_diff_deg", "suture_count_diff", "suture_median_dist_mm", "spacing_diff_mm", "excision_iou"):
        v = col(name)
        if v:
            q = st.quantiles(v, n=4) if len(v) >= 4 else [min(v), st.median(v), max(v)]
            out[name] = {"n": len(v), "median": round(st.median(v), 3), "q1": round(q[0], 3), "q3": round(q[-1], 3)}
    d = col("contour_dice")
    if d:
        out["fraction_dice_ge_0.85"] = round(sum(x >= 0.85 for x in d) / len(d), 2)
    a = col("rstl_diff_deg")
    if a:
        out["fraction_rstl_within_15deg"] = round(sum(x <= 15 for x in a) / len(a), 2)
    m = [r["technique_primary_match"] for r in rows if r.get("technique_primary_match") in ("True", "False")]
    if m:
        out["fraction_primary_technique_match"] = round(sum(x == "True" for x in m) / len(m), 2)
    return out
