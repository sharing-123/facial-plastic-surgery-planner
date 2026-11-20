"""Synthetic checks: plant known motion, confirm the math recovers it, including
under head roll and a different image scale. Tests the maths only, not MediaPipe."""
import math

import numpy as np

import face_proportions as fp
import profile_angles as pa
import quality_gate as qg
import smile_symmetry as ss

PX = 8.0  # px per mm at scale 1 (iris 11.7 mm wide)


def make_video(T=60, left_mm=(6.0, 5.0), right_mm=(3.0, 1.0), brow_up=(4.0, 2.0),
               lid_down=(3.0, 1.0), roll_deg=0.0, scale=1.0, nose_shift_mm=0.0,
               outer_up_mm=0.0, gonion_asym_mm=0.0):
    """Planted truth at peak. Mouth corners move (dx lateral, dy up) = left_mm/right_mm;
    brows rise brow_up mm; upper lids drop lid_down mm. Returns (T, 478, 2) pixels."""
    c, s = math.cos(math.radians(roll_deg)), math.sin(math.radians(roll_deg))
    rot = np.array([[c, -s], [s, c]])
    frames = []
    for t in range(T):
        k = 0.0 if t < 10 else min(1.0, (t - 10) / 20)   # relaxed, ramp, hold
        f = np.zeros((478, 2))

        def put(idx, x_mm, y_up_mm):
            f[idx] = (x_mm * PX, -y_up_mm * PX)

        put(ss.OUTER_EYE_A, -45, outer_up_mm); put(ss.OUTER_EYE_B, 45, outer_up_mm)
        put(ss.INNER_EYE_A, -15, 0); put(ss.INNER_EYE_B, 15, 0)
        for edges, x in ((ss.IRIS_A_EDGES, -30), (ss.IRIS_B_EDGES, 30)):
            put(edges[0], x - 5.85, 0); put(edges[1], x + 5.85, 0)
        put(ss.MOUTH[0], -(25 + k * left_mm[0]), -40 + k * left_mm[1])
        put(ss.MOUTH[1], 25 + k * right_mm[0], -40 + k * right_mm[1])
        put(ss.BROW[0], -30, 20 + k * brow_up[0]); put(ss.BROW[1], 30, 20 + k * brow_up[1])
        put(ss.LID_UP[0], -30, 5 - k * lid_down[0]); put(ss.LID_UP[1], 30, 5 - k * lid_down[1])
        put(ss.LID_LOW[0], -30, -5); put(ss.LID_LOW[1], 30, -5)
        put(ss.ALAR[0], -18, -25); put(ss.ALAR[1], 18, -25)
        put(ss.NOSE_TIP, nose_shift_mm, -20); put(ss.CHIN, 0, -80)
        put(ss.LIP_IN[0], 0, -38); put(ss.LIP_IN[1], 0, -42)
        put(fp.GLABELLA, 0, 15); put(fp.NASION, 0, 3); put(fp.SUBNASALE, 0, -30)
        put(fp.UPPER_LIP_TOP, 0, -35); put(fp.LOWER_LIP_BOTTOM, 0, -47)
        put(fp.ZYGOMA[0], -70, -5); put(fp.ZYGOMA[1], 70, -5)
        put(fp.GONION[0], -55, -60); put(fp.GONION[1], 55, -60 + gonion_asym_mm)
        f = f * scale @ rot.T + np.array([320.0, 240.0])
        frames.append(f)
    return np.stack(frames)


def near(a, b, tol=0.2):
    assert abs(a - b) < tol, (a, b)


def check(roll, scale):
    _, rep = ss.compute_all(make_video(roll_deg=roll, scale=scale), fps=30)
    L, R = ss.SIDES
    sm, br, ey = (rep["tasks"][k] for k in ("smile", "brow_raise", "eye_closure"))
    near(sm["excursion_mm"][L], math.hypot(6, 5)); near(sm["excursion_mm"][R], math.hypot(3, 1))
    near(sm["height_diff_at_peak_mm"], 4.0, 0.3)
    near(br["excursion_mm"][L], 4.0); near(br["excursion_mm"][R], 2.0)
    near(ey["excursion_mm"][L], 3.0); near(ey["excursion_mm"][R], 1.0)
    assert br["weaker_side"] == R and ey["weaker_side"] == R
    assert abs(sm["excursion_symmetry_ratio"] - math.hypot(3, 1) / math.hypot(6, 5)) < 0.03
    return rep


