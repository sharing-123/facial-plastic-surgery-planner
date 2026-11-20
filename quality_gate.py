"""Quality gate: decide whether a photo/video is good enough to measure at all.

If the gate says CANNOT_ASSESS the tool must refuse to output measurements, because a
confident-looking number from a bad landmark fit is worse than no number (false reassurance).

All thresholds are screening values chosen for this prototype. They are NOT validated
cut-offs; tune them on real data (including swollen, scarred, cleft and palsy faces).
The gate catches pose, framing, blur, closed eyes, missing frames, jitter and implausible
geometry. It CANNOT detect every bad fit, and it cannot tell a true deformity from a
landmark error, so a passing gate is not proof that the numbers are right.
"""
import math

import numpy as np

import face_proportions as fp

IRIS_EDGES = ((469, 471), (474, 476))   # horizontal iris edges, image-left / image-right
LID_UP, LID_LOW = (159, 386), (145, 374)

PASS, WARN, REFUSE = "PASS", "PASS_WITH_WARNINGS", "CANNOT_ASSESS"

T = {  # (warn, fail)
    "yaw_asym": (0.08, 0.15),            # head turned left/right
    "roll_deg": (15.0, 30.0),            # head tilted sideways
    "mid_to_low_ratio": ((0.65, 1.5), (0.5, 2.0)),   # head tilted up/down or bad fit
    "face_aspect": (None, (0.7, 1.5)),   # bizygomatic width / glabella-menton height
    "face_width_px": (220, 120),         # too small to measure well
    "iris_px": (10, 6),                  # iris is the mm scale
    "iris_to_outer_canthal": (None, (0.08, 0.20)),   # iris implausible => scale unreliable
    "mouth_open": (0.12, 0.35),          # inner lip gap / mouth width
    "blur_laplacian_var": (60, 20),
    "valid_frame_fraction": (0.97, 0.90),
    "rest_jitter": (0.008, 0.02),        # rest-period landmark wobble / outer-canthal width
}


def _check_high(name, v, fails, warns, msg):
    warn, fail = T[name]
    if v >= fail:
        fails.append((name, msg))
    elif v >= warn:
        warns.append((name, msg))


def _check_low(name, v, fails, warns, msg):
    warn, fail = T[name]
    if v <= fail:
        fails.append((name, msg))
    elif v <= warn:
        warns.append((name, msg))


