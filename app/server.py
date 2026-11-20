"""Local web app for the facial analysis and marking tools. Listens on 127.0.0.1 ONLY: patient photos never leave
this computer. Standard library server, no extra dependencies.

Run:  python app/server.py      then open http://127.0.0.1:8791
"""
import base64
import json
import math
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np

import acne_lesions as ac
from bioinfo import clinical_coding as cc
from bioinfo import enrichment as en
from bioinfo import fhir_export as fx
import after_illustration as ai
import face_zones as fz
import marking_render as mr
import sam_segment
import smile_symmetry as ss
import surgeon_compare as sc
import surgical_planner as sp
import wound_planner as wp
import wrinkle_analysis as wa
from overlay import draw_overlay
from quality_gate import assess

PORT = 8791
OUT = ROOT / "app_output"
LOCK = threading.Lock()
STATE = {"img": None, "lm": None, "ppm": None, "ppm_source": None, "gate": None, "name": "", "last": None}
MODEL = str(ROOT / "face_landmarker.task")
_MESH = {}


def data_url(img, q=92, png=False):
    ok, buf = cv2.imencode(".png" if png else ".jpg", img, [] if png else [cv2.IMWRITE_JPEG_QUALITY, q])
    return ("data:image/png;base64," if png else "data:image/jpeg;base64,") + base64.b64encode(buf.tobytes()).decode()


def decode(data):
    raw = base64.b64decode(data.split(",", 1)[1] if data.startswith("data:") else data)
    return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)


def detect_face(img):
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision
    if "mesh" not in _MESH:
        opts = vision.FaceLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=MODEL),
                                            running_mode=vision.RunningMode.IMAGE, num_faces=1)
        _MESH["mesh"] = vision.FaceLandmarker.create_from_options(opts)
    h, w = img.shape[:2]
    res = _MESH["mesh"].detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    if not res.face_landmarks:
        return None
    return np.array([[p.x * w, p.y * h] for p in res.face_landmarks[0]])


def need_image():
    if STATE["img"] is None:
        raise ValueError("Belum ada foto. Muat foto dulu.")


def api_load(req):
    if req.get("path"):
        p = Path(req["path"])
        img = cv2.imread(str(p))
        name = p.name
    else:
        img = decode(req["data"])
        name = req.get("name", "foto")
    if img is None:
        raise ValueError("Berkas gambar tidak dapat dibaca.")
    h, w = img.shape[:2]
    if max(h, w) > 3000:
        s = 3000 / max(h, w)
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    lm = detect_face(img)
    STATE.update(img=img, lm=lm, name=name, ppm=None, ppm_source=None, gate=None, last=None)
    info = {"w": img.shape[1], "h": img.shape[0], "face": lm is not None, "image": data_url(img, 90), "name": name}
    if lm is not None:
        STATE["ppm"], STATE["ppm_source"] = float(ss._px_per_mm(lm)), "iris 11,7 mm (galat sekitar 5%)"
        g = assess(lm[None], image=img)
        STATE["gate"] = g
        info["gate"] = {"status": g["status"], "failures": [f["message"] for f in g["failures"]], "warnings": [f["message"] for f in g["warnings"]]}
    info["ppm"], info["ppm_source"] = STATE["ppm"], STATE["ppm_source"]
    return info


def api_calibrate(req):
    need_image()
    a, b = np.array(req["p1"], float), np.array(req["p2"], float)
    mm = float(req["mm"])
    if mm <= 0 or np.linalg.norm(b - a) < 2:
        raise ValueError("Dua titik kalibrasi harus berjauhan dan panjang mm harus positif.")
    STATE["ppm"], STATE["ppm_source"] = float(np.linalg.norm(b - a) / mm), f"kalibrasi manual ({mm:g} mm)"
    return {"ppm": STATE["ppm"], "ppm_source": STATE["ppm_source"]}


