import { REST, type HeroState } from './hero';

export type V3 = [number, number, number];

export interface Light { key: number; rim: number; beam: number; bloom: number; floor: number; pool: number; dial: number }

export interface Chapter {
  id: string;
  cam: V3; target: V3; fov: number;
  /** Where the subject sits horizontally, as a fraction of viewport width (negative = left). */
  shift: number;
  hero: Partial<HeroState>;
  light: Partial<Light>;
  /** Optional drive from the progress through the chapter's own scroll extent (0..1). */
  drive?: (sub: number) => Partial<HeroState>;
  /** HUD stage name key */
  hud: string;
}

export const BASE_LIGHT: Light = { key: 1, rim: 1, beam: 1, bloom: 0.55, floor: 1, pool: 1, dial: 1 };

export const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Skin builds from the top down behind a front that sweeps y = 1 to -1 (object space). */
const solidBehind = (front: number) => Math.max(0, Math.min(1, ((1.2 - front) / 2.4 - 0.12) * 1.2));

export const CHAPTERS: Chapter[] = [
  { id: 'hero', hud: 'hud.s0', cam: [0, 0.3, 6.5], target: [0, -0.42, 0], fov: 26, shift: 0.12, hero: { yaw: -0.28, pitch: 0.02, rings: 1, cloud: 0.5, after: 0.22, scanY: -1.2, settle: 1 }, light: { floor: 1 } },
  {
    id: 'capture', hud: 'hud.s1', cam: [0.5, 0.15, 5.9], target: [0, -0.1, 0], fov: 26, shift: 0.2, hero: { yaw: -0.4, pitch: 0.04, solid: 0, cloud: 1, after: 0.95, laser: 1, rings: 0.8 }, light: { bloom: 0.9, rim: 0.7, beam: 1.2 },
    drive: sub => ({ scanY: lerp(0.98, -0.98, sub), yaw: -0.4 + sub * 0.5, solid: 0 }),
  },
  {
    id: 'rebuild', hud: 'hud.s2', cam: [-0.3, 0.12, 5.7], target: [0, -0.1, 0], fov: 25, shift: -0.2, hero: { yaw: 0.2, pitch: 0.03, cloud: 0.55, after: 0.5, wire: 1, laser: 0.9, rings: 0 }, light: { bloom: 0.85 },
    drive: sub => { const f = lerp(1.0, -1.0, sub); return { scanY: f, wireY: f, solid: solidBehind(f), yaw: 0.25 - sub * 0.5 }; },
  },
  { id: 'landmarks', hud: 'hud.s3', cam: [0.2, 0.15, 5.2], target: [0, -0.1, 0], fov: 26, shift: 0.19, hero: { yaw: -0.5, pitch: 0.06, dots: 1, wave: 1, wire: 0.25, wireY: -1.2, cloud: 0.12, after: 0.12 }, light: { bloom: 0.8, rim: 0.7 } },
  { id: 'proportions', hud: 'hud.s4', cam: [-0.1, 0.18, 5.0], target: [0, -0.1, 0], fov: 25, shift: -0.19, hero: { yaw: 0.34, pitch: 0.02, dots: 0.35, wave: 1, grid: 1 }, light: { bloom: 0.7 } },
  { id: 'zones', hud: 'hud.s5', cam: [0.3, 0.15, 5.2], target: [0, -0.1, 0], fov: 25, shift: 0.19, hero: { yaw: -0.26, pitch: 0.03, dots: 0.1, wave: 1, zones: 1, grid: 0.2 }, light: { bloom: 0.7 } },
  { id: 'rstl', hud: 'hud.s6', cam: [-0.2, 0.15, 5.0], target: [0, -0.1, 0], fov: 25, shift: -0.19, hero: { yaw: 0.22, pitch: 0.0, dots: 0, wave: 1, rstl: 1, zones: 0 }, light: { bloom: 0.7 } },
  {
    id: 'layers', hud: 'hud.s7', cam: [2.5, 0.4, 6.6], target: [0.05, -0.02, 0.1], fov: 27, shift: 0.14, hero: { yaw: -0.62, pitch: 0.1, rstl: 0 }, light: { bloom: 0.6, rim: 1.2, beam: 1.2 },
    drive: sub => ({ peel: sm(0.0, 0.06, sub), explode: sm(0.08, 0.5, sub), yaw: -0.62 + sm(0.45, 1, sub) * 0.5, pitch: 0.1 - sm(0.5, 1, sub) * 0.08, lift: 0 }),
  },
  { id: 'plan', hud: 'hud.s8', cam: [-1.3, -0.05, 3.9], target: [-0.3, -0.2, 0.5], fov: 24, shift: -0.2, hero: { yaw: 0.62, pitch: -0.02, plan: 1, rstl: 0.55, dots: 0 }, light: { bloom: 0.85, key: 1.1 } },
  { id: 'studio', hud: 'hud.s9', cam: [0, 0.2, 6.6], target: [0, -0.45, 0], fov: 26, shift: 0, hero: { yaw: -0.1, pitch: 0.0, dots: 0.5, wave: 1, rings: 1, cloud: 0.4, after: 0.2, scanY: -1.2 }, light: { bloom: 0.6, beam: 1.2 } },
];

