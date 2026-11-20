"""Marking geometry for repair planning, in face-aligned millimetres (y up).

All functions take a wound/scar centre line Q (n x 2, mm) and return polylines or points that the app
draws on the photo: suture guide ticks with a halving order, W-plasty zig-zags, a geometric broken line,
and re-exports of the ellipse and Z-plasty from wound_planner.

These are DRAWING AIDS for a surgeon, not a surgical plan. Sizes follow commonly taught values and are
parameters the surgeon changes.
"""
import math

import numpy as np


def _arc(Q):
    d = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(d)]), d


def point_at(Q, s):
    """Point and unit tangent at arc length s along polyline Q."""
    cum, d = _arc(Q)
    s = float(np.clip(s, 0.0, cum[-1]))
    i = int(np.searchsorted(cum, s, side="right") - 1)
    i = min(i, len(Q) - 2)
    t = (s - cum[i]) / d[i] if d[i] > 0 else 0.0
    p = Q[i] + (Q[i + 1] - Q[i]) * t
    tan = (Q[i + 1] - Q[i]) / max(d[i], 1e-9)
    return p, tan


def bisection_order(n):
    """Order of placing n sutures by repeated halving: middle first, then the middle of each half, ..."""
    order, queue = [], [(0, n - 1)]
    while queue:
        lo, hi = queue.pop(0)
        if lo > hi:
            continue
        mid = (lo + hi) // 2
        order.append(mid)
        queue += [(lo, mid - 1), (mid + 1, hi)]
    rank = [0] * n
    for r, idx in enumerate(order, start=1):
        rank[idx] = r
    return rank


def suture_guide(Q, spacing_mm=4.0, bite_mm=3.0):
    """Skin suture entry/exit marks. Positions are spread evenly over the wound (not just every spacing),
    so the first and last suture sit about half a spacing from each end. Returns list of dicts."""
    cum, _ = _arc(Q)
    L = float(cum[-1])
    n = max(1, int(round(L / spacing_mm)))
    step = L / n
    pos = [(i + 0.5) * step for i in range(n)]
    rank = bisection_order(n)
    out = []
    for i, s in enumerate(pos):
        p, tan = point_at(Q, s)
        nrm = np.array([-tan[1], tan[0]])
        out.append({"index": i + 1, "order": rank[i], "centre": p, "a": p + nrm * bite_mm, "b": p - nrm * bite_mm,
                    "arc_mm": round(s, 1)})
    return out


def w_plasty(Q, limb_mm=6.0):
    """Two zig-zag lines parallel to the scar, offset half a period against each other (equilateral teeth).
    Returns (line_side_A, line_side_B). Excising the zones between them and suturing interdigitates the edges."""
    cum, _ = _arc(Q)
    L = float(cum[-1])
    h = limb_mm * math.sin(math.radians(60))
    lines = []
    for sign, shift in ((+1, 0.0), (-1, 0.5)):
        pts, i = [], 0
        while True:
            s = (i + shift) * limb_mm
            if s > L:
                break
            p, tan = point_at(Q, s)
            nrm = np.array([-tan[1], tan[0]])
            pts.append(p + (nrm * sign * h if i % 2 == 1 else 0 * nrm))
            i += 1
        # start and end on the centre line so the pattern closes on the scar ends
        p0, _ = point_at(Q, 0.0)
        p1, _ = point_at(Q, L)
        lines.append(np.vstack([p0, *pts, p1]) if len(pts) else np.vstack([p0, p1]))
    return lines[0], lines[1]


def geometric_broken_line(Q, seed=7, seg_mm=(5.0, 9.0), amp_mm=(2.5, 5.0)):
    """Irregular broken line (random length, angle and side) for long scars, so the closed scar is not a straight
    line the eye can follow. Deterministic for a given seed so the drawing is reproducible."""
    rng = np.random.default_rng(seed)
    cum, _ = _arc(Q)
    L = float(cum[-1])
    pts, s, side = [point_at(Q, 0.0)[0]], 0.0, 1
    while s < L - 3.0:
        s = min(L, s + rng.uniform(*seg_mm))
        p, tan = point_at(Q, s)
        nrm = np.array([-tan[1], tan[0]])
        pts.append(p + nrm * side * rng.uniform(*amp_mm) if s < L else p)
        side *= -1
    pts.append(point_at(Q, L)[0])
    return np.vstack(pts)


def tissue_removed_mm2(line_a, line_b):
    """Rough area enclosed between the two W-plasty lines (shoelace on the closed loop)."""
    loop = np.vstack([line_a, line_b[::-1]])
    x, y = loop[:, 0], loop[:, 1]
    return float(0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def z_plasty_series(Q, alpha=60, limb_mm=15.0, max_n=6):
    """Series of Z-plasties along a long scar: equal central limbs of about limb_mm, arms equal to the central limb,
    alternating sides so neighbouring Zs do not collide. Returns list of dicts with central/arm_1/arm_2 (mm)."""
    import wound_planner as wp
    cum, _ = _arc(Q)
    L = float(cum[-1])
    n = int(min(max_n, max(1, round(L / limb_mm))))
    out = []
    for i in range(n):
        p1, _ = point_at(Q, L * i / n)
        p2, _ = point_at(Q, L * (i + 1) / n)
        z = wp.z_plasty(p1, p2, alpha if i % 2 == 0 else -alpha)
        out.append({"central": z["central"], "arm_1": z["arm_1"], "arm_2": z["arm_2"],
                    "limb_mm": z["limb_length_mm"], "gain_percent": wp.Z_GAIN.get(abs(alpha))})
    return out
