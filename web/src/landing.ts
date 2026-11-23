import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Vector3 } from 'three';
import type { World } from './world';
import { CHAPTERS, type Layout } from './world/chapters';
import { angDiff } from './clinical/wound';
import { lang, num, onBeforeLang, onLang, t } from './i18n';
import { initFx } from './fx';

gsap.registerPlugin(ScrollTrigger, SplitText);

interface Tag { el: HTMLElement; anchor: Vector3; dx: number; dy: number; chapter: number; flip: boolean }

declare global {
  interface Window { __go?: (id: string, t?: number) => void; __fs?: { world: World; lenis?: Lenis; shot: () => string } }
}

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function startLanding(): Promise<() => void> {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const { createWorld } = await import('./world');
  const world = createWorld(canvas, params.has('capture'));
  const sections = [...document.querySelectorAll<HTMLElement>('.chapter')];
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const coarse = matchMedia('(pointer: coarse)').matches;

  let layout: Layout[] = [];
  const measure = () => {
    layout = sections.map(s => ({ top: s.getBoundingClientRect().top + window.scrollY, height: s.offsetHeight }));
    world.setLayout(layout);
  };
  const resize = () => { world.resize(window.innerWidth, window.innerHeight); measure(); ScrollTrigger.refresh(); };

  // smooth native scroll; the world reads lenis.scroll, so the story state stays a pure function of scroll position
  const lenis = reduce() ? undefined : new Lenis({ lerp: 0.11, smoothWheel: true });
  lenis?.on('scroll', ScrollTrigger.update);
  const scrollNow = () => (lenis ? lenis.scroll : window.scrollY);

  // --- labels projected from 3D anchors
  const tagHost = document.getElementById('tags')!;
  const tags: Tag[] = [];
  const hero = world.hero;
  const P = hero.P;
  const addTag = (chapter: number, anchor: Vector3 | undefined, html: () => string, dx: number, dy: number, mark = false) => {
    if (!anchor) return;
    const el = document.createElement('div');
    el.className = 'tag' + (mark ? ' mark' : '');
    tagHost.appendChild(el);
    const tag: Tag = { el, anchor, dx, dy, chapter, flip: false };
    tags.push(tag);
    const fill = () => { el.innerHTML = `<i></i><span>${html()}</span>`; };
    fill(); onLang(fill);
  };
  const mmAnchor = (x: number, y: number, lift = 0.012) => hero.hf.lift(x * 0.01, y * 0.01, lift) ?? undefined;
  const h = (a: number, b: number) => Math.abs(P[a][1] - P[b][1]);
  addTag(3, hero.anchors.nose && mmAnchor(0, P[1][1] - 6, 0.03), () => `<b>478</b> ${t('tag.pts')}`, 90, -70);
  addTag(4, mmAnchor(62, (P[10][1] + P[9][1]) / 2), () => `${t('tag.upper')} <b>${num(h(10, 9), 0)} mm</b>`, 40, 0);
  addTag(4, mmAnchor(66, (P[9][1] + P[2][1]) / 2), () => `${t('tag.middle')} <b>${num(h(9, 2), 0)} mm</b>`, 40, 0);
  addTag(4, mmAnchor(58, (P[2][1] + P[152][1]) / 2), () => `${t('tag.lower')} <b>${num(h(2, 152), 0)} mm</b>`, 40, 0);
  const w = hero.wound;
  const woundDeg = ((Math.atan2(w.p2[1] - w.p1[1], w.p2[0] - w.p1[0]) * 180) / Math.PI + 360) % 180;
  addTag(8, hero.anchors.woundCentre, () => `${t('tag.ellipse')} <b>3,5 : 1</b>`.replace('3,5', num(3.5, 1)), -150, -64, true);
  addTag(8, mmAnchor(w.p2[0] - 10, w.p2[1] - 14), () => `${t('tag.axis')} <b>${num(w.axis, 0)}°</b>`, -130, 30);
  addTag(8, mmAnchor(w.p1[0] + 2, w.p1[1] + 2), () => `${t('tag.angle')} <b>${num(angDiff(woundDeg, w.axis), 0)}°</b>`, -190, -8, true);

  // exploded layers: one label per layer, tied to the layer's own position
  const layerNames = ['c5.l0', 'c5.l1', 'c5.l2', 'c5.l3'];
  layerNames.forEach((k, idx) => addTag(7, hero.layerAnchors[idx], () => `${t(k)}`, 78, -4 + idx * 2));
  tags.slice(-4).forEach(tg => tg.el.classList.add('leader'));

  // --- text reveal: headings rise from a mask, body fades; re-created when the language changes
  const shown = new WeakSet<Element>();
  let splits: SplitText[] = [];
  let triggers: ScrollTrigger[] = [];
  const setupReveal = () => {
    const calm = reduce();
    sections.forEach((sec, i) => {
      const head = sec.querySelector<HTMLElement>('h1, h2');
      const rest = [...sec.querySelectorAll<HTMLElement>('.copy p, .steps, .cta, .limits, .hero-sub, .hero-note, .cue')];
      const play = () => {
        if (head) shown.add(head);
        rest.forEach(r => shown.add(r));
      };
      let lines: Element[] = [];
      if (head) {
        const sp = SplitText.create(head, { type: 'lines', mask: 'lines', linesClass: 'ln' });
        splits.push(sp);
        lines = sp.lines;
      }
      const revealed = head ? shown.has(head) : true;
      if (calm || revealed) { gsap.set(lines, { yPercent: 0 }); gsap.set(rest, { clearProps: 'all' }); return; }
      if (i === 0) { gsap.set(lines, { yPercent: 115 }); gsap.set(rest, { opacity: 0, y: 14 }); return; } // hero waits for the intro
      gsap.set(lines, { yPercent: 115 });
      gsap.set(rest, { opacity: 0, y: 14 });
      triggers.push(ScrollTrigger.create({
        trigger: sec, start: 'top 58%', once: true,
        onEnter: () => {
          play();
          gsap.to(lines, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 });
          gsap.to(rest, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.25 });
        },
      }));
    });
  };
  const teardownReveal = () => { splits.forEach(s => s.revert()); splits = []; triggers.forEach(tr => tr.kill()); triggers = []; };
  onBeforeLang(teardownReveal);
  onLang(() => { setupReveal(); measure(); ScrollTrigger.refresh(); });
  await document.fonts.ready;
  setupReveal();

  // --- layer step list follows progress through the layers chapter
  const steps = [...document.querySelectorAll<HTMLElement>('.steps li')];
  const layerIdx = CHAPTERS.findIndex(c => c.id === 'layers');
  const updateSteps = (scroll: number) => {
    const L = layout[layerIdx]; if (!L) return;
    const sub = Math.max(0, Math.min(1, (scroll - L.top) / Math.max(1, L.height - window.innerHeight)));
    const idx = sub < 0.3 ? 0 : sub < 0.5 ? 1 : sub < 0.72 ? 2 : 3;
    steps.forEach((s, k) => s.classList.toggle('on', k === idx));
  };

  // --- interface motion
  const goTo = (i: number) => { const L = layout[i]; if (!L) return; const y = CHAPTERS[i].drive ? L.top + 4 : L.top + L.height / 2 - window.innerHeight / 2; if (lenis) lenis.scrollTo(y, { duration: 1.8 }); else window.scrollTo({ top: y, behavior: 'smooth' }); };
  const fx = initFx(sections, goTo);

  // --- loop
  let last = 0, lastScroll = 0, velocity = 0;
  const tick = (time: number) => {
    if (document.body.dataset.view !== 'landing') return;
    const raw = time - last; last = time;
    const dt = Math.min(0.05, Math.max(0.001, raw));
    world.stage.sampleOk = raw < 0.2 && !document.hidden;
    lenis?.raf(time * 1000);
    const s = scrollNow();
    velocity = velocity * 0.85 + ((s - lastScroll) / dt) * 0.15; lastScroll = s;
    if (!coarse) { pointer.x += (pointer.tx - pointer.x) * 0.06; pointer.y += (pointer.ty - pointer.y) * 0.06; }
    world.update(s, velocity, dt, time, pointer);
    updateSteps(s);
    fx(world.state.u, world.state.active, velocity);
    const hp = document.getElementById('hud-pct'), hb = document.getElementById('hud-bar'), hpt = document.getElementById('hud-pts'), hs = document.getElementById('hud-stage');
    if (hp && hb && hpt && hs) {
      const pc = Math.round(world.hud.pct * 100);
      hp.textContent = `${pc}%`; hb.style.width = `${pc}%`;
      hpt.textContent = Math.round(world.hud.points).toLocaleString(lang() === 'id' ? 'id-ID' : 'en-US');
      hs.textContent = t(CHAPTERS[world.state.active].hud);
    }
    const st = world.state;
    const out = { x: 0, y: 0, visible: true };
    for (const tg of tags) {
      const near = Math.abs(st.u - tg.chapter) < 0.42;
      tg.el.classList.toggle('on', near);
      if (!near) continue;
      world.project(tg.anchor, out);
      const wpx = window.innerWidth;
      const flip = out.x + tg.dx > wpx - 210 ? true : out.x + tg.dx < 12 ? false : tg.flip;
      tg.flip = flip;
      const x = Math.max(12, Math.min(wpx - tg.el.offsetWidth - 12, out.x + (flip ? -tg.dx : tg.dx)));
      tg.el.style.transform = `translate3d(${x}px, ${out.y + tg.dy}px, 0)`;
    }
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  const onMove = (e: PointerEvent) => { pointer.tx = (e.clientX / window.innerWidth) * 2 - 1; pointer.ty = (e.clientY / window.innerHeight) * 2 - 1; };
  if (!coarse) window.addEventListener('pointermove', onMove, { passive: true });
  let rz = 0;
  const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(resize); };
  window.addEventListener('resize', onResize);
  resize();

  // anchors for in-page links go through lenis so they stay smooth
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]:not([href^="#/"])').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.6 }); else target.scrollIntoView();
    });
  });

  // --- intro: the surface condenses out of scattered points
  const veil = document.getElementById('veil');
  const hero0 = sections[0];
  const heroLines = hero0.querySelectorAll('.ln');
  const heroRest = hero0.querySelectorAll<HTMLElement>('.hero-sub, .hero-note, .cue');
  const startIntro = () => {
    veil?.classList.add('gone');
    if (reduce()) { world.intro.v = 1; return; }
    gsap.to(world.intro, { v: 1, duration: 3.8, ease: 'power2.inOut' });
    gsap.to(heroLines, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.1, delay: 1.5 });
    gsap.to(heroRest, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.12, delay: 2.4 });
    if (heroLines.length) shown.add(hero0.querySelector('h1')!);
  };
  requestAnimationFrame(() => requestAnimationFrame(startIntro));

  window.__go = (id: string, tt = 0.5) => {
    const i = CHAPTERS.findIndex(c => c.id === id);
    if (i < 0) return;
    const L = layout[i];
    // drive chapters are scrubbed through their whole extent; the others are centred on the viewport
    const centered = CHAPTERS[i].drive ? L.top + (L.height - window.innerHeight) * tt : L.top + L.height / 2 - window.innerHeight / 2;
    if (lenis) lenis.scrollTo(centered, { immediate: true }); else window.scrollTo(0, centered);
  };
  window.__fs = { world, lenis, shot: () => canvas.toDataURL('image/png') };
  if (params.has('capture')) {
    // QC helper: jump to a chapter, run the world synchronously until smoothing settles, POST the canvas to a local receiver
    let fake = 1000;
    (window as unknown as Record<string, unknown>).__snap = async (id: string, tt: number, name: string, extra?: (w: World) => void) => {
      window.__go?.(id, tt);
      world.intro.v = 1;
      extra?.(world);
      for (let i = 0; i < 240; i++) { fake += 0.016; world.update(lenis ? lenis.scroll : window.scrollY, 0, 0.016, fake, { x: 0, y: 0 }); }
      const url = canvas.toDataURL('image/png');
      await fetch(`http://127.0.0.1:8799/?name=${name}`, { method: 'POST', body: url });
      return { u: world.state.u, scroll: lenis ? lenis.scroll : window.scrollY };
    };
  }

  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    lenis?.destroy();
    teardownReveal();
  };
}