def api_face(req):
    need_image()
    if STATE["lm"] is None:
        raise ValueError("Wajah frontal tidak terdeteksi. Gunakan foto frontal, atau gunakan tab Luka dengan kalibrasi manual.")
    g = STATE["gate"]
    if g["status"] == "CANNOT_ASSESS" and not req.get("force"):
        return {"refused": True, "gate": g}
    rep = ss.analyze_photo(STATE["lm"][None])
    rep["quality_gate"] = g
    OUT.mkdir(exist_ok=True)
    draw_overlay(STATE["img"], STATE["lm"], rep, OUT / "wajah_overlay.png", min_width=1400)
    fp = rep["frontal_proportions"]
    return {"image": data_url(cv2.imread(str(OUT / "wajah_overlay.png"))), "gate": g["status"],
            "ratios": fp["ratios"], "nose": fp["nose_frontal"], "canthal_tilt": fp["canthal_tilt_deg"],
            "asymmetry_mean_mm": fp["mirror_asymmetry"]["mean_mm"], "asymmetry_largest": fp["mirror_asymmetry"]["largest"],
            "asymmetry_pairs_mm": fp["mirror_asymmetry"]["per_pair_mm"], "rest": rep["static_rest"]}


def _pts(lst):
    """Validated list of (x, y) inside the finite plane; anything malformed is dropped."""
    out = []
    for p in lst or []:
        try:
            x, y = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError):
            continue
        if np.isfinite(x) and np.isfinite(y):
            out.append((x, y))
    return out


