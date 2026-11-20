"""Draws the expected final marking visual: contour, RSTL, excision/plasty geometry, numbered suture guide,
dimensions, scale bar and a plan panel. Works with a face frame (wound_planner.FaceFrame) or, without a face,
with ImageFrame (pixels / px-per-mm, y up).

Colours: green = wound contour, white dotted = RSTL axis, cyan = fusiform excision, magenta = Z-plasty,
orange = W-plasty, yellow dashed = geometric broken line, white/black ticks with numbers = suture guide.
These are DRAWING AIDS for a surgeon, not a surgical plan.
"""
import math

import cv2
import numpy as np

import markings as mk
import wound_planner as wp

COL = {"contour": (60, 220, 60), "rstl": (255, 255, 255), "ellipse": (255, 200, 0), "z": (230, 60, 230), "w": (0, 140, 255),
       "gblc": (0, 230, 255), "suture": (255, 255, 255), "crit": (0, 140, 255)}


class ImageFrame:
    """Millimetre frame for photos without a detected face: x right, y UP, origin at the image top-left."""

    def __init__(self, px_per_mm):
        self.scale = float(px_per_mm)

    def to_mm(self, P):
        q = np.asarray(P, float) / self.scale
        q[..., 1] *= -1
        return q

    def to_px(self, Q):
        q = np.array(Q, float) * self.scale
        q[..., 1] *= -1
        return q


def centerline(mask, n=14):
    """Curved centre line of an elongated mask: bin pixels along the principal axis, average the perpendicular offset."""
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs, ys], 1).astype(float)
    c = pts.mean(axis=0)
    _, vec = np.linalg.eigh(np.cov((pts - c).T))
    u, v = vec[:, -1], vec[:, 0]
    t, s = (pts - c) @ u, (pts - c) @ v
    edges = np.linspace(t.min(), t.max(), n + 1)
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (t >= a) & (t <= b)
        if m.sum() > 3:
            out.append(c + u * t[m].mean() + v * s[m].mean())
    out = np.array(out)
    if len(out) >= 2:                                   # extend the end points to the true extremes
        out[0] = c + u * t.min() + v * np.mean(s[t <= edges[1]])
        out[-1] = c + u * t.max() + v * np.mean(s[t >= edges[-2]])
    return out


def _dotted(img, p0, p1, colour, th, step=14):
    d = np.linalg.norm(p1 - p0)
    for i in range(int(d // step) + 1):
        a = p0 + (p1 - p0) * (i * step / max(d, 1e-9))
        b = p0 + (p1 - p0) * (min(d, i * step + step * 0.5) / max(d, 1e-9))
        cv2.line(img, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), colour, th, cv2.LINE_AA)


def _line(img, pts, colour, th, closed=False):
    cv2.polylines(img, [np.round(pts).astype(np.int32).reshape(-1, 1, 2)], closed, colour, th, cv2.LINE_AA)


def _label(img, text, org, scale, colour, th=1):
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), th + 3, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, colour, th, cv2.LINE_AA)


def build_geometry(frame, wound_px, report, layers, limb_mm=6.0, z_angle=60, spacing_mm=4.0, bite_mm=3.0, wplasty_limb=6.0):
    """All drawing geometry in mm."""
    Q = frame.to_mm(np.asarray(wound_px, float))
    g = {"Q": Q}
    if "suture_guide" in layers:
        g["suture"] = mk.suture_guide(Q, spacing_mm, bite_mm)
    if "ellipse" in layers:
        e = report["elliptical_excision"]
        axis = e["axis_deg"]
        c = 0.5 * (Q[0] + Q[-1])
        g["ellipse"] = wp.ellipse_points(c, e["half_length_mm"], e["half_width_mm"], axis)
        g["ellipse_axes"] = (2 * e["half_length_mm"], 2 * e["half_width_mm"])
    if "z_plasty" in layers:
        g["z_series"] = mk.z_plasty_series(Q, z_angle, limb_mm=15.0)
        g["z_angle"] = z_angle
    if "w_plasty" in layers:
        a, b = mk.w_plasty(Q, wplasty_limb)
        g["w"] = (a, b)
        g["w_area"] = mk.tissue_removed_mm2(a, b)
    if "gblc" in layers:
        g["gblc"] = (mk.geometric_broken_line(Q, seed=7), mk.geometric_broken_line(Q, seed=11))
    ang = math.radians(report["elliptical_excision"]["axis_deg"])
    g["rstl_dir"] = np.array([math.cos(ang), math.sin(ang)])
    g["centre"] = Q.mean(axis=0)
    return g


