import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LineSegments, Mesh, MeshPhysicalMaterial,
  MeshBasicMaterial, Points, RingGeometry, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import type { FaceMesh } from '../face/geometry';
import { vertexNormals } from '../face/geometry';

/** Area-weighted surface samples of the face mesh: the "point cloud" a depth scanner would return. */
function sampleSurface(mesh: FaceMesh, count: number): { pos: Float32Array; nrm: Float32Array } {
  const nrm = vertexNormals(mesh.pos, mesh.tri);
  const nt = mesh.tri.length / 3;
  const cum = new Float32Array(nt);
  let total = 0;
  for (let t = 0; t < nt; t++) {
    const a = mesh.tri[t * 3] * 3, b = mesh.tri[t * 3 + 1] * 3, c = mesh.tri[t * 3 + 2] * 3, p = mesh.pos;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    cum[t] = total;
  }
  const pos = new Float32Array(count * 3), nr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * total;
    let lo = 0, hi = nt - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
    const ia = mesh.tri[lo * 3], ib = mesh.tri[lo * 3 + 1], ic = mesh.tri[lo * 3 + 2];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = w * mesh.pos[ia * 3 + k] + u * mesh.pos[ib * 3 + k] + v * mesh.pos[ic * 3 + k];
      nr[i * 3 + k] = w * nrm[ia * 3 + k] + u * nrm[ib * 3 + k] + v * nrm[ic * 3 + k];
    }
  }
  return { pos, nrm: nr };
}

export interface ScanState { scanY: number; cloud: number; after: number; wire: number; wireY: number; laser: number; rings: number; settle: number }

/**
 * The scanning set: a point cloud that is dense and loose below the scan plane and settles on the skin above it, a glowing
 * laser ring at the plane, a wireframe of the reconstruction mesh, and gyroscope rings that orbit the subject.
 */
export class ScanSet {
  readonly group = new Group();
  readonly cloud: Points;
  readonly laser: Mesh;
  readonly wire: LineSegments;
  readonly rings = new Group();
  readonly count: number;
  private ringMats: MeshPhysicalMaterial[] = [];
  private sats: Array<{ m: Mesh; r: number; speed: number; phase: number }> = [];

