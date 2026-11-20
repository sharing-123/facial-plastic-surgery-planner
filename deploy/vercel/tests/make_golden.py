"""Generates golden.json from the Python implementation (surgical_planner, markings). The Node parity test then checks that
the browser library (public/lib.js) reproduces it. Run from the repository root:  python deploy/vercel/tests/make_golden.py"""
import json
import os
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, ROOT)
import markings as mk  # noqa: E402
import surgical_planner as sp  # noqa: E402

rng = np.random.default_rng(11)
REGIONS = ["cheek", "forehead", "brow", "periorbital", "nose", "lip", "perioral", "chin", "glabella", "outside_face_oval"]
CTX = [{"kind": "laserasi_baru", "depth": "subkutan"}, {"kind": "laserasi_baru", "mechanism": "gigitan", "depth": "otot_fascia", "contamination": "berat", "hours": 30},
       {"kind": "laserasi_baru", "tissue_loss": "kecil", "depth": "subkutan"}, {"kind": "laserasi_baru", "tissue_loss": "bermakna"},
       {"kind": "laserasi_baru", "age_years": 6, "mechanism": "tumpul_remuk"}, {"kind": "parut", "scar_type": "kontraktur_web", "scar_months": 18},
       {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 14}, {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 3},
       {"kind": "parut", "scar_type": "keloid"}, {"kind": "parut", "scar_type": "hipertrofik", "scar_months": 20}, {"kind": "parut", "scar_type": "cekung"}]
cases = []
for i in range(120):
    n = int(rng.integers(2, 6))
    pts = (rng.random((n, 2)) * [900, 700] + 50).round(1)
    ppm = float(rng.choice([2.5, 4.0, 6.6, 9.0]))
    rstl = round(float(rng.uniform(0, 180)), 1)
    region = REGIONS[int(rng.integers(len(REGIONS)))]
    rep = sp.geometry_noface(pts.tolist(), ppm, rstl, region)
    if i % 7 == 0:
        rep.update(linear=False, elongation=1.4, solidity=0.7)
    if i % 5 == 0:
        rep["critical_borders"] = [{"structure": "vermilion_border", "min_distance_mm": 0.0, "crosses": True}]
    ctx = dict(CTX[int(rng.integers(len(CTX)))])
    plan = sp.plan(rep, ctx)
    sut = plan["rencana_jahitan"]
    cases.append({"points_px": pts.tolist(), "ppm": ppm, "rstl": rstl, "region": region,
                  "extra": {k: rep[k] for k in ("linear", "elongation", "solidity", "critical_borders") if k in rep}, "ctx": ctx,
                  "py_report": {k: rep[k] for k in ("length_mm", "chord_mm", "tortuosity", "mean_angle_to_rstl_deg", "elliptical_excision")},
                  "py_plan": {"wilayah": plan["wilayah"], "teknik": [t["nama"] for t in plan["teknik"]], "marking_layers": sorted(plan["marking_layers"]),
                              "flags": plan["peringatan_merah"], "notes": plan["catatan"],
                              "sut": None if sut is None else {"kulit": sut["perkiraan_jumlah_jahitan_kulit"], "dalam": sut["perkiraan_jumlah_jahitan_dalam"],
                                                               "lepas": sut["lepas_jahitan"], "n_lapisan": len(sut["lapisan"]), "bahan_kulit": sut["lapisan"][-1]["bahan"]}}})
geo = []
for Q in ([[0, 0], [20, 0], [20, 20]], [[0, 0], [60, 5]], [[0, 0], [10, 10], [25, 8], [40, 20]], [[3, 4], [33, 4]], [[0, 0], [45, 0]]):
    Q = np.array(Q, float)
    g = mk.suture_guide(Q, 4.0, 3.0)
    wa, wb = mk.w_plasty(Q, 6.0)
    z = mk.z_plasty_series(Q, 60, 15.0)
    geo.append({"Q": Q.tolist(), "sutures": [{"order": s["order"], "centre": s["centre"].tolist(), "a": s["a"].tolist(), "b": s["b"].tolist()} for s in g],
                "w": [wa.tolist(), wb.tolist()],
                "z": [{"central": [p.tolist() for p in x["central"]], "arm_1": [p.tolist() for p in x["arm_1"]], "arm_2": [p.tolist() for p in x["arm_2"]],
                       "limb_mm": x["limb_mm"], "gain": x["gain_percent"]} for x in z]})
json.dump({"cases": cases, "geo": geo}, open(os.path.join(os.path.dirname(__file__), "golden.json"), "w"))
print("golden:", len(cases), "plan cases,", len(geo), "geometry fixtures")
