import { Group, Mesh } from 'three';
import { toGeometry, vertexNormals, type FaceMesh } from '../face/geometry';
import { createSkinMaterial } from './skin';
import type { Anatomy } from './anatomy';

export interface LayerState { peel: number; fat: number; muscle: number; bone: number }
export interface Layers {
  group: Group;
  fatMesh: Mesh;
  setAnatomy: (a: Anatomy) => void;
  setExplode: (e: number) => void;
  apply: (s: LayerState, time: number) => void;
}

/** Copy of the skin surface pushed inwards by a constant depth (world units). */
function offsetSurface(mesh: FaceMesh, depth: number): FaceMesh {
  const n = mesh.pos.length / 3;
  const nrm = vertexNormals(mesh.pos, mesh.tri);
  const pos = new Float32Array(mesh.pos);
  for (let i = 0; i < n; i++) {
    pos[i * 3] -= nrm[i * 3] * depth; pos[i * 3 + 1] -= nrm[i * 3 + 1] * depth; pos[i * 3 + 2] -= nrm[i * 3 + 2] * depth;
  }
  return { ...mesh, pos };
}

/**
 * Layers under the skin. The fat and SMAS shell is a schematic wax surface 2.6 mm below the skin; muscles and
 * bone come from the real anatomy meshes (see anatomy.ts) once they have loaded.
 */
export function buildLayers(mesh: FaceMesh): Layers {
  const group = new Group();
  const fat = createSkinMaterial('#e6c58a');
  fat.material.roughness = 0.6; fat.material.clearcoat = 0.12; fat.material.clearcoatRoughness = 0.5;
  fat.u.uPore.value = 0.4;
  const fatMesh = new Mesh(toGeometry(offsetSurface(mesh, 0.026)), fat.material);
  group.add(fatMesh);
  let anatomy: Anatomy | undefined;
  return {
    group, fatMesh,
    setAnatomy(a) { anatomy = a; group.add(a.group); },
    setExplode(e) {
      // layers separate along z so skin, fat, muscle and bone can be read one by one
      fatMesh.position.z = 0.5 * e;
      if (anatomy) { anatomy.muscles.position.z = 0.05 * e; anatomy.bones.position.z = -0.45 * e; }
    },
    apply(s, time) {
      fat.u.uTime.value = time;
      const open = s.peel > 0.001;
      fat.u.uDissolve.value = s.fat;
      fatMesh.visible = open && s.fat < 0.999;
      if (anatomy) anatomy.apply({ open, muscle: s.muscle, bone: s.bone }, time);
    },
  };
}