def shape_descriptors(mask, ppm):
    """Area, principal-axis extents, elongation and solidity. A linear wound is elongated and fairly solid; a lobulated keloid
    or an avulsion is not, and a suture line through it would be meaningless."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 30:
        raise ValueError("Kontur terlalu kecil.")
    pts = np.stack([xs, ys], 1).astype(float)
    c = pts - pts.mean(axis=0)
    w, vec = np.linalg.eigh(c.T @ c)
    major = (c @ vec[:, -1]).max() - (c @ vec[:, -1]).min()
    minor = (c @ vec[:, 0]).max() - (c @ vec[:, 0]).min()
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    hull = cv2.contourArea(cv2.convexHull(cnt))
    solidity = float(cv2.contourArea(cnt) / hull) if hull > 0 else 0.0
    elong = float(major / max(minor, 1e-6))
    return {"area_mm2": round(float(mask.sum()) / ppm ** 2, 1), "major_mm": round(major / ppm, 1), "minor_mm": round(minor / ppm, 1),
            "elongation": round(elong, 2), "solidity": round(solidity, 2), "linear": bool(elong >= 2.5 and solidity >= 0.6)}


def api_wound(req):
    need_image()
    img = STATE["img"]
    ppm = STATE["ppm"]
    if not ppm:
        raise ValueError("Skala belum ada. Wajah tidak terdeteksi: lakukan kalibrasi manual (klik dua titik dengan panjang yang diketahui).")
    ctx = req.get("context", {})
    mask, seg, line = None, None, None
    outline = _pts(req.get("outline"))
    if len(outline) >= 3:
        poly = np.array(outline, float)
        poly[:, 0] = np.clip(poly[:, 0], 0, img.shape[1] - 1)
        poly[:, 1] = np.clip(poly[:, 1], 0, img.shape[0] - 1)
        if cv2.contourArea(poly.astype(np.float32)) < 100:
            raise ValueError("Kontur kasar terlalu kecil atau hampir garis lurus; gambar poligon yang mengelilingi luka.")
        if req.get("no_ai"):
            m0 = np.zeros(img.shape[:2], np.uint8)
            cv2.fillPoly(m0, [np.round(poly).astype(np.int32).reshape(-1, 1, 2)], 1)
            mask, seg = m0 > 0, {"method": "kontur_klinisi_apa_adanya", "stability": None}
        elif sam_segment.available():
            mask, seg = sam_segment.segment_consensus(img, poly, _pts(req.get("pos")), _pts(req.get("neg")))
        else:
            import wound_segment as ws
            mask, ref = ws.segment(img, poly, ppm)
            seg = {"method": "grabcut" if ref else "outline_fallback"}
        if mask.sum() < 30:
            raise ValueError("Segmentasi menghasilkan area terlalu kecil; periksa garis kasar dan titik.")
        line = mr.centerline(mask, n=14)
    else:
        pts = _pts(req.get("points"))
        if len(pts) >= 2:
            line = np.array(pts, float)
            line[:, 0] = np.clip(line[:, 0], 0, img.shape[1] - 1)
            line[:, 1] = np.clip(line[:, 1], 0, img.shape[0] - 1)
    if line is None:
        raise ValueError("Tandai luka: klik titik sepanjang luka, atau gambar garis kasar di sekeliling luka.")
    if len(line) < 2 or float(np.linalg.norm(np.diff(line, axis=0), axis=1).sum()) < 3.0:
        raise ValueError("Garis luka terlalu pendek atau semua titik berimpit.")
    shape = shape_descriptors(mask, ppm) if mask is not None else None
    lm = STATE["lm"]
    rstl = req.get("rstl_deg")
    if lm is not None:
        rstl_ov = None if rstl in (None, "") else float(rstl)
        report, geo = wp.plan(lm, line, image=img, rstl_override_deg=rstl_ov, ppm_override=ppm)
        frame = geo["ff"]
    else:
        if rstl in (None, ""):
            raise ValueError("Wajah tidak terdeteksi: isi arah RSTL (derajat; 0 = horizontal pada foto, 90 = vertikal).")
        report = sp.geometry_noface(line, ppm, float(rstl), region=ctx.get("region", "cheek"))
        frame = mr.ImageFrame(ppm)
    if shape:
        report.update(shape)
    plan = sp.plan(report, ctx)
    layers = req.get("layers") or plan["marking_layers"]
    if shape and not shape["linear"]:
        layers = [x for x in layers if x not in ("suture_guide", "z_plasty", "w_plasty", "gblc", "ellipse")]
    if "suture_guide" not in layers and not req.get("layers") and plan["rencana_jahitan"]:
        layers = ["suture_guide"] + list(layers)
    OUT.mkdir(exist_ok=True)
    banner = []
    gate = STATE["gate"]
    if gate and gate["status"] != "PASS":
        txt = ("KUALITAS FOTO TIDAK LAYAK: titik wajah, skala dan wilayah mungkin tidak andal; periksa." if gate["status"] == "CANNOT_ASSESS"
               else "Kualitas foto: ada peringatan; periksa skala dan wilayah.")
        banner.append((txt, (60, 60, 240) if gate["status"] == "CANNOT_ASSESS" else (0, 200, 240)))
    if seg and seg.get("warning"):
        banner.append(("KONTUR TIDAK STABIL: periksa manual.", (0, 200, 240)))
    g = mr.draw(img, frame, line, report, plan, layers, OUT / "rencana_marking.png", mask=mask, banner=banner,
            spacing_mm=float(req.get("spacing_mm", 4.0)), bite_mm=float(req.get("bite_mm", 3.0)),
            z_angle=int(req.get("z_angle", 60)), wplasty_limb=float(req.get("w_limb", 6.0)))
    c = g["centre"]
    p0, p1 = frame.to_px(c[None])[0], frame.to_px((c + g["rstl_dir"])[None])[0]
    STATE["last"] = {"mask": mask, "ppm": ppm, "rstl_angle_deg": math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0])) % 180,
                     "suture_px": [frame.to_px(x["centre"][None])[0].tolist() for x in g.get("suture", [])],
                     "excision_px": frame.to_px(g["ellipse"]).tolist() if "ellipse" in g else None,
                     "top_techniques": [t["nama"] for t in plan["teknik"]], "report": report, "plan": plan, "ctx": ctx, "scale_note": STATE["ppm_source"] or ""}
    rep_out = {k: v for k, v in report.items() if k not in ("segments",)}
    (OUT / "rencana_marking.json").write_text(json.dumps({"report": rep_out, "plan": plan, "segmentation": seg, "scale": [ppm, STATE["ppm_source"]]},
                                                       indent=2, default=float, ensure_ascii=False), encoding="utf-8")
    after_mode = None
    if mask is not None:
        try:
            after_mode = ai.render(img, frame, mask, line, plan, report, g, OUT / "ilustrasi_setelah.png")
        except Exception:                                            # noqa: BLE001  (illustration is optional; never break the plan)
            traceback.print_exc()
    after_img = data_url(cv2.imread(str(OUT / "ilustrasi_setelah.png"))) if after_mode else None
    return {"image": data_url(cv2.imread(str(OUT / "rencana_marking.png"))), "after_image": after_img, "report": rep_out, "plan": plan, "segmentation": seg,
            "gate": None if not gate else {"status": gate["status"], "failures": [f["message"] for f in gate["failures"]]},
            "layers": layers, "ppm": ppm, "ppm_source": STATE["ppm_source"]}


def api_surgeon_compare(req):
    last = STATE.get("last")
    if not last:
        raise ValueError("Jalankan Buat rencana marking dulu (hasil alat disimpan di server, tidak ditampilkan bila mode buta).")
    surg = {}
    if req.get("contour_px") and len(req["contour_px"]) >= 3:
        surg["contour_px"] = req["contour_px"]
    if req.get("rstl") and len(req["rstl"]) == 2:
        surg["rstl_angle_deg"] = sc.line_angle(*req["rstl"])
    if req.get("sutures"):
        surg["suture_px"] = req["sutures"]
    if req.get("excision_px") and len(req["excision_px"]) >= 3:
        surg["excision_px"] = req["excision_px"]
    if req.get("technique"):
        surg["technique"] = req["technique"]
    if not surg:
        raise ValueError("Belum ada marking ahli yang digambar.")
    tool = {k: last[k] for k in ("rstl_angle_deg", "suture_px", "excision_px", "top_techniques")}
    tool["mask"] = last["mask"]
    metrics = sc.compare(tool, surg, STATE["img"].shape[:2], last["ppm"])
    OUT.mkdir(exist_ok=True)
    sc.append_csv(OUT / "validasi_ahli.csv", req.get("case_id") or STATE["name"], req.get("surgeon_id") or "ahli", metrics)
    return {"metrics": metrics, "summary_all_cases": sc.summarize(OUT / "validasi_ahli.csv"), "csv": str(OUT / "validasi_ahli.csv")}


def api_fhir(req):
    last = STATE.get("last")
    if not last:
        raise ValueError("Buat rencana marking dulu; ekspor FHIR memakai hasil terakhir.")
    pseudo = "".join(ch for ch in str(req.get("pseudonym") or "pseudo-001") if ch.isalnum() or ch in "-.")[:60] or "pseudo-001"
    bundle = fx.build_bundle(pseudo, last["report"], last["plan"], last["ctx"], "scale: " + last["scale_note"])
    fx.validate(bundle)                                        # refuse to hand out an invalid resource
    OUT.mkdir(exist_ok=True)
    (OUT / "ekspor_fhir.json").write_text(json.dumps(bundle, indent=2, default=float), encoding="utf-8")
    return {"bundle": json.loads(json.dumps(bundle, default=float)), "saved": str(OUT / "ekspor_fhir.json")}


_LIB = {}


def api_enrich(req):
    genes = [g for g in str(req.get("genes", "")).replace(",", " ").replace(";", " ").split() if g]
    if len(genes) < 5:
        raise ValueError("Masukkan minimal 5 simbol gen (dipisah spasi, koma, atau baris baru).")
    if len(genes) > 3000:
        raise ValueError("Maksimal 3000 gen.")
    if "lib" not in _LIB:
        _LIB["lib"] = en.load_library()
    r = en.ora(genes, _LIB["lib"])
    top = [{"term": t["term"], "overlap": t["overlap"], "set_size": t["set_size"], "fdr": t["fdr"], "odds_ratio": t["odds_ratio"], "genes": t["genes"][:12]} for t in r["table"][:15]]
    return {"top": top, "n_query": r["n_query"], "n_in_universe": r["n_in_universe"], "unknown_symbols": r["unknown_symbols"][:50],
            "significant_count": len(r.get("significant", [])), "universe_size": r["universe_size"], "library": "Reactome_2022 (Enrichr), BH-FDR, hypergeometric",
            "caveat": r.get("caveat", "")}


def api_context(req):
    c = cc.condition_context(str(req.get("condition", "")))
    if c is None:
        raise ValueError("Kondisi tidak ada di snapshot (tersedia: keloid, cleft lip, Bell palsy, acne vulgaris).")
    return c


def zone_of(lab_map, x, y):
    if lab_map is None:
        return None
    h, w = lab_map.shape
    x, y = int(round(x)), int(round(y))
    if not (0 <= x < w and 0 <= y < h) or lab_map[y, x] == 0:
        return "di luar atlas wajah"
    return fz.NAMES[lab_map[y, x] - 1]


def api_acne(req):
    need_image()
    img, lm = STATE["img"], STATE["lm"]
    if lm is not None:
        rep, maps = ac.analyse(img, lm)
    else:
        rep, maps = ac.analyse(img, None, 1.0 / STATE["ppm"] if STATE["ppm"] else None)
    if maps is None:
        raise ValueError(rep.get("reason", "Tidak dapat dianalisis."))
    lab = maps["lab"]
    items = []
    for i, l in enumerate(rep["lesions"], 1):
        items.append({"id": i, "x": l["x"], "y": l["y"], "r_px": round(l["radius_mm"] * rep["px_per_mm"], 1), "class": l["class"],
                      "zone": zone_of(lab, l["x"], l["y"]), "source": "otomatis"})
    return {"lesions": items, "mode": rep["mode"], "px_per_mm": rep["px_per_mm"], "caveats": rep["caveats"]}


def api_acne_export(req):
    need_image()
    lab = None
    if STATE["lm"] is not None:
        ff = wp.FaceFrame(STATE["lm"])
        lab = fz.build(ff.to_mm(STATE["lm"]), ff, STATE["img"].shape[:2])
    out, per_zone = [], {}
    for i, l in enumerate(req["lesions"], 1):
        z = zone_of(lab, l["x"], l["y"])
        per_zone[z or "tanpa zona"] = per_zone.get(z or "tanpa zona", 0) + 1
        out.append({"id": i, "x": l["x"], "y": l["y"], "kelas": l.get("class", "manual"), "zona": z, "sumber": l.get("source", "manual")})
    OUT.mkdir(exist_ok=True)
    (OUT / "jerawat_terkonfirmasi.json").write_text(json.dumps({"jumlah": len(out), "per_zona": per_zone, "lesi": out}, indent=2, ensure_ascii=False), encoding="utf-8")
    cv2.imwrite(str(OUT / "jerawat_terkonfirmasi.png"), _draw_lesions(STATE["img"], req["lesions"]))
    return {"jumlah": len(out), "per_zona": per_zone, "disimpan": str(OUT / "jerawat_terkonfirmasi.json")}


def _draw_lesions(img, lesions):
    vis = img.copy()
    for i, l in enumerate(lesions, 1):
        r = int(max(6, l.get("r_px", 8) * 1.4))
        cv2.circle(vis, (int(l["x"]), int(l["y"])), r, (60, 60, 230), max(2, vis.shape[1] // 700), cv2.LINE_AA)
        cv2.putText(vis, str(i), (int(l["x"]) + r, int(l["y"]) - r), cv2.FONT_HERSHEY_SIMPLEX, max(0.5, vis.shape[1] / 2500), (255, 255, 255), 2, cv2.LINE_AA)
    return vis


def api_lines(req):
    need_image()
    if STATE["lm"] is None:
        raise ValueError("Peta garis memerlukan wajah frontal yang terdeteksi.")
    g = STATE["gate"]
    if g["status"] == "CANNOT_ASSESS" and not req.get("force"):
        return {"refused": True, "gate": g}
    rep, maps = wa.analyse(STATE["img"], STATE["lm"])
    if maps is None:
        raise ValueError(rep["reason"])
    OUT.mkdir(exist_ok=True)
    wa.draw_heatmap(STATE["img"], STATE["lm"], rep, maps, OUT / "garis.png", min_width=1400)
    return {"image": data_url(cv2.imread(str(OUT / "garis.png"))),
            "zones": {z: {k: v[k] for k in ("fine_density_mm_per_cm2", "fold_density_mm_per_cm2", "fine_length_mm", "fold_length_mm", "status")} for z, v in rep["zones"].items()}}


ROUTES = {"/api/load": api_load, "/api/calibrate": api_calibrate, "/api/face": api_face, "/api/wound": api_wound,
          "/api/surgeon_compare": api_surgeon_compare, "/api/fhir": api_fhir, "/api/enrich": api_enrich, "/api/context": api_context, "/api/acne": api_acne, "/api/acne/export": api_acne_export, "/api/lines": api_lines}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self._send(200, (Path(__file__).parent / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif path == "/api/status":
            self._send(200, json.dumps({"sam": sam_segment.available(), "face_model": Path(MODEL).is_file(), "has_image": STATE["img"] is not None}))
        else:
            self._send(404, "{}")

    def do_POST(self):
        fn = ROUTES.get(urlparse(self.path).path)
        if fn is None:
            return self._send(404, "{}")
        try:
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n) or b"{}")
            with LOCK:
                res = fn(req)
            self._send(200, json.dumps(res, default=float))
        except ValueError as e:
            self._send(400, json.dumps({"error": str(e)}))
        except Exception as e:                                       # noqa: BLE001
            traceback.print_exc()
            self._send(500, json.dumps({"error": f"{type(e).__name__}: {e}"}))


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Aplikasi berjalan di http://127.0.0.1:{PORT}  (hanya komputer ini)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