def draw(image_bgr, frame, wound_px, report, plan, layers, out_path, mask=None, margin_mm=32.0, width=1500, banner=None, **kw):
    """Render the marking plan. Returns the geometry used."""
    layers = list(layers)
    g = build_geometry(frame, wound_px, report, layers, **kw)
    Q = g["Q"]
    if mask is not None and "suture" in g:
        _bites_outside_edges(g["suture"], mask, frame, kw.get("bite_mm", 3.0))
    # crop window around everything drawn
    allpts = [Q]
    for k in ("ellipse",):
        if k in g:
            allpts.append(g[k])
    for z in g.get("z_series", []):
        allpts += [np.array(z[k]) for k in ("central", "arm_1", "arm_2")]
    if "w" in g:
        allpts += list(g["w"])
    allp = np.vstack(allpts)
    px_all = frame.to_px(allp)
    x0, y0 = np.floor(px_all.min(axis=0) - margin_mm * frame.scale).astype(int)
    x1, y1 = np.ceil(px_all.max(axis=0) + margin_mm * frame.scale).astype(int)
    h, w = image_bgr.shape[:2]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    crop = image_bgr[y0:y1, x0:x1]
    f = max(1.0, width * 0.62 / crop.shape[1])
    img = cv2.resize(crop, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    off = np.array([x0, y0], float)
    P = lambda Qmm: (frame.to_px(np.asarray(Qmm, float)) - off) * f
    th = max(2, int(round(img.shape[1] / 600)))
    k = img.shape[1] / 900.0

    if mask is not None:
        m = cv2.resize(mask[y0:y1, x0:x1].astype(np.uint8), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(img, cs, -1, COL["contour"], th, cv2.LINE_AA)
    # RSTL axis through the wound centre
    c = P(g["centre"][None])[0]
    d = g["rstl_dir"] * np.array([1, -1]) * 1.0              # mm frame (y up) -> pixel direction
    span = 0.46 * max(img.shape[:2])
    _dotted(img, c - d * span, c + d * span, COL["rstl"], max(1, th - 1))
    _label(img, "RSTL", tuple(np.round(c - d * span * 0.96 + np.array([4, -8])).astype(int)), 0.55 * k, COL["rstl"])
    if "ellipse" in g:
        _line(img, P(g["ellipse"]), COL["ellipse"], th, True)
        a, b = g["ellipse_axes"]
        _label(img, f"elips {a:.0f} x {b:.0f} mm", tuple(np.round(P(g["ellipse"])[0] + [8, -10]).astype(int)), 0.55 * k, COL["ellipse"])
    if "z_series" in g:
        for z in g["z_series"]:
            for key in ("central", "arm_1", "arm_2"):
                _line(img, P(np.array(z[key])), COL["z"], th)
        z0 = g["z_series"][0]
        mid = P(np.array(z0["arm_1"][1])[None])[0]
        _label(img, f"Z-plasty {len(g['z_series'])}x, {g['z_angle']} derajat, lengan {z0['limb_mm']:.0f} mm (+{z0['gain_percent']}% per Z)",
               tuple(np.round(mid + [8, -8]).astype(int)), 0.5 * k, COL["z"])
    if "w" in g:
        for line in g["w"]:
            _line(img, P(line), COL["w"], th)
        p = P(g["w"][0][len(g["w"][0]) // 2][None])[0]
        _label(img, f"W-plasty (gigi {kw.get('wplasty_limb', 6.0):g} mm)", tuple(np.round(p + [8, -12]).astype(int)), 0.55 * k, COL["w"])
    if "gblc" in g:
        for line in g["gblc"]:
            pts = P(line)
            for a, b in zip(pts[:-1], pts[1:]):
                _dotted(img, a, b, COL["gblc"], th, step=10)
        p = P(g["gblc"][0][len(g["gblc"][0]) // 2][None])[0]
        _label(img, "geometric broken line", tuple(np.round(p + [8, 14]).astype(int)), 0.55 * k, COL["gblc"])
    _line(img, P(Q), (255, 255, 255), max(1, th - 1))                               # wound centre line
    if "suture" in g:
        for s in g["suture"]:
            a, b = P(s["a"][None])[0], P(s["b"][None])[0]
            cv2.line(img, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), (0, 0, 0), th + 2, cv2.LINE_AA)
            cv2.line(img, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), COL["suture"], th, cv2.LINE_AA)
            for pt in (a, b):
                cv2.circle(img, tuple(np.round(pt).astype(int)), th + 1, (0, 0, 255), -1, cv2.LINE_AA)
            nrm = (a - b) / max(np.linalg.norm(a - b), 1e-9)
            tp = a + nrm * 18 * k
            _label(img, str(s["order"]), (int(tp[0]) - 6, int(tp[1]) + 5), 0.5 * k, (255, 255, 255))
    # scale bar and dimensions
    bar = 10.0 * frame.scale * f
    bx, by = int(30 * k), img.shape[0] - int(30 * k)
    cv2.line(img, (bx, by), (bx + int(bar), by), (0, 0, 0), th + 3)
    cv2.line(img, (bx, by), (bx + int(bar), by), (255, 255, 255), th)
    _label(img, "10 mm", (bx, by - int(10 * k)), 0.6 * k, (255, 255, 255))
    _label(img, f"panjang {report['length_mm']:.1f} mm", tuple(np.round(P(Q[-1][None])[0] + [-60 * k, 38 * k]).astype(int)), 0.62 * k, COL["contour"], 2)

    # ---------------- panel ----------------
    pw = int(900 * k)
    H = max(img.shape[0], int(1060 * k))
    panel = np.full((H, pw, 3), 26, np.uint8)
    if H > img.shape[0]:
        img = cv2.copyMakeBorder(img, 0, H - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(26, 26, 26))
    y = int(40 * k)
    lines = [(t, 0.5, c, 2) for t, c in (banner or [])] + [("RENCANA MARKING", 0.95, (255, 255, 255), 2), ("dukungan keputusan, ahli bedah memutuskan", 0.5, (170, 170, 170), 1)]
    r = report
    lines += [("", 0.4, None, 1),
              (f"Wilayah: {plan['wilayah']}", 0.62, (235, 235, 235), 1),
              (f"Panjang {r['length_mm']} mm | tortuositas {r.get('tortuosity')} | sudut ke RSTL {r['mean_angle_to_rstl_deg']} deg", 0.55, (235, 235, 235), 1),
              (ALIGN_ID.get(r["alignment"].split(" (")[0].split()[0].lower(), r["alignment"]), 0.6, (80, 190, 60) if r["mean_angle_to_rstl_deg"] <= wp.FAV else (0, 200, 240) if r["mean_angle_to_rstl_deg"] < wp.UNFAV else (60, 60, 240), 2),
              (f"Sumber RSTL: {SRC_ID.get(r.get('rstl_source', 'coarse').split()[0].lower(), r.get('rstl_source', ''))}", 0.46, (170, 170, 170), 1), ("", 0.4, None, 1)]
    for t in plan["teknik"][:3]:
        lines.append((f"{t['peringkat']}. {t['nama']}", 0.58, (255, 210, 120) if t["peringkat"] == 1 else (200, 200, 200), 1))
        lines.append((t["alasan"], 0.45, (200, 200, 200), 1))
        if t.get("ukuran"):
            lines.append((t["ukuran"], 0.45, (170, 220, 255), 1))
    sj = plan["rencana_jahitan"]
    if sj:
        lines += [("", 0.4, None, 1), ("JAHITAN", 0.62, (255, 255, 255), 1)]
        for l in sj["lapisan"]:
            lines.append((f"- {l['lapis']}: {l['bahan']}", 0.45, (220, 220, 220), 1))
        lines += [(f"Kulit: {sj['perkiraan_jumlah_jahitan_kulit']} jahitan tiap {sj['jarak_antar_jahitan_kulit_mm']:g} mm (nomor = urutan, belah dua).", 0.45, (220, 220, 220), 1),
                  (f"Dalam: sekitar {sj['perkiraan_jumlah_jahitan_dalam']} jahitan tiap {sj['jarak_antar_jahitan_dalam_mm']:g} mm. Lepas: {sj['lepas_jahitan']}.", 0.45, (220, 220, 220), 1)]
    else:
        lines += [("", 0.4, None, 1), ("Tidak ada garis jahitan untuk rencana ini.", 0.5, (200, 200, 200), 1)]
    if report.get("area_mm2") is not None:
        lines.append((f"Lesi: luas {report['area_mm2']} mm2, {report['major_mm']} x {report['minor_mm']} mm (elongasi {report['elongation']}, solidity {report['solidity']}).", 0.46, (200, 200, 200), 1))
    if report.get("critical_borders"):
        lines += [("", 0.4, None, 1), ("LANDMARK KRITIS", 0.62, (0, 140, 255), 2)]
        lines += [(f"- {c['structure']}: {c['min_distance_mm']} mm" + (" (DILINTASI)" if c["crosses"] else "") + ". Jahitan pertama di sini.", 0.45, (0, 170, 255), 1) for c in report["critical_borders"]]
    if plan["peringatan_merah"]:
        lines += [("", 0.4, None, 1), ("PERHATIAN", 0.62, (60, 60, 240), 2)]
        lines += [(f"! {f}", 0.45, (120, 120, 255), 1) for f in plan["peringatan_merah"][:4]]
    lines += [("", 0.4, None, 1), ("Foto 2D tidak menunjukkan kedalaman, vaskularisasi, kontaminasi, saraf atau tulang.", 0.43, (150, 150, 150), 1)]
    legend = [("Garis hijau = kontur luka; putih bertitik = arah RSTL", COL["contour"])]
    if "suture" in layers:
        legend.append(("Garis putih bernomor = tempat masuk dan keluar jarum, 3 mm dari tepi luka; nomor = urutan (tengah dulu, lalu belah dua)", (255, 255, 255)))
    for key, text, colr in (("ellipse", "Cyan = batas eksisi elips", COL["ellipse"]), ("z_plasty", "Magenta = Z-plasty berseri (lengan tengah dan dua lengan tiap Z, sisi bergantian)", COL["z"]),
                            ("w_plasty", "Oranye = dua garis zig-zag W-plasty (gigi bergeser setengah periode)", COL["w"]), ("gblc", "Kuning putus-putus = geometric broken line", COL["gblc"])):
        if key in layers:
            legend.append((text, colr))
    lines += [("", 0.4, None, 1), ("LEGENDA", 0.55, (255, 255, 255), 1)] + [(t, 0.42, c, 1) for t, c in legend]
    for text, sz, colour, thick in lines:
        if not text:
            y += int(10 * k)
            continue
        for chunk in _wrap_px(text, sz * k, thick, pw - int(34 * k)):
            cv2.putText(panel, chunk, (int(16 * k), y), cv2.FONT_HERSHEY_SIMPLEX, sz * k, colour, thick, cv2.LINE_AA)
            y += int(30 * sz * k + 6 * k)
    cv2.imwrite(str(out_path), np.hstack([img, panel]))
    return g


def _bites_outside_edges(sutures, mask, frame, bite_mm):
    """On a gaping wound the bites must be bite_mm OUTSIDE each edge, not bite_mm from the centre line: measure the half
    width of the contour on both sides of every station along the normal and place entry/exit marks beyond it."""
    h, w = mask.shape
    reach = int(40 * frame.scale)
    for s in sutures:
        c = s["centre"]
        n = s["a"] - s["b"]
        n = n / max(np.linalg.norm(n), 1e-9)
        cpx = frame.to_px(c[None])[0]
        dpx = frame.to_px((c + n)[None])[0] - cpx
        dpx = dpx / max(np.linalg.norm(dpx), 1e-9)
        edge = []
        for sign in (1, -1):
            t = 0
            while t < reach:
                x, y = np.round(cpx + sign * dpx * t).astype(int)
                if not (0 <= x < w and 0 <= y < h) or not mask[y, x]:
                    break
                t += 1
            edge.append(t / frame.scale)
        s["a"], s["b"] = c + n * (edge[0] + bite_mm), c - n * (edge[1] + bite_mm)
        s["wound_width_mm"] = round(edge[0] + edge[1], 1)


def _wrap_px(text, scale, thick, max_px):
    words, out, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if cv2.getTextSize(trial, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)[0][0] > max_px and cur:
            out.append(cur)
            cur = w
        else:
            cur = trial
    return out + [cur] if cur else out


ALIGN_ID = {"favourable": "MENGUNTUNGKAN (sejajar RSTL)", "intermediate": "SEDANG", "unfavourable": "TIDAK MENGUNTUNGKAN (hampir tegak lurus RSTL)"}
SRC_ID = {"clinician": "ditetapkan klinisi", "coarse": "perkiraan kasar, belum diverifikasi"}
