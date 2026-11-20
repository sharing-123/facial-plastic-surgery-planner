"""One-shot full-face report for a frontal photo with COVERAGE ACCOUNTING.

Runs the quality gate, the zone atlas, rest symmetry and proportions, fine lines/folds and red-spot
counts, then writes a coverage.json that lists, for every zone and module, whether it was analysed,
low-confidence or NOT analysed (and why), plus the parts of the head that are outside the atlas.

"No gaps" here means no SILENT gaps: whatever could not be assessed is listed as not assessed, never as
normal. It does not mean every possible problem was found. Detectors are unvalidated; see each module.
"""
import argparse
import json
from pathlib import Path

import numpy as np

import acne_lesions as ac
import face_zones as fz
import smile_symmetry as ss
import wound_planner as wp
import wrinkle_analysis as wa
from overlay import draw_overlay
from quality_gate import REFUSE, assess


def run_all(image_bgr, landmarks_px, out_dir=None):
    gate = assess(landmarks_px[None], image=image_bgr)
    if gate["status"] == REFUSE:
        return {"status": "CANNOT_ASSESS", "quality_gate": gate}, None
    ff = wp.FaceFrame(landmarks_px)
    lab = fz.build(ff.to_mm(landmarks_px), ff, image_bgr.shape[:2])
    base = ss.analyze_photo(landmarks_px[None])
    base["quality_gate"] = gate
    rw, mw = wa.analyse(image_bgr, landmarks_px)
    ra, ma = ac.analyse(image_bgr, landmarks_px)
    status = {"lines": rw["module_status"] if mw else {}, "red_spots": ra["module_status"] if ma else {}}
    cov = fz.coverage(lab, ff.scale, status)
    n_zones = len(fz.NAMES)
    summary = {}
    for mod, st in status.items():
        c = {"analysed": 0, "low_confidence": 0, "not_analysed": 0}
        for z in fz.NAMES:
            if fz.IS_SKIN[z]:
                k = st.get(z, "not_analysed:missing").split(":")[0]
                c[k] = c.get(k, 0) + 1
        summary[mod] = c
    non_skin = [z for z in fz.NAMES if not fz.IS_SKIN[z]]
    rep = {"status": gate["status"], "quality_gate": gate, "px_per_mm": round(ff.scale, 2),
           "zones_in_atlas": n_zones, "skin_zones": n_zones - len(non_skin), "non_skin_zones_excluded": non_skin,
           "coverage_summary_per_module": summary, "coverage": cov,
           "rest_symmetry_and_proportions": {"static_rest": base["static_rest"], "frontal_proportions": base["frontal_proportions"]},
           "lines": {z: {k: v for k, v in rw["zones"][z].items()} for z in wa.SKIN_ZONES} if mw else None,
           "red_spots": {"totals": ra["totals"], "zones": ra["zones"]} if ma else None,
           "not_covered_at_all": fz.NOT_IN_ATLAS + ["dark marks / hyperpigmentation (detector unreliable, disabled)",
                                                    "acne grade and lesion type", "facial movement (needs the video protocol)"],
           "caveats": ["Coverage = nothing silently skipped, not 'nothing missed'.", "All detectors unvalidated against clinicians."]}
    if out_dir:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        draw_overlay(image_bgr, landmarks_px, base, out / "proportions_symmetry.png", min_width=1400)
        wa.draw_heatmap(image_bgr, landmarks_px, rw, mw, out / "lines.png", min_width=1400)
        ac.draw(image_bgr, ra, ma, out / "red_spots.png", min_width=1400)
        (out / "coverage_report.json").write_text(json.dumps(rep, indent=2, default=float), encoding="utf-8")
    return rep, {"lab": lab}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image")
    ap.add_argument("--model", default="face_landmarker.task")
    ap.add_argument("--out", default="full_report_output")
    args = ap.parse_args()
    lm, img = ss.extract_landmarks_image(args.image, args.model)
    rep, _ = run_all(img, lm[0], args.out)
    if rep["status"] == "CANNOT_ASSESS":
        print("TIDAK DAPAT DINILAI:", *[f["message"] for f in rep["quality_gate"]["failures"]], sep="\n  - ")
        return
    print(json.dumps({"coverage_summary_per_module": rep["coverage_summary_per_module"],
                      "not_covered_at_all": rep["not_covered_at_all"]}, indent=2))


if __name__ == "__main__":
    main()
