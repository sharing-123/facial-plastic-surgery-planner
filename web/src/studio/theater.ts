import { drawAnnotated, type ViewXf } from './draw';
import { state, type Layers2D, type StudioState } from './store';
import { DX_NAME } from '../clinical/classify';
import { lang, num, t } from '../i18n';
import { T, esc } from './panels';

/**
 * The analysis shown as it happens: a scan front sweeps the photograph, each stage draws its own real layer (landmarks, proportion grid,
 * zone atlas, skin tension lines, lesion edge) behind the front while the camera pushes in, and the stage list fills with the numbers
 * computed for this photo. Everything drawn comes from the live state, nothing is a canned picture.
 */
interface Stage { en: string; id: string; layers: Partial<Layers2D>; dur: number; zoom: 'face' | 'lesion'; readout: () => string }

const NONE: Layers2D = { landmarks: false, grid: false, zones: false, rstl: false, lesion: false };

function stagesFor(): Stage[] {
  const s = state;
  const hasL = !!s.lesion && !!s.report && !!s.cls && !!s.plan;
  const out: Stage[] = [
    { en: 'Finding the face', id: 'Mencari wajah', layers: { landmarks: true }, dur: 1.7, zoom: 'face', readout: () => `${s.lm?.length ?? 478} ${T('landmarks', 'landmark')}` },
    { en: 'Measuring the proportions', id: 'Mengukur proporsi', layers: { grid: true, landmarks: true }, dur: 1.3, zoom: 'face', readout: () => `${T('mirror asymmetry', 'asimetri cermin')} ${num(s.props?.mirror.mean ?? 0, 1)} mm` },
    { en: 'Mapping the 34 zones', id: 'Memetakan 34 zona', layers: { zones: true }, dur: 1.3, zoom: 'face', readout: () => `34 ${T('zones', 'zona')}` },
    { en: 'Tracing skin tension lines', id: 'Menelusuri garis tegangan kulit', layers: { rstl: true }, dur: 1.3, zoom: 'face', readout: () => (s.report ? `RSTL ${num(s.report.axis, 0)}°` : T('field fitted to the face', 'medan disesuaikan ke wajah')) },
  ];
  if (hasL) {
    out.push(
      { en: 'Finding the lesion edge', id: 'Mencari tepi lesi', layers: { lesion: true }, dur: 1.5, zoom: 'lesion', readout: () => `${num(s.cls!.sizeMm.long, 1)} × ${num(s.cls!.sizeMm.short, 1)} mm` },
      { en: 'Naming the lesion type', id: 'Menentukan jenis lesi', layers: { lesion: true }, dur: 1.2, zoom: 'lesion', readout: () => `${DX_NAME[s.cls!.top][lang()]} ${Math.round(s.cls!.differential[0].share * 100)}%` },
      { en: 'Choosing closure and drawing the plan', id: 'Memilih penutupan dan menggambar rencana', layers: { lesion: true }, dur: 1.2, zoom: 'lesion', readout: () => `${t(s.plan!.techniques[0].name.k).split(' (')[0]}` },
    );
  }
  return out;
}

function bounds(pts: Array<[number, number]>, pad: number): { x0: number; y0: number; x1: number; y1: number } {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), m = Math.max(w, h) * pad;
  return { x0: Math.min(...xs) - m, y0: Math.min(...ys) - m, x1: Math.max(...xs) + m, y1: Math.max(...ys) + m };
}

