import { Color, DoubleSide, MeshPhysicalMaterial, type IUniform, type Texture } from 'three';

export interface SkinUniforms {
  uDissolve: IUniform<number>;
  uEdge: IUniform<Color>;
  uTime: IUniform<number>;
  uPore: IUniform<number>;
  uSss: IUniform<number>;
  uTint: IUniform<Color>;
  uTintMix: IUniform<number>;
  uZone: IUniform<Texture | null>;
  uZoneMix: IUniform<number>;
  uSolid: IUniform<number>;
}

const NOISE = /* glsl */`
  float fsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fsNoise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(fsHash(i+vec3(0,0,0)), fsHash(i+vec3(1,0,0)), f.x), mix(fsHash(i+vec3(0,1,0)), fsHash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(fsHash(i+vec3(0,0,1)), fsHash(i+vec3(1,0,1)), f.x), mix(fsHash(i+vec3(0,1,1)), fsHash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fsFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * fsNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

/**
 * Porcelain-skin material: physical shading plus procedural pores, a thin-tissue warm rim (cheap subsurface),
 * and a noise dissolve with a glowing edge used for the intro and for peeling layers.
 */
export function createSkinMaterial(color = '#e6cdbd'): { material: MeshPhysicalMaterial; u: SkinUniforms } {
  const u: SkinUniforms = {
    uDissolve: { value: 0 },
    uEdge: { value: new Color('#5fe8c8') },
    uTime: { value: 0 },
    uPore: { value: 1 },
    uSss: { value: 1 },
    uTint: { value: new Color('#ffffff') },
    uTintMix: { value: 0 },
    uZone: { value: null },
    uZoneMix: { value: 0 },
    uSolid: { value: 1 },
  };
  const material = new MeshPhysicalMaterial({
    color: new Color(color), roughness: 0.5, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.42,
    sheen: 0.9, sheenRoughness: 0.55, sheenColor: new Color('#ff9f8a'), envMapIntensity: 1.15,
    transparent: false, side: DoubleSide,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; uniform float uDissolve; uniform vec3 uEdge; uniform float uTime; uniform float uPore; uniform float uSss;
        uniform vec3 uTint; uniform float uTintMix; uniform sampler2D uZone; uniform float uZoneMix; uniform float uSolid;
        ${NOISE}
        vec3 fsBump(vec3 sp, vec3 sn, vec2 dh){
          vec3 sx = dFdx(sp), sy = dFdy(sp);
          vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
          float det = dot(sx, r1);
          vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
          return normalize(abs(det) * sn - g);
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fsDissolveField = fsFbm(vObj * 5.5) * 0.2 + (0.5 - vObj.y * 0.5) * 0.8;
        float fsCut = uDissolve * 1.45 - 0.2;
        if (uDissolve > 0.001 && fsDissolveField < fsCut) discard;
        float fsPlane = mix(1.2, -1.2, uSolid);
        float fsBuilt = 0.0;
        if (uSolid < 0.999) {
          float bn = fsFbm(vObj * 10.0) * 0.1;
          if (vObj.y + bn < fsPlane) discard;
          fsBuilt = 1.0 - smoothstep(0.0, 0.035, vObj.y + bn - fsPlane);
        }
        float fsEdge = (uDissolve > 0.001) ? 1.0 - smoothstep(0.0, 0.028, fsDissolveField - fsCut) : 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fsTone = fsFbm(vObj * 7.0);
        diffuseColor.rgb *= 0.93 + fsTone * 0.14;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);
        vec4 fsZ = vec4(0.0);
        if (uZoneMix > 0.001) {
          vec2 zuv = vec2((vObj.x * 100.0 + 100.0) / 200.0, (100.0 - vObj.y * 100.0) / 212.0);
          fsZ = texture2D(uZone, zuv);
          diffuseColor.rgb = mix(diffuseColor.rgb, fsZ.rgb, fsZ.a * uZoneMix * 0.85);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += fsZ.rgb * step(0.95, fsZ.a) * uZoneMix * 0.9;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float h = fsNoise(vObj * 190.0) * 0.5 + fsNoise(vObj * 70.0) * 0.5;
          float h2 = fsNoise(vObj * vec3(26.0, 120.0, 26.0)) * 0.35;
          vec2 dh = vec2(dFdx(h + h2), dFdy(h + h2)) * 0.0006 * uPore;
          normal = fsBump(-vViewPosition, normal, dh);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
          vec3 sss = vec3(0.95, 0.34, 0.24) * fres * 0.34 * uSss * (0.6 + 0.4 * fsTone);
          outgoingLight += sss * diffuseColor.rgb;
          outgoingLight += uEdge * (fsEdge + fsBuilt * 1.3) * 2.6;
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'fs-skin-v1';
  return { material, u };
}

/** Inner face of the shell and its rim: plaster, so the mask reads as an object with thickness. It follows the same top-down build as the skin. */
export function createRimMaterial(solid?: IUniform<number>): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: new Color('#cdb4a3'), roughness: 0.62, metalness: 0, envMapIntensity: 0.8, side: DoubleSide });
  if (solid) {
    m.onBeforeCompile = shader => {
      shader.uniforms.uSolid = solid;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjR;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjR = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjR; uniform float uSolid;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uSolid < 0.999 && vObjR.y < mix(1.2, -1.2, uSolid)) discard;');
    };
    m.customProgramCacheKey = () => 'fs-rim-solid';
  }
  return m;
}
