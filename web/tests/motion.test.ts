import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseMotion, measure, type Frame, type Pt } from '../src/studio/motion';
import { CANON } from '../src/face/geometry';

/** Canonical face in image coordinates (y down), 478 points with the iris points placed on the eye centres. */
function base(): Pt[] {
  const lm: Pt[] = CANON.vertices.map(v => [v[0] * 100 + 300, -v[1] * 100 + 300] as Pt);
  const eye = (a: number, b: number): Pt => [(lm[a][0] + lm[b][0]) / 2, (lm[a][1] + lm[b][1]) / 2];
  const r = eye(33, 133), l = eye(263, 362);
  while (lm.length < 478) lm.push([0, 0]);
  lm[468] = r; lm[469] = [r[0] - 5, r[1]]; lm[471] = [r[0] + 5, r[1]];
  lm[473] = l; lm[474] = [l[0] - 5, l[1]]; lm[476] = [l[0] + 5, l[1]];
  return lm;
}

/** A clip: 12 rest frames, then a ramp to the peak and back, with the given strengths per side. */
function clip(strength: { smile?: [number, number]; brow?: [number, number]; eye?: [number, number] }, roll = 0): Frame[] {
  const b = base();
  const frames: Frame[] = [];
  const cos = Math.cos((roll * Math.PI) / 180), sin = Math.sin((roll * Math.PI) / 180);
  for (let i = 0; i < 60; i++) {
    const k = i < 12 ? 0 : Math.sin(((i - 12) / 47) * Math.PI);
    const lm = b.map(p => [...p] as Pt);
    const ocw = Math.hypot(b[263][0] - b[33][0], b[263][1] - b[33][1]);
    const [sR, sL] = strength.smile ?? [0, 0];
    lm[61][1] -= 0.08 * ocw * sR * k; lm[291][1] -= 0.08 * ocw * sL * k;
    const [bR, bL] = strength.brow ?? [0, 0];
    for (const j of [105, 66, 107]) lm[j][1] -= 0.06 * ocw * bR * k;
    for (const j of [334, 296, 336]) lm[j][1] -= 0.06 * ocw * bL * k;
    const [eR, eL] = strength.eye ?? [0, 0];
    lm[159][1] += (lm[145][1] - lm[159][1]) * eR * k; lm[386][1] += (lm[374][1] - lm[386][1]) * eL * k;
    const c = lm[1];
    frames.push({ t: i / 10, lm: roll ? lm.map(p => [c[0] + (p[0] - c[0]) * cos - (p[1] - c[1]) * sin, c[1] + (p[0] - c[0]) * sin + (p[1] - c[1]) * cos] as Pt) : lm });
  }
  return frames;
}

test('smile: recovers a 40 percent weaker left corner', () => {
  const r = analyseMotion(clip({ smile: [1, 0.4] }));
  const s = r.moves.find(m => m.key === 'smile')!;
  assert.ok(s.seen);
  assert.ok(Math.abs(s.ratio! - 40) < 4, `ratio ${s.ratio}`);
  assert.equal(s.weaker, 'L');
  assert.ok(s.mm && s.mm.R > 0);
});

test('brow: recovers a 30 percent weaker right brow', () => {
  const b = analyseMotion(clip({ brow: [0.3, 1] })).moves.find(m => m.key === 'brow')!;
  assert.ok(b.seen && Math.abs(b.ratio! - 30) < 5, `ratio ${b.ratio}`);
  assert.equal(b.weaker, 'R');
});

test('eye closure: reports the closure fraction per side', () => {
  const e = analyseMotion(clip({ eye: [1, 0.6] })).moves.find(m => m.key === 'eye')!;
  assert.ok(e.seen && Math.abs(e.value.R - 1) < 0.05 && Math.abs(e.value.L - 0.6) < 0.06, JSON.stringify(e.value));
});

test('symmetric movement gives no weaker side, and rest gives "not seen"', () => {
  const s = analyseMotion(clip({ smile: [1, 1] })).moves.find(m => m.key === 'smile')!;
  assert.equal(s.weaker, 'none');
  const rest = analyseMotion(clip({}));
  assert.ok(rest.moves.every(m => !m.seen && m.ratio === null));
});

test('head roll does not change the result', () => {
  const s = analyseMotion(clip({ smile: [1, 0.4] }, 12)).moves.find(m => m.key === 'smile')!;
  assert.ok(Math.abs(s.ratio! - 40) < 5, `ratio ${s.ratio}`);
});

test('quality flags: missing frames and a short clip', () => {
  const f = clip({ smile: [1, 1] }).slice(0, 8);
  f[3] = { t: 0.3, lm: null }; f[4] = { t: 0.4, lm: null };
  const q = analyseMotion(f).quality;
  assert.ok(q.flags.includes('short') && q.flags.includes('lowDetection'));
  assert.ok(measure(base()).irisPx! > 0);
});
