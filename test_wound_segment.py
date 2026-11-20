"""Segmentation tests on synthetic wounds with known masks."""
import cv2
import numpy as np

import wound_segment as ws

PPM = 6.0
H, W = 1200, 1200


def scene(seed=0, dark=(40, 40, 120), skin=(150, 175, 205), noise=6.0, faint=False):
    rng = np.random.default_rng(seed)
    img = np.empty((H, W, 3), np.float32)
    img[:] = skin
    yy, xx = np.mgrid[0:H, 0:W]
    img *= (1 + 0.12 * (xx / W - 0.5))[..., None]                       # lighting gradient
    truth = np.zeros((H, W), np.uint8)
    # irregular blob: ellipse 24 x 12 mm with a bump
    cv2.ellipse(truth, (600, 600), (int(12 * PPM), int(6 * PPM)), 20, 0, 360, 1, -1)
    cv2.circle(truth, (650, 560), int(4 * PPM), 1, -1)
    soft = cv2.GaussianBlur(truth.astype(np.float32), (0, 0), 1.5)
    col = np.array(skin if False else dark, np.float32)
    mix = soft[..., None] * (0.15 if faint else 1.0)
    img = img * (1 - mix) + col * mix
    img += rng.normal(0, noise, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8), truth.astype(bool)


def rough_seed(truth, grow=1.18, jitter=0.0, seed=1):
    """A sloppy clinician outline: the true boundary pushed outwards and jittered."""
    cnts, _ = cv2.findContours(truth.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(float)
    ctr = c.mean(axis=0)
    rng = np.random.default_rng(seed)
    pts = ctr + (c - ctr) * grow + rng.normal(0, jitter, c.shape)
    return pts[:: max(1, len(pts) // 14)]


def iou(a, b):
    return float((a & b).sum() / (a | b).sum())


def test_grabcut_snaps_to_true_boundary():
    img, truth = scene()
    mask, refined = ws.segment(img, rough_seed(truth, 1.3, jitter=4), PPM)
    seed_only = ws._poly_mask(img.shape[:2], rough_seed(truth, 1.3, jitter=4)).astype(bool)
    assert refined
    assert iou(mask, truth) > 0.9, iou(mask, truth)
    assert iou(mask, truth) > iou(seed_only, truth) + 0.05          # clearly better than the rough outline
    rep, _ = ws.measure(img, mask, PPM)
    true_area = truth.sum() / PPM ** 2
    assert abs(rep["area_mm2"] - true_area) / true_area < 0.08, (rep["area_mm2"], true_area)


def test_inside_seed_also_works():
    img, truth = scene(seed=2)
    mask, refined = ws.segment(img, rough_seed(truth, 0.8, jitter=3), PPM)
    assert iou(mask, truth) > 0.85, iou(mask, truth)


def test_measurements_length_width_and_colour():
    img, truth = scene()
    rep, _ = ws.measure(img, truth, PPM)
    assert rep["length_mm"] >= rep["width_mm"] > 5
    c = rep["colour_vs_surrounding_skin"]
    assert c["dark_fraction"] + c["red_fraction"] + c["other_fraction"] > 0.99
    assert c["delta_E_mean"] > 15
    p1, p2 = np.array(rep["axis_endpoints_px"][0]), np.array(rep["axis_endpoints_px"][1])
    assert np.linalg.norm(p2 - p1) / PPM > 20                        # long axis of the 24 mm ellipse + bump


def test_faint_scar_falls_back_to_clinician_outline_or_stays_sane():
    img, truth = scene(faint=True, noise=10.0)
    seed = rough_seed(truth, 1.15)
    mask, refined = ws.segment(img, seed, PPM)
    seed_mask = ws._poly_mask(img.shape[:2], seed).astype(bool)
    # either refinement is rejected (mask == seed) or it stays close to the seed: never a runaway region
    assert (not refined and (mask == seed_mask).all()) or iou(mask, seed_mask) > 0.5


def test_tiny_or_empty_seed_is_safe():
    img, _ = scene()
    mask, refined = ws.segment(img, np.array([[10.0, 10], [12, 10], [11, 12]]), PPM)
    assert not refined


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
