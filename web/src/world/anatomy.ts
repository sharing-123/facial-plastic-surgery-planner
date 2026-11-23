import { Color, DoubleSide, Group, Matrix4, Mesh, MeshPhysicalMaterial, type IUniform } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Real anatomy under the canonical skin: skull, teeth, nasal cartilage and the muscles of the face, from Ecorche
 * (CC BY-SA 4.0, based on BodyParts3D and Z-Anatomy). See public/models/NOTICE-head_anatomy.txt.
 *
 * Alignment is a similarity fit of four skull landmarks (nasion, glabella, gnathion, upper incisor edge) to the
 * canonical face with assumed soft-tissue thickness, plus a width correction. It is an illustration fit, not a
 * registration to any patient.
 */
const FIT = { sx: 0.95, s: 1.02, pitch: 0.045, tyMm: -1604.9, tzMm: -124.2 };
const MM = 0.01;

export interface Anatomy {
  group: Group;
  muscles: Group;
  bones: Group;
  apply: (s: { open: boolean; muscle: number; bone: number }, time: number) => void;
}

interface DissolveU { uDissolve: IUniform<number>; uEdge: IUniform<Color> }

function anatomyMaterial(opts: { roughness: number; clearcoat: number; sheen: number; tint: string; colors: boolean; streak: number; bump: number; mottle: number }): { material: MeshPhysicalMaterial; u: DissolveU } {
  const u: DissolveU = { uDissolve: { value: 0 }, uEdge: { value: new Color('#5fe8c8') } };
  const material = new MeshPhysicalMaterial({
    vertexColors: opts.colors, roughness: opts.roughness, metalness: 0, clearcoat: opts.clearcoat, clearcoatRoughness: 0.3,
    sheen: opts.sheen, sheenColor: new Color(opts.tint), envMapIntensity: 1.2, side: DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uDissolve = u.uDissolve; shader.uniforms.uEdge = u.uEdge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; uniform float uDissolve; uniform vec3 uEdge;
        float anHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float anNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(anHash(i), anHash(i+vec3(1,0,0)), f.x), mix(anHash(i+vec3(0,1,0)), anHash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(anHash(i+vec3(0,0,1)), anHash(i+vec3(1,0,1)), f.x), mix(anHash(i+vec3(0,1,1)), anHash(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float anField = (anNoise(vObj * 5.5) * 0.5 + anNoise(vObj * 11.0) * 0.1) * 0.25 + (0.5 - vObj.y * 0.5) * 0.8;
        float anCut = uDissolve * 1.45 - 0.2;
        if (uDissolve > 0.001 && anField < anCut) discard;
        float anEdge = (uDissolve > 0.001) ? 1.0 - smoothstep(0.0, 0.028, anField - anCut) : 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= ${(1 - opts.mottle / 2).toFixed(3)} + ${opts.mottle.toFixed(3)} * anNoise(vObj * 22.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float h = anNoise(vObj * vec3(${opts.streak.toFixed(1)}, ${(opts.streak * 6).toFixed(1)}, ${opts.streak.toFixed(1)})) * 0.6 + anNoise(vObj * 150.0) * 0.4;
          vec3 sp = -vViewPosition; vec3 sx = dFdx(sp), sy = dFdy(sp);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1);
          vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * ${opts.bump.toFixed(4)};
          normal = normalize(abs(det) * normal - g);
        }`)
      .replace('#include <opaque_fragment>', `outgoingLight += uEdge * anEdge * 2.6;\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `fs-anatomy-${opts.tint}-${opts.colors}`;
  return { material, u };
}

export async function loadAnatomy(url = '/models/head_anatomy.glb'): Promise<Anatomy> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const fit = new Matrix4();
  const c = Math.cos(FIT.pitch), s = Math.sin(FIT.pitch);
  // bone mm (face toward +z, y up) -> canonical mm: scale, pitch about x, translate; then mm -> world units
  fit.set(
    FIT.sx * FIT.s, 0, 0, 0,
    0, FIT.s * c, -FIT.s * s, FIT.tyMm,
    0, FIT.s * s, FIT.s * c, FIT.tzMm,
    0, 0, 0, 1,
  );
  const toWorld = new Matrix4().makeScale(MM, MM, MM).multiply(fit).multiply(new Matrix4().makeScale(1000, 1000, 1000));

  const muscleMat = anatomyMaterial({ roughness: 0.42, clearcoat: 0.55, sheen: 0.4, tint: '#ff8f80', colors: true, streak: 14, bump: 0.006, mottle: 0.28 });
  muscleMat.material.color.setRGB(3.4, 2.1, 2.0);
  const boneMat = anatomyMaterial({ roughness: 0.5, clearcoat: 0.12, sheen: 0.5, tint: '#fff2dc', colors: false, streak: 60, bump: 0.0012, mottle: 0.1 });
  boneMat.material.color.set('#d8cbb2');
  const group = new Group(), muscles = new Group(), bones = new Group();
  const meshes: Mesh[] = [];
  gltf.scene.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
  for (const m of meshes) {
    const ex = m.userData as { name?: string; layer?: string };
    const name = ex.name ?? m.name;
    const muscle = /(orbicularis|zygomatic(us)?\s|frontalis|masseter|temporalis|corrugator|procerus|nasalis|risorius|mentalis|depressor|levator|pterygoid|buccinator|occipitalis)/i.test(name) && !/bone/i.test(name);
    const geo = m.geometry.clone();
    geo.applyMatrix4(toWorld);
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, muscle ? muscleMat.material : boneMat.material);
    mesh.name = name; mesh.userData = { name, kind: muscle ? 'muscle' : 'bone' };
    (muscle ? muscles : bones).add(mesh);
  }
  group.add(bones, muscles);
  return {
    group, muscles, bones,
    apply(st, _time) {
      group.visible = st.open;
      muscleMat.u.uDissolve.value = st.muscle;
      boneMat.u.uDissolve.value = st.bone;
      muscles.visible = st.muscle < 0.999;
      bones.visible = st.bone < 0.999;
    },
  };
}
