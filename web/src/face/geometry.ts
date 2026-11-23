import { BufferGeometry, Float32BufferAttribute } from 'three';
import canonicalData from './canonical.json';

/** Indexed triangle mesh in world units (1 unit = 10 cm). Original landmark vertices come first. */
export interface FaceMesh {
  pos: Float32Array;
  uv: Float32Array;
  tri: Uint32Array;
  origCount: number;
  /** photo px -> world: (px - c) * s, y flipped; set for meshes built from a photo */
  xf?: { cx: number; cy: number; s: number };
}

export interface BuildOptions {
  subdivisions?: number;
  fillEyes?: boolean;
  fillMouth?: boolean;
}

export const CANON = canonicalData as {
  vertices: number[][];
  triangles: number[][];
  oval: number[];
  leftEye: number[];
  rightEye: number[];
  lips: number[];
  leftBrow: number[];
  rightBrow: number[];
  nose: number[];
};

const SCALE = 0.1;

/** Canonical MediaPipe face in world units, y up, z toward the viewer. */
export function canonicalMesh(): FaceMesh {
  const n = CANON.vertices.length;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  CANON.vertices.forEach((v, i) => {
    pos[i * 3] = v[0] * SCALE;
    pos[i * 3 + 1] = v[1] * SCALE;
    pos[i * 3 + 2] = v[2] * SCALE;
    uv[i * 2] = (v[0] / 15.5) + 0.5;
    uv[i * 2 + 1] = (v[1] / 17.7) + 0.52;
  });
  return { pos, uv, tri: Uint32Array.from(CANON.triangles.flat()), origCount: n };
}

export interface LandmarkLike { x: number; y: number; z: number }

/**
 * Mesh from a photo: landmarks are normalised image coordinates. x and z share a scale
 * (MediaPipe z uses roughly the x scale); the photo itself becomes the texture via uv = (x, 1 - y).
 */
export function meshFromLandmarks(lm: LandmarkLike[], imgW: number, imgH: number): FaceMesh {
  const n = CANON.vertices.length;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, lm[i].x * imgW); x1 = Math.max(x1, lm[i].x * imgW); y0 = Math.min(y0, lm[i].y * imgH); y1 = Math.max(y1, lm[i].y * imgH); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = 1.55 / Math.max(x1 - x0, 1); // face width becomes 1.55 units, like the canonical mesh
  for (let i = 0; i < n; i++) {
    const p = lm[i];
    pos[i * 3] = (p.x * imgW - cx) * s;
    pos[i * 3 + 1] = -(p.y * imgH - cy) * s;
    pos[i * 3 + 2] = -p.z * imgW * s;
    uv[i * 2] = p.x;
    uv[i * 2 + 1] = 1 - p.y;
  }
  return { pos, uv, tri: Uint32Array.from(CANON.triangles.flat()), origCount: n, xf: { cx, cy, s } };
}

function edgeKey(a: number, b: number, n: number): number {
  return a < b ? a * n + b : b * n + a;
}

