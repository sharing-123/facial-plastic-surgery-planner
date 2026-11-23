/**
 * Rule-based repair planning for facial wounds and scars (decision SUPPORT), ported from surgical_planner.py.
 * It encodes commonly taught principles: RSTL alignment, aesthetic-unit respect, layered closure, 3-4:1 fusiform excision,
 * Z-plasty gain table, W-plasty and geometric broken line for long scars, timing of scar revision. Materials, sizes and
 * removal days are textbook values, not orders. It cannot see depth, vascularity, contamination, bone or nerve injury.
 * Output is made of message keys (see i18n/plan.ts) so the same plan reads in English and Indonesian.
 */
import type { Region } from './rstl';
import type { WoundReport } from './woundplan';

export interface Msg { k: string; p?: Record<string, string | number> }
export type MarkKind = 'suture_guide' | 'ellipse' | 'z_plasty' | 'w_plasty' | 'gblc';

export interface PlanContext {
  kind: 'laceration' | 'scar';
  mechanism: 'sharp' | 'blunt' | 'bite';
  depth: 'unknown' | 'skin' | 'muscle' | 'bone';
  contamination: 'clean' | 'heavy';
  tissueLoss: 'none' | 'small' | 'major';
  hours: number;
  scarType: 'widened' | 'contracture' | 'keloid' | 'hypertrophic' | 'depressed';
  scarMonths: number;
  ageYears: number | null;
}

export const DEFAULT_CTX: PlanContext = {
  kind: 'laceration', mechanism: 'sharp', depth: 'unknown', contamination: 'clean', tissueLoss: 'none', hours: 0,
  scarType: 'widened', scarMonths: 0, ageYears: null,
};

export interface Technique { name: Msg; rank: number; why: Msg; size?: Msg; options?: Msg[]; marking: MarkKind[] }
export interface SuturePlan {
  layers: Array<{ layer: Msg; material: Msg; purpose: Msg }>;
  skinSpacingMm: number; skinCount: number; deepSpacingMm: number; deepCount: number; order: Msg; removal: Msg; regionPoints: Msg[];
}
export interface Plan {
  region: Region; kind: PlanContext['kind']; flags: Msg[]; prep: Msg[]; techniques: Technique[]; sutures: SuturePlan | null;
  marking: MarkKind[]; aftercare: Msg[]; notes: Msg[]; unknowns: Msg[]; angle: number; lengthMm: number;
}

const REGION_FLAGS: Partial<Record<Region, string[]>> = {
  periorbital: ['rf.periorbital1', 'rf.periorbital2'], nose: ['rf.nose1', 'rf.nose2'], lip: ['rf.lip1'], cheek: ['rf.cheek1'],
  forehead: ['rf.forehead1'], chin: ['rf.chin1'], outside_face_oval: ['rf.edge1'],
};
const REGION_POINTS: Partial<Record<Region, string[]>> = {
  brow: ['rp.brow1', 'rp.brow2'], periorbital: ['rp.periorbital1', 'rp.periorbital2'], nose: ['rp.nose1'], lip: ['rp.lip1', 'rp.lip2'],
  perioral: ['rp.perioral1'], forehead: ['rp.forehead1'], glabella: ['rp.glabella1'],
};

const m = (k: string, p?: Msg['p']): Msg => ({ k, p });
const half = (x: number) => Math.floor(x + 0.5);

function flapOptions(r: Region): Msg[] {
  const t: Partial<Record<Region, string[]>> = {
    nose: ['flap.nose1', 'flap.nose2', 'flap.fthg'], cheek: ['flap.cheek1', 'flap.cheek2', 'flap.fthg'], lip: ['flap.lip1', 'flap.lip2', 'flap.lip3'],
    periorbital: ['flap.eye1', 'flap.eye2'], forehead: ['flap.fore1', 'flap.fthg'], chin: ['flap.chin1'], brow: ['flap.brow1'], glabella: ['flap.glab1'],
  };
  return (t[r] ?? ['flap.generic1', 'flap.fthg']).map(k => m(k));
}

