"""Patch: rim material follows the top-down build, calmer bone shading, thinner rings and dial, wider layers camera."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\world")


def rd(n):
    return (W / n).read_text(encoding="utf8")


def wr(n, s):
    (W / n).write_text(s, encoding="utf8")


# 1. rim material shares the skin's reveal plane
s = rd("skin.ts")
old = s[s.index("/** Inner face of the shell"):]
new = '''/** Inner face of the shell and its rim: plaster, so the mask reads as an object with thickness. It follows the same top-down build as the skin. */
export function createRimMaterial(solid?: IUniform<number>): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: new Color('#cdb4a3'), roughness: 0.62, metalness: 0, envMapIntensity: 0.8, side: DoubleSide });
  if (solid) {
    m.onBeforeCompile = shader => {
      shader.uniforms.uSolid = solid;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\\nvarying vec3 vObjR;').replace('#include <begin_vertex>', '#include <begin_vertex>\\nvObjR = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\\nvarying vec3 vObjR; uniform float uSolid;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\\nif (uSolid < 0.999 && vObjR.y < mix(1.2, -1.2, uSolid)) discard;');
    };
    m.customProgramCacheKey = () => 'fs-rim-solid';
  }
  return m;
}
'''
s = s.replace(old, new)
wr("skin.ts", s)

h = rd("hero.ts")
h = h.replace("createRimMaterial()]", "createRimMaterial(u.uSolid)]", 1)
wr("hero.ts", h)

# 2. anatomy bump per material
a = rd("anatomy.ts")
a = a.replace("colors: boolean; streak: number })", "colors: boolean; streak: number; bump: number; mottle: number })", 1)
a = a.replace("* 0.006;", "* ${opts.bump.toFixed(4)};", 1)
a = a.replace("diffuseColor.rgb *= 0.86 + 0.28 * anNoise(vObj * 22.0);", "diffuseColor.rgb *= ${(1 - opts.mottle / 2).toFixed(3)} + ${opts.mottle.toFixed(3)} * anNoise(vObj * 22.0);", 1)
a = a.replace("colors: true, streak: 14 })", "colors: true, streak: 14, bump: 0.006, mottle: 0.28 })", 1)
a = a.replace("colors: false, streak: 60 })", "colors: false, streak: 60, bump: 0.0012, mottle: 0.1 })", 1)
wr("anatomy.ts", a)

# 3. thinner rings, quieter dial
sc = rd("scan.ts")
sc = sc.replace("const radii = [1.22, 1.42, 1.62];", "const radii = [1.12, 1.3, 1.48];")
sc = sc.replace("0.0065 + i * 0.002", "0.0038 + i * 0.0012")
sc = sc.replace("0.0026 * (i + 1) + 0.0008", "0.0016 * (i + 1) + 0.0005").replace("0.0019 * (3 - i)", "0.0011 * (3 - i)").replace("0.0012 * (i + 1);", "0.0008 * (i + 1);")
wr("scan.ts", sc)
st = rd("studio.ts")
st = st.replace("float t1 = step(0.55, fract(da * 90.0 / 6.2831853))", "float t1 = step(0.78, fract(da * 150.0 / 6.2831853))")
st = st.replace("float t3 = step(0.5, fract(da * 36.0 / 6.2831853))", "float t3 = step(0.7, fract(da * 72.0 / 6.2831853))")
st = st.replace("(rings * 0.42 + t1 * 0.5 + t2 * 0.42 + t3 * 0.3 + sweep * 0.2)", "(rings * 0.3 + t1 * 0.3 + t2 * 0.22 + t3 * 0.18 + sweep * 0.16)")
wr("studio.ts", st)

# 4. layers camera
c = rd("chapters.ts")
c = c.replace("cam: [2.1, 0.45, 5.4], target: [0.1, -0.02, 0.15], fov: 27, shift: 0.2,", "cam: [2.5, 0.4, 6.6], target: [0.05, -0.02, 0.1], fov: 27, shift: 0.14,")
wr("chapters.ts", c)
print("ok")
