import { T, esc } from './panels';
import { realHtml } from './real';
import { commitMask, paintMask, setCtx, state, tapLesion } from './store';
import { workImage } from '../clinical/segment';

/**
 * Examples run live: the photograph is loaded, a synthetic lesion is drawn on it, and the studio analyses it for real
 * (the caller plays the analysis on screen). The lesions are synthetic, drawn on public-domain portraits, never patient photographs.
 */
/** [landmark index, [dx, dy]] with the offset in face widths. */
export type Anchor = [number, [number, number]];
export interface Spec { sample: number; kind: 'laceration' | 'scar'; a: Anchor; b: Anchor; w: number }

export const SPECS: Record<string, Spec> = {
  ex1: { sample: 0, kind: 'laceration', a: [9, [-0.17, -0.04]], b: [9, [0.0, -0.145]], w: 0.014 },
  ex2: { sample: 1, kind: 'laceration', a: [9, [-0.12, -0.13]], b: [9, [0.12, -0.19]], w: 0.014 },
  ex3: { sample: 2, kind: 'scar', a: [234, [0.17, 0.16]], b: [234, [0.30, 0.36]], w: 0.011 },
  ex4: { sample: 1, kind: 'laceration', a: [152, [-0.12, -0.19]], b: [152, [0.06, -0.10]], w: 0.016 },
  ex5: { sample: 2, kind: 'scar', a: [10, [0.10, 0.07]], b: [10, [0.14, 0.20]], w: 0.011 },
  ex6: { sample: 0, kind: 'laceration', a: [234, [0.15, -0.03]], b: [234, [0.20, 0.13]], w: 0.013 },
};


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Draws the synthetic lesion on the loaded photograph and lets the studio segment, measure and plan it. */
export async function applySpec(id: string): Promise<boolean> {
  const sp = SPECS[id];
  if (!sp) return false;
  for (let k = 0; k < 80 && !(state.lm && state.work && !state.busy); k++) await sleep(150);
  if (!state.lm || !state.photo) return false;
  const lm = state.lm, fw = Math.abs(lm[454][0] - lm[234][0]);
  const P = (c: Anchor): [number, number] => [lm[c[0]][0] + c[1][0] * fw, lm[c[0]][1] + c[1][1] * fw];
  const a = P(sp.a), b = P(sp.b), cv = state.photo.canvas, g = cv.getContext('2d')!;
  const cols = sp.kind === 'laceration' ? ['#4d0f10', '#8c2a24'] : ['#a9625a', '#d49a8e'];
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = cols[0]; g.lineWidth = sp.w * fw; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.strokeStyle = cols[1]; g.lineWidth = sp.w * fw * 0.35; g.stroke(); g.restore();
  state.work = workImage(cv);
  setCtx({ kind: sp.kind });
  await tapLesion([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  if (!state.lesion) return false;
  state.lesion.mask.fill(0);
  for (let k = 0; k <= 24; k++) { const f = k / 24; paintMask([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], sp.w * fw * 0.5, true); }
  commitMask();
  state.woundPts = [a, b];
  setCtx({ kind: sp.kind });
  return !!state.report;
}

/** Gallery of examples as cards. Esc, the backdrop or the close button shut it; a card starts the live analysis. */
export async function openExamples(onPick: (id: string) => void): Promise<void> {
  const box = document.getElementById('examples')!;
  const body = box.querySelector<HTMLElement>('.ex-body')!;
  box.hidden = false;
  document.body.classList.add('modal-open');
  body.innerHTML = `<p class="muted">${T('Loading…', 'Memuat…')}</p>`;
  try {
    body.innerHTML = await realHtml();
    const pick = (el: HTMLElement) => { closeExamples(); onPick(el.dataset.ex!); };
    body.querySelectorAll<HTMLElement>('.ex-card').forEach(c => {
      c.addEventListener('click', ev => { if ((ev.target as HTMLElement).closest('.ex-sheet')) return; pick(c); });
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(c); } });
    });
  } catch {
    body.innerHTML = `<p class="muted">${T('The examples are not available from this server.', 'Contoh tidak tersedia dari server ini.')}</p>`;
  }
}

export function closeExamples(): void {
  const box = document.getElementById('examples');
  if (box) box.hidden = true;
  document.body.classList.remove('modal-open');
}

export function openLightbox(src: string): void {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<button type="button" class="lb-x" aria-label="${T('Close', 'Tutup')}">×</button><img src="${esc(src)}" alt="">`;
  const close = () => { lb.remove(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  lb.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(lb);
}
