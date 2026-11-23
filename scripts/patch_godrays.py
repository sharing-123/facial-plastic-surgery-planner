"""Add visible slanted god-ray shafts (WoundScan style) and darken the backdrop."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\world")
st = (W / "studio.ts").read_text(encoding="utf8")
st = st.replace("halo * 0.035 + vec3(0.95, 0.62, 0.42) * core * 0.02", "halo * 0.012 + vec3(0.95, 0.62, 0.42) * core * 0.008")
st += '''
/** Tall slanted light shafts behind the subject: soft edges, fade along their length, slow breathing. */
export function buildGodrays(): Group {
  const g = new Group();
  const specs: Array<{ p: [number, number, number]; rz: number; w: number; a: number; tint: [number, number, number] }> = [
    { p: [2.4, 2.6, -1.6], rz: -0.42, w: 1.5, a: 1.0, tint: [1.0, 0.86, 0.6] },
    { p: [-2.8, 2.8, -2.4], rz: 0.36, w: 1.1, a: 0.7, tint: [1.0, 0.78, 0.45] },
    { p: [0.4, 3.2, -3.2], rz: -0.12, w: 1.9, a: 0.55, tint: [1.0, 0.9, 0.72] },
    { p: [4.2, 2.4, -3.4], rz: -0.55, w: 1.0, a: 0.5, tint: [1.0, 0.82, 0.5] },
  ];
  for (const s of specs) {
    const m = new Mesh(new PlaneGeometry(s.w, 11), new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uAmount: { value: s.a }, uTime: { value: 0 }, uTint: { value: new Vector3(...s.tint) }, uPhase: { value: Math.random() * 6 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uAmount; uniform float uTime; uniform vec3 uTint; uniform float uPhase;
        void main(){
          float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float along = smoothstep(0.0, 0.12, vUv.y) * pow(vUv.y, 1.2);
          float breathe = 0.78 + 0.22 * sin(uTime * 0.35 + uPhase + vUv.y * 3.0);
          float a = across * across * along * breathe * uAmount * 0.16;
          gl_FragColor = vec4(uTint * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    m.position.set(...s.p); m.rotation.z = s.rz; m.renderOrder = -1;
    g.add(m);
  }
  return g;
}
'''
(W / "studio.ts").write_text(st, encoding="utf8")
ix = (W / "index.ts").read_text(encoding="utf8")
ix = ix.replace("buildBackdrop, buildBeam,", "buildBackdrop, buildBeam, buildGodrays,", 1)
ix = ix.replace("  scene.add(beam, beam2, beam3);", "  scene.add(beam, beam2, beam3);\n  const godrays = buildGodrays();\n  scene.add(godrays);", 1)
ix = ix.replace("      stage.bloom.intensity = s.light.bloom;", "      stage.bloom.intensity = s.light.bloom;\n      godrays.children.forEach((c, gi) => { const u = ((c as { material: { uniforms: Record<string, { value: number }> } }).material).uniforms; u.uTime.value = time; u.uAmount.value = [1.0, 0.7, 0.55, 0.5][gi] * (0.55 + 0.45 * s.light.beam); });", 1)
(W / "index.ts").write_text(ix, encoding="utf8")
print("ok")