export function makePlan(rep: WoundReport, ctx: PlanContext): Plan {
  const crossed = rep.regions.length ? rep.regions : (['cheek'] as Region[]);
  const region: Region = (['lip', 'periorbital', 'nose', 'brow', 'perioral'] as Region[]).find(r => crossed.includes(r)) ?? crossed[0];
  const L = rep.lengthMm, ang = rep.meanAngle, ell = rep.ellipse;
  const ellOk = ell.tissueFactor <= 2;
  const ellSize = m('t.ellipse_size', { a: Math.round(2 * ell.halfLengthMm), b: Math.round(2 * ell.halfWidthMm), axis: Math.round(ell.axisDeg) });
  const flags: Msg[] = [], notes: Msg[] = [], techniques: Technique[] = [];
  let prep: Msg[] = [];
  let marking: MarkKind[] = ['suture_guide'];

  if (ctx.kind === 'laceration') {
    if (ctx.depth === 'muscle' || ctx.depth === 'bone') flags.push(m('f.deep'));
    if (ctx.depth === 'unknown') notes.push(m('n.depth_unknown'));
    if (ctx.mechanism === 'bite') flags.push(m('f.bite'));
    if (ctx.mechanism === 'blunt') notes.push(m('n.blunt'));
    if (ctx.contamination === 'heavy' || ctx.hours > 24) flags.push(m('f.contam'));
    if (ctx.tissueLoss === 'major') flags.push(m('f.loss'));
    for (const k of REGION_FLAGS[region] ?? []) flags.push(m(k));
    prep = ['pr.photo', 'pr.tetanus', 'pr.anaesthesia', 'pr.nerve'].map(k => m(k));
  } else {
    prep = ['pr.doc', 'pr.goal'].map(k => m(k));
    if (ctx.scarMonths && ctx.scarMonths < 6) notes.push(m('n.scar_young', { months: ctx.scarMonths }));
  }
  if (!rep.linear) notes.push(m('n.nonlinear', { elong: rep.elongation }));

  const T = (name: string, rank: number, why: Msg, marks: MarkKind[], extra: Partial<Technique> = {}) => techniques.push({ name: m(name), rank, why, marking: marks, ...extra });
  const nonlinearOnly = !rep.linear && ctx.scarType !== 'keloid' && ctx.scarType !== 'hypertrophic';
  if (nonlinearOnly) {
    T('t.manual', 1, m('w.manual'), []); marking = [];
  } else if (ctx.kind === 'laceration') {
    if (ctx.tissueLoss === 'major') {
      T('t.reconstruct', 1, m('w.loss'), [], { options: flapOptions(region) }); marking = [];
    } else T('t.primary', 1, m('w.primary', { ang: Math.round(ang) }), ['suture_guide']);
    if (ctx.tissueLoss === 'small' && !ellOk) notes.push(m('n.ellipse_no', { ang: Math.round(ang), len: Math.round(2 * ell.halfLengthMm) }));
    if (ctx.tissueLoss === 'small' && ellOk) { T('t.ellipse_min', 2, m('w.ellipse_small'), ['ellipse'], { size: ellSize }); marking.push('ellipse'); }
    if (ang >= 60 && ctx.tissueLoss !== 'major') notes.push(m('n.perp', { ang: Math.round(ang) }));
    if (rep.critical.length) notes.push(m('n.critical', { names: rep.critical.map(c => c.structure).join(', ') }));
  } else if (ctx.scarType === 'contracture') {
    T('t.z', 1, m('w.contracture'), ['z_plasty'], { size: m('z.size') }); marking.push('z_plasty');
  } else if (ctx.scarType === 'keloid') {
    T('t.nonsurg', 1, m('w.keloid'), []); marking = [];
  } else if (ctx.scarType === 'hypertrophic') {
    T('t.silicone', 1, m('w.hypertrophic'), []); marking = [];
  } else if (ctx.scarType === 'depressed') {
    T('t.subcision', 1, m('w.depressed'), ellOk ? ['ellipse'] : []); marking = ellOk ? ['ellipse'] : [];
  } else if (L >= 30 && ang >= 30) {
    T('t.w', 1, m('w.long', { len: Math.round(L), ang: Math.round(ang) }), ['w_plasty', 'gblc'], { size: m('w.size') }); marking = ['w_plasty', 'gblc'];
    if (ellOk) { T('t.ellipse', 2, m('w.alt_ellipse'), ['ellipse'], { size: ellSize }); marking.push('ellipse'); }
  } else if (ang >= 30 && !ellOk) {
    T('t.z', 1, m('w.z_long', { len: Math.round(L), ang: Math.round(ang), ell: Math.round(2 * ell.halfLengthMm) }), ['z_plasty'], { size: m('z.size60') }); marking = ['z_plasty'];
  } else if (ang >= 30) {
    T('t.ellipse', 1, m('w.short', { len: Math.round(L), ang: Math.round(ang) }), ['ellipse'], { size: ellSize }); marking = ['ellipse', 'suture_guide'];
    T('t.z', 2, m('w.z_alt'), ['z_plasty'], { size: m('z.size60') });
  } else {
    T('t.observe', 1, m('w.aligned', { ang: Math.round(ang) }), []); marking = ['suture_guide'];
  }
  if (rep.linear && ctx.kind === 'scar' && !['contracture', 'keloid', 'hypertrophic', 'depressed'].includes(ctx.scarType) && !ellOk) notes.push(m('n.ellipse_long'));

  const primary = techniques[0]?.name.k ?? '';
  const noSutures = !rep.linear || ['t.observe', 't.nonsurg', 't.silicone', 't.manual'].includes(primary) ||
    (ctx.kind === 'scar' && !marking.includes('suture_guide') && !techniques.some(t => ['t.ellipse', 't.z', 't.w'].includes(t.name.k)));
  if (noSutures) marking = marking.filter(x => x !== 'suture_guide');

  let sutures: SuturePlan | null = null;
  if (!noSutures && (marking.length || ctx.kind === 'laceration')) {
    let skin = 's.skin_default';
    if (ctx.ageYears != null && ctx.ageYears < 12) skin = 's.skin_child';
    if (region === 'periorbital') skin = 's.skin_lid';
    const layers: SuturePlan['layers'] = [
      { layer: m('s.deep'), material: m('s.deep_mat'), purpose: m('s.deep_why') },
      { layer: m('s.skin'), material: m(skin), purpose: m('s.skin_why') },
    ];
    if (region === 'lip') layers.unshift({ layer: m('s.mucosa'), material: m('s.mucosa_mat'), purpose: m('s.mucosa_why') });
    sutures = {
      layers, skinSpacingMm: 4, skinCount: Math.max(1, half(L / 4)), deepSpacingMm: 7, deepCount: Math.max(1, half(L / 7)),
      order: m('s.order'), removal: m(region === 'periorbital' ? 's.remove_lid' : 's.remove_face'),
      regionPoints: (REGION_POINTS[region] ?? []).map(k => m(k)),
    };
  }
  return {
    region, kind: ctx.kind, flags, prep, techniques: techniques.sort((a, b) => a.rank - b.rank), sutures,
    marking: [...new Set(marking)], aftercare: ['a.sun', 'a.silicone', 'a.review'].map(k => m(k)), notes,
    unknowns: ['u.depth', 'u.rstl', 'u.scale'].map(k => m(k)), angle: ang, lengthMm: L,
  };
}