export interface Layout { top: number; height: number }

export interface WorldState {
  cam: V3; target: V3; fov: number; shift: number; hero: HeroState; light: Light; active: number; u: number;
  /** scroll progress through the active chapter's own extent, 0..1 */
  sub: number;
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const plateau = (f: number) => { const x = Math.max(0, Math.min(1, (f - 0.18) / 0.64)); return x * x * x * (x * (x * 6 - 15) + 10); };

function heroAt(ch: Chapter, sub: number): HeroState {
  const d = ch.drive ? ch.drive(sub) : {};
  return { ...REST, ...ch.hero, ...d };
}

/**
 * Pure, reversible function of scroll: the same scrollY always gives the same world.
 * Chapter i is centred on its layout box; between centres state eases with a dwell at each end.
 */
export function evaluate(layout: Layout[], scrollY: number, vh: number, portrait: boolean): WorldState {
  const n = CHAPTERS.length;
  const mid = (i: number) => layout[i].top + layout[i].height / 2;
  const probe = scrollY + vh / 2;
  let a = 0;
  for (let i = 0; i < n - 1; i++) if (probe >= mid(i)) a = i;
  const b = Math.min(n - 1, a + 1);
  const span = Math.max(1, mid(b) - mid(a));
  const f = a === b ? 0 : Math.max(0, Math.min(1, (probe - mid(a)) / span));
  const t = a === b ? 0 : plateau(f);
  const subOf = (i: number) => {
    const L = layout[i];
    const extent = Math.max(1, L.height - vh);
    return Math.max(0, Math.min(1, (scrollY - L.top) / extent));
  };
  const ca = CHAPTERS[a], cb = CHAPTERS[b];
  const ha = heroAt(ca, subOf(a)), hb = heroAt(cb, subOf(b));
  const hero = { ...REST } as HeroState;
  for (const k of Object.keys(REST) as Array<keyof HeroState>) hero[k] = lerp(ha[k], hb[k], t);
  const light = { ...BASE_LIGHT };
  for (const k of Object.keys(BASE_LIGHT) as Array<keyof Light>) light[k] = lerp(ca.light[k] ?? BASE_LIGHT[k], cb.light[k] ?? BASE_LIGHT[k], t);
  const pull = portrait ? 1.42 : 1;
  const camA = ca.cam.map((v, i) => (i === 2 ? v * pull : v)) as V3, camB = cb.cam.map((v, i) => (i === 2 ? v * pull : v)) as V3;
  const cam = lerp3(camA, camB, t);
  // arc the camera in flight so moves are curves, not straight dollies
  cam[1] += Math.sin(t * Math.PI) * 0.18;
  cam[0] += Math.sin(t * Math.PI) * 0.22 * (a % 2 ? -1 : 1);
  const target = lerp3(ca.target, cb.target, t);
  if (portrait) target[1] -= 0.18;
  const active = t > 0.5 ? b : a;
  return {
    cam, target, fov: lerp(ca.fov, cb.fov, t) * (portrait ? 1.12 : 1),
    shift: portrait ? 0 : lerp(ca.shift, cb.shift, t), hero, light, active, u: a + t, sub: subOf(active),
  };
}
