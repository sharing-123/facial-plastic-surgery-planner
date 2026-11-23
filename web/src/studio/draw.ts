import type { P2 } from '../clinical/rstl';
import { traceStreamlines } from '../clinical/rstl';
import { ZONES } from '../clinical/zones';
import { geometricBrokenLine, sutureGuide, wPlasty, zPlastySeries } from '../clinical/markings';
import { MIRROR_PAIRS } from '../clinical/face';
import { zPlasty } from '../clinical/wound';
import { lang, num, t } from '../i18n';
import { state, zonesNow, type StudioState } from './store';

const GROUP_RGB: Record<string, string> = {
  forehead: '126,168,255', temple: '107,140,255', brow: '150,150,160', periorbital: '197,140,255', eye: '60,60,70', nose: '255,159,176',
  cheek: '255,179,138', perioral: '255,211,122', lip: '255,111,142', chin: '155,227,193', jaw: '127,210,255',
};
const INK = '#5fe8c8', MARK = '#ff8f6e';

let zoneCanvas: { key: string; c: HTMLCanvasElement } | null = null;
let rstlCache: { key: string; lines: P2[][] } | null = null;

const keyOf = (s: StudioState) => (s.P ? `${s.P[33][0].toFixed(2)}|${s.P[263][1].toFixed(2)}|${s.P[152][1].toFixed(2)}|${s.P[61][0].toFixed(2)}|${s.P[291][1].toFixed(2)}|${s.P[1][0].toFixed(2)}` : '');

