"""Bioinformatics tests: enrichment statistics against analytic values, FDR, positive and negative biological controls,
FHIR validity, coding tables and the Open Targets snapshot sanity."""
import json

import numpy as np
from scipy.stats import hypergeom

from bioinfo import clinical_coding as cc
from bioinfo import enrichment as en
from bioinfo import fhir_export as fx
import surgical_planner as sp


def test_bh_fdr_matches_hand_calculation_and_is_monotone():
    p = [0.01, 0.04, 0.03, 0.005, 0.5]
    q = en.bh_fdr(p)
    # sorted p: .005 .01 .03 .04 .5 -> p*n/rank = .025 .025 .05 .05 .5 ; cumulative min from the end keeps them
    assert np.allclose(q, [0.025, 0.05, 0.05, 0.025, 0.5], atol=1e-12)
    assert (np.diff(np.sort(q)) >= -1e-12).all() and q.max() <= 1.0


def test_ora_p_value_equals_hypergeometric_survival_function():
    lib = {"A": {f"G{i}" for i in range(10)}, "B": {f"G{i}" for i in range(10, 40)}, "C": {f"H{i}" for i in range(50)}}
    query = [f"G{i}" for i in range(8)] + ["G12", "X1"]
    r = en.ora(query, lib, min_size=5, min_overlap=1)
    row = {x["term"]: x for x in r["table"]}
    N = len(set().union(*lib.values()))
    assert r["unknown_symbols"] == ["X1"] and r["n_in_universe"] == 9
    assert abs(row["A"]["p_value"] - hypergeom.sf(8 - 1, N, 10, 9)) < 1e-15 and row["A"]["overlap"] == 8
    assert row["A"]["fdr"] <= row["B"]["fdr"] and r["table"][0]["term"] == "A"


def test_alias_and_empty_query_are_handled():
    lib = {"ECM": {"CCN2", "COL1A1", "FN1", "TGFB1", "MMP2", "LOX"}}
    r = en.ora(["CTGF", "COL1A1", "FN1", "TGFB1", "MMP2"], lib, min_size=3)
    assert r["table"][0]["overlap"] == 5 and r["unknown_symbols"] == []
    assert en.ora([], lib)["table"] == []


def test_keloid_fibrosis_signature_recovers_extracellular_matrix_and_tgfb_pathways():
    lib = en.load_library()
    sig = ["COL1A1", "COL1A2", "COL3A1", "COL5A1", "COL5A2", "FN1", "TGFB1", "TGFB2", "SMAD3", "CCN2", "MMP2", "MMP9", "SERPINE1", "LOX", "POSTN", "FBN1", "VCAN", "THBS1", "ITGA5", "ITGB1", "BGN", "DCN", "SPARC"]
    r = en.ora(sig, lib)
    sig_terms = " | ".join(r["significant"]).lower()
    assert r["n_in_universe"] >= 20
    assert "extracellular matrix organization" in sig_terms and "collagen" in sig_terms, r["significant"][:8]
    assert r["table"][0]["fdr"] < 1e-6


def test_random_gene_lists_rarely_give_false_positives():
    lib = en.load_library()
    universe = sorted(set().union(*lib.values()))
    rng = np.random.default_rng(0)
    hits = 0
    for _ in range(60):
        genes = rng.choice(universe, size=25, replace=False).tolist()
        if en.ora(genes, lib)["significant"]:
            hits += 1
    assert hits / 60 <= 0.05, hits                      # measured null rate with the correct BH family: 0.7% (25 genes), 0.3% (100 genes), 300 draws each


def test_coding_tables():
    assert cc.code_wound_or_scar("laserasi_baru", "cheek")[0]["code"] == "S01.4"
    assert cc.code_wound_or_scar("laserasi_baru", "lip")[0]["code"] == "S01.5"
    assert cc.code_wound_or_scar("laserasi_baru", "periorbital")[0]["code"] == "S01.1"
    assert any(c["code"] == "HP:0010562" for c in cc.code_wound_or_scar("parut", "chin", "keloid"))
    assert cc.code_wound_or_scar("parut", "chin", "linear_melebar")[0]["code"] == "L90.5"
    assert {c["code"] for c in cc.OTHER["cleft_lip_unilateral"]} == {"Q36.9", "HP:0100333"}


def test_open_targets_snapshot_is_sane_and_has_provenance():
    for name, must in (("keloid", {"NEDD4"}), ("cleft lip", {"IRF6"})):
        c = cc.condition_context(name)
        assert c and c["retrieved"] and c["source"].startswith("https://api.platform.opentargets.org")
        scores = [t["score"] for t in c["top_targets"]]
        assert scores == sorted(scores, reverse=True) and all(0 < s <= 1 for s in scores)
        assert must <= {t["symbol"] for t in c["top_targets"]}, (name, [t["symbol"] for t in c["top_targets"]][:8])
    assert cc.condition_context("hypertrophic scar") is None          # the mis-resolved search was dropped, never stored


def test_fhir_bundle_validates_and_is_marked_unconfirmed():
    rep = sp.geometry_noface([[0, 0], [100, 40]], 5.0, 10.0, "cheek")
    rep["area_mm2"] = 120.5
    plan = sp.plan(rep, {"kind": "laserasi_baru", "depth": "subkutan"})
    b = fx.build_bundle("pseudo-001", rep, plan, {"kind": "laserasi_baru"}, "scale from manual calibration")
    parsed = fx.validate(b)
    kinds = [e.resource.__class__.__name__ for e in parsed.entry]
    assert kinds.count("Observation") == 4 and "Condition" in kinds and "Patient" in kinds
    obs = [e.resource for e in parsed.entry if e.resource.__class__.__name__ == "Observation"]
    assert {o.valueQuantity.code for o in obs} == {"mm", "deg", "mm2", "{count}"} and all(o.valueQuantity.system == "http://unitsofmeasure.org" for o in obs)
    cond = [e.resource for e in parsed.entry if e.resource.__class__.__name__ == "Condition"][0]
    assert cond.verificationStatus.coding[0].code == "unconfirmed" and cond.code.coding[0].code == "S01.4"
    assert "name" not in json.dumps(b).lower().replace("pseudonym", "")                  # no personal name field anywhere


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
