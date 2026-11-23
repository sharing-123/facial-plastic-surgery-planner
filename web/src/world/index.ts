import { Vector3 } from 'three';
import { createStage, type Stage } from './stage';
import { FLOOR_Y, buildBackdrop, buildBeam, buildGodrays, buildSparks, buildDust, buildEnvironment, buildFloor, buildLights, BG } from './studio';
import { Hero, REST, type HeroState } from './hero';
import { CHAPTERS, evaluate, type Layout, type WorldState } from './chapters';
import { loadAnatomy } from './anatomy';

export interface World {
  stage: Stage;
  hero: Hero;
  state: WorldState;
  hud: { pct: number; points: number };
  /** Intro progress, driven by a GSAP tween on load; 1 = finished. */
  intro: { v: number };
  setLayout: (l: Layout[]) => void;
  update: (scrollY: number, velocity: number, dt: number, time: number, pointer: { x: number; y: number }) => void;
  resize: (w: number, h: number) => void;
  project: (v: Vector3, out: { x: number; y: number; visible: boolean }) => void;
  dispose: () => void;
}

const smooth = (cur: number, target: number, dt: number, k = 7.5) => cur + (target - cur) * (1 - Math.exp(-dt * k));

export function createWorld(canvas: HTMLCanvasElement, capture = false): World {
  const stage = createStage(canvas, capture);
  const { scene, camera, renderer } = stage;
  scene.background = BG;
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.6;

  const lights = buildLights();
  scene.add(lights.group);
  const floor = buildFloor(window.innerWidth, window.innerHeight);
  scene.add(floor);
  const dust = buildDust(stage.coarse ? 320 : 700);
  scene.add(dust);
  scene.add(buildBackdrop());
  const beam = buildBeam();
  const beam2 = buildBeam([3.4, 5.2, 2.2], 0.8, [0.7, 1.0, 0.92]);
  const beam3 = buildBeam([0.9, 6.2, -2.6], 0.7, [0.6, 0.9, 1.0]);
  scene.add(beam, beam2, beam3);
  const sparks = buildSparks(stage.coarse ? 160 : 380);
  scene.add(sparks);
  const godrays = buildGodrays();
  scene.add(godrays);
  const hero = new Hero();
  scene.add(hero.root);
  loadAnatomy().then(a => hero.layers.setAnatomy(a)).catch(err => console.warn('anatomy not loaded', err));

  let layout: Layout[] = [];
  let vh = window.innerHeight;
  let portrait = false;
  let smoothScroll = 0;
  let first = true;
  const intro = { v: 0 };
  const cur: HeroState = { ...REST };
  const smoothed = { cam: new Vector3(0, 0.2, 5.4), target: new Vector3(0, 0.1, 0), fov: 26, shift: 0 };
  let state = evaluate(layout.length ? layout : CHAPTERS.map((_, i) => ({ top: i * 900, height: 900 })), 0, 900, false);
  const tmp = new Vector3();

  const world: World = {
    stage, hero, get state() { return state; }, intro, hud: { pct: 0, points: 0 },
    setLayout(l) { layout = l; },
    resize(w, h) {
      vh = h; portrait = w / h < 0.95;
      stage.resize(w, h);
      floor.getRenderTarget().setSize(Math.max(256, Math.floor(w * stage.pixelRatio() * 0.7)), Math.max(256, Math.floor(h * stage.pixelRatio() * 0.7)));
      (floor.material as unknown as { uniforms: Record<string, { value: { set: (a: number, b: number) => void } }> }).uniforms.uRes.value.set(w, h);
    },
    update(scrollY, velocity, dt, time, pointer) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const k = reduce ? 1000 : 7.5;
      smoothScroll = first || reduce ? scrollY : smooth(smoothScroll, scrollY, dt, 7.5);
      if (layout.length === CHAPTERS.length) state = evaluate(layout, smoothScroll, vh, portrait);
      const s = state;
      // intro: a scan sweeps the face from top to bottom; the skin is built behind the laser and the cloud settles
      const iv = intro.v;
      const ph = Math.min(1, Math.max(0, (iv - 0.06) / 0.7)), ee = ph * ph * (3 - 2 * ph);
      const sweepY = 1.0 - 2.0 * ee;
      const fade = Math.min(1, Math.max(0, (iv - 0.8) / 0.2)), fe = fade * fade * (3 - 2 * fade);
      const lr = (a: number, b: number) => a + (b - a) * fe;
      const introHero: Partial<HeroState> = iv >= 1 ? {} : {
        scanY: lr(sweepY, s.hero.scanY), laser: lr(1, s.hero.laser), cloud: lr(1, s.hero.cloud), after: lr(0.9, s.hero.after),
        solid: lr(Math.max(0, Math.min(1, ((1.2 - sweepY) / 2.4 - 0.12) * 1.2)), s.hero.solid), wire: lr(0.55 * Math.sin(Math.min(1, iv / 0.8) * Math.PI), s.hero.wire), wireY: lr(sweepY, s.hero.wireY),
        rings: lr(Math.min(1, iv * 3), s.hero.rings), dissolve: 0,
      };
      const target: HeroState = { ...s.hero, ...introHero };
      for (const key of Object.keys(REST) as Array<keyof HeroState>) cur[key] = first ? target[key] : smooth(cur[key], target[key], dt, key === 'yaw' || key === 'pitch' ? 4.2 : 9);
      // pointer parallax, clamped and softened while a big camera move is happening
      const calm = 1 - Math.min(1, Math.abs(velocity) / 2400);
      const hv = { ...cur, yaw: cur.yaw + pointer.x * 0.1 * calm + Math.sin(time * 0.25) * 0.03, pitch: cur.pitch - pointer.y * 0.05 * calm };
      hero.apply(hv, time, stage.size.y * stage.pixelRatio() * 0.9);

      smoothed.cam.set(...s.cam); smoothed.target.set(...s.target);
      if (first) { smoothed.fov = s.fov; smoothed.shift = s.shift; }
      else { smoothed.fov = smooth(smoothed.fov, s.fov, dt, k); smoothed.shift = smooth(smoothed.shift, s.shift, dt, k); }
      camera.position.copy(smoothed.cam);
      camera.position.x += pointer.x * 0.12 * calm; camera.position.y += pointer.y * 0.06 * calm;
      camera.fov = smoothed.fov;
      camera.lookAt(smoothed.target);
      const w = stage.size.x, h = stage.size.y;
      camera.setViewOffset(w, h, -smoothed.shift * w, 0, w, h);
      camera.updateProjectionMatrix();

      lights.key.intensity = 90 * s.light.key; lights.rim.intensity = 2.4 * s.light.rim;
      (beam.material as unknown as { uniforms: { uAmount: { value: number } } }).uniforms.uAmount.value = 0.22 * s.light.beam;
      for (const b2 of [beam2, beam3]) (b2.material as unknown as { uniforms: { uAmount: { value: number } } }).uniforms.uAmount.value = 0.16 * s.light.beam;
      stage.bloom.intensity = s.light.bloom;
      { const su = (sparks.material as unknown as { uniforms: Record<string, { value: number }> }).uniforms; su.uTime.value = time; su.uScale.value = stage.size.y * stage.pixelRatio(); su.uAmount.value = 0.4 + 0.6 * s.light.dial; }
      godrays.children.forEach((c, gi) => { const u = ((c as unknown as { material: { uniforms: Record<string, { value: number }> } }).material).uniforms; u.uTime.value = time; u.uAmount.value = [1.0, 0.7, 0.55, 0.5][gi] * (0.55 + 0.45 * s.light.beam); });
      const fu = (floor.material as unknown as { uniforms: Record<string, { value: number }> }).uniforms;
      fu.uTime.value = time; fu.uStrength.value = s.light.floor; fu.uPool.value = s.light.pool; fu.uDial.value = s.light.dial;
      world.hud.pct = cur.laser > 0.05 ? Math.max(0, Math.min(1, (0.98 - cur.scanY) / 1.96)) : 1;
      world.hud.points = hero.scan.count * (cur.cloud > 0.05 ? world.hud.pct : 1);
      (dust.material as unknown as { uniforms: Record<string, { value: number }> }).uniforms.uTime.value = time;
      (dust.material as unknown as { uniforms: Record<string, { value: number }> }).uniforms.uScale.value = stage.size.y * stage.pixelRatio() * 0.0055;
      const du = hero.dots.material.uniforms;
      du.uScale.value = stage.size.y * stage.pixelRatio() * 1.0;
      stage.aberration.offset.set(0.0009 * Math.min(1.8, Math.abs(velocity) / 900), 0.0006 * Math.min(1.8, Math.abs(velocity) / 900));
      first = false;
      stage.render(dt);
    },
    project(v, out) {
      tmp.copy(v);
      hero.spin.localToWorld(tmp);
      tmp.project(camera);
      out.x = (tmp.x * 0.5 + 0.5) * stage.size.x; out.y = (-tmp.y * 0.5 + 0.5) * stage.size.y; out.visible = tmp.z < 1;
    },
    dispose() { stage.renderer.dispose(); },
  };
  void FLOOR_Y;
  return world;
}
