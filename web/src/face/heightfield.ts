import { Vector3 } from 'three';
import type { FaceMesh } from './geometry';
import { vertexNormals } from './geometry';

/**
 * The frontal face is close to a height field z(x, y). Rasterising the front surface once lets every overlay
 * (landmark dots, grid, RSTL, wound marks) be designed in 2D and lifted onto the skin with a lookup.
 */
export class Heightfield {
  readonly w: number;
  readonly h: number;
  readonly minX: number;
  readonly minY: number;
  readonly dx: number;
  readonly dy: number;
  private z: Float32Array;
  private nx: Float32Array;
  private ny: Float32Array;
  private nz: Float32Array;
  private cover: Uint8Array;

  constructor(mesh: FaceMesh, width = 360) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      minX = Math.min(minX, mesh.pos[i]); maxX = Math.max(maxX, mesh.pos[i]);
      minY = Math.min(minY, mesh.pos[i + 1]); maxY = Math.max(maxY, mesh.pos[i + 1]);
    }
    const pad = 0.02;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    this.w = width;
    this.h = Math.ceil(width * (maxY - minY) / (maxX - minX));
    this.minX = minX; this.minY = minY;
    this.dx = (maxX - minX) / (this.w - 1);
    this.dy = (maxY - minY) / (this.h - 1);
    const size = this.w * this.h;
    this.z = new Float32Array(size).fill(-1e9);
    this.nx = new Float32Array(size);
    this.ny = new Float32Array(size);
    this.nz = new Float32Array(size);
    this.cover = new Uint8Array(size);
    const nrm = vertexNormals(mesh.pos, mesh.tri);
    const p = mesh.pos;
    for (let t = 0; t < mesh.tri.length; t += 3) {
      const a = mesh.tri[t], b = mesh.tri[t + 1], c = mesh.tri[t + 2];
      const ax = (p[a * 3] - minX) / this.dx, ay = (p[a * 3 + 1] - minY) / this.dy;
      const bx = (p[b * 3] - minX) / this.dx, by = (p[b * 3 + 1] - minY) / this.dy;
      const cx = (p[c * 3] - minX) / this.dx, cy = (p[c * 3 + 1] - minY) / this.dy;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by, cy)));
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
          const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
          const l3 = 1 - l1 - l2;
          const e = -0.02;
          if (l1 < e || l2 < e || l3 < e) continue;
          const zz = l1 * p[a * 3 + 2] + l2 * p[b * 3 + 2] + l3 * p[c * 3 + 2];
          const idx = y * this.w + x;
          if (zz > this.z[idx]) {
            this.z[idx] = zz;
            this.nx[idx] = l1 * nrm[a * 3] + l2 * nrm[b * 3] + l3 * nrm[c * 3];
            this.ny[idx] = l1 * nrm[a * 3 + 1] + l2 * nrm[b * 3 + 1] + l3 * nrm[c * 3 + 1];
            this.nz[idx] = l1 * nrm[a * 3 + 2] + l2 * nrm[b * 3 + 2] + l3 * nrm[c * 3 + 2];
            this.cover[idx] = 1;
          }
        }
      }
    }
  }

  private cell(x: number, y: number): number {
    const gx = Math.round((x - this.minX) / this.dx), gy = Math.round((y - this.minY) / this.dy);
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return -1;
    return gy * this.w + gx;
  }

  covers(x: number, y: number): boolean {
    const i = this.cell(x, y);
    return i >= 0 && this.cover[i] === 1;
  }

  /** Height at (x, y), bilinear over covered cells; NaN if outside the surface. */
  zAt(x: number, y: number): number {
    const fx = (x - this.minX) / this.dx, fy = (y - this.minY) / this.dy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    let sum = 0, wsum = 0;
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= 1; i++) {
        const gx = x0 + i, gy = y0 + j;
        if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) continue;
        const idx = gy * this.w + gx;
        if (!this.cover[idx]) continue;
        const wgt = (1 - Math.abs(fx - gx)) * (1 - Math.abs(fy - gy));
        sum += this.z[idx] * wgt; wsum += wgt;
      }
    }
    return wsum > 1e-4 ? sum / wsum : NaN;
  }

  normalAt(x: number, y: number, out = new Vector3()): Vector3 {
    const i = this.cell(x, y);
    if (i < 0 || !this.cover[i]) return out.set(0, 0, 1);
    return out.set(this.nx[i], this.ny[i], this.nz[i]).normalize();
  }

  /** Point on the skin (plus `lift` along the normal). Returns null outside the surface. */
  lift(x: number, y: number, lift = 0, out = new Vector3()): Vector3 | null {
    const z = this.zAt(x, y);
    if (Number.isNaN(z)) return null;
    const n = this.normalAt(x, y, new Vector3());
    return out.set(x + n.x * lift, y + n.y * lift, z + n.z * lift);
  }

  /** Lift a 2D polyline, dropping samples outside the skin; returns separate runs. */
  liftPolyline(pts: Array<[number, number]>, lift = 0.004): Vector3[][] {
    const runs: Vector3[][] = [];
    let cur: Vector3[] = [];
    for (const [x, y] of pts) {
      const p = this.lift(x, y, lift);
      if (p) cur.push(p);
      else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    return runs.filter(r => r.length > 1);
  }
}
