import type { P2 } from '../clinical/rstl';
import { drawAnnotated, type ViewXf } from './draw';
import { commitMask, moveLandmark, paintMask, patch, state, tapLesion } from './store';
import { MIRROR_PAIRS } from '../clinical/face';

const EDIT_LM = [...new Set(Object.values(MIRROR_PAIRS).flat().concat([1, 2, 9, 13, 14, 17, 152, 168, 10]))];

/** The annotated photo: pan, zoom, tap a lesion, trace a wound line, paint the outline, drag landmarks, calibrate scale. */
export class View2D {
  readonly canvas = document.createElement('canvas');
  private v: ViewXf = { scale: 1, ox: 0, oy: 0 };
  private drag: { kind: 'pan' | 'brush' | 'lm' | 'none'; lm?: number; x: number; y: number; moved: boolean } = { kind: 'none', x: 0, y: 0, moved: false };
  private pts = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private scalePts: P2[] = [];
  onScaleRequest?: (a: P2, b: P2) => void;
  private raf = 0;

  constructor(private wrap: HTMLElement) {
    this.canvas.className = 'v2d-canvas';
    wrap.appendChild(this.canvas);
    new ResizeObserver(() => this.resize()).observe(wrap);
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('pointermove', e => this.move(e));
    c.addEventListener('pointerup', e => this.up(e));
    c.addEventListener('pointercancel', e => this.up(e));
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    c.addEventListener('dblclick', () => { if (state.tool === 'trace') this.finishTrace(); });
    this.resize();
  }

  fit(): void {
    const p = state.photo; if (!p) return;
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    let k = Math.min(w / p.width, h / p.height) * 0.96, cx = p.width / 2, cy = p.height / 2;
    if (state.lm) {
      // start on the face: a full-body portrait would otherwise leave the face a few pixels wide
      const xs = state.lm.map(q => q[0]), ys = state.lm.map(q => q[1]);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      k = Math.min(w / (bw * 1.5), h / (bh * 1.4)); cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    }
    this.v = { scale: k, ox: w / 2 - cx * k, oy: h / 2 - cy * k };
    this.draw();
  }

  resize(): void {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    this.canvas.width = Math.max(2, Math.floor(w * dpr)); this.canvas.height = Math.max(2, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.fit();
  }

  draw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      drawAnnotated(this.canvas, state, this.v);
      if (state.tool === 'scale' || state.tool === 'trace') this.drawPending();
    });
  }

  private drawPending(): void {
    const ctx = this.canvas.getContext('2d')!; const dpr = this.canvas.width / this.canvas.clientWidth;
    ctx.setTransform(this.v.scale * dpr, 0, 0, this.v.scale * dpr, this.v.ox * dpr, this.v.oy * dpr);
    ctx.strokeStyle = '#ffd36e'; ctx.fillStyle = '#ffd36e'; ctx.lineWidth = 2 / this.v.scale;
    const pts = state.tool === 'scale' ? this.scalePts : (state.woundPts ?? []);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 4 / this.v.scale, 0, 6.283); ctx.fill(); });
  }

  private toImg(e: PointerEvent): P2 { return [(e.offsetX - this.v.ox) / this.v.scale, (e.offsetY - this.v.oy) / this.v.scale]; }

  private zoomAt(x: number, y: number, f: number): void {
    const ns = Math.max(0.15, Math.min(14, this.v.scale * f));
    const k = ns / this.v.scale;
    this.v.ox = x - (x - this.v.ox) * k; this.v.oy = y - (y - this.v.oy) * k; this.v.scale = ns;
    this.draw();
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.drag.kind = 'none'; return; }
    const img = this.toImg(e);
    const tool = state.tool;
    this.drag = { kind: 'pan', x: e.offsetX, y: e.offsetY, moved: false };
    if ((tool === 'brush' || tool === 'erase') && state.lesion) { this.drag.kind = 'brush'; paintMask(img, 8 / this.v.scale * 3, tool === 'brush'); this.draw(); }
    if (tool === 'landmarks' && state.lm) {
      let best = -1, bd = 14 / this.v.scale;
      for (const i of EDIT_LM) { const d = Math.hypot(state.lm[i][0] - img[0], state.lm[i][1] - img[1]); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) this.drag = { kind: 'lm', lm: best, x: e.offsetX, y: e.offsetY, moved: false };
    }
  }

  private move(e: PointerEvent): void {
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pts.size === 2) {
      const [a, b] = [...this.pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinch);
      this.pinch = d; return;
    }
    const d = this.drag;
    if (d.kind === 'none') return;
    if (Math.hypot(e.offsetX - d.x, e.offsetY - d.y) > 3) d.moved = true;
    if (d.kind === 'pan' && d.moved) { this.v.ox += e.offsetX - d.x; this.v.oy += e.offsetY - d.y; d.x = e.offsetX; d.y = e.offsetY; this.draw(); }
    else if (d.kind === 'brush') { paintMask(this.toImg(e), 8 / this.v.scale * 3, state.tool === 'brush'); this.draw(); }
    else if (d.kind === 'lm' && d.lm != null) { moveLandmark(d.lm, this.toImg(e)); this.draw(); }
  }

  private up(e: PointerEvent): void {
    this.pts.delete(e.pointerId); this.pinch = 0;
    const d = this.drag; this.drag = { kind: 'none', x: 0, y: 0, moved: false };
    if (d.kind === 'brush') { commitMask(); this.draw(); return; }
    if (d.kind !== 'pan' || d.moved || !state.photo) return;
    const img = this.toImg(e);
    if (img[0] < 0 || img[1] < 0 || img[0] > state.photo.width || img[1] > state.photo.height) return;
    if (state.tool === 'tap') { void tapLesion(img).then(() => this.draw()); }
    else if (state.tool === 'trace') { state.woundPts = [...(state.woundPts ?? []), img]; patch({}); this.draw(); }
    else if (state.tool === 'scale') {
      this.scalePts.push(img);
      if (this.scalePts.length === 2) { const [a, b] = this.scalePts; this.scalePts = []; this.onScaleRequest?.(a, b); }
      this.draw();
    }
  }

  finishTrace(): void {
    if ((state.woundPts?.length ?? 0) >= 2) { patch({ tool: 'tap' }); import('./store').then(m => { m.analyseLesion(); m.emit(); this.draw(); }); }
  }
}
