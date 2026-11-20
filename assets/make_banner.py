"""Renders assets/banner.webp, a looping motion graphic of a rotating 3D facial mesh with an animated scan plane,
a wound centre line, numbered suture marks and a flowing skin tension line. Run from the repository root.

    python assets/make_banner.py

Frames are drawn with OpenCV at 2x and reduced, then written as an animated WebP (about 3 seconds, seamless loop)."""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
W, H, SS, N_FRAMES, FPS = 1400, 440, 2, 72, 24
FONTS = Path("C:/Windows/Fonts")


def load_mesh():
    from mediapipe.tasks.python import vision
    edges = np.array([(c.start, c.end) for c in vision.FaceLandmarksConnections.FACE_LANDMARKS_TESSELATION])
    v = np.load(ROOT / "test_data" / "canonical_face_cm.npy").astype(np.float64)
    v -= v.mean(axis=0)
    return v, edges


def rot(v, yaw, pitch, roll):
    cy, sy, cp, sp, cr, sr = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return v @ (Rz @ Rx @ Ry).T


def project(v, cx, cy, scale, d=34.0):
    k = d / (d - v[:, 2])
    return np.stack([cx + v[:, 0] * scale * k, cy - v[:, 1] * scale * k], axis=1), k


def background():
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    base = np.zeros((H, W, 3), np.float32)
    base[..., 0] = 24 + 30 * y + 10 * (1 - x)          # B
    base[..., 1] = 12 + 16 * y
    base[..., 2] = 8 + 10 * y
    vign = 1 - 0.35 * ((x - 0.45) ** 2 + (y - 0.5) ** 2) * 2.2
    return np.clip(base * vign[..., None], 0, 255).astype(np.uint8)


def floor_grid(t):
    img = np.zeros((H * SS, W * SS, 3), np.uint8)
    horizon, vp = 0.70 * H * SS, (0.33 * W * SS)
    for i in range(14):                                   # horizontal lines moving toward the viewer
        s = ((i + t * 1.0) % 14) / 14.0
        y = horizon + (H * SS - horizon) * s ** 2.1
        a = int(60 * s)
        cv2.line(img, (0, int(y)), (W * SS, int(y)), (a * 2, int(a * 1.5), int(a * 0.5)), SS, cv2.LINE_AA)
    for k in range(-14, 15):                              # vertical lines converging to the vanishing point
        x1 = vp + k * (W * SS / 7)
        cv2.line(img, (int(vp + k * 14), int(horizon)), (int(x1), H * SS), (30, 22, 8), SS, cv2.LINE_AA)
    return img


def particles(t, rng_state):
    layer = np.zeros((H * SS, W * SS, 3), np.uint8)
    for (px, py, sp, ph, r) in rng_state:
        y = (py - t * sp * H) % H
        tw = 0.5 + 0.5 * math.sin(2 * math.pi * (t * 1 + ph))
        c = int(60 + 110 * tw)
        cv2.circle(layer, (int(px * SS), int(y * SS)), max(1, int(r * SS)), (c, int(c * 0.9), int(c * 0.5)), -1, cv2.LINE_AA)
    return layer


def font(name, size, index=0):
    try:
        return ImageFont.truetype(str(FONTS / name), size, index=index)
    except OSError:
        return ImageFont.load_default()


