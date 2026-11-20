"""Cleft module tests: plant known asymmetries in mm, recover them under roll and scale."""
import math

import numpy as np

import cleft_analysis as ca
import test_wound_planner as tw
import wound_planner as wp

# canonical-face landmark used as the clean "symmetric" starting point for each clicked point
SRC = {"nasion": 168, "prn": 1, "sn": 2, "sbal_R": 98, "sbal_L": 327, "al_R": 129, "al_L": 358,
       "cph_R": 37, "cph_L": 267, "ls": 0, "ch_R": 61, "ch_L": 291}


def clicks(scale=6.0, roll=0.0, **plant):
    """plant: key -> (dx_mm, dy_mm) added in the face frame. Returns (clicks_px, frame)."""
    lm = tw.face_px(scale, roll)
    ff = wp.FaceFrame(lm)
    P = ff.to_mm(lm)
    pts = {k: P[i].copy() for k, i in SRC.items()}
    for k, (dx, dy) in plant.items():
        pts[k] = pts[k] + np.array([dx, dy])
    return {k: ff.to_px(v[None])[0] for k, v in pts.items()}, ff


def run(**kw):
    plant = kw.pop("plant", {})
    c, ff = clicks(**kw, **plant)
    return ca.analyse(c, ff)[0]


def near(a, b, tol):
    assert abs(a - b) <= tol, (a, b)


def test_symmetric_face_gives_ones_and_zeros():
    m = run()
    for k in ("lateral_lip_height_mm", "alar_base_to_midline_mm", "commissure_to_midline_mm"):
        assert m[k]["ratio_min_over_max"] > 0.98, (k, m[k])
    for k in ("cupid_bow_level_diff_mm", "commissure_level_diff_mm", "alar_base_level_diff_mm", "nasal_tip_deviation_mm"):
        assert m[k] < 0.3, (k, m[k])
    assert abs(m["cupid_bow_tilt_deg"]) < 1.0


def test_planted_cleft_pattern_recovered():
    plant = {"cph_L": (0, 3.0),            # cleft-side cupid's bow peak sits 3 mm high
             "ch_L": (0, 2.0),             # mouth corner 2 mm high
             "sbal_L": (4.0, 0.0),         # alar base 4 mm lateral on the left
             "prn": (3.0, 0.0)}            # nasal tip 3 mm off the midline
    base = run()
    m = run(plant=plant)
    near(m["cupid_bow_level_diff_mm"], 3.0, 0.3)
    near(m["commissure_level_diff_mm"], 2.0, 0.3)
    assert m["alar_base_to_midline_mm"]["L"] - base["alar_base_to_midline_mm"]["L"] > 3.5
    near(m["nasal_tip_deviation_mm"], base["nasal_tip_deviation_mm"] + 3.0, 0.3)
    assert m["shorter_lip_side"] in ("R", "L")


def test_invariant_to_roll_and_scale():
    plant = {"cph_L": (0, 3.0), "ch_L": (0, 2.0), "prn": (3.0, 0.0)}
    ref = run(plant=plant)
    for scale, roll in ((9.0, 10), (4.0, -8)):
        m = run(scale=scale, roll=roll, plant=plant)
        for k in ("cupid_bow_level_diff_mm", "commissure_level_diff_mm", "nasal_tip_deviation_mm", "cupid_bow_tilt_deg"):
            near(m[k], ref[k], 0.4)
        near(m["lateral_lip_height_mm"]["ratio_min_over_max"], ref["lateral_lip_height_mm"]["ratio_min_over_max"], 0.03)


def test_shorter_lip_side_and_ratio():
    m = run(plant={"cph_L": (0, -3.0)})        # left peak lower: left lateral lip height longer
    assert m["shorter_lip_side"] == "R"
    m2 = run(plant={"cph_R": (0, -3.0)})
    assert m2["shorter_lip_side"] == "L"
    assert m["lateral_lip_height_mm"]["ratio_min_over_max"] < 0.95


def test_status_bands_and_compare():
    assert ca.status("cupid_bow_level_diff_mm", 0.5) == "green"
    assert ca.status("cupid_bow_level_diff_mm", 1.5) == "yellow"
    assert ca.status("cupid_bow_level_diff_mm", 3.0) == "red"
    pre = run(plant={"cph_L": (0, 4.0), "ch_L": (0, 3.0)})
    post = run(plant={"cph_L": (0, 0.5), "ch_L": (0, 0.5)})
    d = ca.compare(pre, post)
    assert d["cupid_bow_level_diff_mm"]["abs_change"] < -2.5
    assert d["lateral_lip_height_mm"]["ratio_change"] > 0.03


def test_plain_frame_fallback_matches_scale():
    f = ca.PlainFrame(mm_per_px=0.2)
    c = {k: (100.0 + 10 * i, 200.0) for i, k in enumerate(ca.KEYS)}
    q = f.to_mm(np.array(c["nasion"]))
    near(q[0], 20.0, 1e-9)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
