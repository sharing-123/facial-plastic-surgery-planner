"""One-off patch: scan HUD, new chapters (capture, rebuild), floor dial and shafts wiring for the landing page."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web")


def rd(p):
    return (W / p).read_text(encoding="utf8")


def wr(p, s):
    (W / p).write_text(s, encoding="utf8")


# ---- index.ts
i = rd("src/world/index.ts")
i = i.replace("  const beam = buildBeam();\n  scene.add(beam);",
              "  const beam = buildBeam();\n  const beam2 = buildBeam([3.4, 5.2, 2.2], 1.25, [0.72, 0.78, 1.0]);\n  const beam3 = buildBeam([0.4, 6.2, -3.2], 1.0, [0.8, 0.66, 1.0]);\n  scene.add(beam, beam2, beam3);", 1)
i = i.replace("uniforms.uAmount.value = 0.22 * s.light.beam;",
              "uniforms.uAmount.value = 0.22 * s.light.beam;\n      for (const b2 of [beam2, beam3]) (b2.material as unknown as { uniforms: { uAmount: { value: number } } }).uniforms.uAmount.value = 0.16 * s.light.beam;", 1)
i = i.replace("fu.uTime.value = time; fu.uStrength.value = s.light.floor; fu.uPool.value = s.light.pool;",
              "fu.uTime.value = time; fu.uStrength.value = s.light.floor; fu.uPool.value = s.light.pool; fu.uDial.value = s.light.dial;\n      world.hud.pct = cur.laser > 0.05 ? Math.max(0, Math.min(1, (0.98 - cur.scanY) / 1.96)) : 1;\n      world.hud.points = hero.scan.count * (cur.cloud > 0.05 ? world.hud.pct : 1);", 1)
i = i.replace("  state: WorldState;\n", "  state: WorldState;\n  hud: { pct: number; points: number };\n", 1)
i = i.replace("    stage, hero, get state() { return state; }, intro,", "    stage, hero, get state() { return state; }, intro, hud: { pct: 0, points: 0 },", 1)
wr("src/world/index.ts", i)

# ---- html
h = rd("index.html")
new_sections = '''      <section class="chapter side-left xtall" id="capture" data-chapter="1">
        <div class="copy">
          <h2 data-i18n-html="c1a.title">The face, <em>sampled</em> as points.</h2>
          <p data-i18n="c1a.body">A scanner returns a cloud of surface points. Scroll to sweep the laser down the face and watch the cloud settle onto the skin.</p>
          <p class="fine" data-i18n="c1a.note">Illustration. FaceStudio itself reads a photograph, not a depth scan.</p>
        </div>
      </section>

      <section class="chapter side-right xtall" id="rebuild" data-chapter="2">
        <div class="copy">
          <h2 data-i18n-html="c1b.title">Points become a <em>surface</em>.</h2>
          <p data-i18n="c1b.body">Landmarks are triangulated into a mesh, smoothed, and textured with your photograph. Here the mesh is built from the top down, behind the laser.</p>
        </div>
      </section>

      <section class="chapter side-left" id="landmarks" data-chapter="3">'''
h = h.replace('      <section class="chapter side-left" id="landmarks" data-chapter="1">', new_sections, 1)
for old, new in (('id="proportions" data-chapter="2"', 'id="proportions" data-chapter="4"'), ('id="zones" data-chapter="3"', 'id="zones" data-chapter="5"'),
                 ('id="rstl" data-chapter="4"', 'id="rstl" data-chapter="6"'), ('id="layers" data-chapter="5"', 'id="layers" data-chapter="7"'),
                 ('id="plan" data-chapter="6"', 'id="plan" data-chapter="8"'), ('id="studio" data-chapter="7"', 'id="studio" data-chapter="9"')):
    h = h.replace(old, new, 1)
h = h.replace('<section class="chapter side-left tall" id="layers"', '<section class="chapter side-left xtall" id="layers"', 1)
hud = '''  <canvas id="world" aria-hidden="true"></canvas>
  <div class="hud" id="hud" aria-hidden="true">
    <i class="br tl"></i><i class="br tr"></i><i class="br bl"></i><i class="br bb"></i>
    <div class="hud-box">
      <div class="hud-row"><span data-i18n="hud.stage">Stage</span><b id="hud-stage">-</b></div>
      <div class="hud-row"><span data-i18n="hud.scan">Scan</span><b id="hud-pct">0%</b></div>
      <div class="hud-bar"><i id="hud-bar"></i></div>
      <div class="hud-row"><span data-i18n="hud.points">Surface samples</span><b id="hud-pts">0</b></div>
      <div class="hud-row"><span data-i18n="hud.lm">Landmarks</span><b>478</b></div>
    </div>
  </div>'''
h = h.replace('  <canvas id="world" aria-hidden="true"></canvas>', hud, 1)
wr("index.html", h)

# ---- i18n
en = rd("src/i18n/en.ts")
en = en.replace("  'c2.title':", """  'c1a.title': 'The face, <em>sampled</em> as points.',
  'c1a.body': 'A scanner returns a cloud of surface points. Scroll to sweep the laser down the face and watch the cloud settle onto the skin.',
  'c1a.note': 'Illustration. FaceStudio itself reads a photograph, not a depth scan.',
  'c1b.title': 'Points become a <em>surface</em>.',
  'c1b.body': 'Landmarks are triangulated into a mesh, smoothed, and textured with your photograph. Here the mesh is built from the top down, behind the laser.',
  'hud.stage': 'Stage', 'hud.scan': 'Scan', 'hud.points': 'Surface samples', 'hud.lm': 'Landmarks',
  'hud.s0': 'Overview', 'hud.s1': 'Capture', 'hud.s2': 'Reconstruction', 'hud.s3': 'Landmarks', 'hud.s4': 'Proportions', 'hud.s5': 'Zones', 'hud.s6': 'Skin lines', 'hud.s7': 'Layers', 'hud.s8': 'Plan', 'hud.s9': 'Studio',
  'c2.title':""", 1)
en = en.replace("'c5.body': 'Skin, fat and SMAS, muscle, bone. The layers are schematic and scale to the landmarks. They are an illustration, not a scan.',",
                "'c5.body': 'Skin, fat and SMAS, muscle, bone, pulled apart so each can be read. The layers are schematic and scale to the landmarks. They are an illustration, not a scan.',")
wr("src/i18n/en.ts", en)
idn = rd("src/i18n/id.ts")
idn = idn.replace("  'c2.title':", """  'c1a.title': 'Wajah, diambil sebagai <em>titik</em>.',
  'c1a.body': 'Pemindai menghasilkan awan titik permukaan. Gulir untuk menyapukan laser dari dahi ke dagu dan lihat titik-titik itu menempel ke kulit.',
  'c1a.note': 'Ilustrasi. FaceStudio sendiri membaca foto, bukan pindai kedalaman.',
  'c1b.title': 'Titik menjadi <em>permukaan</em>.',
  'c1b.body': 'Landmark ditriangulasi menjadi mesh, dihaluskan, lalu diberi tekstur dari foto Anda. Di sini mesh dibangun dari atas ke bawah, di belakang laser.',
  'hud.stage': 'Tahap', 'hud.scan': 'Pindai', 'hud.points': 'Sampel permukaan', 'hud.lm': 'Landmark',
  'hud.s0': 'Gambaran', 'hud.s1': 'Pengambilan', 'hud.s2': 'Rekonstruksi', 'hud.s3': 'Landmark', 'hud.s4': 'Proporsi', 'hud.s5': 'Zona', 'hud.s6': 'Garis kulit', 'hud.s7': 'Lapisan', 'hud.s8': 'Rencana', 'hud.s9': 'Studio',
  'c2.title':""", 1)
idn = idn.replace("'c5.body': 'Kulit, lemak dan SMAS, otot, tulang. Lapisannya skematik dan mengikuti skala landmark. Ini ilustrasi, bukan hasil pindai.',",
                  "'c5.body': 'Kulit, lemak dan SMAS, otot, tulang, ditarik terpisah agar masing-masing terbaca. Lapisannya skematik dan mengikuti skala landmark. Ini ilustrasi, bukan hasil pindai.',")
wr("src/i18n/id.ts", idn)

# ---- css
c = rd("src/styles/landing.css")
c += """
.chapter.xtall { min-height: 330vh; }
.hud { position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: var(--mono); font-size: 0.7rem; color: var(--muted); }
.hud .br { position: absolute; width: 26px; height: 26px; border: 1px solid rgba(236, 232, 226, 0.32); }
.hud .tl { top: 84px; left: var(--pad); border-right: 0; border-bottom: 0; } .hud .tr { top: 84px; right: var(--pad); border-left: 0; border-bottom: 0; }
.hud .bl { bottom: 22px; left: var(--pad); border-right: 0; border-top: 0; } .hud .bb { bottom: 22px; right: var(--pad); border-left: 0; border-top: 0; }
.hud-box { position: absolute; top: 124px; right: var(--pad); width: 196px; display: grid; gap: 7px; padding: 12px 14px; background: rgba(7, 8, 10, 0.55); border: 1px solid var(--line); }
.hud-row { display: flex; justify-content: space-between; gap: 10px; } .hud-row b { font-weight: 500; color: var(--text); }
.hud-bar { height: 3px; background: rgba(236, 232, 226, 0.12); } .hud-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--ink), #fff); transition: width 120ms linear; }
.tag.leader::after { content: ''; position: absolute; right: 100%; top: 50%; width: 54px; height: 1px; background: linear-gradient(90deg, transparent, var(--line-strong)); }
@media (max-width: 860px) { .hud-box { display: none; } .hud .tl, .hud .tr { top: 70px; } }
@media (prefers-reduced-motion: reduce) { .hud-bar i { transition: none; } }
"""
wr("src/styles/landing.css", c)

# ---- landing.ts: chapter indexes for tags, layer tags, HUD updates
l = rd("src/landing.ts")
l = l.replace("addTag(1,", "addTag(@3,").replace("addTag(2,", "addTag(@4,").replace("addTag(6,", "addTag(@8,").replace("addTag(@", "addTag(")
l = l.replace("  // --- text reveal:", """  // exploded layers: one label per layer, tied to the layer's own position
  const layerNames = ['c5.l0', 'c5.l1', 'c5.l2', 'c5.l3'];
  layerNames.forEach((k, idx) => addTag(7, hero.layerAnchors[idx], () => `${t(k)}`, 78, -4 + idx * 2));
  tags.slice(-4).forEach(tg => tg.el.classList.add('leader'));

  // --- text reveal:""", 1)
l = l.replace("    updateSteps(s);", """    updateSteps(s);
    const hp = document.getElementById('hud-pct'), hb = document.getElementById('hud-bar'), hpt = document.getElementById('hud-pts'), hs = document.getElementById('hud-stage');
    if (hp && hb && hpt && hs) {
      const pc = Math.round(world.hud.pct * 100);
      hp.textContent = `${pc}%`; hb.style.width = `${pc}%`;
      hpt.textContent = Math.round(world.hud.points).toLocaleString(lang() === 'id' ? 'id-ID' : 'en-US');
      hs.textContent = t(CHAPTERS[world.state.active].hud);
    }""", 1)
l = l.replace("import { num, onBeforeLang, onLang, t } from './i18n';", "import { lang, num, onBeforeLang, onLang, t } from './i18n';", 1)
l = l.replace("const idx = sub < 0.08 ? 0 : sub < 0.38 ? 1 : sub < 0.64 ? 2 : 3;", "const idx = sub < 0.3 ? 0 : sub < 0.5 ? 1 : sub < 0.72 ? 2 : 3;", 1)
wr("src/landing.ts", l)
print("patched")
