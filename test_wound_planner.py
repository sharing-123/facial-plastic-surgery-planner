"""Tests for the wound planner on the MediaPipe canonical (mean) face, projected frontally."""
import math
from pathlib import Path

import numpy as np

import face_proportions as fp
import smile_symmetry as ss
import wound_planner as wp

CANON = np.load(Path(__file__).parent / "test_data" / "canonical_face_cm.npy")   # (468, 3) cm


def face_px(scale=6.0, roll_deg=0.0, centre=(900.0, 1000.0)):
    """Frontal landmarks in px (478 points; iris synthesised from the eye contours)."""
    pts = np.zeros((478, 2))
    pts[:468] = np.stack([CANON[:, 0] * 10 * scale, -CANON[:, 1] * 10 * scale], axis=1)
    for c, ring in ((468, wp.EYE_R), (473, wp.EYE_L)):
        ctr = pts[ring].mean(axis=0)
        r = 5.85 * scale
        pts[c] = ctr
        pts[c + 1], pts[c + 2], pts[c + 3], pts[c + 4] = ctr + (r, 0), ctr + (0, -r), ctr + (-r, 0), ctr + (0, r)
    a = math.radians(roll_deg)
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    return pts @ rot.T + np.array(centre)


def c(x, y):
    """Canonical-face millimetres (origin at the face centre of the mesh, y up) -> planner frame (origin at inner canthus)."""
    return np.array([x, y - CANON[133, 1] * 10])


def mm_to_px(lm, Q):
    return wp.FaceFrame(lm).to_px(np.array(Q, float))


def near(a, b, tol):
    assert abs(a - b) <= tol, (a, b)


def test_frame_round_trip_and_scale():
    lm = face_px(scale=6.0, roll_deg=10)
    ff = wp.FaceFrame(lm)
    q = np.array([[10.0, 5.0], [-22.0, -30.0]])
    assert np.allclose(ff.to_mm(ff.to_px(q)), q, atol=1e-9)
    near(ff.scale, 6.0, 0.1)                                   # iris scale recovers px/mm


def test_length_and_angle_invariant_to_roll_and_scale():
    for scale, roll in ((6.0, 0), (9.0, 12), (4.0, -9)):
        lm = face_px(scale, roll)
        rep, _ = wp.plan(lm, mm_to_px(lm, [c(-45, -15), c(-35, -15)]))        # 10 mm horizontal, cheek
        near(rep["length_mm"], 10.0, 0.3)
        near(rep["segments"][0]["wound_deg"] % 180, 0.0, 1.0) if rep["segments"][0]["wound_deg"] < 90 else \
            near(rep["segments"][0]["wound_deg"], 180.0, 1.0)


def test_regions_on_canonical_face():
    lm = face_px()
    ff = wp.FaceFrame(lm)
    cx = wp.Ctx(ff.to_mm(lm))
    P = cx.P
    cases = {"lip": P[fp.UPPER_IN], "nose": P[1], "forehead": c(-20.0, 72.0),
             "chin": c(0.0, -82.0), "cheek": c(-45.0, -15.0),
             "outside_face_oval": c(-110.0, 0.0), "glabella": np.array([0.0, P[9][1] + 3.0])}
    for want, p in cases.items():
        assert wp.region_of(p, cx) == want, (want, wp.region_of(p, cx))
    assert wp.region_of(P[33] + np.array([0.0, 4.0]), cx) in ("periorbital", "brow")


def test_rstl_alignment_classes():
    lm = face_px()
    horiz, _ = wp.plan(lm, mm_to_px(lm, [c(-30, 70), c(-10, 70)]))             # forehead, horizontal
    vert, _ = wp.plan(lm, mm_to_px(lm, [c(-20, 62), c(-20, 80)]))              # forehead, vertical
    assert horiz["alignment"].startswith("favourable") and horiz["mean_angle_to_rstl_deg"] < 3
    assert vert["alignment"].startswith("unfavourable") and vert["mean_angle_to_rstl_deg"] > 85
    assert "forehead" in horiz["regions_crossed"]


