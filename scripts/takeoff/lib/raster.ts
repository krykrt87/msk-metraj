// Izgara tabanlı bölge ölçümü: çizgileri hücrelere işler, 4-komşulu doldurur, sınırı çokgene çevirir.
// Kullanım alanı: kendi sınır çizgisi olmayan mahaller ve dış kontur (brüt alan).
import type { P } from './geom';

export interface Win {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array; // 0 boş, 1 engel, 2 dolu
  constructor(
    readonly win: Win,
    readonly res: number, // mm / hücre
  ) {
    this.w = Math.ceil((win.maxX - win.minX) / res) + 1;
    this.h = Math.ceil((win.maxY - win.minY) / res) + 1;
    this.cells = new Uint8Array(this.w * this.h);
  }
  private cx(x: number) {
    return Math.round((x - this.win.minX) / this.res);
  }
  private cy(y: number) {
    return Math.round((y - this.win.minY) / this.res);
  }
  /** Bresenham çizgisi (8-komşulu çizgi, 4-komşulu dolguya geçirmez). */
  line(a: P, b: P) {
    let x0 = this.cx(a.x);
    let y0 = this.cy(a.y);
    const x1 = this.cx(b.x);
    const y1 = this.cy(b.y);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 1e7; guard++) {
      if (x0 >= 0 && y0 >= 0 && x0 < this.w && y0 < this.h) this.cells[y0 * this.w + x0] = 1;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  polyline(pts: P[], closed = false) {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1], pts[i]);
    if (closed && pts.length > 2) this.line(pts[pts.length - 1], pts[0]);
  }
  /** Tohumdan 4-komşulu doldurur; pencere kenarına değerse sızıntı vardır. */
  fill(seed: P): { cells: number; leaked: boolean } {
    const sx = this.cx(seed.x);
    const sy = this.cy(seed.y);
    if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) return { cells: 0, leaked: true };
    const start = sy * this.w + sx;
    if (this.cells[start] !== 0) return { cells: 0, leaked: false };
    const stack = new Int32Array(this.w * this.h);
    let top = 0;
    stack[top++] = start;
    this.cells[start] = 2;
    let n = 0;
    let leaked = false;
    while (top > 0) {
      const i = stack[--top];
      n++;
      const x = i % this.w;
      const y = (i - x) / this.w;
      if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) leaked = true;
      if (x > 0 && this.cells[i - 1] === 0) ((this.cells[i - 1] = 2), (stack[top++] = i - 1));
      if (x < this.w - 1 && this.cells[i + 1] === 0) ((this.cells[i + 1] = 2), (stack[top++] = i + 1));
      if (y > 0 && this.cells[i - this.w] === 0) ((this.cells[i - this.w] = 2), (stack[top++] = i - this.w));
      if (y < this.h - 1 && this.cells[i + this.w] === 0) ((this.cells[i + this.w] = 2), (stack[top++] = i + this.w));
    }
    return { cells: n, leaked };
  }
  /** Dolu (2) hücrelerin sınırı: kenar izleme ile en uzun halka (dünya koordinatı, hücre kenarları). */
  outline(): P[] {
    const { w, h, cells } = this;
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] === 2;
    // yönlü kenarlar: dolu hücrenin solunda/sağında boşluk varsa kenar ekle (saat yönü tersine)
    const next = new Map<number, number>();
    const key = (x: number, y: number) => y * (w + 1) + x;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!filled(x, y)) continue;
        if (!filled(x, y - 1)) next.set(key(x, y), key(x + 1, y));
        if (!filled(x + 1, y)) next.set(key(x + 1, y), key(x + 1, y + 1));
        if (!filled(x, y + 1)) next.set(key(x + 1, y + 1), key(x, y + 1));
        if (!filled(x - 1, y)) next.set(key(x, y + 1), key(x, y));
      }
    }
    let best: number[] = [];
    const seen = new Set<number>();
    for (const s of next.keys()) {
      if (seen.has(s)) continue;
      const loop: number[] = [];
      let k: number | undefined = s;
      while (k !== undefined && !seen.has(k)) {
        seen.add(k);
        loop.push(k);
        k = next.get(k);
      }
      if (loop.length > best.length) best = loop;
    }
    const toP = (k: number): P => {
      const x = k % (w + 1);
      const y = (k - x) / (w + 1);
      return { x: this.win.minX + (x - 0.5) * this.res, y: this.win.minY + (y - 0.5) * this.res };
    };
    return simplify(best.map(toP), this.res * 0.75);
  }
}

/** Douglas–Peucker sadeleştirme (kapalı halka). */
export function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  const dp = (a: number, b: number) => {
    let maxD = 0;
    let idx = -1;
    const A = pts[a];
    const B = pts[b];
    const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((B.x - A.x) * (A.y - pts[i].y) - (A.x - pts[i].x) * (B.y - A.y)) / L;
      if (d > maxD) ((maxD = d), (idx = i));
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      dp(a, idx);
      dp(idx, b);
    }
  };
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const mid = Math.floor(pts.length / 2);
  keep[mid] = 1;
  dp(0, mid);
  dp(mid, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}
