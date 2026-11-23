"""World motion: glowing satellites that travel along the gyroscope rings, and sparks rising from the floor dial."""
from pathlib import Path

W = Path(r"C:\Users\allam\Downloads\FaceStudio\web\src\world")
sc = (W / "scan.ts").read_text(encoding="utf8")
sc = sc.replace("Points, RingGeometry, ShaderMaterial, TorusGeometry, Vector3,", "MeshBasicMaterial, Points, RingGeometry, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3,", 1)
sc = sc.replace("  private ringMats: MeshPhysicalMaterial[] = [];", "  private ringMats: MeshPhysicalMaterial[] = [];\n  private sats: Array<{ m: Mesh; r: number; speed: number; phase: number }> = [];", 1)
sc = sc.replace("      this.rings.add(ring);\n    });", """      this.rings.add(ring);
      // a glowing marker rides each ring, with a short fading tail
      for (let k = 0; k < 2; k++) {
        const sat = new Mesh(new SphereGeometry(0.026 - k * 0.008, 16, 16), new MeshBasicMaterial({ color: new Color('#7ffbe0').multiplyScalar(3.2), toneMapped: false, transparent: true }));
        ring.add(sat);
        this.sats.push({ m: sat, r, speed: (0.5 + i * 0.18) * (i % 2 ? -1 : 1), phase: k * 3.14159 });
      }
    });""", 1)
sc = sc.replace("    void Vector3;\n  }", """    for (const s2 of this.sats) {
      const a = time * s2.speed + s2.phase;
      s2.m.position.set(Math.cos(a) * s2.r, Math.sin(a) * s2.r, 0);
      (s2.m.material as MeshBasicMaterial).opacity = Math.min(1, s.rings * 1.4);
    }
    void Vector3;
  }""", 1)
(W / "scan.ts").write_text(sc, encoding="utf8")

st = (W / "studio.ts").read_text(encoding="utf8")
st += '''
/** Fine sparks lifting off the dial ring and fading as they rise. */
export function buildSparks(count = 360): Points {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 1.9;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.sin(a) * r; seed[i] = Math.random();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  const m = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uAmount: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){
        float life = fract(uTime * (0.07 + aSeed * 0.1) + aSeed * 7.0);
        vec3 p = position; p.y = ${FLOOR_Y.toFixed(2)} + life * (1.2 + aSeed * 2.4);
        p.x += sin(uTime * 0.6 + aSeed * 30.0) * 0.06; p.z += cos(uTime * 0.5 + aSeed * 17.0) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.8 + aSeed * 1.6) * uScale * 0.006 / -mv.z * 3.0;
        vA = sin(life * 3.14159) * (0.4 + aSeed * 0.6);
      }`,
    fragmentShader: `uniform float uAmount; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * uAmount; gl_FragColor = vec4(vec3(0.45, 1.0, 0.88) * 1.8, a * 0.8); }`,
  });
  const p = new Points(g, m); p.frustumCulled = false;
  return p;
}
'''
(W / "studio.ts").write_text(st, encoding="utf8")
ix = (W / "index.ts").read_text(encoding="utf8")
ix = ix.replace("buildGodrays, buildDust,", "buildGodrays, buildSparks, buildDust,", 1)
ix = ix.replace("  const godrays = buildGodrays();", "  const sparks = buildSparks(stage.coarse ? 160 : 380);\n  scene.add(sparks);\n  const godrays = buildGodrays();", 1)
ix = ix.replace("      stage.bloom.intensity = s.light.bloom;", "      stage.bloom.intensity = s.light.bloom;\n      { const su = (sparks.material as unknown as { uniforms: Record<string, { value: number }> }).uniforms; su.uTime.value = time; su.uScale.value = stage.size.y * stage.pixelRatio(); su.uAmount.value = 0.4 + 0.6 * s.light.dial; }", 1)
(W / "index.ts").write_text(ix, encoding="utf8")
print("ok")