def test_cheek_rstl_follows_nasolabial_near_nose_and_horizontal_laterally():
    lm = face_px()
    cx = wp.Ctx(wp.FaceFrame(lm).to_mm(lm))
    near_nose = wp.rstl_angle("cheek", c(-22.0, -10.0), cx)
    lateral = wp.rstl_angle("cheek", c(-62.0, -5.0), cx)
    assert 45 < near_nose < 110 or near_nose > 150, near_nose           # steep, nasolabial-like
    assert min(lateral, 180 - lateral) < 25, lateral                    # near horizontal
    # mirror symmetry of the rule
    r = wp.rstl_angle("cheek", c(22.0, -10.0), cx)
    near((180 - near_nose) % 180, r, 1.0)


def test_critical_border_crossing_and_proximity():
    lm = face_px()
    P = wp.FaceFrame(lm).to_mm(lm)
    top = P[0] + np.array([0.0, 6.0])
    bot = P[0] + np.array([0.0, -3.0])
    rep, _ = wp.plan(lm, mm_to_px(lm, [top, bot]))
    v = [c for c in rep["critical_borders"] if c["structure"] == "vermilion_border"]
    assert v and v[0]["crosses"]
    far, _ = wp.plan(lm, mm_to_px(lm, [c(-50, -10), c(-40, -10)]))
    assert not far["critical_borders"]


def test_ellipse_contains_endpoints_and_scales_with_angle():
    for deg in (0, 20, 45, 70, 90):
        r = math.radians(deg)
        p1, p2 = np.array([-5 * math.cos(r), -5 * math.sin(r)]), np.array([5 * math.cos(r), 5 * math.sin(r)])
        c, a, b, f = wp.ellipse_for(p1, p2, 0.0)
        for p in (p1, p2):
            q = (p - c)
            assert (q[0] / a) ** 2 + (q[1] / b) ** 2 <= 1.0 + 1e-9
        near(a / b, wp.ELLIPSE_LW_RATIO, 1e-9)
    near(wp.ellipse_for(np.array([-5.0, 0]), np.array([5.0, 0]), 0.0)[3], 1.0, 1e-9)     # aligned: no extra tissue
    near(wp.ellipse_for(np.array([0, -5.0]), np.array([0, 5.0]), 0.0)[3], wp.ELLIPSE_LW_RATIO, 1e-9)


def test_unfavourable_wound_gets_tissue_warning():
    lm = face_px()
    rep, _ = wp.plan(lm, mm_to_px(lm, [c(-20, 62), c(-20, 80)]))
    assert rep["elliptical_excision"]["tissue_sacrifice_factor_vs_wound_half_length"] > 2.0
    assert "warning" in rep["elliptical_excision"]


def test_z_plasty_geometry_and_gain_table():
    z = wp.z_plasty(np.array([0.0, 0.0]), np.array([10.0, 0.0]), 60)
    assert z["theoretical_length_gain_percent"] == 75
    a1, a2 = z["arm_1"], z["arm_2"]
    near(np.linalg.norm(a1[1] - a1[0]), 10.0, 1e-9)
    near(math.degrees(math.atan2(*(a1[1] - a1[0])[::-1])), 60.0, 1e-6)
    near(math.degrees(math.atan2(*(a2[1] - a2[0])[::-1])), -60.0, 1e-6)
    assert [wp.Z_GAIN[a] for a in (30, 45, 60)] == [25, 50, 75]


def test_scar_colour_detects_redder_line():
    lm = face_px()
    img = np.full((2000, 1800, 3), (150, 170, 200), np.uint8)               # uniform skin tone (BGR)
    line = mm_to_px(lm, [c(-45, -15), c(-30, -15)])
    import cv2
    cv2.polylines(img, [np.round(line).astype(np.int32).reshape(-1, 1, 2)], False, (110, 110, 215), 18)
    rep, _ = wp.plan(lm, line, image=img)
    assert rep["scar_colour"]["delta_a_redness"] > 3 and rep["scar_colour"]["delta_E"] > 5
    flat = np.full((2000, 1800, 3), (150, 170, 200), np.uint8)
    near(wp.plan(lm, line, image=flat)[0]["scar_colour"]["delta_E"], 0.0, 0.5)


def test_clinician_rstl_override():
    lm = face_px()
    w = mm_to_px(lm, [c(-45, -15), c(-35, -15)])               # horizontal 10 mm wound
    auto, _ = wp.plan(lm, w)
    forced, _ = wp.plan(lm, w, rstl_override_deg=0.0)
    assert forced["mean_angle_to_rstl_deg"] < 1.0 and forced["rstl_source"] == "clinician override"
    assert forced["elliptical_excision"]["axis_deg"] == 0.0
    assert auto["rstl_source"].startswith("coarse")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
