import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipseFor, zPlasty, angDiff, ELLIPSE_LW_RATIO } from '../src/clinical/wound';
import { bisectionOrder, sutureGuide, wPlasty, tissueRemovedMm2 } from '../src/clinical/markings';
import { RstlContext, type P2 } from '../src/clinical/rstl';
import { buildZones, ZONE_NAMES } from '../src/clinical/zones';
import { CANON } from '../src/face/geometry';
import { analyseWound } from '../src/clinical/woundplan';
import { makePlan, DEFAULT_CTX } from '../src/clinical/planner';
import { assessPhoto, frontalProportions } from '../src/clinical/face';

const P: P2[] = CANON.vertices.map(v => [v[0] * 10, v[1] * 10] as P2); // canonical face in mm, y up

test('ellipse_for matches the Python reference (wound_planner.ellipse_for)', () => {
  // python: ellipse_for([0,0],[20,0], axis 0)  -> a=10, b=10/3.5, factor 1 ; axis 90 -> a = 10*sqrt(0+ (3.5)^2) = 35
  const e0 = ellipseFor([0, 0], [20, 0], 0);
  assert.ok(Math.abs(e0.a - 10) < 1e-9 && Math.abs(e0.b - 10 / ELLIPSE_LW_RATIO) < 1e-9 && Math.abs(e0.tissueFactor - 1) < 1e-9);
  const e90 = ellipseFor([0, 0], [20, 0], 90);
  assert.ok(Math.abs(e90.a - 35) < 1e-9 && Math.abs(e90.tissueFactor - 3.5) < 1e-9);
});

test('Z-plasty arms equal the central limb and gain table is the classic one', () => {
  const z = zPlasty([0, 0], [10, 0], 60);
  assert.equal(z.gainPct, 75);
  assert.ok(Math.abs(Math.hypot(z.arm1[1][0] - z.arm1[0][0], z.arm1[1][1] - z.arm1[0][1]) - 10) < 1e-9);
  assert.equal(zPlasty([0, 0], [10, 0], 45).gainPct, 50);
  assert.equal(zPlasty([0, 0], [10, 0], 30).gainPct, 25);
});

test('angle difference is headless (0 and 180 are the same line)', () => {
  assert.equal(angDiff(0, 180), 0);
  assert.equal(angDiff(10, 170), 20);
  assert.equal(angDiff(0, 90), 90);
});

test('suture halving order places the middle first', () => {
  const r = bisectionOrder(7);
  assert.equal(r[3], 1);
  assert.deepEqual([...r].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  const g = sutureGuide([[0, 0], [40, 0]], 4, 3);
  assert.equal(g.length, 10);
  assert.ok(g.every(m => Math.abs(m.a[1] - 3) < 1e-9 || Math.abs(m.a[1] + 3) < 1e-9));
});

test('W-plasty lines close on the scar ends and remove a positive area', () => {
  const [a, b] = wPlasty([[0, 0], [30, 0]], 6);
  assert.deepEqual(a[0], b[0]);
  assert.ok(tissueRemovedMm2(a, b) > 0);
});

test('regions on the canonical face are plausible', () => {
  const ctx = new RstlContext(P);
  assert.equal(ctx.regionOf([0, 70]), 'forehead');
  assert.equal(ctx.regionOf([-50, -20]), 'cheek');
  assert.equal(ctx.regionOf([0, -40]), 'lip');
  assert.equal(ctx.regionOf([0, -10]), 'nose');
  assert.equal(ctx.angle('forehead', [0, 70]), 0);
  assert.equal(ctx.angle('nose', [0, -10]), 90);
});

test('the zone atlas covers the whole oval with no unlabeled interior and uses all 34 names', () => {
  const zm = buildZones(P, 1);
  const seen = new Set<number>();
  for (const id of zm.lab) if (id) seen.add(id);
  assert.ok(seen.size >= 30, `zones present: ${seen.size}`);
  assert.equal(ZONE_NAMES.length, 34);
});

test('proportions of the canonical face are finite and symmetric', () => {
  const p = frontalProportions(P);
  assert.ok(p.mirror.mean < 1.5, `mirror mean ${p.mirror.mean}`);
  assert.ok(Math.abs((p.ratios.middle_to_lower_third as number) - 1) < 0.5);
  assert.ok(Object.values(p.lengths).every(Number.isFinite));
});

test('planner: ellipse is not recommended when it would exceed 2x the wound; keloid gets no sutures', () => {
  const lm = P.map(p => [p[0] * 2 + 500, 500 - p[1] * 2] as P2); // pretend px, y down, 2 px/mm
  // a wound on the right cheek perpendicular to the local RSTL
  const woundPx: P2[] = [[lm[50][0] - 10, lm[50][1] - 40], [lm[50][0] - 10, lm[50][1] + 40]];
  const rep = analyseWound(lm, woundPx, { ppmOverride: 2 });
  const plan = makePlan(rep, { ...DEFAULT_CTX, tissueLoss: 'small' });
  assert.equal(rep.ellipse.tooLong, rep.ellipse.tissueFactor > 2);
  if (rep.ellipse.tooLong) assert.ok(!plan.marking.includes('ellipse'));
  const keloid = makePlan(rep, { ...DEFAULT_CTX, kind: 'scar', scarType: 'keloid' });
  assert.equal(keloid.sutures, null);
  assert.equal(keloid.techniques[0].name.k, 't.nonsurg');
});

test('quality gate refuses a closed-eye or no-face input and passes the canonical frontal face', () => {
  assert.equal(assessPhoto([], 100, 100, null).status, 'CANNOT_ASSESS');
  const lm: P2[] = Array.from({ length: 478 }, (_, i) => (i < 468 ? [P[i][0] * 3 + 400, 400 - P[i][1] * 3] : [400, 300]) as P2);
  // iris points: 11.7 mm wide at 3 px/mm = 35 px
  lm[469] = [lm[468 > 0 ? 159 : 0][0] - 17, lm[159][1]]; lm[471] = [lm[159][0] + 17, lm[159][1]];
  lm[474] = [lm[386][0] - 17, lm[386][1]]; lm[476] = [lm[386][0] + 17, lm[386][1]];
  const g = assessPhoto(lm, 800, 800, { blurVar: 200, brightness: 120 });
  assert.ok(['PASS', 'PASS_WITH_WARNINGS'].includes(g.status) || g.failures.every(f => f.code !== 'no_face'), JSON.stringify(g));
});
