"""Rule and geometry tests for the planner and the marking drawings (no images needed)."""
import math

import numpy as np

import markings as mk
import surgical_planner as sp

BASE = {"length_mm": 28.0, "chord_mm": 27.0, "regions_crossed": ["cheek"], "mean_angle_to_rstl_deg": 70.0,
        "critical_borders": [], "elliptical_excision": {"axis_deg": 55.0, "half_length_mm": 40.0, "half_width_mm": 11.4,
                                                          "length_to_width": 3.5, "tissue_sacrifice_factor_vs_wound_half_length": 2.8, "warning": "x"}}


def rep(**kw):
    r = dict(BASE)
    r.update(kw)
    return r


def names(p):
    return [t["nama"] for t in p["teknik"]]


def test_clean_fresh_laceration_gets_primary_layered_closure_and_unfavourable_note():
    p = sp.plan(rep(), {"kind": "laserasi_baru", "depth": "subkutan"})
    assert names(p)[0].startswith("Penutupan primer berlapis")
    assert any("tegak lurus" in n for n in p["catatan"])
    assert p["marking_layers"] == ["suture_guide"]
    assert len(p["rencana_jahitan"]["lapisan"]) == 2


def test_red_flags_for_depth_bite_contamination_and_cheek():
    p = sp.plan(rep(), {"kind": "laserasi_baru", "mechanism": "gigitan", "depth": "otot_fascia", "contamination": "berat", "hours": 30})
    text = " ".join(p["peringatan_merah"])
    assert "Struktur dalam" in text and "gigitan" in text and "tertunda" in text and "parotis" in text


def test_impractical_ellipse_is_not_recommended_for_a_fresh_wound():
    p = sp.plan(rep(), {"kind": "laserasi_baru", "depth": "subkutan", "tissue_loss": "kecil"})        # factor 2.8
    assert not any("elips" in n for n in names(p)) and "ellipse" not in p["marking_layers"]
    assert any("tidak disarankan" in n for n in p["catatan"])
    ok = dict(BASE["elliptical_excision"], tissue_sacrifice_factor_vs_wound_half_length=1.4)
    p2 = sp.plan(rep(elliptical_excision=ok), {"kind": "laserasi_baru", "depth": "subkutan", "tissue_loss": "kecil"})
    assert any("elips" in n for n in names(p2)) and "ellipse" in p2["marking_layers"]


def test_tissue_loss_switches_to_reconstruction_without_suture_guide():
    p = sp.plan(rep(), {"kind": "laserasi_baru", "tissue_loss": "bermakna"})
    assert p["teknik"][0]["nama"].startswith("Rekonstruksi defek") and p["marking_layers"] == []
    assert any("tegangan" in f for f in p["peringatan_merah"])


def test_lip_and_eyelid_specifics():
    lip = sp.plan(rep(regions_crossed=["lip"], critical_borders=[{"structure": "vermilion_border", "min_distance_mm": 0.0, "crosses": True}]),
                  {"kind": "laserasi_baru", "depth": "subkutan"})
    assert lip["rencana_jahitan"]["lapisan"][0]["lapis"].startswith("Mukosa")
    assert any("vermilion" in " ".join(n for n in lip["catatan"]) for _ in [0])
    eye = sp.plan(rep(regions_crossed=["periorbital"]), {"kind": "laserasi_baru", "depth": "subkutan"})
    assert eye["rencana_jahitan"]["lepas_jahitan"].startswith("3 sampai 5") and any("kanalikulus" in f for f in eye["peringatan_merah"])


def test_lip_rules_apply_when_a_line_crosses_lip_and_perioral_skin():
    p = sp.plan(rep(regions_crossed=["perioral", "lip"]), {"kind": "laserasi_baru", "depth": "subkutan"})
    assert p["wilayah"].startswith("bibir") and p["rencana_jahitan"]["lapisan"][0]["lapis"].startswith("Mukosa")


def test_scar_decisions_by_type_length_and_orientation():
    contr = sp.plan(rep(), {"kind": "parut", "scar_type": "kontraktur_web", "scar_months": 18})
    assert contr["teknik"][0]["nama"] == "Z-plasty" and "z_plasty" in contr["marking_layers"]
    long = sp.plan(rep(length_mm=45.0), {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 14})
    assert long["teknik"][0]["nama"].startswith("W-plasty") and {"w_plasty", "gblc"} <= set(long["marking_layers"])
    ok_ell = dict(BASE["elliptical_excision"], tissue_sacrifice_factor_vs_wound_half_length=1.6, half_length_mm=14.4, half_width_mm=4.1)
    short = sp.plan(rep(length_mm=18.0, elliptical_excision=ok_ell), {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 14})
    assert short["teknik"][0]["nama"].startswith("Eksisi elips")
    perp = sp.plan(rep(length_mm=18.0), {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 14})       # factor 2.8: ellipse impractical
    assert perp["teknik"][0]["nama"] == "Z-plasty" and "ellipse" not in perp["marking_layers"]
    aligned = sp.plan(rep(mean_angle_to_rstl_deg=12.0), {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 14})
    assert aligned["teknik"][0]["nama"].startswith("Observasi")
    keloid = sp.plan(rep(), {"kind": "parut", "scar_type": "keloid", "scar_months": 14})
    assert "non-bedah" in keloid["teknik"][0]["nama"] and keloid["marking_layers"] == []
    young = sp.plan(rep(), {"kind": "parut", "scar_type": "linear_melebar", "scar_months": 3})
    assert any("matang" in n for n in young["catatan"])