function zoneLayer(s: StudioState): HTMLCanvasElement | null {
  const zm = zonesNow();
  if (!zm) return null;
  const k = keyOf(s);
  if (zoneCanvas?.key === k) return zoneCanvas.c;
  const c = document.createElement('canvas'); c.width = zm.w; c.height = zm.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(zm.w, zm.h);
  for (let i = 0; i < zm.lab.length; i++) {
    const id = zm.lab[i];
    if (!id) continue;
    const [r, g, b] = GROUP_RGB[ZONES[id - 1][1]].split(',').map(Number);
    const edge = (i % zm.w > 0 && zm.lab[i - 1] !== id) || (i >= zm.w && zm.lab[i - zm.w] !== id) || (i % zm.w < zm.w - 1 && zm.lab[i + 1] !== id) || (i + zm.w < zm.lab.length && zm.lab[i + zm.w] !== id);
    img.data.set(edge ? [240, 232, 255, 230] : [r, g, b, 70], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  zoneCanvas = { key: k, c };
  return c;
}

function rstlLines(s: StudioState): P2[][] {
  const k = keyOf(s) + `|${s.rstlDeg}`;
  if (rstlCache?.key === k) return rstlCache.lines;
  const seeds: P2[] = [];
  for (let y = -100; y <= 90; y += 8) for (let x = -80; x <= 80; x += 8) seeds.push([x + (Math.round(y / 8) % 2) * 4, y]);
  const lines = traceStreamlines(s.ctxR!, seeds, 2, 9);
  rstlCache = { key: k, lines };
  return lines;
}

const mmToPx = (s: StudioState) => (p: P2): P2 => s.frame!.toPx(p);

export interface ViewXf { scale: number; ox: number; oy: number }

/** Photo plus the layers the clinician has switched on, in image space transformed by the view. */
export function drawAnnotated(canvas: HTMLCanvasElement, s: StudioState, v: ViewXf): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = canvas.width / canvas.clientWidth || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!s.photo) return;
  ctx.setTransform(v.scale * dpr, 0, 0, v.scale * dpr, v.ox * dpr, v.oy * dpr);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.photo.canvas, 0, 0);
  if (!s.lm || !s.frame || !s.P) return;
  const toPx = mmToPx(s), pxmm = s.frame.scale, lw = (w: number) => w / v.scale;
  const L = s.layers;
  if (L.zones) {
    const zc = zoneLayer(s);
    if (zc) {
      const o = toPx([0, 0]), ex = toPx([1, 0]), ey = toPx([0, 1]);
      const X0 = -100, Y1 = 100;
      ctx.save();
      ctx.transform(ex[0] - o[0], ex[1] - o[1], -(ey[0] - o[0]), -(ey[1] - o[1]), o[0] + (ex[0] - o[0]) * X0 + (ey[0] - o[0]) * Y1, o[1] + (ex[1] - o[1]) * X0 + (ey[1] - o[1]) * Y1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(zc, 0, 0);
      ctx.restore();
    }
  }
  if (L.rstl && s.ctxR) {
    ctx.strokeStyle = 'rgba(205,189,255,0.85)'; ctx.lineWidth = lw(1.2); ctx.lineCap = 'round';
    for (const line of rstlLines(s)) { ctx.beginPath(); line.forEach((p, i) => { const q = toPx(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
  }
  if (L.grid) {
    const P = s.P; ctx.strokeStyle = 'rgba(95,232,200,0.9)'; ctx.lineWidth = lw(1.2); ctx.setLineDash([]);
    const line = (a: P2, b: P2) => { const p = toPx(a), q = toPx(b); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
    const xr = 95;
    for (const y of [P[10][1], P[9][1], P[2][1], P[152][1]]) line([-xr, y], [xr, y]);
    for (const x of [P[234][0], P[33][0], P[133][0], P[362][0], P[263][0], P[454][0]]) line([x, P[10][1]], [x, P[152][1] - 4]);
    ctx.setLineDash([lw(5), lw(5)]); ctx.strokeStyle = 'rgba(236,232,226,0.8)'; line([0, P[10][1]], [0, P[152][1] - 6]); ctx.setLineDash([]);
  }
  if (L.landmarks) {
    const key = new Set(Object.values(MIRROR_PAIRS).flat().concat([1, 2, 9, 13, 14, 17, 152, 168, 10]));
    for (let i = 0; i < s.lm.length; i++) {
      const big = key.has(i);
      ctx.fillStyle = big ? 'rgba(255,255,255,0.95)' : 'rgba(95,232,200,0.7)';
      ctx.beginPath(); ctx.arc(s.lm[i][0], s.lm[i][1], lw(big ? 3 : 1.3), 0, 6.283); ctx.fill();
      if (big) { ctx.strokeStyle = INK; ctx.lineWidth = lw(1.3); ctx.stroke(); }
    }
  }
  if (L.lesion && s.lesion) drawLesion(ctx, s, lw, pxmm);
  void toPx;
}

function drawLesion(ctx: CanvasRenderingContext2D, s: StudioState, lw: (w: number) => number, pxmm: number): void {
  const les = s.lesion!;
  const w = les.w, h = les.h, sc = les.scale;
  // outline from the mask edge pixels
  ctx.fillStyle = 'rgba(255,143,110,0.20)';
  const c = ctx.canvas;
  void c;
  const edge = les.contourPx;
  ctx.fillStyle = MARK;
  for (const p of edge) { ctx.fillRect(p[0] - lw(0.8), p[1] - lw(0.8), lw(1.6), lw(1.6)); }
  void w; void h; void sc;
  const [a, b] = les.endpoints;
  ctx.strokeStyle = '#dffff6'; ctx.lineWidth = lw(1.4); ctx.setLineDash([lw(4), lw(3)]);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
  const mm = (les.majorPx / pxmm), mn = (les.minorPx / pxmm);
  ctx.font = `${lw(12)}px "JetBrains Mono", monospace`; ctx.fillStyle = '#fff';
  ctx.fillText(`${num(mm, 1)} x ${num(mn, 1)} mm`, les.centroid[0] + lw(10), les.centroid[1] - lw(10));
  if (s.woundPts && s.woundPts.length) {
    ctx.strokeStyle = MARK; ctx.lineWidth = lw(2);
    ctx.beginPath(); s.woundPts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    for (const p of s.woundPts) { ctx.fillStyle = MARK; ctx.beginPath(); ctx.arc(p[0], p[1], lw(3.5), 0, 6.283); ctx.fill(); }
  }
}

/* ---------------------------------------------------------------- three pictures for a plan */

export interface PlanImages { measured: HTMLCanvasElement; marking: HTMLCanvasElement; result: HTMLCanvasElement; box: { x: number; y: number; size: number } }

function cropCanvas(s: StudioState): { c: HTMLCanvasElement; x0: number; y0: number; k: number; size: number } {
  const rep = s.report!, les = s.lesion!;
  const halfMm = Math.max(28, Math.min(75, rep.lengthMm * 1.5 + 14));
  const half = halfMm * s.frame!.scale;
  const cx = les.centroid[0], cy = les.centroid[1];
  const size = half * 2, out = 720;
  const c = document.createElement('canvas'); c.width = out; c.height = out;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#101216'; ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.photo!.canvas, cx - half, cy - half, size, size, 0, 0, out, out);
  return { c, x0: cx - half, y0: cy - half, k: out / size, size };
}

function pathMM(ctx: CanvasRenderingContext2D, pts: P2[], tf: (p: P2) => P2, close = false): void {
  ctx.beginPath();
  pts.forEach((p, i) => { const q = tf(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
  if (close) ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#fff'): void {
  ctx.font = '600 15px "JetBrains Mono", monospace';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = 'rgba(9,10,13,0.82)'; ctx.fillRect(x, y - 15, w, 24);
  ctx.fillStyle = color; ctx.fillText(text, x + 7, y + 2);
}

export function drawPlanImages(s: StudioState): PlanImages | null {
  if (!s.photo || !s.frame || !s.report || !s.lesion || !s.plan) return null;
  const rep = s.report, plan = s.plan, fr = s.frame;
  const base = cropCanvas(s);
  const tfPx = (p: P2): P2 => [(p[0] - base.x0) * base.k, (p[1] - base.y0) * base.k];
  const tf = (q: P2): P2 => tfPx(fr.toPx(q));
  const pxPerMm = fr.scale * base.k;
  const copy = () => { const c = document.createElement('canvas'); c.width = c.height = 720; c.getContext('2d')!.drawImage(base.c, 0, 0); return c; };

  // 1. measured
  const m = copy(); let ctx = m.getContext('2d')!;
  ctx.strokeStyle = MARK; ctx.lineWidth = 2.5; ctx.fillStyle = 'rgba(255,143,110,0.18)';
  const cont = s.lesion.contourPx.map(tfPx);
  ctx.beginPath(); cont.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  const ax = [-1, 1].map(sg => tf([rep.centre[0] + Math.cos((rep.axis * Math.PI) / 180) * 24 * sg, rep.centre[1] + Math.sin((rep.axis * Math.PI) / 180) * 24 * sg] as P2));
  ctx.beginPath(); ctx.moveTo(ax[0][0], ax[0][1]); ctx.lineTo(ax[1][0], ax[1][1]); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; pathMM(ctx, rep.Q, tf); ctx.stroke();
  const c0 = tf(rep.centre);
  label(ctx, `${num(rep.lengthMm, 1)} mm`, c0[0] + 14, c0[1] - 22);
  label(ctx, `RSTL ${num(rep.axis, 0)}°  Δ ${num(rep.meanAngle, 0)}°`, c0[0] + 14, c0[1] + 28, '#c8fff0');
  const sb = 10 * pxPerMm;
  ctx.fillStyle = '#fff'; ctx.fillRect(28, 676, sb, 5); ctx.fillRect(28, 670, 2, 17); ctx.fillRect(28 + sb - 2, 670, 2, 17);
  label(ctx, '10 mm', 36 + sb, 684);

  // 2. marking
  const k = copy(); ctx = k.getContext('2d')!;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const draw = (pts: P2[], color: string, w: number, dash: number[] = []) => { ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = w; pathMM(ctx, pts, tf); ctx.stroke(); ctx.setLineDash([]); };
  draw(rep.Q, 'rgba(255,255,255,0.8)', 2, [6, 5]);
  if (plan.marking.includes('ellipse')) draw(rep.ellipsePts, MARK, 3.2);
  if (plan.marking.includes('z_plasty')) {
    for (const z of zPlastySeries(rep.Q, 60, Math.max(8, rep.lengthMm / Math.max(1, Math.round(rep.lengthMm / 15))))) { draw(z.central, MARK, 3.2); draw(z.arm1, MARK, 3.2); draw(z.arm2, MARK, 3.2); }
  }
  if (plan.marking.includes('w_plasty')) { const [a, b] = wPlasty(rep.Q, 6); draw(a, MARK, 3); draw(b, '#dffff6', 3); }
  if (plan.marking.includes('gblc')) draw(geometricBrokenLine(rep.Q), '#ffe4a8', 3, [2, 6]);
  if (plan.marking.includes('suture_guide')) {
    const line = plan.marking.includes('ellipse') ? [[rep.centre[0] - Math.cos((rep.axis * Math.PI) / 180) * rep.ellipse.halfLengthMm, rep.centre[1] - Math.sin((rep.axis * Math.PI) / 180) * rep.ellipse.halfLengthMm], [rep.centre[0] + Math.cos((rep.axis * Math.PI) / 180) * rep.ellipse.halfLengthMm, rep.centre[1] + Math.sin((rep.axis * Math.PI) / 180) * rep.ellipse.halfLengthMm]] as P2[] : rep.Q;
    for (const m2 of sutureGuide(line, 4, 3)) {
      const a = tf(m2.a), b = tf(m2.b);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const c = tf(m2.centre);
      if (m2.order <= 9) { ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.arc(c[0] + 12, c[1] - 12, 9, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(String(m2.order), c[0] + 12, c[1] - 8); ctx.textAlign = 'start'; }
    }
  }
  for (const c of rep.critical) { void c; }
  if (!plan.marking.length) label(ctx, lang() === 'id' ? 'Tanpa marking otomatis' : 'No automatic marking', 24, 40, '#dffff6');

  // 3. expected result: lesion removed, final line drawn, sutures faded. An illustration, not a prediction.
  const r = copy(); ctx = r.getContext('2d')!;
  const ring: number[] = [0, 0, 0]; let rn = 0;
  const bd = ctx.getImageData(0, 0, 720, 720).data;
  const bb = cont.reduce((a, p) => ({ x0: Math.min(a.x0, p[0]), x1: Math.max(a.x1, p[0]), y0: Math.min(a.y0, p[1]), y1: Math.max(a.y1, p[1]) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
  const pad = 22;
  for (let y = Math.max(0, bb.y0 - pad * 2); y < Math.min(720, bb.y1 + pad * 2); y += 3) for (let x = Math.max(0, bb.x0 - pad * 2); x < Math.min(720, bb.x1 + pad * 2); x += 3) {
    if (x > bb.x0 - pad && x < bb.x1 + pad && y > bb.y0 - pad && y < bb.y1 + pad) continue;
    const i = (y * 720 + x) * 4; ring[0] += bd[i]; ring[1] += bd[i + 1]; ring[2] += bd[i + 2]; rn++;
  }
  if (rn) {
    ctx.save(); ctx.filter = 'blur(7px)'; ctx.fillStyle = `rgb(${Math.round(ring[0] / rn)},${Math.round(ring[1] / rn)},${Math.round(ring[2] / rn)})`;
    ctx.beginPath(); cont.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  let finalLine: P2[] = rep.Q;
  const primary = plan.techniques[0]?.name.k;
  if (primary === 't.ellipse' || primary === 't.ellipse_min') {
    const cth = Math.cos((rep.axis * Math.PI) / 180), sth = Math.sin((rep.axis * Math.PI) / 180);
    finalLine = [[rep.centre[0] - cth * rep.ellipse.halfLengthMm, rep.centre[1] - sth * rep.ellipse.halfLengthMm], [rep.centre[0] + cth * rep.ellipse.halfLengthMm, rep.centre[1] + sth * rep.ellipse.halfLengthMm]];
  } else if (primary === 't.z') {
    const zz = zPlasty(rep.Q[0], rep.Q[rep.Q.length - 1], 60);
    finalLine = [zz.arm1[1], zz.arm2[1]];
  } else if (primary === 't.w') finalLine = geometricBrokenLine(rep.Q, 11, [3, 5], [1, 2]);
  if (plan.sutures || plan.marking.length) {
    ctx.strokeStyle = 'rgba(214,150,140,0.95)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; pathMM(ctx, finalLine, tf); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,232,0.35)'; ctx.lineWidth = 1; pathMM(ctx, finalLine, tf); ctx.stroke();
  }
  label(ctx, lang() === 'id' ? 'Ilustrasi, bukan prediksi' : 'Illustration, not a prediction', 24, 40, '#c8fff0');
  void t;
  void state;
  return { measured: m, marking: k, result: r, box: { x: base.x0, y: base.y0, size: base.size } };
}
