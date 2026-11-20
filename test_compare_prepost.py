"""Pre/post comparison tests on the canonical face with planted changes and a different camera pose."""
import cv2
import numpy as np

import compare_prepost as cp
import test_wound_planner as tw
import wound_planner as wp

LM = tw.face_px(6.0)
FF = wp.FaceFrame(LM)


def with_change(lm, moves):
    """moves: {landmark index: (dx_mm, dy_mm) in the face frame}. Returns new px landmarks."""
    P = FF.to_mm(lm)
    for i, (dx, dy) in moves.items():
        P[i] = P[i] + np.array([dx, dy])
    return FF.to_px(P)


def new_pose(lm, deg=8.0, scale=1.15, shift=(120.0, -60.0)):
    a = np.radians(deg)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]) * scale
    c = lm.mean(axis=0)
    return (lm - c) @ R.T + c + np.array(shift)


def test_registration_recovers_camera_pose_change():
    post = new_pose(LM)
    M, rms = cp.similarity(post, LM)
    back = post @ M[:, :2].T + M[:, 2]
    assert rms < 0.5 and np.abs(back - LM).max() < 0.5


def test_planted_mouth_corner_change_is_detected_and_nothing_else():
    pre = with_change(LM, {61: (0, 7.0)})                       # right mouth corner 7 mm low (asymmetric)
    post = pre.copy()
    for i in (61, 146, 91, 185, 40, 78, 95, 62, 76, 77):          # lift the right mouth corner region 6 mm
        post = with_change(post, {i: (0, 6.0)}) if False else post
    P = FF.to_mm(pre)
    for i in (61, 146, 91, 185, 78, 95, 62, 76):
        P[i] = P[i] + np.array([0.0, -6.0])
    post = FF.to_px(P)
    rep = cp.compare_measurements(cp.measure(pre), cp.measure(new_pose(post)), cp.noise_floor(pre), cp.noise_floor(new_pose(post), seed=1)) \
        if False else None
    M, _ = cp.similarity(new_pose(post), pre)
    post_reg = new_pose(post) @ M[:, :2].T + M[:, 2]
    rep = cp.compare_measurements(cp.measure(pre), cp.measure(post_reg), cp.noise_floor(pre), cp.noise_floor(post_reg, seed=1))
    m = rep["mouth_corner_height_diff_mm"]
    assert m["beyond_landmark_noise"] and m["verdict"] == "more symmetric", m
    assert abs(m["delta"]) > 4
    untouched = ("brow_height_diff_mm", "alar_to_intercanthal", "alar_width_mm", "fifth_intercanthal", "canthal_tilt_R_deg")
    for k in untouched:
        assert not rep[k]["beyond_landmark_noise"], (k, rep[k])


def test_noise_floor_is_small_but_nonzero_and_unchanged_face_shows_no_change():
    nf = cp.noise_floor(LM)
    assert 0 < nf["mouth_corner_height_diff_mm"] < 1.0
    post = new_pose(LM)
    M, _ = cp.similarity(post, LM)
    reg = post @ M[:, :2].T + M[:, 2]
    rep = cp.compare_measurements(cp.measure(LM), cp.measure(reg), nf, cp.noise_floor(reg, seed=1))
    changed = [k for k, v in rep.items() if v["beyond_landmark_noise"]]
    assert not changed, changed


def test_visual_difference_is_zero_for_identical_images_and_comparability_gate():
    img = (np.random.default_rng(0).random((600, 600, 3)) * 255).astype(np.uint8)
    de = cp.visual(img, img, "demo_output/_tmp_visual.png", tile=300)
    assert de < 0.5
    ok, info = cp.comparable(img, img)
    assert ok
    dark = (img * 0.4).astype(np.uint8)
    assert not cp.comparable(img, dark)[0]
    import os
    os.remove("demo_output/_tmp_visual.png")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
