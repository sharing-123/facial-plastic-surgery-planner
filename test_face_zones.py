"""Atlas tests on the canonical face: no unlabeled pixel inside the oval, symmetric zones, sane areas."""
import numpy as np

import face_zones as fz
import test_wound_planner as tw
import wound_planner as wp

H, W = 2000, 1800
LM = tw.face_px(6.0)
FF = wp.FaceFrame(LM)
P = FF.to_mm(LM)
LAB = fz.build(P, FF, (H, W))


def oval_mask():
    import cv2
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round(FF.to_px(P[wp.OVAL])).astype(np.int32)], 1)
    return m > 0


def test_every_oval_pixel_has_a_zone_and_nothing_outside():
    ov = oval_mask()
    assert (LAB[ov] > 0).all()
    assert (LAB[~ov] == 0).all()


def test_all_zones_exist_with_positive_area():
    present = set(np.unique(LAB)) - {0}
    missing = [n for n in fz.NAMES if fz.ID[n] not in present]
    assert not missing, missing


def test_left_right_areas_are_balanced():
    for n in fz.NAMES:
        if n.endswith("_R"):
            a, b = (LAB == fz.ID[n]).sum(), (LAB == fz.ID[n[:-1] + "L"]).sum()
            assert min(a, b) / max(a, b) > 0.8, (n, a, b)


def test_coverage_report_flags_unanalysed_zones():
    st = {"lines": {n: "analysed" for n in fz.NAMES if fz.IS_SKIN[n]}}
    cov = fz.coverage(LAB, FF.scale, st)
    gap_zones = {g["zone"] for g in cov["gaps"]}
    assert "eye_R" in gap_zones and "brow_L" in gap_zones and "vermilion_upper" in gap_zones
    assert "forehead_central" not in gap_zones
    assert "ears" in cov["not_in_atlas"]
    assert abs(sum(cov["zone_area_cm2"].values()) - cov["oval_area_cm2"]) / cov["oval_area_cm2"] < 0.01


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
