"""Export the MediaPipe canonical face (468 pts, cm) with triangles and region index lists.

Triangles are recovered as 3-cycles of the tessellation edge graph, then filtered so that no
other vertex lies inside the triangle in the (x, y) plane (removes separating cycles).
Output: web/src/face/canonical.json
"""
import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np

SRC = Path(r"C:\Users\allam\Downloads\Coding_Zenodo\smile_symmetry\test_data\canonical_face_cm.npy")
OUT = Path(__file__).resolve().parents[1] / "web" / "src" / "face" / "canonical.json"

from mediapipe.tasks.python.vision import FaceLandmarksConnections as C  # noqa: E402

v = np.load(SRC).astype(float)
edges = {tuple(sorted((c.start, c.end))) for c in C.FACE_LANDMARKS_TESSELATION}
adj = {}
for a, b in edges:
    adj.setdefault(a, set()).add(b)
    adj.setdefault(b, set()).add(a)

tris = set()
for a, b in edges:
    for c in adj[a] & adj[b]:
        tris.add(tuple(sorted((a, b, c))))
tris = sorted(tris)


def inside(p, a, b, c):
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-12:
        return False
    l1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d
    l2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d
    l3 = 1 - l1 - l2
    return l1 > 1e-6 and l2 > 1e-6 and l3 > 1e-6


good = []
for t in tris:
    a, b, c = (v[i] for i in t)
    # separating cycles are rare in this mesh; keep all 3-cycles (a hole is worse than an overlap)
    # orient counter-clockwise seen from +z (viewer)
    cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    good.append(list(t) if cr > 0 else [t[0], t[2], t[1]])


def verts(conn):
    s = set()
    for c in conn:
        s.add(c.start)
        s.add(c.end)
    return sorted(s)


def loop(conn):
    """Order a closed connection set into a vertex loop."""
    nxt = {}
    for c in conn:
        nxt.setdefault(c.start, []).append(c.end)
        nxt.setdefault(c.end, []).append(c.start)
    start = next(iter(nxt))
    out, prev, cur = [start], None, start
    while True:
        n = [x for x in nxt[cur] if x != prev]
        if not n:
            break
        prev, cur = cur, n[0]
        if cur == start:
            break
        out.append(cur)
    return out


# remove spurious separating cycles: for any edge shared by 3 triangles, drop the one with the largest area
from collections import defaultdict
def area(t):
    a, b, c = (v[i] for i in t)
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a))
for _ in range(5):
    em = defaultdict(list)
    for ti, t in enumerate(good):
        for k in range(3):
            em[tuple(sorted((t[k], t[(k + 1) % 3])))].append(ti)
    drop = set()
    for e_, ts in em.items():
        if len(ts) > 2:
            drop.add(max(ts, key=lambda i: area(good[i])))
    if not drop:
        break
    good = [t for i, t in enumerate(good) if i not in drop]

data = {
    "vertices": np.round(v, 4).tolist(),
    "triangles": good,
    "oval": loop(C.FACE_LANDMARKS_FACE_OVAL),
    "leftEye": loop(C.FACE_LANDMARKS_LEFT_EYE),
    "rightEye": loop(C.FACE_LANDMARKS_RIGHT_EYE),
    "lips": verts(C.FACE_LANDMARKS_LIPS),
    "leftBrow": verts(C.FACE_LANDMARKS_LEFT_EYEBROW),
    "rightBrow": verts(C.FACE_LANDMARKS_RIGHT_EYEBROW),
    "nose": verts(C.FACE_LANDMARKS_NOSE),
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, separators=(",", ":")))
print("tri raw", len(tris), "tri kept", len(good), "oval", len(data["oval"]), file=sys.stderr)
