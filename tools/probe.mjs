import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const out = {};
for (const node of doc.getRoot().listNodes()) {
  const m = node.getMesh(); if (!m) continue;
  const name = (node.getExtras() || {}).name || node.getName();
  const pts = [];
  for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i+1], a[i+2]]); }
  out[name] = pts;
}
const stat = pts => { const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9]; for (const p of pts) for (let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);} return {mn:mn.map(v=>+(v*1000).toFixed(1)), mx:mx.map(v=>+(v*1000).toFixed(1))}; };
for (const n of ['Mandible','Left nasal bone','Right nasal bone','Left zygomatic bone','Right zygomatic bone','Left upper central secondary incisor tooth','Frontal bone','Left maxilla','Left orbicularis oris','Left zygomaticus major','Left frontalis']) if (out[n]) console.log(n, JSON.stringify(stat(out[n])));
// specific points
const argmax = (pts,f)=>pts.reduce((b,p)=>f(p)>f(b)?p:b);
const man = out['Mandible']; const gn = argmax(man,p=>-p[1]); console.log('gnathion(mm)', gn.map(v=>+(v*1000).toFixed(1)));
const nb = [...out['Left nasal bone'],...out['Right nasal bone']]; const na = argmax(nb,p=>p[1]); console.log('nasal top(mm)', na.map(v=>+(v*1000).toFixed(1)));
const inc = out['Left upper central secondary incisor tooth']; const ib = argmax(inc,p=>p[2]-0.2*p[1]); console.log('incisor labial front(mm)', ib.map(v=>+(v*1000).toFixed(1)), 'edge min y', argmax(inc,p=>-p[1]).map(v=>+(v*1000).toFixed(1)));
const zy = [...out['Left zygomatic bone']]; console.log('zygion L max x(mm)', argmax(zy,p=>p[0]).map(v=>+(v*1000).toFixed(1)));
console.log('mandible angle max x(mm)', argmax(man,p=>p[0]).map(v=>+(v*1000).toFixed(1)));
const fr = out['Frontal bone']; console.log('glabella-ish: frontal max z', argmax(fr,p=>p[2]).map(v=>+(v*1000).toFixed(1)));