export function vertexNormals(pos: Float32Array, tri: Uint32Array): Float32Array {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < tri.length; t += 3) {
    const ia = tri[t], ib = tri[t + 1], ic = tri[t + 2];
    const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
    const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
    const cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    // area weighted (cross product magnitude) accumulation
    for (const i of [ia, ib, ic]) {
      nrm[i * 3] += nx; nrm[i * 3 + 1] += ny; nrm[i * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  return nrm;
}

/** Boundary loops (ordered vertex rings) of an indexed mesh. Pinched vertices are handled by consuming edges. */
export function boundaryLoops(mesh: { tri: Uint32Array; pos: Float32Array }): number[][] {
  const n = mesh.pos.length / 3;
  const count = new Map<number, number>();
  for (let t = 0; t < mesh.tri.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(mesh.tri[t + e], mesh.tri[t + (e + 1) % 3], n);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  const out = new Map<number, number[]>();
  for (let t = 0; t < mesh.tri.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.tri[t + e], b = mesh.tri[t + (e + 1) % 3];
      if (count.get(edgeKey(a, b, n)) === 1) { const l = out.get(a); if (l) l.push(b); else out.set(a, [b]); }
    }
  }
  const loops: number[][] = [];
  for (const start of [...out.keys()]) {
    while (out.get(start)?.length) {
      const loop: number[] = [];
      let cur = start;
      for (;;) {
        loop.push(cur);
        const nx = out.get(cur);
        if (!nx || !nx.length) break;
        cur = nx.pop()!;
        if (cur === start) break;
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

/** Close boundary loops with a centroid fan: everything except the outer rim and (unless asked) the eyes. */
function fillLoops(mesh: FaceMesh, opts: BuildOptions): FaceMesh {
  const loops = boundaryLoops(mesh);
  const eyeSet = new Set([...CANON.leftEye, ...CANON.rightEye]);
  const ovalSet = new Set(CANON.oval);
  const pos = Array.from(mesh.pos);
  const uv = Array.from(mesh.uv);
  const tri = Array.from(mesh.tri);
  for (const loop of loops) {
    const outer = loop.filter(i => ovalSet.has(i)).length > loop.length / 2;
    const eye = loop.length > 8 && loop.filter(i => eyeSet.has(i)).length > loop.length / 2;
    if (outer || (eye && !opts.fillEyes)) continue;
    if (!opts.fillMouth && loop.filter(i => CANON.lips.includes(i)).length > loop.length / 2) continue;
    let cx = 0, cy = 0, cz = 0, cu = 0, cv = 0;
    for (const i of loop) {
      cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2];
      cu += uv[i * 2]; cv += uv[i * 2 + 1];
    }
    const m = loop.length;
    const c = pos.length / 3;
    // small cavities (nostrils, mouth) sit a little below the rim so they read as openings; eyes stay level
    pos.push(cx / m, cy / m, cz / m - (eye ? 0 : 0.012));
    uv.push(cu / m, cv / m);
    for (let k = 0; k < m; k++) tri.push(loop[(k + 1) % m], loop[k], c);
  }
  return { pos: Float32Array.from(pos), uv: Float32Array.from(uv), tri: Uint32Array.from(tri), origCount: mesh.origCount };
}

/** One level of PN-style subdivision: new edge points follow a Hermite curve defined by vertex normals. */
function subdivide(mesh: FaceMesh): FaceMesh {
  const n = mesh.pos.length / 3;
  const nrm = vertexNormals(mesh.pos, mesh.tri);
  const mid = new Map<number, number>();
  const pos: number[] = Array.from(mesh.pos);
  const uv: number[] = Array.from(mesh.uv);
  const edgePoint = (a: number, b: number): number => {
    const key = edgeKey(a, b, n);
    const hit = mid.get(key);
    if (hit !== undefined) return hit;
    const ax = mesh.pos[a * 3], ay = mesh.pos[a * 3 + 1], az = mesh.pos[a * 3 + 2];
    const bx = mesh.pos[b * 3], by = mesh.pos[b * 3 + 1], bz = mesh.pos[b * 3 + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dota = dx * nrm[a * 3] + dy * nrm[a * 3 + 1] + dz * nrm[a * 3 + 2];
    const dotb = -dx * nrm[b * 3] - dy * nrm[b * 3 + 1] - dz * nrm[b * 3 + 2];
    // tangent at a (toward b) and tangent arriving at b, both projected to the vertex tangent planes
    const tax = dx - dota * nrm[a * 3], tay = dy - dota * nrm[a * 3 + 1], taz = dz - dota * nrm[a * 3 + 2];
    const tbx = -dx - dotb * nrm[b * 3], tby = -dy - dotb * nrm[b * 3 + 1], tbz = -dz - dotb * nrm[b * 3 + 2];
    // Hermite midpoint = (a + b)/2 + (Ta - Tb_out)/8, with Tb_out = -tb (direction of travel into b)
    const px = (ax + bx) / 2 + (tax + tbx) / 8;
    const py = (ay + by) / 2 + (tay + tby) / 8;
    const pz = (az + bz) / 2 + (taz + tbz) / 8;
    const id = pos.length / 3;
    pos.push(px, py, pz);
    uv.push((mesh.uv[a * 2] + mesh.uv[b * 2]) / 2, (mesh.uv[a * 2 + 1] + mesh.uv[b * 2 + 1]) / 2);
    mid.set(key, id);
    return id;
  };
  const tri: number[] = [];
  for (let t = 0; t < mesh.tri.length; t += 3) {
    const a = mesh.tri[t], b = mesh.tri[t + 1], c = mesh.tri[t + 2];
    const ab = edgePoint(a, b), bc = edgePoint(b, c), ca = edgePoint(c, a);
    tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { pos: Float32Array.from(pos), uv: Float32Array.from(uv), tri: Uint32Array.from(tri), origCount: mesh.origCount };
}

export function buildSurface(base: FaceMesh, opts: BuildOptions = {}): FaceMesh {
  let m = fillLoops(base, opts);
  for (let i = 0; i < (opts.subdivisions ?? 2); i++) m = subdivide(m);
  return m;
}

export function toGeometry(mesh: FaceMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(mesh.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(vertexNormals(mesh.pos, mesh.tri), 3));
  g.setAttribute('uv', new Float32BufferAttribute(mesh.uv, 2));
  g.setIndex(Array.from(mesh.tri));
  return g;
}

/**
 * Give the front surface a physical thickness: a back surface pushed along -normal plus
 * side walls on every boundary loop. Group 0 = front, group 1 = back and walls.
 */
export function shellGeometry(front: FaceMesh, thickness: number): BufferGeometry {
  const n = front.pos.length / 3;
  const nrm = vertexNormals(front.pos, front.tri);
  const pos: number[] = Array.from(front.pos);
  const uv: number[] = Array.from(front.uv);
  const nor: number[] = Array.from(nrm);
  const frontIdx = Array.from(front.tri);
  // back vertices; soften the offset direction toward -z so the rim stays clean
  for (let i = 0; i < n; i++) {
    const dx = nrm[i * 3] * 0.55, dy = nrm[i * 3 + 1] * 0.55, dz = nrm[i * 3 + 2] * 0.55 + 0.45;
    const l = Math.hypot(dx, dy, dz) || 1;
    pos.push(front.pos[i * 3] - (dx / l) * thickness, front.pos[i * 3 + 1] - (dy / l) * thickness, front.pos[i * 3 + 2] - (dz / l) * thickness);
    uv.push(front.uv[i * 2], front.uv[i * 2 + 1]);
    nor.push(-nrm[i * 3], -nrm[i * 3 + 1], -nrm[i * 3 + 2]);
  }
  const backIdx: number[] = [];
  for (let t = 0; t < front.tri.length; t += 3) {
    backIdx.push(front.tri[t] + n, front.tri[t + 2] + n, front.tri[t + 1] + n);
  }
  // walls: two vertices per boundary vertex with outward-facing flat normals
  for (const loop of boundaryLoops(front)) {
    const base = pos.length / 3;
    const m = loop.length;
    for (let k = 0; k < m; k++) {
      const a = loop[k], b = loop[(k + 1) % m];
      const ex = front.pos[b * 3] - front.pos[a * 3], ey = front.pos[b * 3 + 1] - front.pos[a * 3 + 1];
      let nx = ey, ny = -ex; // candidate outward normal in xy (loop direction follows triangle winding)
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      for (const v of [a, a + n, b, b + n]) {
        pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        uv.push(uv[v * 2], uv[v * 2 + 1]);
        nor.push(nx, ny, 0);
      }
      const o = base + k * 4;
      backIdx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex([...frontIdx, ...backIdx]);
  g.addGroup(0, frontIdx.length, 0);
  g.addGroup(frontIdx.length, backIdx.length, 1);
  return g;
}