def assess(landmarks, image=None, rest_fraction=0.1):
    """landmarks: (T, 478, 2) px, NaN where no face. image: BGR array of the frame/photo
    (optional; enables framing and blur checks). Returns a dict with status."""
    fails, warns, m = [], [], {}
    n = len(landmarks)
    valid = ~np.isnan(landmarks).any(axis=(1, 2))
    m["valid_frame_fraction"] = round(float(valid.mean()), 3)
    if not valid.any():
        return _result(REFUSE, [("no_face", "Wajah tidak terdeteksi.")], [], m)
    if n > 1:
        _check_low("valid_frame_fraction", m["valid_frame_fraction"], fails, warns,
                   f"Wajah hilang di {100 * (1 - m['valid_frame_fraction']):.0f}% frame.")

    n_rest = max(3, int(n * rest_fraction)) if n > 1 else 1
    rest = landmarks[:n_rest][valid[:n_rest]]
    if len(rest) == 0:
        return _result(REFUSE, fails + [("no_rest", "Tidak ada wajah di awal video (fase istirahat).")], warns, m)
    p = np.median(rest, axis=0)

    a, b = p[fp.EYE["image_left"][1]], p[fp.EYE["image_right"][1]]
    oc = float(np.linalg.norm(b - a))
    if oc < 1:
        return _result(REFUSE, fails + [("degenerate", "Geometri wajah tidak masuk akal.")], warns, m)
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    u = np.array([math.cos(ang), math.sin(ang)])
    v = np.array([-u[1], u[0]])

    # pose
    za, zb = fp.ZYGOMA
    left = abs(float(np.dot(p[1] - p[za], u)))
    right = abs(float(np.dot(p[zb] - p[1], u)))
    m["yaw_asym"] = round(abs(left - right) / max(left + right, 1e-6), 3)
    _check_high("yaw_asym", m["yaw_asym"], fails, warns, "Kepala menoleh ke samping; ulangi menghadap lurus.")
    m["roll_deg"] = round(abs(math.degrees(ang)), 1)
    _check_high("roll_deg", m["roll_deg"], fails, warns, "Kepala miring ke samping; luruskan.")
    mid = float(np.dot(p[fp.SUBNASALE] - p[fp.GLABELLA], v))
    low = float(np.dot(p[fp.MENTON] - p[fp.SUBNASALE], v))
    if low <= 0 or mid <= 0:
        fails.append(("pitch", "Urutan titik wajah vertikal tidak masuk akal (kepala menengadah/menunduk atau titik meleset)."))
    else:
        m["mid_to_low_ratio"] = round(mid / low, 3)
        r = mid / low
        (w0, w1), (f0, f1) = T["mid_to_low_ratio"]
        if not f0 <= r <= f1:
            fails.append(("pitch", "Kepala menengadah/menunduk atau titik meleset; ulangi dengan dagu sejajar."))
        elif not w0 <= r <= w1:
            warns.append(("pitch", "Posisi kepala vertikal agak miring."))

    # geometry / scale
    height = float(np.linalg.norm(p[fp.MENTON] - p[fp.GLABELLA]))
    bizyg = float(np.linalg.norm(p[za] - p[zb]))
    m["face_width_px"] = round(bizyg)
    _check_low("face_width_px", bizyg, fails, warns, "Wajah terlalu kecil di gambar; dekatkan kamera atau pakai resolusi lebih tinggi.")
    aspect = bizyg / max(height, 1e-6)
    m["face_aspect"] = round(aspect, 3)
    lo, hi = T["face_aspect"][1]
    if not lo <= aspect <= hi:
        fails.append(("face_aspect", "Bentuk titik wajah tidak masuk akal (tertutup, masker, distorsi, atau titik meleset)."))
    iris = float(np.mean([abs(p[IRIS_EDGES[0][0]][0] - p[IRIS_EDGES[0][1]][0]),
                          abs(p[IRIS_EDGES[1][0]][0] - p[IRIS_EDGES[1][1]][0])]))
    m["iris_px"] = round(iris, 1)
    _check_low("iris_px", iris, fails, warns, "Iris terlalu kecil untuk kalibrasi skala mm.")
    m["iris_to_outer_canthal"] = round(iris / oc, 3)
    lo, hi = T["iris_to_outer_canthal"][1]
    if not lo <= iris / oc <= hi:
        fails.append(("scale", "Ukuran iris tidak wajar terhadap lebar mata; skala mm tidak dapat dipercaya."))
    elif not 0.115 <= iris / oc <= 0.17:
        warns.append(("scale_marginal", "Iris tampak kecil/besar terhadap lebar mata (menyipit, kelopak turun, atau kepala menunduk); skala mm kurang andal."))

    # eyes open (a single narrow eye may be a true finding, so only both-closed refuses)
    fiss = [float(np.linalg.norm(p[u_] - p[l_])) / max(iris, 1e-6)
            for u_, l_ in zip(LID_UP, LID_LOW)]
    m["eye_open_to_iris"] = [round(x, 2) for x in fiss]
    if max(fiss) < 0.35:
        fails.append(("eyes_closed", "Kedua mata tertutup atau hampir tertutup; skala iris tidak andal. Foto harus mata terbuka menatap lurus."))
    elif min(fiss) < 0.45:
        warns.append(("eye_narrow", "Satu mata sempit: bisa temuan nyata (ptosis/lagoftalmos) atau menyipit; konfirmasi."))

    # neutral mouth at rest
    mouth_w = float(np.linalg.norm(p[fp.MOUTH[0]] - p[fp.MOUTH[1]]))
    gap = float(np.linalg.norm(p[fp.UPPER_IN] - p[fp.LOWER_IN])) / max(mouth_w, 1e-6)
    m["mouth_open"] = round(gap, 3)
    _check_high("mouth_open", gap, fails, warns, "Mulut terbuka; minta pasien merapatkan bibir (ekspresi netral).")

    # framing and image quality
    if image is not None:
        h, w = image.shape[:2]
        pts = landmarks[valid].reshape(-1, 2)
        if (pts[:, 0] < 0).any() or (pts[:, 0] >= w).any() or (pts[:, 1] < 0).any() or (pts[:, 1] >= h).any():
            fails.append(("cropped", "Wajah terpotong di tepi gambar."))
        else:
            gray, crop = _face_crop(image, p)
            if crop is not None:
                import cv2
                lap = float(cv2.Laplacian(cv2.resize(crop, (256, 256)), cv2.CV_64F).var())
                m["blur_laplacian_var"] = round(lap, 1)
                _check_low("blur_laplacian_var", lap, fails, warns, "Gambar buram; ulangi dengan fokus dan cahaya lebih baik.")
                m["brightness"] = round(float(crop.mean()), 1)
                if not 45 <= crop.mean() <= 215:
                    warns.append(("exposure", "Pencahayaan terlalu gelap atau terang."))

    # temporal stability at rest (video)
    if len(rest) >= 3:
        mid_c = 0.5 * (rest[:, fp.EYE["image_left"][0]] + rest[:, fp.EYE["image_right"][0]])
        keys = [33, 263, 133, 362, 1, 152, 61, 291]
        jit = float(np.mean([np.std(rest[:, k] - mid_c, axis=0).mean() for k in keys])) / oc
        m["rest_jitter"] = round(jit, 4)
        _check_high("rest_jitter", jit, fails, warns, "Titik wajah bergoyang saat istirahat; wajah bergerak atau deteksi tidak stabil.")

    status = REFUSE if fails else WARN if warns else PASS
    return _result(status, fails, warns, m)


def _face_crop(image, p):
    import cv2
    x0, y0 = np.clip(p.min(axis=0).astype(int), 0, None)
    x1, y1 = p.max(axis=0).astype(int)
    crop = image[y0:y1, x0:x1]
    if crop.size == 0:
        return None, None
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    return gray, gray


def _result(status, fails, warns, metrics):
    return {
        "status": status,
        "failures": [{"code": c, "message": s} for c, s in fails],
        "warnings": [{"code": c, "message": s} for c, s in warns],
        "metrics": metrics,
        "note": "Ambang adalah nilai penyaring prototipe, bukan batas klinis tervalidasi. "
                "Lolos gerbang bukan bukti angka benar.",
    }
