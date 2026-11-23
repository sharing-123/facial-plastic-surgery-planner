"""Burn tab: tab wiring, a burn category in the gallery, role chips and the donor map styles."""
import json
import shutil
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src")
PUB = Path(r"C:\Users\allam\Downloads\FaceStudio\web\public\real")
SRC = Path(r"C:\Users\allam\AppData\Local\Temp\claude\a7673535580505a5\ad480fce-68da-4eca-922b-b10bdaa34a89\scratchpad\real3")

# photo of a real split-graft donor site (thigh) with its attribution
shutil.copy(SRC / "huid_verwijderdt_voor_transplantatie.jpg", PUB / "huid_verwijderdt_voor_transplantatie.jpg")
att = json.loads((PUB / "ATTRIBUTION.json").read_text(encoding="utf8"))
a3 = json.loads((SRC / "ATTRIBUTION.json").read_text(encoding="utf8"))
att["huid_verwijderdt_voor_transplantatie.jpg"] = a3["huid_verwijderdt_voor_transplantatie.jpg"]
(PUB / "ATTRIBUTION.json").write_text(json.dumps(att, indent=1, ensure_ascii=False), encoding="utf8")

# burn.ts: the thigh entry shows the real photograph
b = (W / "studio" / "burn.ts").read_text(encoding="utf8")
b = b.replace("interface Donor { id: string; x: number; y: number;", "interface Donor { photo?: string; id: string; x: number; y: number;", 1)
b = b.replace("{ id: 'thigh', x: 120, y: 380,", "{ photo: 'huid_verwijderdt_voor_transplantatie.jpg', id: 'thigh', x: 120, y: 380,", 1)
b = b.replace("info.innerHTML = `<h5 style=\"color:${COL[d.kind]}\">${esc(d.name[L])}</h5><p>${esc(d.note[L])}</p>`;",
              "info.innerHTML = `<h5 style=\"color:${COL[d.kind]}\">${esc(d.name[L])}</h5><p>${esc(d.note[L])}</p>${d.photo ? `<img class=\"donor-photo\" src=\"/real/${esc(d.photo)}\" alt=\"\"><p class=\"fine\">${T('A real photograph of a split-graft donor site on the thigh just after harvest (Wikimedia Commons, CC BY-SA 3.0).', 'Foto nyata lokasi donor cangkok terbelah pada paha tepat setelah pengambilan (Wikimedia Commons, CC BY-SA 3.0).')}</p>` : ''}`;", 1)
(W / "studio" / "burn.ts").write_text(b, encoding="utf8")

s = (W / "studio" / "store.ts").read_text(encoding="utf8")
s = s.replace("'nose' | 'cleft' | 'skin';", "'nose' | 'cleft' | 'skin' | 'burn';", 1)
(W / "studio" / "store.ts").write_text(s, encoding="utf8")

m = (W / "studio" / "mount.ts").read_text(encoding="utf8")
m = m.replace("import { mountWrinkles, wireWrinkles, wrinkleHtml } from './wrinkles';", "import { mountWrinkles, wireWrinkles, wrinkleHtml } from './wrinkles';\nimport { burnHtml, mountBurn, wireBurn } from './burn';", 1)
m = m.replace("['skin', 'Lines', 'Kerutan', 'photo']]", "['skin', 'Lines', 'Kerutan', 'photo'], ['burn', 'Burn', 'Luka bakar', 'photo']]", 1)
m = m.replace("""        <div class="view" data-view="skin" hidden id="v-skin"></div>""", """        <div class="view" data-view="skin" hidden id="v-skin"></div>
        <div class="view" data-view="burn" hidden id="v-burn"></div>""", 1)
m = m.replace("  mountWrinkles(document.getElementById('v-skin')!, () => renderResults());", "  mountWrinkles(document.getElementById('v-skin')!, () => renderResults());\n  mountBurn(document.getElementById('v-burn')!, () => renderResults());", 1)
m = m.replace("state.tab === 'cleft' || state.tab === 'skin') {", "state.tab === 'cleft' || state.tab === 'skin' || state.tab === 'burn') {", 1)
m = m.replace("state.tab === 'cleft' ? cleftHtml() : wrinkleHtml()}</div>`;", "state.tab === 'cleft' ? cleftHtml() : state.tab === 'burn' ? burnHtml() : wrinkleHtml()}</div>`;", 1)
m = m.replace("else if (state.tab === 'cleft') paintCleft(el); else wireWrinkles(el);", "else if (state.tab === 'cleft') paintCleft(el); else if (state.tab === 'burn') wireBurn(el); else wireWrinkles(el);", 1)
(W / "studio" / "mount.ts").write_text(m, encoding="utf8")

