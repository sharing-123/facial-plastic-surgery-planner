"""Nose tab: real profile photographs with pre-placed points, and a real before/after pair read side by side."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\studio")
n = (W / "nose.ts").read_text(encoding="utf8")

n = n.replace("import { loadPhotoFile } from './photo';", "import { loadPhotoFile, loadPhotoUrl } from './photo';", 1) if "loadPhotoUrl" not in n else n
n = n.replace("const st = { img:", "const st = { after: null as { img: HTMLCanvasElement; pts: Partial<Record<Key, P>> } | null, img:", 1)
n = n.replace("""export function noseMetrics(): { nf: number; nl: number; goode: number; len: number; proj: number } | null {
  const p = st.pts; if (!KEYS.every(k => p[k])) return null;""", """export function noseMetrics(p: Partial<Record<Key, P>> = st.pts): { nf: number; nl: number; goode: number; len: number; proj: number } | null {
  if (!KEYS.every(k => p[k])) return null;""", 1)
# a new image clears the pair
n = n.replace("st.img = p.canvas; st.w = p.width; st.h = p.height; st.pts = {}; st.name = f.name; st.demo = false; st.noseMm = null;", "st.img = p.canvas; st.w = p.width; st.h = p.height; st.pts = {}; st.name = f.name; st.demo = false; st.noseMm = null; st.after = null;", 1)

# results: the real outcome block, before the planned-profile card
n = n.replace("    <section class=\"mv-card\"><h5>${T('Planned profile (illustration)'", "    ${afterCard(m)}\n    <section class=\"mv-card\"><h5>${T('Planned profile (illustration)'", 1)
n += """
/** A real profile photograph with the eight points pre-placed (fractions of the picture) for the clinician to confirm or drag. */
export async function loadNoseUrl(url: string, name: string, frac: Record<string, [number, number]>, after?: { url: string; frac: Record<string, [number, number]> }): Promise<void> {
  const p = await loadPhotoUrl(url, name);
  st.img = p.canvas; st.w = p.width; st.h = p.height; st.name = name; st.demo = false; st.noseMm = null; st.after = null; st.pts = {};
  for (const k of KEYS) if (frac[k]) st.pts[k] = [frac[k][0] * st.w, frac[k][1] * st.h];
  if (after) {
    const a = await loadPhotoUrl(after.url, 'after'); const pts: Partial<Record<Key, P>> = {};
    for (const k of KEYS) if (after.frac[k]) pts[k] = [after.frac[k][0] * a.width, after.frac[k][1] * a.height];
    st.after = { img: a.canvas, pts };
  }
  refresh();
}

function afterCard(before: NonNullable<ReturnType<typeof noseMetrics>>): string {
  if (!st.after) return '';
  const a = noseMetrics(st.after.pts); if (!a) return '';
  const d = (x: number, y: number, u: string, dg = 0) => `${num(y - x, dg)}${u}`;
  const row = (label: string, b: string, af: string, ch: string) => `<div class="ns-row"><div><b>${esc(label)}</b><span>${T('before', 'sebelum')} ${esc(b)} · ${T('after', 'sesudah')} ${esc(af)}</span></div><strong>${esc(ch)}</strong></div>`;
  return `<section class="mv-card"><h5>${T('Real outcome: before and after (photographs)', 'Hasil nyata: sebelum dan sesudah (foto)')}</h5><div id="ns-real"></div>
    ${row(T('Nasofrontal angle', 'Sudut nasofrontal'), `${num(before.nf, 0)}°`, `${num(a.nf, 0)}°`, d(before.nf, a.nf, '°')) }
    ${row(T('Nasolabial angle', 'Sudut nasolabial'), `${num(before.nl, 0)}°`, `${num(a.nl, 0)}°`, d(before.nl, a.nl, '°'))}
    ${row(T('Goode ratio', 'Rasio Goode'), num(before.goode, 2), num(a.goode, 2), d(before.goode, a.goode, '', 2))}
    <p class="fine">${T('The points on both photographs were placed by the program for you to confirm; moving a point by a few pixels changes an angle by a few degrees. A real photograph pair is also affected by head position and lighting, so read the change as an estimate.', 'Titik pada kedua foto dipasang program untuk Anda konfirmasi; menggeser titik beberapa piksel mengubah sudut beberapa derajat. Pasangan foto nyata juga dipengaruhi posisi kepala dan cahaya, jadi baca perubahan sebagai perkiraan.')}</p></section>`;
}
"""
# slider for the real pair, added to wireNose
n = n.replace("  const host = root.querySelector<HTMLElement>('#ns-sim'), after = host ? simulate() : null;", """  const real = root.querySelector<HTMLElement>('#ns-real');
  if (real && st.after && st.img) {
    const a = document.createElement('canvas'); a.width = st.img.width; a.height = st.img.height; a.getContext('2d')!.drawImage(st.img as HTMLCanvasElement, 0, 0);
    const b = document.createElement('canvas'); b.width = a.width; b.height = a.height; b.getContext('2d')!.drawImage(st.after.img, 0, 0, a.width, a.height);
    real.appendChild(compareSlider(a, b, T('Before', 'Sebelum'), T('After', 'Sesudah')));
  }
  const host = root.querySelector<HTMLElement>('#ns-sim'), after = host ? simulate() : null;""", 1)
(W / "nose.ts").write_text(n, encoding="utf8")
print("ok")
