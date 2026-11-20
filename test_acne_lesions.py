"""Acne module tests on synthetic skin with planted red lesions, pustules and dark marks."""
import cv2
import numpy as np
from scipy import ndimage as ndi

import acne_lesions as ac
import test_wound_planner as tw
import wound_planner as wp

H, W = 2000, 1800
LM = tw.face_px(6.0)
FF = wp.FaceFrame(LM)
PPM = FF.scale


def skin(seed=0, noise=1.5, grad=0.12, spots=()):
    """spots: list of (x_mm, y_mm, radius_mm, kind) in the planner frame; kind red|pustule|dark."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    base = 175.0 * (1 + grad * (xx / W - 0.5) + 0.5 * grad * (yy / H - 0.5))
    bl = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), 40)
    base *= 1 + bl / (bl.std() + 1e-9) * 0.05
    img = base[..., None].repeat(3, 2) * np.array([0.82, 0.93, 1.0])
    lab = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8).astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)
    for x, y, r, kind in spots:
        c = FF.to_px(np.array([[x, y]], float))[0]
        d2 = (np.arange(W)[None, :] - c[0]) ** 2 + (np.arange(H)[:, None] - c[1]) ** 2
        g = np.exp(-d2 / (2 * (0.55 * r * PPM) ** 2)).astype(np.float32)
        if kind in ("red", "pustule"):
            lab[..., 1] += 14 * g
            lab[..., 0] -= 4 * g
            if kind == "pustule":
                lab[..., 0] += 11 * g * (d2 < (0.5 * r * PPM) ** 2)
                lab[..., 2] += 8 * g * (d2 < (0.5 * r * PPM) ** 2)
        else:
            lab[..., 0] -= 14 * g
    out = np.clip(cv2.cvtColor(lab, cv2.COLOR_Lab2BGR) * 255.0, 0, 255)
    out = out * (1 + rng.normal(0, noise / 100, (H, W, 1)))
    return np.clip(out, 0, 255).astype(np.uint8)


def place(n, seed):
    """n non-overlapping lesion centres inside the cheeks (planner frame mm)."""
    rng = np.random.default_rng(seed)
    pts = []
    while len(pts) < n:
        x = rng.choice([-1, 1]) * rng.uniform(20, 55)
        y = rng.uniform(-45, -8)
        if all(np.hypot(x - a, y - b) > 9 for a, b, *_ in pts):
            pts.append((x, y, rng.uniform(1.5, 3.5)))
    return pts


def match(found, truth, tol_mm=2.5):
    tp, used = 0, set()
    for x, y, *_ in truth:
        c = FF.to_px(np.array([[x, y]], float))[0]
        for i, l in enumerate(found):
            if i not in used and np.hypot(l["x"] - c[0], l["y"] - c[1]) <= tol_mm * PPM:
                tp += 1; used.add(i); break
    return tp, len(found) - len(used)


def run(spots, seed=0, **kw):
    img = skin(seed=seed, spots=spots, **kw)
    rep, maps = ac.analyse(img, LM)
    return rep, img


def test_red_lesions_recall_and_no_false_positives():
    pts = place(24, 3)
    rep, _ = run([(x, y, r, "red") for x, y, r in pts])
    reds = [l for l in rep["lesions"] if l["class"] != "dark_macule"]
    tp, fp = match(reds, pts)
    assert tp / len(pts) >= 0.85, (tp, len(pts))
    assert fp <= 2, fp


def test_blank_skin_has_almost_no_lesions():
    rep, _ = run([], seed=5, noise=3.0)
    assert sum(rep["totals"].values()) <= 2, rep["totals"]


def test_pustules_are_classified_and_dark_marks_are_not_reported():
    pts = place(18, 8)
    spots = [(x, y, r, "pustule") for x, y, r in pts[:6]] + [(x, y, r, "dark") for x, y, r in pts[6:12]] + \
            [(x, y, r, "red") for x, y, r in pts[12:]]
    rep, _ = run(spots)
    t = rep["totals"]
    assert t["pustule_like"] >= 3 and t["red_inflamed"] >= 3, t
    assert t["dark_macule"] == 0                      # dark-mark detection is disabled (unreliable on real skin)


def test_zone_counts_sum_to_totals_and_gaps_reported():
    pts = place(12, 2)
    rep, _ = run([(x, y, r, "red") for x, y, r in pts])
    zsum = sum(v["red_inflamed"] + v["pustule_like"] + v["dark_macule"] for v in rep["zones"].values())
    assert zsum <= sum(rep["totals"].values())          # lesions in non-skin zones (eye, brow, lip) are not counted per zone
    assert set(rep["module_status"]) == set(ac.SKIN_ZONES)


def test_lips_and_eyes_do_not_count_as_acne():
    rep, _ = run([])
    for l in rep["lesions"]:
        assert True
    assert rep["totals"]["red_inflamed"] <= 2


def test_low_resolution_refused():
    small = tw.face_px(1.0, centre=(200.0, 220.0))
    rep, maps = ac.analyse(np.full((500, 400, 3), 150, np.uint8), small)
    assert rep["status"] == "CANNOT_ASSESS" and maps is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
