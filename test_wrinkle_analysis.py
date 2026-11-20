"""Wrinkle module tests on synthetic skin: planted dark lines of known length, noise, shading.
Real skin (pores, hair, make-up, compression) will produce more false lines than this."""
import cv2
import numpy as np
from scipy import ndimage as ndi

import test_wound_planner as tw
import wound_planner as wp
import wrinkle_analysis as wa

H, W = 2000, 1800


def _blur_norm(a, s):
    b = ndi.gaussian_filter(a, s)
    return b / (b.std() + 1e-9)


def skin(lm, lines_mm=(), noise=0.015, grad=0.15, seed=0, contrast=0.06, width_mm=0.5):
    rng = np.random.default_rng(seed)
    ff = wp.FaceFrame(lm)
    yy, xx = np.mgrid[0:H, 0:W]
    base = 175.0 * (1 + grad * (xx / W - 0.5) + 0.5 * grad * (yy / H - 0.5)) \
        * (1 + _blur_norm(rng.normal(0, 1, (H, W)), 40) * 0.08)
    img = base[..., None].repeat(3, 2) * np.array([0.82, 0.93, 1.0])
    layer = np.zeros((H, W), np.float32)
    for a, b in lines_mm:
        pa, pb = ff.to_px(np.array(a, float)[None])[0], ff.to_px(np.array(b, float)[None])[0]
        cv2.line(layer, tuple(np.round(pa).astype(int)), tuple(np.round(pb).astype(int)), 1.0,
                 max(1, int(round(width_mm * ff.scale))), cv2.LINE_AA)
    layer = cv2.GaussianBlur(layer, (0, 0), 0.7)
    img = img * (1 - contrast * layer)[..., None] * (1 + rng.normal(0, noise, (H, W, 1)))
    return np.clip(img, 0, 255).astype(np.uint8)


LM = tw.face_px(6.0)
FF = wp.FaceFrame(LM)
P = FF.to_mm(LM)
TOP = max(P[wp.BROW_R + wp.BROW_L][:, 1])
HAIR = P[10][1] - 8
YS = np.linspace(TOP + 6, HAIR + 2, 5)            # inside the forehead zones


FOREHEAD = ("forehead_central", "forehead_R", "forehead_L", "glabella")   # the planted lines straddle the glabella zone


def forehead_len(img, lm=LM):
    rep, _ = wa.analyse(img, lm)
    return sum(rep["zones"][z]["fine_length_mm"] for z in FOREHEAD), rep


def test_planted_lines_length_within_10_percent():
    truth = 5 * 24.0
    for contrast in (0.04, 0.08):
        got, _ = forehead_len(skin(LM, [((-12, y), (12, y)) for y in YS], contrast=contrast))
        assert 0.9 * truth <= got <= 1.1 * truth, (contrast, got, truth)


def test_diagonal_line_length_is_not_biased():
    a, b = (-10.0, YS[0]), (10.0, YS[0] + 5.0)
    truth = float(np.hypot(20.0, 5.0))
    got, _ = forehead_len(skin(LM, [(a, b)], contrast=0.08))
    assert 0.85 * truth <= got <= 1.25 * truth, (got, truth)    # ridge ends add ~1 mm each on a 20 mm line


def test_noise_and_shading_alone_make_no_lines():
    for kw in ({"noise": 0.03, "seed": 1}, {"noise": 0.0, "grad": 0.30}):
        got, rep = forehead_len(skin(LM, [], **kw))
        assert got < 3.0, (kw, got)
        assert all(z["fine_length_mm"] + z["fold_length_mm"] < 3.0 for z in rep["zones"].values())


def test_planted_deep_fold_is_found_as_fold_not_fine():
    ff_zone = ("cheek_medial_R", "cheek_medial_L", "cheek_lateral_R", "cheek_lateral_L", "nasolabial_R", "nasolabial_L")
    img = skin(LM, [((-34, -8), (-34, -34))], contrast=0.12, width_mm=2.2)        # 26 mm fold on the right cheek
    rep, _ = wa.analyse(img, LM)
    fold = sum(rep["zones"][z]["fold_length_mm"] for z in rep["zones"])
    assert 18 <= fold <= 40, fold


def test_low_resolution_is_refused():
    small = tw.face_px(2.0, centre=(300.0, 330.0))
    rep, maps = wa.analyse(np.full((700, 600, 3), 150, np.uint8), small)
    assert rep["status"] == "CANNOT_ASSESS" and maps is None


def test_dynamic_split():
    z = lambda d, st="analysed": {"zones": {k: {"fine_density_mm_per_cm2": d.get(k, 1.0), "status": st} for k in wa.SKIN_ZONES}}
    out = wa.compare_dynamic(z({"glabella": 2.0}), z({"glabella": 5.0}))
    assert out["glabella"]["dynamic_added_density"] == 3.0 and out["glabella"]["dynamic_share"] == 0.6
    out2 = wa.compare_dynamic(z({"glabella": 4.0}), z({"glabella": 3.0}))
    assert out2["glabella"]["dynamic_added_density"] == 0.0
    out3 = wa.compare_dynamic(z({}), z({}, "not_analysed:hair"))
    assert out3["glabella"]["status"].startswith("not_comparable")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