def text_layer(t):
    """Static typography with a travelling highlight over the title. Returns RGBA uint8 (H, W, 4)."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_t = font("cambriab.ttf", 50)
    f_s = font("corbel.ttf", 19)
    f_c = font("corbelb.ttf", 13)
    f_a = font("cambriai.ttf", 17)
    x0 = 735
    d.text((x0, 112), "Facial Plastic", font=f_t, fill=(236, 244, 255, 255))
    d.text((x0, 168), "Surgery Planner", font=f_t, fill=(236, 244, 255, 255))
    d.line([(x0, 238), (x0 + 120, 238)], fill=(90, 200, 255, 255), width=3)
    d.text((x0, 252), "Artificial intelligence and bioinformatics for", font=f_s, fill=(170, 195, 225, 255))
    d.text((x0, 278), "quantitative marking and suture planning", font=f_s, fill=(170, 195, 225, 255))
    chips = ["Computer vision", "Surgical planning", "Bioinformatics", "Research prototype"]
    cx = x0
    for c in chips:
        w = d.textlength(c, font=f_c) + 22
        d.rounded_rectangle([cx, 322, cx + w, 346], radius=12, outline=(70, 150, 210, 255), width=1, fill=(14, 30, 56, 200))
        d.text((cx + 11, 327), c, font=f_c, fill=(150, 205, 245, 255))
        cx += w + 8
    d.text((x0, 372), "Universitas Indonesia and Universitas Kristen Krida Wacana", font=f_a, fill=(120, 145, 180, 255))
    arr = np.array(img)
    # highlight band sweeping across the title lines
    band_x = int((-0.2 + 1.4 * t) * 700 + 700)
    xs = np.arange(W)[None, :]
    band = np.exp(-((xs - band_x) / 55.0) ** 2)
    mask = np.zeros((H, W), np.float32)
    mask[108:228, :] = 1.0
    boost = (band * mask)[..., None] * 90
    arr[..., :3] = np.clip(arr[..., :3].astype(np.float32) + boost * (arr[..., 3:4] > 200), 0, 255).astype(np.uint8)
    return arr


def bezier(p0, p1, p2, s):
    return (1 - s) ** 2 * p0 + 2 * (1 - s) * s * p1 + s ** 2 * p2


def render_frame(t, mesh, edges, wounds, bg, parts):
    v, _ = mesh, None
    yaw = math.radians(38) * math.sin(2 * math.pi * t)
    pitch = math.radians(-7) + math.radians(4) * math.sin(2 * math.pi * t + 1.2)
    roll = math.radians(2) * math.sin(2 * math.pi * t + 0.4)
    R = rot(v, yaw, pitch, roll)
    cx, cy, scale = 345 * SS, 222 * SS, 19.4 * SS
    P, k = project(R, cx, cy, scale)
    z = R[:, 2]
    zn = (z - z.min()) / (z.max() - z.min())
    scan = -9.8 + 19.2 * ((t) % 1.0)                         # scan plane height in the rotated frame (cm)
    lay = np.zeros((H * SS, W * SS, 3), np.uint8)
    # edges with depth shading, brightened near the scan plane
    em = (R[edges[:, 0], 1] + R[edges[:, 1], 1]) / 2
    ez = (zn[edges[:, 0]] + zn[edges[:, 1]]) / 2
    near = np.exp(-((em - scan) / 0.55) ** 2)
    order = np.argsort(ez)
    for e in order:
        a, b = edges[e]
        depth = 0.18 + 0.82 * ez[e] ** 1.6
        base = np.array([255, 205, 120]) * depth * 0.55 + np.array([60, 25, 6])        # BGR: cyan to deep blue
        col = base + near[e] * np.array([255, 255, 255]) * 0.8
        cv2.line(lay, tuple(np.round(P[a]).astype(int)), tuple(np.round(P[b]).astype(int)), tuple(int(min(255, c)) for c in col), SS, cv2.LINE_AA)
    # vertices
    for i in range(len(R)):
        r = 1.3 + 2.4 * math.exp(-((R[i, 1] - scan) / 0.45) ** 2)
        c = 120 + 135 * zn[i]
        cv2.circle(lay, tuple(np.round(P[i]).astype(int)), int(r * SS * 0.7) + 1, (int(c), int(c * 0.95), int(c * 0.6)), -1, cv2.LINE_AA)
    # scan line across the mesh
    ys = cy - scan * scale * 1.0
    xs0, xs1 = P[:, 0].min() - 30 * SS, P[:, 0].max() + 30 * SS
    for j, a in enumerate((0.25, 0.6, 1.0)):
        cv2.line(lay, (int(xs0), int(ys)), (int(xs1), int(ys)), (int(255 * a), int(240 * a), int(150 * a)), max(1, SS - j * 0 if j == 2 else SS), cv2.LINE_AA)
    # wound lines and numbered suture marks, attached to the mesh; one wound per cheek, shown in turn
    wl = np.zeros_like(lay)
    callout = (0.0, 0.0)
    for wound_idx, t0, total in wounds:
        W3 = R[wound_idx]
        Pw, kw = project(W3, cx, cy, scale)
        vis = float(np.clip((W3[:, 2].mean() - 0.2) / 1.5, 0, 1))
        phase = ((t - t0) % 1.0) / 0.46
        if phase > 1.0 or vis < 0.02:
            continue
        fade = 1.0 if phase < 0.80 else max(0.0, (1.0 - phase) / 0.20)
        al = vis * fade
        n = len(Pw)
        for a_, b_ in zip(Pw[:-1], Pw[1:]):
            cv2.line(wl, tuple(np.round(a_).astype(int)), tuple(np.round(b_).astype(int)), (int(70 * al), int(70 * al), int(255 * al)), int(3.2 * SS), cv2.LINE_AA)
        rank = [0, 8, 4, 10, 2, 6, 9, 5, 1, 7, 3]                       # halving order for 11 stations
        for i in range(n):
            reveal = 0.04 + 0.70 * rank[i % 11] / 11.0
            if phase < reveal:
                continue
            tan = Pw[min(i + 1, n - 1)] - Pw[max(i - 1, 0)]
            tan = tan / (np.linalg.norm(tan) + 1e-9)
            nrm = np.array([-tan[1], tan[0]])
            a_, b_ = Pw[i] + nrm * 15 * SS, Pw[i] - nrm * 15 * SS
            cv2.line(wl, tuple(np.round(a_).astype(int)), tuple(np.round(b_).astype(int)), (int(255 * al), int(255 * al), int(255 * al)), int(1.8 * SS), cv2.LINE_AA)
            for q in (a_, b_):
                cv2.circle(wl, tuple(np.round(q).astype(int)), int(2.6 * SS), (int(60 * al), int(60 * al), int(255 * al)), -1, cv2.LINE_AA)
            cv2.putText(wl, str(rank[i % 11] + 1), (int(a_[0] + 5 * SS), int(a_[1] - 4 * SS)), cv2.FONT_HERSHEY_SIMPLEX, 0.56 * SS, (int(255 * al), int(255 * al), int(255 * al)), 1, cv2.LINE_AA)
        callout = (al, total * float(np.clip(phase / 0.75, 0, 1)))
    # flowing skin tension line (dots travelling along a curve)
    p0, p1, p2 = np.array([95 * SS, 330 * SS]), np.array([330 * SS, 120 * SS]), np.array([610 * SS, 300 * SS])
    fl = np.zeros_like(lay)
    for i in range(34):
        s = ((i / 34.0) + t) % 1.0
        q = bezier(p0, p1, p2, s)
        al = math.sin(math.pi * s) ** 1.5
        cv2.circle(fl, tuple(np.round(q).astype(int)), int(1.9 * SS), (int(110 * al), int(230 * al), int(120 * al)), -1, cv2.LINE_AA)
    # glow and compositing
    glow = cv2.GaussianBlur(lay, (0, 0), 5 * SS) * 0.75 + cv2.GaussianBlur(wl, (0, 0), 6 * SS) * 1.1 + cv2.GaussianBlur(fl, (0, 0), 4 * SS) * 0.9
    small = lambda a: cv2.resize(a, (W, H), interpolation=cv2.INTER_AREA)
    out = bg.astype(np.float32) + small(parts[0]).astype(np.float32) + small(floor_grid(t)).astype(np.float32) * 0.8
    out += small(lay).astype(np.float32) + small(wl).astype(np.float32) + small(fl).astype(np.float32) + small(glow.astype(np.uint8)).astype(np.float32) * 0.55
    out = np.clip(out, 0, 255).astype(np.uint8)
    rgba = text_layer(t)
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    rgb = rgba[..., :3][..., ::-1].astype(np.float32)
    out = (out.astype(np.float32) * (1 - a) + rgb * a).astype(np.uint8)
    # measurement callout counting up while the marks appear
    pil = Image.fromarray(out[..., ::-1])
    d = ImageDraw.Draw(pil)
    alpha_box, val = callout
    if alpha_box > 0.05:
        bx, by = 520, 112
        f = font("consola.ttf", 20)
        col = (int(120 + 120 * alpha_box), int(220 * alpha_box + 20), int(255 * alpha_box))
        d.rounded_rectangle([bx, by, bx + 138, by + 40], radius=7, outline=col, width=1, fill=(10, 24, 46))
        d.text((bx + 10, by + 8), f"{val:5.1f} mm", font=f, fill=col)
    d.line([(24, 22), (24, 52)], fill=(90, 200, 255), width=2); d.line([(24, 22), (54, 22)], fill=(90, 200, 255), width=2)
    d.line([(W - 24, H - 22), (W - 24, H - 52)], fill=(90, 200, 255), width=2); d.line([(W - 24, H - 22), (W - 54, H - 22)], fill=(90, 200, 255), width=2)
    return pil


def main():
    mesh, edges = load_mesh()
    def wound(p_a, p_b):
        pa = mesh[int(np.argmin(np.linalg.norm(mesh - np.array(p_a), axis=1)))]
        pb = mesh[int(np.argmin(np.linalg.norm(mesh - np.array(p_b), axis=1)))]
        pts = np.linspace(pa, pb, 11)
        return np.array([int(np.argmin(np.linalg.norm(mesh[:, :2] - p[:2], axis=1) + 0.35 * np.abs(mesh[:, 2] - p[2]))) for p in pts])
    wounds = [(wound((-6.4, 2.2, 0.8), (-2.4, -6.2, 3.4)), 0.02, 52.1), (wound((6.4, 1.8, 0.8), (2.6, -5.8, 3.4)), 0.52, 38.4)]
    rng = np.random.default_rng(5)
    parts = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.15, 0.5), rng.random(), rng.uniform(0.8, 1.8)) for _ in range(46)]
    bg = background()
    frames = []
    for f in range(N_FRAMES):
        t = f / N_FRAMES
        frames.append(render_frame(t, mesh, edges, wounds, bg, [particles(t, parts)]))
        if f % 12 == 0:
            print("frame", f, flush=True)
    out = ROOT / "assets" / "banner.webp"
    out.parent.mkdir(exist_ok=True)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0, quality=80, method=4)
    print("saved", out, round(out.stat().st_size / 1e6, 2), "MB")
    contact = Image.new("RGB", (W // 2 * 2, H // 2 * 2))
    for i, fr in enumerate([frames[0], frames[18], frames[36], frames[54]]):
        contact.paste(fr.resize((W // 2, H // 2)), ((i % 2) * W // 2, (i // 2) * H // 2))
    contact.save(ROOT / "assets" / "_contact.png")


if __name__ == "__main__":
    main()