export function playTheater(host: HTMLElement): Promise<void> {
  const s = state;
  if (!s.photo || !s.lm || !s.frame || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  host.querySelector('.theater')?.remove();
  const stages = stagesFor();
  const total = stages.reduce((a, g) => a + g.dur, 0);

  const root = document.createElement('div');
  root.className = 'theater';
  root.setAttribute('role', 'status');
  root.innerHTML = `
    <div class="th-main"><div class="th-fig">
      <canvas class="th-cv"></canvas>
      <i class="th-br tl"></i><i class="th-br tr"></i><i class="th-br bl"></i><i class="th-br br"></i>
      <div class="th-cap"><span class="th-n"></span><b class="th-name"></b></div>
      <div class="th-bar"><i></i></div>
      <button type="button" class="th-skip">${T('Skip', 'Lewati')}</button>
    </div></div>
    <ol class="th-steps">${stages.map((g, i) => `<li data-i="${i}"><span class="dot"></span><span class="lbl">${esc(lang() === 'id' ? g.id : g.en)}</span><span class="val"></span></li>`).join('')}</ol>`;
  host.appendChild(root);

  const cv = root.querySelector<HTMLCanvasElement>('.th-cv')!;
  const off = document.createElement('canvas');
  off.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
  root.querySelector('.th-fig')!.appendChild(off);
  const nameEl = root.querySelector<HTMLElement>('.th-name')!, nEl = root.querySelector<HTMLElement>('.th-n')!, bar = root.querySelector<HTMLElement>('.th-bar i')!;
  const items = [...root.querySelectorAll<HTMLElement>('.th-steps li')];

  const face = bounds(s.lm.map(p => [p[0], p[1]] as [number, number]), 0.12);
  const les = s.lesion;
  const lp = les ? les.contourPx.map(p => [p[0], p[1]] as [number, number]) : [];
  const lesB = les && lp.length ? bounds(lp, 1.6) : face;
  const view = { cx: (face.x0 + face.x1) / 2, cy: (face.y0 + face.y1) / 2, span: Math.max(face.x1 - face.x0, face.y1 - face.y0) };
  const spanOf = (b: { x0: number; y0: number; x1: number; y1: number }) => Math.max(b.x1 - b.x0, b.y1 - b.y0, 40);
  view.span *= 1.08;

  let W = 0, H = 0, dpr = 1;
  const size = () => {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
    for (const c of [cv, off]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`; }
  };
  size();
  const ro = new ResizeObserver(size); ro.observe(root.querySelector('.th-fig')!);

  const ctx = cv.getContext('2d')!;
  const seeds = Array.from({ length: 46 }, () => ({ x: Math.random(), j: Math.random(), v: 0.4 + Math.random() }));
  const t0 = performance.now();
  let raf = 0, done = false, resolveFn: () => void = () => { /* set below */ };
  let shown = -1;

  const finish = () => {
    if (done) return;
    done = true; cancelAnimationFrame(raf); ro.disconnect();
    root.classList.add('out');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => { root.remove(); resolveFn(); }, 420);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
  window.addEventListener('keydown', onKey);
  root.querySelector('.th-skip')!.addEventListener('click', finish);

  const ease = (x: number) => x * x * (3 - 2 * x);

  const frame = (now: number) => {
    if (done) return;
    const el = (now - t0) / 1000;
    let acc = 0, idx = stages.length - 1, local = 1;
    for (let i = 0; i < stages.length; i++) {
      if (el < acc + stages[i].dur) { idx = i; local = (el - acc) / stages[i].dur; break; }
      acc += stages[i].dur;
    }
    if (el >= total + 0.55) { finish(); return; }
    const g = stages[idx], past = el >= total;
    if (idx !== shown) {
      shown = idx;
      nameEl.textContent = lang() === 'id' ? g.id : g.en;
      nEl.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(stages.length).padStart(2, '0')}`;
      items.forEach((li, i) => { li.classList.toggle('on', i === idx); li.classList.toggle('done', i < idx); if (i < idx) li.querySelector('.val')!.textContent = stages[i].readout(); });
    }
    if (past) items.forEach((li, i) => { li.classList.remove('on'); li.classList.add('done'); li.querySelector('.val')!.textContent = stages[i].readout(); });
    bar.style.width = `${Math.min(100, (el / total) * 100)}%`;

    // camera: the face first, then a push-in on the lesion
    const target = g.zoom === 'lesion' && les ? { cx: (lesB.x0 + lesB.x1) / 2, cy: (lesB.y0 + lesB.y1) / 2, span: spanOf(lesB) * 1.25 } : { cx: (face.x0 + face.x1) / 2, cy: (face.y0 + face.y1) / 2, span: Math.max(face.x1 - face.x0, face.y1 - face.y0) * 1.08 };
    const k = 1 - Math.pow(0.0025, 1 / 60);
    view.cx += (target.cx - view.cx) * k; view.cy += (target.cy - view.cy) * k; view.span += (target.span - view.span) * k;
    const sc = Math.min(W, H) / view.span;
    const v: ViewXf = { scale: sc, ox: W / 2 - view.cx * sc, oy: H / 2 - view.cy * sc };

    // base photo (dimmed) and the stage layers revealed behind the scan front
    const base: StudioState = { ...s, layers: { ...NONE } };
    drawAnnotated(cv, base, v);
    const front = past ? H + 4 : ease(Math.min(1, local * 1.08)) * (H + 8) - 4;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(5,6,8,0.42)'; ctx.fillRect(0, 0, W, H);
    const fake: StudioState = { ...s, layers: { ...NONE, ...g.layers } };
    drawAnnotated(off, fake, v);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, front)); ctx.clip();
    ctx.drawImage(off, 0, 0, W, H);
    ctx.restore();

    // scan front: bright line, falling glow, ticks and sparks
    if (!past && front > 0 && front < H + 2) {
      const gr = ctx.createLinearGradient(0, front - 90, 0, front);
      gr.addColorStop(0, 'rgba(95,232,200,0)'); gr.addColorStop(1, 'rgba(95,232,200,0.24)');
      ctx.fillStyle = gr; ctx.fillRect(0, Math.max(0, front - 90), W, Math.min(90, front));
      ctx.fillStyle = '#c8fff0'; ctx.shadowColor = '#5fe8c8'; ctx.shadowBlur = 16; ctx.fillRect(0, front - 1, W, 2); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(200,255,240,0.8)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, front - 1); ctx.lineTo(x, front - (x % 96 === 0 ? 9 : 4)); ctx.stroke(); }
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = '#c8fff0';
      ctx.fillText(`y ${(front / H).toFixed(3)}`, W - 62, front - 8);
      for (const sd of seeds) {
        const x = sd.x * W, y = front - ((el * 90 * sd.v + sd.j * 60) % 60);
        ctx.fillStyle = `rgba(200,255,240,${0.8 - (front - y) / 80})`; ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return new Promise<void>(res => { resolveFn = res; });
}