def test_recovers_planted_values():
    check(0, 1.0)


def test_head_roll_and_scale_invariant():
    check(12, 1.0)
    check(-8, 1.7)


def test_static_rest_metrics_and_midline():
    rep = ss.compute_all(make_video(nose_shift_mm=3.0), 30)[1]["static_rest"]
    L, R = ss.SIDES
    near(rep["midline_deviation_mm(+=toward_image_right)"]["nose_tip"], 3.0)
    near(rep["midline_deviation_mm(+=toward_image_right)"]["chin"], 0.0)
    near(rep["brow_height_above_lid_mm"][L], 15.0); near(rep["palpebral_fissure_height_mm"][R], 10.0)
    near(rep["alar_to_midline_mm"][L], 18.0)
    near(rep["mouth_corner_height_diff_mm"], 0.0)


def test_symmetric_face_gives_ratio_one():
    lm = make_video(left_mm=(5, 4), right_mm=(5, 4), brow_up=(3, 3), lid_down=(2, 2))
    rep = ss.compute_all(lm, 30)[1]
    for task in rep["tasks"].values():
        assert task["excursion_symmetry_ratio"] > 0.97


def test_compare_pre_post():
    pre = ss.compute_all(make_video(left_mm=(6, 5), right_mm=(1, 0.5)), 30)[1]
    post = ss.compute_all(make_video(left_mm=(6, 5), right_mm=(5, 4)), 30)[1]
    d = ss.compare(pre, post)
    assert d["smile"]["symmetry_ratio_change"] > 0.4
    assert abs(d["brow_raise"]["symmetry_ratio_change"]) < 0.01   # unchanged task


def test_smile_only_wrapper_still_works():
    _, s = ss.compute_metrics(make_video(), 30)
    near(s["excursion_mm"][ss.SIDES[0]], math.hypot(6, 5))


def test_frontal_proportions_recovered():
    rep = ss.compute_all(make_video(outer_up_mm=3.0), 30)[1]["frontal_proportions"]
    r, L = rep["ratios"], rep["lengths_mm"]
    near(L["bizygomatic_width"], 140.0); near(L["bigonial_width"], 110.0)
    near(r["middle_to_lower_third"], 0.9, 0.02)
    near(r["upper_lip_to_lower_face"], 0.25, 0.01)
    near(r["alar_to_intercanthal"], 1.2, 0.02)
    near(r["lower_to_upper_vermilion"], 5 / 3, 0.03)
    near(r["bigonial_to_bizygomatic"], 110 / 140, 0.01)
    near(r["fifths_of_bizygomatic"]["outer_left"], 25 / 140, 0.005)
    near(rep["canthal_tilt_deg"]["image_left"], math.degrees(math.atan(3 / 30)), 0.3)
    nf = rep["nose_frontal"]                                    # planted: alar 36 mm, nasion y 3 to subnasale y -30 = 33 mm
    near(nf["nasal_height_mm"], 33.0, 0.3); near(nf["nasal_index"], 100 * 36 / 33, 1.5)
    assert nf["nasal_index_class"] == "hyperplatyrrhine"
    near(nf["alar_to_bizygomatic"], 36 / 140, 0.01)


def test_mirror_asymmetry():
    sym = ss.compute_all(make_video(), 30)[1]["frontal_proportions"]["mirror_asymmetry"]
    assert sym["mean_mm"] < 0.1
    asym = ss.compute_all(make_video(gonion_asym_mm=4.0), 30)[1]["frontal_proportions"]["mirror_asymmetry"]
    near(asym["per_pair_mm"]["gonion"], 4.0, 0.2)
    assert asym["largest"] == "gonion"