def test_child_gets_absorbable_skin_suture_and_counts_are_consistent():
    p = sp.plan(rep(length_mm=40.0), {"kind": "laserasi_baru", "depth": "subkutan", "age_years": 6})
    assert "absorbable" in p["rencana_jahitan"]["lapisan"][1]["bahan"]
    assert p["rencana_jahitan"]["perkiraan_jumlah_jahitan_kulit"] == 10 and p["rencana_jahitan"]["perkiraan_jumlah_jahitan_dalam"] == 6


def test_every_plan_states_its_limits():
    p = sp.plan(rep(), {"kind": "laserasi_baru"})
    assert p["hal_yang_tidak_diketahui_dari_foto"] and "belum divalidasi" in p["status"]


def test_bisection_order_is_a_permutation_starting_in_the_middle():
    for n in (1, 2, 5, 8, 13):
        r = mk.bisection_order(n)
        assert sorted(r) == list(range(1, n + 1))
    r = mk.bisection_order(7)
    assert r[3] == 1 and {r[1], r[5]} == {2, 3}


def test_suture_guide_spacing_count_and_perpendicular_bites():
    Q = np.array([[0.0, 0.0], [20.0, 0.0], [20.0, 20.0]])           # L-shaped, 40 mm
    g = mk.suture_guide(Q, spacing_mm=4.0, bite_mm=3.0)
    assert len(g) == 10
    for s in g:
        assert abs(np.linalg.norm(s["a"] - s["b"]) - 6.0) < 1e-6
    arcs = [s["arc_mm"] for s in g]
    assert abs((arcs[1] - arcs[0]) - 4.0) < 0.2 and arcs[0] > 1.5 and arcs[-1] < 38.5
    first = g[0]
    assert abs(first["a"][1] - first["b"][1]) > 5.9                    # on the first straight segment the bite is vertical


def test_w_plasty_teeth_are_offset_and_have_expected_height():
    Q = np.array([[0.0, 0.0], [36.0, 0.0]])
    a, b = mk.w_plasty(Q, limb_mm=6.0)
    assert abs(a[:, 1].max() - 6.0 * math.sin(math.radians(60))) < 1e-6 and abs(b[:, 1].min() + 6.0 * math.sin(math.radians(60))) < 1e-6
    xs_a = {round(x, 3) for x, y in a if y > 0}
    xs_b = {round(x, 3) for x, y in b if y < 0}
    assert not (xs_a & xs_b)                                            # teeth on the two sides are offset
    assert mk.tissue_removed_mm2(a, b) > 0


def test_gblc_is_deterministic_and_stays_near_the_scar():
    Q = np.array([[0.0, 0.0], [50.0, 0.0]])
    a, b = mk.geometric_broken_line(Q, seed=3), mk.geometric_broken_line(Q, seed=3)
    assert np.allclose(a, b) and np.abs(a[:, 1]).max() <= 5.0 + 1e-9
    assert abs(a[0][0]) < 1e-9 and abs(a[-1][0] - 50.0) < 1e-9


def test_z_plasty_series_splits_long_scars_into_practical_limbs():
    Q = np.array([[0.0, 0.0], [60.0, 0.0]])
    s = mk.z_plasty_series(Q, 60, limb_mm=15.0)
    assert len(s) == 4 and all(abs(z["limb_mm"] - 15.0) < 0.1 for z in s) and s[0]["gain_percent"] == 75
    ups = [np.sign(z["arm_1"][1][1]) for z in s]
    assert ups[0] != ups[1]                                            # sides alternate
    assert len(mk.z_plasty_series(np.array([[0.0, 0.0], [10.0, 0.0]]), 60)) == 1


def test_geometry_noface_matches_expected_angle_and_length():
    pts = [[100, 400], [100 + 80, 400]]                                  # 80 px horizontal at 8 px/mm = 10 mm
    r = sp.geometry_noface(pts, 8.0, rstl_deg=90.0)
    assert abs(r["length_mm"] - 10.0) < 0.05 and abs(r["mean_angle_to_rstl_deg"] - 90.0) < 0.5
    assert r["elliptical_excision"]["tissue_sacrifice_factor_vs_wound_half_length"] > 3.0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
