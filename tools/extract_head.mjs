/**
 * Cut the head out of Ecorche (CC BY-SA 4.0, github.com/Charleeh/ecorche): skull bones, teeth, nasal cartilage and
 * the muscles of the face. World transforms are baked in (metres, Y up, face toward +Z), colours kept, geometry
 * simplified, and the result written as one compact GLB with meshopt compression.
 *
 *   node extract_head.mjs <ecorche.glb> <out.glb> <out.manifest.json>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import fs from 'node:fs';

const [, , src, out, manifestPath] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(src);
await doc.transform(dequantize());

const BONE = /(frontal bone|parietal bone|temporal bone|occipital bone|sphenoid|ethmoid|zygomatic bone|maxilla|mandible|nasal bone|lacrimal|vomer|palatine|inferior nasal concha|tooth|sclera|cornea|nasal cartilage|septal nasal)/i;
const MUSCLE = /(corrugator|masseter|depressor|frontalis|levator labii|mentalis|nasalis|orbicularis|procerus|risorius|temporalis|zygomaticus|pterygoid|buccinator|occipitalis)/i;

const root = doc.getRoot();
const keep = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  const ex = node.getExtras() || {};
  const name = ex.name || node.getName();
  if (!mesh || !name) continue;
  const isMuscle = MUSCLE.test(name) && !/(thorac|abdomin|latissimus|serratus|erector|psoas|iliacus)/i.test(name);
  const isBone = BONE.test(name) && !/(femur|tibia|fibula|humerus)/i.test(name);
  if (!isMuscle && !isBone) continue;
  keep.push({ node, mesh, name, kind: isMuscle ? 'muscle' : 'bone', ex });
}
console.error('selected', keep.length, 'bones', keep.filter(k => k.kind === 'bone').length, 'muscles', keep.filter(k => k.kind === 'muscle').length);

// bake world matrices into the vertex positions, then drop everything else
const mul = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
];
const keepNodes = new Set(keep.map(k => k.node));
for (const { node, mesh } of keep) {
  const m = node.getWorldMatrix();
  const sc = Math.cbrt(Math.abs(m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])));
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const a = pos.getArray();
    const outArr = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) {
      const p = mul(m, a[i], a[i + 1], a[i + 2]);
      outArr[i] = p[0]; outArr[i + 1] = p[1]; outArr[i + 2] = p[2];
    }
    pos.setArray(outArr);
    const nrm = prim.getAttribute('NORMAL');
    if (nrm) {
      const n = nrm.getArray(); const no = new Float32Array(n.length);
      for (let i = 0; i < n.length; i += 3) {
        const x = m[0] * n[i] + m[4] * n[i + 1] + m[8] * n[i + 2], y = m[1] * n[i] + m[5] * n[i + 1] + m[9] * n[i + 2], z = m[2] * n[i] + m[6] * n[i + 1] + m[10] * n[i + 2];
        const l = Math.hypot(x, y, z) || 1;
        no[i] = x / l; no[i + 1] = y / l; no[i + 2] = z / l;
      }
      nrm.setArray(no);
    }
    void sc;
  }
}
for (const node of root.listNodes()) {
  if (keepNodes.has(node)) { node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); continue; }
}
const scene = root.listScenes()[0];
for (const { node } of keep) { node.getParentNode()?.removeChild(node); scene.addChild(node); }
for (const node of root.listNodes()) if (!keepNodes.has(node) && node.listChildren().length === 0) node.dispose();
for (const node of root.listNodes()) if (!keepNodes.has(node) && !node.getMesh()) node.dispose();
for (const node of root.listNodes()) if (!keepNodes.has(node)) node.dispose();
await doc.transform(prune());
await doc.transform(weld({ tolerance: 1e-5 }));
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.8, error: 0.0004, lockBorder: false }));

doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);

let tri = 0; const manifest = [];
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const { node, name, kind, ex } of keep) {
  const mesh = node.getMesh(); if (!mesh) continue;
  let t = 0;
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices(); t += idx ? idx.getCount() / 3 : 0;
    const a = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a[i + k]); mx[k] = Math.max(mx[k], a[i + k]); }
  }
  tri += t;
  manifest.push({ name, kind, side: ex.side ?? null, layer: ex.layer ?? null, fma: ex.fma ?? null, source: ex.source ?? null, tri: t });
}
fs.writeFileSync(manifestPath, JSON.stringify({ bbox: { min: mn, max: mx }, triangles: tri, structures: manifest }, null, 1));
console.error('triangles', tri, 'bbox', mn.map(v => +v.toFixed(3)), mx.map(v => +v.toFixed(3)), 'bytes', fs.statSync(out).size);
