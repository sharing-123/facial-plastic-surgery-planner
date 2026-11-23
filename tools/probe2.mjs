import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const node of doc.getRoot().listNodes()) {
  const m = node.getMesh(); if (!m) continue;
  const name = (node.getExtras() || {}).name || node.getName();
  if (!/^(Frontal bone|Left temporalis|Mandible|Left orbicularis oris|Left zygomaticus major)$/.test(name)) continue;
  const p = m.listPrimitives()[0];
  const pos = p.getAttribute('POSITION'), col = p.getAttribute('COLOR_0'), nor = p.getAttribute('NORMAL');
  const idx = p.getIndices();
  let c = [0,0,0]; if (col) { const a = col.getArray(); const n = col.getCount(); for (let i=0;i<n;i++) for (let k=0;k<3;k++) c[k]+=a[i*col.getElementSize()+k]; c = c.map(v=>+(v/n).toFixed(3)); }
  console.log(name, 'verts', pos.getCount(), 'tris', idx.getCount()/3, 'colorType', col && col.getComponentType(), col && col.getNormalized(), 'meanRGB', c, 'hasNormal', !!nor);
}
