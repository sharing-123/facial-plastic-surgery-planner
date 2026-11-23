/**
 * Illustrative previews: a smooth push field moves parts of a picture (nose tip, dorsum, a mouth corner, an alar base) and the
 * result is shown next to the original. It moves pixels along the planned geometry. It does not know about skin thickness, cartilage
 * or healing, so every preview is labelled an illustration and never a prediction.
 */
export interface Push { x: number; y: number; dx: number; dy: number; sigma: number }

export function warpPush(src: HTMLCanvasElement, pushes: Push[], maxSide = 720): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const sc = document.createElement('canvas'); sc.width = w; sc.height = h;
  sc.getContext('2d')!.drawImage(src, 0, 0, w, h);
  const S = sc.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d')!, O = octx.createImageData(w, h), D = O.data;
  const P = pushes.map(p => ({ x: p.x * k, y: p.y * k, dx: p.dx * k, dy: p.dy * k, s2: 2 * (p.sigma * k) ** 2, r: 3.2 * p.sigma * k }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ox = 0, oy = 0;
      for (const p of P) {
        const ddx = x - p.x, ddy = y - p.y;
        if (Math.abs(ddx) > p.r || Math.abs(ddy) > p.r) continue;
        const g = Math.exp(-(ddx * ddx + ddy * ddy) / p.s2);
        ox += p.dx * g; oy += p.dy * g;
      }
      // backward map: the pixel shown at (x, y) came from (x - ox, y - oy)
      const sx = Math.min(w - 1.001, Math.max(0, x - ox)), sy = Math.min(h - 1.001, Math.max(0, y - oy));
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = S[(y0 * w + x0) * 4 + c], b = S[(y0 * w + x0 + 1) * 4 + c], d = S[((y0 + 1) * w + x0) * 4 + c], e = S[((y0 + 1) * w + x0 + 1) * 4 + c];
        D[i + c] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + d * (1 - fx) * fy + e * fx * fy;
      }
    }
  }
  octx.putImageData(O, 0, 0);
  return out;
}

/** Before/after slider: drag the handle, or use the arrow keys. Returns the element to insert. */
export function compareSlider(before: HTMLCanvasElement, after: HTMLCanvasElement, labelBefore: string, labelAfter: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'cmp'; root.tabIndex = 0; root.setAttribute('role', 'slider'); root.setAttribute('aria-label', `${labelBefore} / ${labelAfter}`);
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  for (const [c, s] of [[a, before], [b, after]] as const) { c.width = s.width; c.height = s.height; c.getContext('2d')!.drawImage(s, 0, 0); }
  root.style.aspectRatio = `${before.width} / ${before.height}`;
  root.innerHTML = `<i class="cmp-l">${labelBefore}</i><i class="cmp-r">${labelAfter}</i><span class="cmp-h"><b></b></span>`;
  root.prepend(b); root.prepend(a);
  b.className = 'cmp-top';
  let p = 0.5;
  const set = (v: number) => { p = Math.max(0, Math.min(1, v)); root.style.setProperty('--p', `${p * 100}%`); };
  set(0.5);
  const at = (e: PointerEvent) => { const r = root.getBoundingClientRect(); set((e.clientX - r.left) / r.width); };
  root.addEventListener('pointerdown', e => { root.setPointerCapture(e.pointerId); at(e); });
  root.addEventListener('pointermove', e => { if (root.hasPointerCapture(e.pointerId)) at(e); });
  root.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') set(p - 0.05); else if (e.key === 'ArrowRight') set(p + 0.05); });
  // a short sweep so it is obvious the picture is a before/after
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t0 = performance.now();
    const step = (t: number) => { const x = (t - t0) / 1600; if (x > 1) return; set(0.5 + Math.sin(x * Math.PI * 2) * 0.35 * (1 - x)); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  return root;
}
