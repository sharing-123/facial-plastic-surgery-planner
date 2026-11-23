import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, NormalBlending, Points, ShaderMaterial, Vector3,
} from 'three';

export interface InkOptions {
  width?: number;      // world units across the stroke
  color?: string;
  glow?: number;       // >1 pushes the stroke into the bloom
  dash?: number;       // world length of dash + gap; 0 = solid
  additive?: boolean;
}

/**
 * Camera-facing ribbons for ink strokes lying on the skin. Reveal is a pure function of `uProgress`,
 * with a per-line stagger, so scroll can scrub it in both directions.
 */
export class InkLines extends Mesh {
  declare material: ShaderMaterial;
  readonly lineCount: number;

  constructor(lines: Vector3[][], opts: InkOptions = {}) {
    const pos: number[] = [], prev: number[] = [], next: number[] = [], side: number[] = [], t: number[] = [], id: number[] = [], len: number[] = [];
    const idx: number[] = [];
    let vcount = 0;
    lines.forEach((pts, li) => {
      if (pts.length < 2) return;
      let total = 0;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) { total += pts[i].distanceTo(pts[i - 1]); cum.push(total); }
      const base = vcount;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        for (const s of [-1, 1]) {
          pos.push(p.x, p.y, p.z); prev.push(a.x, a.y, a.z); next.push(b.x, b.y, b.z);
          side.push(s); t.push(cum[i] / (total || 1)); id.push(lines.length > 1 ? li / (lines.length - 1) : 0); len.push(cum[i]);
          vcount++;
        }
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const o = base + i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aPrev', new Float32BufferAttribute(prev, 3));
    g.setAttribute('aNext', new Float32BufferAttribute(next, 3));
    g.setAttribute('aSide', new Float32BufferAttribute(side, 1));
    g.setAttribute('aT', new Float32BufferAttribute(t, 1));
    g.setAttribute('aLine', new Float32BufferAttribute(id, 1));
    g.setAttribute('aLen', new Float32BufferAttribute(len, 1));
    g.setIndex(idx);
    const mat = new ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: {
        uProgress: { value: 0 }, uStagger: { value: 0.55 }, uWidth: { value: opts.width ?? 0.006 },
        uColor: { value: new Color(opts.color ?? '#3fd6b4') }, uGlow: { value: opts.glow ?? 1.5 },
        uDash: { value: opts.dash ?? 0 }, uOpacity: { value: 1 }, uTime: { value: 0 }, uTip: { value: 1 },
      },
      vertexShader: /* glsl */`
        attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aT; attribute float aLine; attribute float aLen;
        uniform float uWidth;
        varying float vSide; varying float vT; varying float vLine; varying float vLen;
        void main(){
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vec4 a = modelViewMatrix * vec4(aPrev, 1.0);
          vec4 b = modelViewMatrix * vec4(aNext, 1.0);
          vec2 tang = normalize((b.xy - a.xy) + vec2(1e-6));
          vec2 nrm = vec2(-tang.y, tang.x);
          p.xy += nrm * aSide * uWidth * 0.5;
          vSide = aSide; vT = aT; vLine = aLine; vLen = aLen;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: /* glsl */`
        uniform float uProgress; uniform float uStagger; uniform vec3 uColor; uniform float uGlow;
        uniform float uDash; uniform float uOpacity; uniform float uTip;
        varying float vSide; varying float vT; varying float vLine; varying float vLen;
        void main(){
          float local = clamp(uProgress * (1.0 + uStagger) - vLine * uStagger, 0.0, 1.0);
          if (vT > local) discard;
          float tip = 1.0 - smoothstep(0.0, 0.06, local - vT);
          if (local >= 1.0) tip = 0.0;
          float edge = smoothstep(1.0, 0.45, abs(vSide));
          float dash = 1.0;
          if (uDash > 0.0) dash = step(0.38, fract(vLen / uDash));
          float a = edge * dash * uOpacity;
          if (a < 0.01) discard;
          vec3 c = uColor * (uGlow + tip * 2.2 * uTip);
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    super(g, mat);
    this.lineCount = lines.length;
    this.frustumCulled = false;
    this.renderOrder = 4;
  }

  set progress(v: number) { this.material.uniforms.uProgress.value = v; this.visible = v > 0.0001 && this.material.uniforms.uOpacity.value > 0.001; }
  get progress(): number { return this.material.uniforms.uProgress.value; }
  set opacity(v: number) { this.material.uniforms.uOpacity.value = v; this.visible = v > 0.001 && this.progress > 0.0001; }
}

/** Soft round dots (landmarks) that light up in a wave and can fly in from scatter. */
export class InkDots extends Points {
  declare material: ShaderMaterial;

  constructor(points: Vector3[], opts: { size?: number; color?: string } = {}) {
    const n = points.length;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    const dist = new Float32Array(n);
    let cx = 0, cy = 0, cz = 0;
    points.forEach(p => { cx += p.x; cy += p.y; cz += p.z; });
    cx /= n; cy /= n; cz /= n;
    points.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3);
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), r = 1.8 + Math.random() * 2.2;
      rnd.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) + 0.2, r * Math.cos(ph)], i * 3);
      dist[i] = Math.hypot(p.x - cx, p.y - cy, (p.z - cz) * 0.6);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aScatter', new Float32BufferAttribute(rnd, 3));
    g.setAttribute('aDist', new Float32BufferAttribute(dist, 1));
    const mat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: {
        uAssemble: { value: 0 }, uWave: { value: 0 }, uSize: { value: opts.size ?? 0.045 }, uScale: { value: 700 },
        uColor: { value: new Color(opts.color ?? '#5fe8c8') }, uOpacity: { value: 1 }, uTime: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute vec3 aScatter; attribute float aDist;
        uniform float uAssemble; uniform float uWave; uniform float uSize; uniform float uScale; uniform float uTime;
        varying float vLit;
        float ease(float x){ return x < 0.5 ? 4.0*x*x*x : 1.0 - pow(-2.0*x + 2.0, 3.0) / 2.0; }
        void main(){
          float k = ease(clamp(uAssemble * 1.6 - aDist * 0.6, 0.0, 1.0));
          vec3 p = mix(aScatter, position, k);
          // wave: points light up outward from the centre; lit points breathe slightly
          float front = uWave * 1.6;
          float lit = smoothstep(front, front - 0.25, aDist);
          vLit = lit;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uScale / -mv.z * (0.4 + 0.9 * lit) * (0.8 + 0.2 * sin(uTime * 2.0 + aDist * 30.0));
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vLit;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(1.0, 0.15, d);
          float a = core * (0.12 + 0.88 * vLit) * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * (1.0 + 1.8 * vLit), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    super(g, mat);
    this.frustumCulled = false;
    this.renderOrder = 5;
  }
}