r = (W / "studio" / "real.ts").read_text(encoding="utf8")
r = r.replace("export type Cat = 'palsy' | 'cleft' | 'aesthetic' | 'wound';", "export type Cat = 'palsy' | 'cleft' | 'burn' | 'aesthetic' | 'wound';", 1)
r = r.replace("  { id: 'r-wound-mannequin'", """  { id: 'r-burn-donor', cat: 'burn', tab: 'burn', need: 'photo', files: ['huid_verwijderdt_voor_transplantatie.jpg'],
    title: ['Facial burn: graft or flap, and where the skin comes from', 'Luka bakar wajah: cangkok atau flap, dan dari mana kulit diambil'], sub: ['Depth, the usual options by site, the team, and a map of donor sites. The picture is a real split-graft donor site on the thigh. Add your own burn photograph to outline it.', 'Kedalaman, pilihan lazim menurut lokasi, tim, dan peta lokasi donor. Gambar adalah lokasi donor cangkok terbelah nyata pada paha. Tambahkan foto luka bakar Anda sendiri untuk dikonturkan.'] },
  { id: 'r-wound-mannequin'""", 1)
r = r.replace("  { cat: 'aesthetic', title:", """  { cat: 'burn', title: ['Facial burns: graft, flap and donor sites', 'Luka bakar wajah: cangkok, flap dan lokasi donor'], sub: ['Whether the burn is left to heal, grafted or covered with a flap, the roles of the team, and where the donor tissue is taken.', 'Apakah luka bakar dibiarkan sembuh, dicangkok atau ditutup flap, peran tim, dan dari mana jaringan donor diambil.'] },
  { cat: 'aesthetic', title:""", 1)
r = r.replace("  } else if (r.tab === 'skin') {", "  } else if (r.tab === 'burn') {\n    /* the tab opens empty on purpose: the guide and the donor map work without a photograph */\n  } else if (r.tab === 'skin') {", 1)
(W / "studio" / "real.ts").write_text(r, encoding="utf8")

css = r"""
/* role chips, depth buttons and the donor map */
.role { display: inline-block; margin: 0 6px 2px 0; padding: 1px 8px; border-radius: 999px; font: 500 0.64rem 'JetBrains Mono', monospace; letter-spacing: 0.02em; border: 1px solid; white-space: nowrap; }
.role.PS { color: #5fe8c8; border-color: rgba(95,232,200,0.5); background: rgba(95,232,200,0.08); } .role.NS { color: #c4a6ff; border-color: rgba(196,166,255,0.5); background: rgba(196,166,255,0.08); }
.role.ENT { color: #8ec5ff; border-color: rgba(142,197,255,0.5); background: rgba(142,197,255,0.08); } .role.NEU { color: #ff9ac4; border-color: rgba(255,154,196,0.5); background: rgba(255,154,196,0.08); }
.role.OPH { color: #f2c14b; border-color: rgba(242,193,75,0.5); background: rgba(242,193,75,0.08); } .role.REH { color: #9be3c1; border-color: rgba(155,227,193,0.5); background: rgba(155,227,193,0.08); }
.role.ICU { color: #ff8f6e; border-color: rgba(255,143,110,0.5); background: rgba(255,143,110,0.08); } .role.ORT, .role.OMF, .role.DENT { color: #ffd37a; border-color: rgba(255,211,122,0.5); background: rgba(255,211,122,0.08); }
.role.PED, .role.SLP, .role.DERM { color: #b8c4cc; border-color: rgba(184,196,204,0.5); background: rgba(184,196,204,0.08); }
.ref-ul li { display: block; } .donor { display: block; margin-top: 3px; font-style: normal; font-size: 0.78rem; color: #f2c14b; }
.chipbtns { display: grid; gap: 6px; } .chipbtn { text-align: left; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); color: var(--muted); font-size: 0.86rem; transition: border-color 0.2s, background-color 0.2s, color 0.2s; }
.chipbtn b { display: inline-block; width: 18px; color: #5fe8c8; font-family: 'JetBrains Mono', monospace; } .chipbtn[aria-pressed='true'] { border-color: #5fe8c8; background: rgba(95,232,200,0.1); color: var(--text); }
.dkeys { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.76rem; color: var(--muted); } .dkey { display: inline-flex; align-items: center; gap: 6px; } .dkey i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.donor-wrap { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 14px; align-items: start; } .donor-svg { width: 100%; height: auto; max-height: 440px; }
.donor-svg .dot { cursor: pointer; outline: none; } .donor-svg .ring { opacity: 0; transition: opacity 0.2s; } .donor-svg .dot:hover .ring, .donor-svg .dot.on .ring, .donor-svg .dot:focus-visible .ring { opacity: 1; }
.donor-info h5 { margin: 0 0 4px; font-size: 0.95rem; } .donor-info p { margin: 0 0 8px; font-size: 0.84rem; line-height: 1.5; color: var(--text); } .donor-photo { width: 100%; border-radius: 8px; border: 1px solid var(--line); }
@media (max-width: 520px) { .donor-wrap { grid-template-columns: 1fr; } }
"""
c = W / "styles" / "studio.css"
t = c.read_text(encoding="utf8")
if "/* role chips" not in t:
    c.write_text(t + css, encoding="utf8")
print("ok")
