// Scanline raster of hatches (XCLIP-aware) on a 50 mm grid per elevation window → union area per key + overlaps
import { ELEV, load, center, inWin, hArea, bbox, type Flat, type P } from './common';
export const CELL = 50;
type Spans = Map<number, number[]>; // row -> [x0,x1,x0,x1...] (cell index, half-open)
export function spansOf(loops: P[][], w: readonly number[]): Spans {
  const rows: Spans = new Map();
  for (const l of loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      if (a.y === b.y) continue;
      const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const r0 = Math.ceil((y0 - w[1]) / CELL - 0.5), r1 = Math.floor((y1 - w[1]) / CELL - 0.5);
      for (let r = r0; r <= r1; r++) {
        const yc = w[1] + (r + 0.5) * CELL;
        if (yc < y0 || yc >= y1) continue;
        const x = a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y);
        let arr = rows.get(r); if (!arr) rows.set(r, (arr = []));
        arr.push(x);
      }
    }
  }
  const out: Spans = new Map();
  for (const [r, xs] of rows) {
    xs.sort((p, q) => p - q);
    const s: number[] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil((xs[k] - w[0]) / CELL - 0.5), c1 = Math.floor((xs[k + 1] - w[0]) / CELL - 0.5);
      if (c1 >= c0) s.push(c0, c1 + 1);
    }
    if (s.length) out.set(r, s);
  }
  return out;
}
function intersect(a: number[], b: number[]): number[] {
  const o: number[] = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i], b[j]), hi = Math.min(a[i + 1], b[j + 1]);
    if (hi > lo) o.push(lo, hi);
    if (a[i + 1] < b[j + 1]) i += 2; else j += 2;
  }
  return o;
}
export function hatchSpans(f: Flat, w: readonly number[]): Spans {
  let s = spansOf(f.loops!, w);
  for (const c of f.clips ?? []) {
    const cs = spansOf([c], w); const o: Spans = new Map();
    for (const [r, v] of s) { const cv = cs.get(r); if (cv) { const x = intersect(v, cv); if (x.length) o.set(r, x); } }
    s = o;
  }
  return s;
}
export interface Grid { w: readonly number[]; nx: number; ny: number; bits: Uint32Array; keys: string[] }
export function rasterize(flat: Flat[], w: readonly number[], keyOf: (f: Flat) => string | null): Grid {
  const nx = Math.ceil((w[2] - w[0]) / CELL), ny = Math.ceil((w[3] - w[1]) / CELL);
  const bits = new Uint32Array(nx * ny); const keys: string[] = [];
  for (const f of flat) {
    if (f.t !== 'HATCH' || !f.loops?.length) continue;
    const k = keyOf(f); if (!k) continue;
    let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; }
    if (ki > 31) throw new Error('too many keys');
    const bit = 1 << ki;
    for (const [r, s] of hatchSpans(f, w)) {
      if (r < 0 || r >= ny) continue;
      for (let k2 = 0; k2 < s.length; k2 += 2) for (let c = Math.max(0, s[k2]); c < Math.min(nx, s[k2 + 1]); c++) bits[r * nx + c] |= bit;
    }
  }
  return { w, nx, ny, bits, keys };
}
export const cellA = (CELL * CELL) / 1e6;
