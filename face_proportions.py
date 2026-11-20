"""Frontal facial proportions and symmetry for aesthetic and reconstructive planning.

Input: one landmark set in millimetres, y pointing UP, midline at x = 0 (the output of
smile_symmetry._mm_frames, median of the rest frames, or a single photo).

The "reference" strings are neoclassical canons / commonly cited ranges. They are NOT
targets or normal values: they differ by sex, age and ethnicity, and surgical planning
must be individualised. The code reports measurements and the difference from the canon,
never a beauty score.
"""
import math

import numpy as np

# MediaPipe FaceMesh indices
GLABELLA, NASION, SUBNASALE, MENTON = 9, 168, 2, 152
UPPER_LIP_TOP, UPPER_IN, LOWER_IN, LOWER_LIP_BOTTOM = 0, 13, 14, 17
EYE = {"image_left": (133, 33), "image_right": (362, 263)}     # (inner, outer) canthus
ALAR = (129, 358)
MOUTH = (61, 291)
ZYGOMA = (234, 454)     # widest face contour
GONION = (172, 397)     # jaw-angle region

# image_left, image_right landmark pairs used for the mirror asymmetry index
MIRROR_PAIRS = {
    "outer_canthus": (33, 263), "inner_canthus": (133, 362), "mouth_corner": (61, 291),
    "brow": (105, 334), "upper_lid": (159, 386), "lower_lid": (145, 374),
    "alar": (129, 358), "zygoma": (234, 454), "gonion": (172, 397),
}

REFERENCES = {
    "middle_to_lower_third": "canon 1.0 (glabella-subnasale : subnasale-menton). Upper third not measured: no reliable hairline landmark.",
    "upper_lip_to_lower_face": "canon 1:2 (subnasale-stomion : stomion-menton)",
    "fifths_each": "canon 0.20 of bizygomatic width per fifth",
    "alar_to_intercanthal": "canon about 1.0",
    "eye_width_to_intercanthal": "canon about 1.0",
    "mouth_to_alar": "commonly cited about 1.5",
    "lower_to_upper_vermilion": "commonly cited 1.5 to 1.6 (varies with ethnicity and age)",
    "canthal_tilt_deg": "commonly cited roughly +4 to +8 degrees (outer canthus higher); varies by sex and ethnicity",
    "bigonial_to_bizygomatic": "no universal canon; reported for tracking change",
}


def _d(p, a, b):
    return float(np.linalg.norm(p[a] - p[b]))


def _r(v, n=2):
    return round(float(v), n)


def frontal_proportions(p):
    """Measurements, ratios and canon differences from one landmark set (mm, y up)."""
    stomion = 0.5 * (p[UPPER_IN] + p[LOWER_IN])
    middle = p[GLABELLA][1] - p[SUBNASALE][1]
    lower = p[SUBNASALE][1] - p[MENTON][1]
    upper_lip = p[SUBNASALE][1] - stomion[1]
    lower_part = stomion[1] - p[MENTON][1]

    eye_w = {k: _d(p, *v) for k, v in EYE.items()}
    ic = _d(p, EYE["image_left"][0], EYE["image_right"][0])
    alar = _d(p, *ALAR)
    mouth = _d(p, *MOUTH)
    bizyg = _d(p, *ZYGOMA)
    bigon = _d(p, *GONION)
    outer_canthal = _d(p, EYE["image_left"][1], EYE["image_right"][1])

    xs = {
        "outer_left": abs(p[EYE["image_left"][1]][0] - p[ZYGOMA[0]][0]),
        "eye_left": eye_w["image_left"], "intercanthal": ic, "eye_right": eye_w["image_right"],
        "outer_right": abs(p[ZYGOMA[1]][0] - p[EYE["image_right"][1]][0]),
    }
    fifths = {k: _r(v / bizyg, 3) for k, v in xs.items()}

    upper_v = p[UPPER_LIP_TOP][1] - p[UPPER_IN][1]
    lower_v = p[LOWER_IN][1] - p[LOWER_LIP_BOTTOM][1]

    tilt = {}
    for side, (inner, outer) in EYE.items():
        dx = abs(p[outer][0] - p[inner][0])
        tilt[side] = _r(math.degrees(math.atan2(p[outer][1] - p[inner][1], dx)), 1)

    return {
        "lengths_mm": {
            "bizygomatic_width": _r(bizyg), "bigonial_width": _r(bigon),
            "intercanthal": _r(ic), "outer_canthal": _r(outer_canthal),
            "eye_width_image_left": _r(eye_w["image_left"]), "eye_width_image_right": _r(eye_w["image_right"]),
            "alar_width": _r(alar), "mouth_width": _r(mouth),
            "glabella_to_subnasale": _r(middle), "subnasale_to_menton": _r(lower),
            "face_height_glabella_to_menton": _r(middle + lower),
        },
        "ratios": {
            "middle_to_lower_third": _r(middle / lower, 3),
            "upper_lip_to_lower_face": _r(upper_lip / lower_part, 3),
            "fifths_of_bizygomatic": fifths,
            "alar_to_intercanthal": _r(alar / ic, 3),
            "eye_width_to_intercanthal": {k: _r(v / ic, 3) for k, v in eye_w.items()},
            "mouth_to_alar": _r(mouth / alar, 3),
            "lower_to_upper_vermilion": _r(lower_v / upper_v, 3) if upper_v > 0 else None,
            "bigonial_to_bizygomatic": _r(bigon / bizyg, 3),
            "face_width_to_height": _r(bizyg / (middle + lower), 3),
        },
        "canthal_tilt_deg": tilt,
        "nose_frontal": nose_frontal(p),
        "mirror_asymmetry": mirror_asymmetry(p),
        "references_not_targets": REFERENCES,
    }


