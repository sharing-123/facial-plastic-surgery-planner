"""Robustness: the server functions must never raise anything except the controlled ValueError, whatever the input.
Uses the moulage photo (no face) and a real portrait (face). Skipped silently if the sample photos are missing."""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "app"))
import server as S  # noqa: E402

SP = os.environ.get("FACE_TEST_PHOTOS", "")
CASES = [("wound1", os.path.join(SP, "cases", "wound1", "photo.jpg")), ("face5", os.path.join(SP, "faces", "face5", "photo.jpg"))]
CTX = [{}, {"kind": "parut", "scar_type": "kontraktur_web"}, {"kind": "parut", "scar_type": "keloid", "scar_months": 0},
       {"kind": "laserasi_baru", "mechanism": "gigitan", "depth": "otot_fascia", "contamination": "berat", "hours": 99, "tissue_loss": "bermakna", "age_years": 2},
       {"kind": "xyz", "mechanism": None, "hours": "abc"}, {"region": "unknown", "age_years": -5}]


def call(fn, req):
    try:
        fn(req)
        return "ok"
    except ValueError:
        return "rejected"


def run_case(name, path):
    S.api_load({"path": path})
    h, w = S.STATE["img"].shape[:2]
    if S.STATE["ppm"] is None:
        S.api_calibrate({"p1": [0, 0], "p2": [66, 0], "mm": 10})
    rng = np.random.default_rng(3)
    results = {"ok": 0, "rejected": 0}
    bad = []

    def go(req):
        try:
            r = call(S.api_wound, req)
            results[r] += 1
        except Exception as e:                                       # noqa: BLE001
            bad.append((type(e).__name__, str(e)[:80], str(req)[:120]))

    for ctx in CTX:
        go({"points": [[w * .3, h * .3], [w * .6, h * .5]], "context": ctx, "rstl_deg": 20})
    cases = [
        {"points": [[10, 10]]}, {"points": []}, {"points": [[5, 5], [5, 5], [5, 5]]}, {"points": [[-50, -50], [w + 80, h + 80]]},
        {"points": [[0, 0], [1, 1]]}, {"points": [[w - 2, h - 2], [w - 40, h - 60]]}, {"points": [[1e9, 1e9], [-1e9, 3]]},
        {"points": [["a", "b"], [None, 3]]}, {"outline": [[10, 10], [20, 20], [30, 30]]}, {"outline": [[100, 100], [100, 100], [100, 100]]},
        {"outline": [[0, 0], [w, 0], [w, h], [0, h]]}, {"outline": [[w * .4, h * .4], [w * .5, h * .4], [w * .5, h * .41], [w * .4, h * .41]]},
        {"outline": [[w * .4, h * .4], [w * .6, h * .6], [w * .6, h * .4], [w * .4, h * .6]]},                 # self-intersecting
        {"outline": [[w * .4, h * .4], [w * .5, h * .4], [w * .5, h * .5], [w * .4, h * .5]], "no_ai": True, "rstl_deg": 10},
        {"outline": [[w * .4, h * .4], [w * .5, h * .4], [w * .5, h * .5]], "pos": [[1, 2, 3], ["x"], None], "neg": [[w * .9, h * .9]]},
        {"points": [[w * .3, h * .3], [w * .6, h * .5]], "layers": ["ellipse", "z_plasty", "w_plasty", "gblc", "suture_guide", "nonsense"], "z_angle": 45, "w_limb": 3, "spacing_mm": 2},
        {"points": [[w * .3, h * .3], [w * .6, h * .5]], "spacing_mm": 0.01}, {"points": [[w * .3, h * .3], [w * .6, h * .5]], "spacing_mm": -4},
        {"points": [[w * .3, h * .3], [w * .6, h * .5]], "rstl_deg": "abc"}, {"points": [[w * .3, h * .3], [w * .6, h * .5]], "rstl_deg": 1e12},
    ]
    for req in cases:
        req = dict(req)
        req.setdefault("context", {"kind": "laserasi_baru"})
        req.setdefault("rstl_deg", 0)
        go(req)
    for _ in range(40):                                              # random polylines and polygons
        n = int(rng.integers(2, 9))
        pts = (rng.random((n, 2)) * [w, h]).tolist()
        go({"points": pts, "context": CTX[int(rng.integers(len(CTX)))], "rstl_deg": float(rng.uniform(-200, 200))})
    return results, bad


def test_no_uncontrolled_exceptions_on_hostile_input():
    ran = False
    for name, path in CASES:
        if not os.path.isfile(path):
            continue
        ran = True
        results, bad = run_case(name, path)
        assert not bad, (name, bad[:5])
        assert results["ok"] > 5, results
    if not ran:
        print("SKIPPED: set FACE_TEST_PHOTOS to the folder holding cases/wound1 and faces/face5")


def test_other_endpoints_do_not_crash_without_or_with_bad_input():
    S.STATE.update(img=None, lm=None, ppm=None, last=None)
    for fn in (S.api_wound, S.api_acne, S.api_face, S.api_lines, S.api_calibrate, S.api_surgeon_compare):
        assert call(fn, {}) == "rejected"
    for bad in ({"data": "data:image/png;base64,AAAA"}, {"path": "C:/definitely/not/here.png"}):
        assert call(S.api_load, bad) == "rejected"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
