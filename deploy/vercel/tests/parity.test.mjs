// Node parity test: the browser library must reproduce the Python implementation. Run: node --test deploy/vercel/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const FP = require('../public/lib.js');
const G = JSON.parse(fs.readFileSync(new URL('./golden.json', import.meta.url)));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const norm = s => s.replace(/\d+(\.\d+)?/g, '#');

test('planner and geometry match Python on 120 randomised cases', () => {
  const mismatches = [];
  G.cases.forEach((c, i) => {
    const Q = c.points_px.map(p => [p[0] / c.ppm, -p[1] / c.ppm]);
    const rep = FP.geometry(Q, c.rstl, c.region); Object.assign(rep, c.extra);
    for (const k of ['length_mm', 'chord_mm', 'mean_angle_to_rstl_deg']) near(rep[k], c.py_report[k], 0.11, `case ${i} ${k}`);
    near(rep.elliptical_excision.half_length_mm, c.py_report.elliptical_excision.half_length_mm, 0.11, `case ${i} ellipse a`);
    near(rep.elliptical_excision.tissue_sacrifice_factor_vs_wound_half_length, c.py_report.elliptical_excision.tissue_sacrifice_factor_vs_wound_half_length, 0.011, `case ${i} factor`);
    const p = FP.plan(rep, c.ctx), g = c.py_plan, probs = [];
    if (p.wilayah !== g.wilayah) probs.push(['wilayah', p.wilayah, g.wilayah]);
    if (JSON.stringify(p.teknik.map(t => t.nama)) !== JSON.stringify(g.teknik)) probs.push(['teknik', p.teknik.map(t => t.nama), g.teknik]);
    if (JSON.stringify([...p.marking_layers].sort()) !== JSON.stringify(g.marking_layers)) probs.push(['layers', p.marking_layers, g.marking_layers]);
    if (JSON.stringify(p.peringatan_merah) !== JSON.stringify(g.flags)) probs.push(['flags', p.peringatan_merah.length, g.flags.length]);
    if (JSON.stringify(p.catatan.map(norm)) !== JSON.stringify(g.notes.map(norm))) probs.push(['notes', p.catatan.map(norm), g.notes.map(norm)]);
    if ((p.rencana_jahitan === null) !== (g.sut === null)) probs.push(['sut null', p.rencana_jahitan === null, g.sut === null]);
    else if (g.sut) {
      const s = p.rencana_jahitan;
      if (s.perkiraan_jumlah_jahitan_kulit !== g.sut.kulit || s.perkiraan_jumlah_jahitan_dalam !== g.sut.dalam || s.lepas_jahitan !== g.sut.lepas ||
          s.lapisan.length !== g.sut.n_lapisan || s.lapisan[s.lapisan.length - 1].bahan !== g.sut.bahan_kulit) probs.push(['sut', s, g.sut]);
    }
    if (probs.length) mismatches.push({ i, probs });
  });
  assert.equal(mismatches.length, 0, JSON.stringify(mismatches.slice(0, 3), null, 1));
});

test('suture guide, W-plasty and serial Z-plasty match Python', () => {
  G.geo.forEach((f, i) => {
    const g = FP.sutureGuide(f.Q, 4, 3);
    assert.equal(g.length, f.sutures.length, `fixture ${i} suture count`);
    g.forEach((s, j) => {
      assert.equal(s.order, f.sutures[j].order);
      for (const k of ['centre', 'a', 'b']) { near(s[k][0], f.sutures[j][k][0], 1e-6, `f${i} s${j} ${k}x`); near(s[k][1], f.sutures[j][k][1], 1e-6, `f${i} s${j} ${k}y`); }
    });
    const w = FP.wPlasty(f.Q, 6); assert.equal(w[0].length, f.w[0].length); assert.equal(w[1].length, f.w[1].length);
    for (const side of [0, 1]) w[side].forEach((p, j) => { near(p[0], f.w[side][j][0], 1e-6, 'w x'); near(p[1], f.w[side][j][1], 1e-6, 'w y'); });
    const z = FP.zSeries(f.Q, 60, 15); assert.equal(z.length, f.z.length);
    z.forEach((x, j) => {
      assert.equal(x.gain_percent, f.z[j].gain); near(x.limb_mm, f.z[j].limb_mm, 0.11, 'limb');
      for (const k of ['central', 'arm_1', 'arm_2']) x[k].forEach((p, m) => { near(p[0], f.z[j][k][m][0], 1e-6, `z ${k} x`); near(p[1], f.z[j][k][m][1], 1e-6, `z ${k} y`); });
    });
  });
});

test('surgeon matching: known shift, count difference, assignment optimality', () => {
  const tool = Array.from({ length: 10 }, (_, i) => [100 + 20 * i, 200]); const surg = tool.slice(0, 8).map(p => [p[0] + 5, p[1] + 5]);
  const m = FP.matchSutures(tool, surg, 5);
  assert.equal(m.count_difference, -2); assert.equal(m.matched, 8); near(m.median_distance_mm, Math.hypot(5, 5) / 5, 0.01, 'median');
  assert.deepEqual(FP.hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]).sort((a, b) => a[0] - b[0]).map(x => x[1]), [1, 0, 2]);
  near(FP.lineAngle([0, 0], [10, 10]), 45, 1e-9, 'angle');
});

test('shape descriptors separate a linear wound from a lobulated lesion', () => {
  const thin = FP.shapeOf([[0, 0], [40, 0], [40, 6], [0, 6]]); assert.equal(thin.linear, true); near(thin.area_mm2, 240, 0.1, 'area');
  const blob = FP.shapeOf([[0, 0], [30, 0], [30, 25], [0, 25]]); assert.equal(blob.linear, false);
});