def test_profile_angles():
    pts = {"glabella": (0, 0), "nasion": (10, 40), "pronasale": (50, 100), "columella": (40, 110),
           "subnasale": (20, 115), "alar_crease": (20, 95), "labrale_superius": (28, 140), "labrale_inferius": (24, 160),
           "labiomental_sulcus": (18, 175), "pogonion": (25, 200)}
    out = pa.angles_from_points(pts, mm_per_px=0.5)
    # independent check of two angles with numpy
    def ang(a, v, b):
        a, v, b = (np.array(x, float) for x in (a, v, b))
        return math.degrees(math.acos(np.dot(a - v, b - v) / np.linalg.norm(a - v) / np.linalg.norm(b - v)))
    near(out["nasofrontal_deg"], ang(pts["glabella"], pts["nasion"], pts["pronasale"]), 0.1)
    near(out["nasolabial_deg"], ang(pts["columella"], pts["subnasale"], pts["labrale_superius"]), 0.1)
    assert 0 < out["nasofacial_deg"] < 90
    assert set(out["e_line_mm"]) == {"labrale_superius", "labrale_inferius"}
    near(out["tip_projection_goode"], 30 / math.hypot(40, 60), 0.002)          # |50-20| / dist(nasion, pronasale)


# ---- quality gate: scale 0.5 keeps the synthetic face inside a 1000x1000 image ----
RNG = np.random.default_rng(0)
IMG = (RNG.random((1000, 1000, 3)) * 255).astype(np.uint8)     # sharp, mid-brightness texture


def gate(lm, image=IMG):
    return qg.assess(lm, image=image)


def codes(res, kind="failures"):
    return {x["code"] for x in res[kind]}


def test_gate_passes_good_synthetic_face():
    res = gate(make_video(scale=0.5))
    assert res["status"] == qg.PASS, res


def test_gate_refuses_turned_head():
    res = gate(make_video(scale=0.5, nose_shift_mm=20.0))
    assert res["status"] == qg.REFUSE and "yaw_asym" in codes(res)


def test_gate_refuses_bad_vertical_geometry():
    lm = make_video(scale=0.5)
    lm[:, fp.GLABELLA, 1] -= 240.0          # glabella far too high: head tilted up / bad fit
    res = gate(lm)
    assert res["status"] == qg.REFUSE and "pitch" in codes(res)


def test_gate_refuses_both_eyes_closed_but_not_one_narrow_eye():
    lm = make_video(scale=0.5, lid_down=(0, 0))
    closed = lm.copy()
    for up, low in zip(ss.LID_UP, ss.LID_LOW):
        closed[:, up] = closed[:, low]
    assert "eyes_closed" in codes(gate(closed))
    one = lm.copy()
    one[:, ss.LID_UP[0]] = one[:, ss.LID_LOW[0]] + np.array([0, -3.0])   # one eye narrow (palsy-like)
    res = gate(one)
    assert "eyes_closed" not in codes(res) and "eye_narrow" in codes(res, "warnings")


def test_gate_refuses_cropped_face():
    res = gate(make_video(scale=0.5), image=IMG[:, :300])
    assert res["status"] == qg.REFUSE and "cropped" in codes(res)


def test_gate_refuses_blurry_image():
    res = gate(make_video(scale=0.5), image=np.full((1000, 1000, 3), 128, np.uint8))
    assert res["status"] == qg.REFUSE and "blur_laplacian_var" in codes(res)


def test_gate_refuses_missing_frames_and_jitter():
    lm = make_video(scale=0.5)
    lost = lm.copy()
    lost[::4] = np.nan                       # 25% of frames lost
    assert "valid_frame_fraction" in codes(gate(lost))
    shaky = lm + RNG.normal(0, 25.0, lm.shape)   # large rest-period wobble
    assert "rest_jitter" in codes(gate(shaky))


def test_gate_refuses_no_face_and_small_face():
    assert gate(np.full((5, 478, 2), np.nan))["status"] == qg.REFUSE
    res = gate(make_video(scale=0.1))        # face only ~100 px wide
    assert res["status"] == qg.REFUSE


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