  constructor(front: FaceMesh, base: FaceMesh, count: number, topY: number, botY: number) {
    this.count = count;
    const { pos, nrm } = sampleSurface(front, count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aNormal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    const cm = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uScan: { value: topY }, uCloud: { value: 0 }, uAfter: { value: 0 }, uSettle: { value: 1 }, uTime: { value: 0 }, uScale: { value: 700 }, uSize: { value: 0.012 } },
      vertexShader: /* glsl */`
        attribute vec3 aNormal; attribute float aSeed;
        uniform float uScan; uniform float uTime; uniform float uScale; uniform float uSize; uniform float uSettle;
        varying float vGlow; varying float vScanned; varying float vSeed; varying float vHeight;
        void main(){
          float d = position.y - uScan;                       // above the plane = already scanned
          float scanned = smoothstep(-0.015, 0.05, d);
          vec3 n = normalize(aNormal);
          float s2 = fract(aSeed * 91.7);
          // unscanned points hover in a loose shell and drift; scanned points sit on the skin
          vec3 drift = vec3(sin(uTime * 0.7 + aSeed * 40.0), cos(uTime * 0.6 + aSeed * 23.0), sin(uTime * 0.5 + aSeed * 11.0)) * 0.03;
          float shell = (0.05 + 0.3 * s2) * (1.0 - scanned) * uSettle;
          vec3 p = position + n * (shell + 0.003 * scanned) + drift * (1.0 - scanned * 0.9) * uSettle;
          vGlow = exp(-abs(d) * 26.0);
          vScanned = scanned; vSeed = aSeed; vHeight = position.y;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uScale / -mv.z * (0.7 + aSeed * 0.9 + vGlow * 3.2) ;
        }`,
      fragmentShader: /* glsl */`
        uniform float uCloud; uniform float uAfter;
        varying float vGlow; varying float vScanned; varying float vSeed; varying float vHeight;
        void main(){
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(1.0, 0.0, r);
          vec3 cold = vec3(0.25, 0.72, 0.95), warm = vec3(0.85, 1.0, 0.97);
          vec3 c = mix(cold, warm, vScanned) + vec3(1.0, 0.95, 1.0) * vGlow;
          float a = core * mix(0.9, uAfter, vScanned) * (0.35 + 0.65 * vSeed) + core * vGlow * 0.9;
          a *= uCloud;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c * (0.9 + vGlow * 2.2), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.cloud = new Points(g, cm);
    this.cloud.frustumCulled = false; this.cloud.renderOrder = 6;

    this.laser = new Mesh(new RingGeometry(0.2, 1.08, 128, 1), new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uOpacity; uniform float uTime; varying vec2 vP;
        void main(){
          float r = length(vP);
          float rim = smoothstep(0.045, 0.0, abs(r - 1.05));
          float fill = smoothstep(1.06, 0.2, r) * 0.1;
          float ticks = step(0.7, fract(atan(vP.y, vP.x) * 40.0 / 6.2831853 + uTime * 0.05)) * smoothstep(0.06, 0.0, abs(r - 0.96)) * 0.6;
          vec3 c = vec3(0.45, 0.95, 0.85) * (rim * 2.2 + fill + ticks) + vec3(1.0) * rim * 0.6;
          gl_FragColor = vec4(c * uOpacity, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.laser.rotation.x = -Math.PI / 2; this.laser.renderOrder = 7;

    // reconstruction mesh: the unique edges of the base triangulation
    const edges = new Set<number>();
    const n = base.pos.length / 3;
    const pts: number[] = [];
    for (let t = 0; t < base.tri.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = base.tri[t + e], b = base.tri[t + (e + 1) % 3];
        const k = a < b ? a * n + b : b * n + a;
        if (edges.has(k)) continue;
        edges.add(k);
        pts.push(base.pos[a * 3], base.pos[a * 3 + 1], base.pos[a * 3 + 2] + 0.004, base.pos[b * 3], base.pos[b * 3 + 1], base.pos[b * 3 + 2] + 0.004);
      }
    }
    const wg = new BufferGeometry();
    wg.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.wire = new LineSegments(wg, new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uFront: { value: 1.2 }, uTime: { value: 0 }, uColor: { value: new Color('#5fe8c8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uOpacity; uniform float uFront; uniform float uTime; uniform vec3 uColor; varying vec3 vP;
        void main(){
          float built = smoothstep(-0.02, 0.05, vP.y - uFront);
          float pulse = 0.55 + 0.45 * sin(vP.y * 9.0 - uTime * 2.4 + vP.x * 5.0);
          float edge = exp(-abs(vP.y - uFront) * 30.0);
          vec3 c = uColor * (0.5 + 0.9 * pulse) + vec3(1.0) * edge;
          float a = (built * 0.55 + edge) * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.wire.frustumCulled = false; this.wire.renderOrder = 5;

    // gyroscope rings
    const radii = [1.12, 1.3, 1.48];
    radii.forEach((r, i) => {
      const m = new MeshPhysicalMaterial({ color: '#d3dbe2', metalness: 1, roughness: 0.14, clearcoat: 1, envMapIntensity: 1.6, transparent: true, opacity: 1 });
      this.ringMats.push(m);
      const ring = new Mesh(new TorusGeometry(r, 0.0038 + i * 0.0012, 12, 220), m);
      ring.rotation.set(0.9 * i, 0.6 * i, 0.3 * i);
      this.rings.add(ring);
      // a glowing marker rides each ring, with a short fading tail
      for (let k = 0; k < 2; k++) {
        const sat = new Mesh(new SphereGeometry(0.026 - k * 0.008, 16, 16), new MeshBasicMaterial({ color: new Color('#7ffbe0').multiplyScalar(3.2), toneMapped: false, transparent: true }));
        ring.add(sat);
        this.sats.push({ m: sat, r, speed: (0.5 + i * 0.18) * (i % 2 ? -1 : 1), phase: k * 3.14159 });
      }
    });
    this.group.add(this.cloud, this.laser, this.wire);
  }

  apply(s: ScanState, time: number, scale: number): void {
    const u = (this.cloud.material as ShaderMaterial).uniforms;
    u.uScan.value = s.scanY; u.uCloud.value = s.cloud; u.uAfter.value = s.after; u.uSettle.value = s.settle; u.uTime.value = time; u.uScale.value = scale;
    this.cloud.visible = s.cloud > 0.002;
    this.laser.position.y = s.scanY;
    const lu = (this.laser.material as ShaderMaterial).uniforms;
    lu.uOpacity.value = s.laser; lu.uTime.value = time;
    this.laser.visible = s.laser > 0.003;
    const wu = (this.wire.material as ShaderMaterial).uniforms;
    wu.uOpacity.value = s.wire; wu.uFront.value = s.wireY; wu.uTime.value = time;
    this.wire.visible = s.wire > 0.003;
    this.rings.visible = s.rings > 0.003;
    this.rings.scale.setScalar(0.6 + 0.4 * s.rings);
    this.ringMats.forEach(m => { m.opacity = Math.min(1, s.rings * 1.4); });
    this.rings.children.forEach((c, i) => {
      c.rotation.x += 0.0016 * (i + 1) + 0.0005;
      c.rotation.y += 0.0011 * (3 - i) * (i % 2 ? -1 : 1);
      c.rotation.z += 0.0008 * (i + 1);
    });
    for (const s2 of this.sats) {
      const a = time * s2.speed + s2.phase;
      s2.m.position.set(Math.cos(a) * s2.r, Math.sin(a) * s2.r, 0);
      (s2.m.material as MeshBasicMaterial).opacity = Math.min(1, s.rings * 1.4);
    }
    void Vector3;
  }
}
