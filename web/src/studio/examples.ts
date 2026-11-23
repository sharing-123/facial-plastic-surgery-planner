import { lang } from '../i18n';
import { T, esc } from './panels';

interface Ex { id: string; title: Record<string, string>; sheet: Record<string, string>; note: Record<string, string> }

let cache: Ex[] | undefined;

async function load(): Promise<Ex[]> {
  if (cache) return cache;
  const r = await fetch('/api/examples');
  if (!r.ok) throw new Error(String(r.status));
  cache = (await r.json()) as Ex[];
  return cache;
}

/** Gallery of annotated example outputs (three panels plus findings). The lesions are synthetic, drawn on public-domain portraits. */
export async function openExamples(): Promise<void> {
  const box = document.getElementById('examples')!;
  const body = box.querySelector<HTMLElement>('.ex-body')!;
  box.hidden = false;
  body.innerHTML = `<p class="muted">${T('Loading…', 'Memuat…')}</p>`;
  try {
    const items = await load();
    const l = lang();
    body.innerHTML = items.map(e => `<figure class="ex-item"><img src="/api/examples/img/${esc(e.sheet[l] ?? e.sheet.en)}" alt="${esc(e.title[l] ?? e.title.en)}"><figcaption>${esc(e.note[l] ?? e.note.en)}</figcaption></figure>`).join('');
  } catch {
    body.innerHTML = `<p class="muted">${T('The examples are not available from this server.', 'Contoh tidak tersedia dari server ini.')}</p>`;
  }
}

export function closeExamples(): void { document.getElementById('examples')!.hidden = true; }
