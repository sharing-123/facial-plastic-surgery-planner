"""Tests for the surgeon-agreement metrics with known synthetic geometry."""
import math
import os
import tempfile

import numpy as np

import surgeon_compare as sc

SHAPE = (400, 400)
PPM = 5.0


def square(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def test_dice_iou_known_overlap():
    a = sc._mask(SHAPE, square(50, 50, 150, 150))
    b = sc._mask(SHAPE, square(100, 50, 200, 150))            # half overlap
    d, i = sc.dice_iou(a, b)
    assert abs(d - 0.5) < 0.02 and abs(i - 1 / 3) < 0.02
    d2, i2 = sc.dice_iou(a, a)
    assert d2 == 1.0 and i2 == 1.0


def test_axial_angle_difference_wraps_and_is_symmetric():
    assert sc.axial_angle_diff(5, 175) == 10 and sc.axial_angle_diff(175, 5) == 10
    assert sc.axial_angle_diff(0, 90) == 90 and sc.axial_angle_diff(30, 30) == 0
    assert abs(sc.line_angle((0, 0), (10, 10)) - 45) < 1e-9 and abs(sc.line_angle((0, 0), (-10, 0)) - 0) < 1e-9


def test_suture_matching_distance_count_and_spacing():
    tool = [(100 + 20 * i, 200) for i in range(10)]                     # 4 mm spacing at 5 px/mm
    surg = [(x + 5, y + 5) for x, y in tool[:8]]                          # shifted 7.07 px = 1.41 mm, two fewer
    m = sc.match_sutures(tool, surg, PPM)
    assert m["count_difference"] == -2 and m["matched"] == 8
    assert abs(m["median_distance_mm"] - math.hypot(5, 5) / PPM) < 0.05
    assert abs(sc.mean_spacing_mm(tool, PPM) - 4.0) < 1e-6


def test_compare_aggregates_all_available_metrics():
    tool = {"contour_px": square(50, 50, 150, 150), "rstl_angle_deg": 80, "suture_px": [(100, 100), (120, 100)],
            "excision_px": square(40, 40, 160, 160), "top_techniques": ["Penutupan primer berlapis", "Z-plasty", "W-plasty"]}
    surg = {"contour_px": square(55, 50, 155, 150), "rstl_angle_deg": 95, "suture_px": [(101, 100), (121, 100)],
            "excision_px": square(40, 40, 160, 160), "technique": "Z-plasty"}
    r = sc.compare(tool, surg, SHAPE, PPM)
    assert r["contour"]["dice"] > 0.9 and r["rstl_angle_difference_deg"] == 15.0
    assert r["sutures"]["median_distance_mm"] < 0.3 and r["excision"]["iou"] == 1.0
    assert r["technique"]["primary_match"] is False and r["technique"]["in_top3"] is True


def test_csv_append_and_summary_fractions():
    d = tempfile.mkdtemp()
    p = os.path.join(d, "v.csv")
    for i, (dice, ang, match) in enumerate([(0.9, 10, True), (0.8, 20, False), (0.88, 5, True), (0.95, 12, True)]):
        sc.append_csv(p, f"c{i}", "S1", {"contour": {"dice": dice}, "rstl_angle_difference_deg": ang,
                                          "technique": {"primary_match": match, "in_top3": True}})
    s = sc.summarize(p)
    assert s["n_rows"] == 4 and s["fraction_dice_ge_0.85"] == 0.75 and s["fraction_rstl_within_15deg"] == 0.75
    assert s["fraction_primary_technique_match"] == 0.75


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