NASAL_INDEX_CLASSES = ((55, "hyperleptorrhine"), (70, "leptorrhine"), (85, "mesorrhine"), (100, "platyrrhine"), (1e9, "hyperplatyrrhine"))


def nose_frontal(p):
    """Frontal nasal measurements. Nasal index = alar width / nasal height x 100 (Martin & Saller classes).
    MediaPipe's nasion is the point between the eyes, not the bony nasion, so nasal height is approximate.
    Low projection and a low bridge need a profile view (profile_angles). A class is a description of
    proportion in a population frame, not a diagnosis; it varies with ethnicity."""
    alar = _d(p, *ALAR)
    height = _d(p, NASION, SUBNASALE)
    ni = 100.0 * alar / height if height > 0 else None
    cls = next((n for lim, n in NASAL_INDEX_CLASSES if ni is not None and ni < lim), None)
    return {"alar_width_mm": _r(alar), "nasal_height_mm": _r(height), "nasal_index": _r(ni, 1) if ni else None,
            "nasal_index_class": cls, "alar_to_bizygomatic": _r(alar / _d(p, *ZYGOMA), 3),
            "alar_to_intercanthal": _r(alar / _d(p, EYE["image_left"][0], EYE["image_right"][0]), 3),
            "alar_to_mouth": _r(alar / _d(p, *MOUTH), 3),
            "alar_level_diff_mm": _r(abs(p[ALAR[0]][1] - p[ALAR[1]][1])),
            "tip_deviation_mm": _r(p[1][0]),
            "note": "approximate nasal height; low projection or low radix needs a profile view"}


def mirror_asymmetry(p):
    """Distance (mm) between each landmark and the mirror image of its partner across
    the midline. 0 = perfectly symmetric. Includes a mean over all pairs."""
    per = {}
    for name, (a, b) in MIRROR_PAIRS.items():
        per[name] = _r(math.hypot(p[a][0] + p[b][0], p[a][1] - p[b][1]))
    return {"per_pair_mm": per, "mean_mm": _r(np.mean(list(per.values()))),
            "largest": max(per, key=per.get)}


def annotate(image_bgr, landmarks_px, out_path):
    """Draw the measured landmarks on the image for visual checking of the detection."""
    import cv2

    img = image_bgr.copy()
    idx = {i for pair in MIRROR_PAIRS.values() for i in pair} | {
        GLABELLA, NASION, SUBNASALE, MENTON, UPPER_LIP_TOP, UPPER_IN, LOWER_IN, LOWER_LIP_BOTTOM}
    for i in idx:
        x, y = landmarks_px[i]
        cv2.circle(img, (int(x), int(y)), 3, (0, 255, 0), -1)
    cv2.imwrite(str(out_path), img)
