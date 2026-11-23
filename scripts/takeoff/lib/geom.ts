// Düzlem geometrisi: dönüşüm matrisleri, yay/elips/spline örnekleme, uzunluk ve alan.
export interface P {
  x: number;
  y: number;
}
/** 2B afin matris [a b c; d e f] : x' = a x + b y + c, y' = d x + e y + f */
export type M = [number, number, number, number, number, number];

export const I: M = [1, 0, 0, 0, 1, 0];
export const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[1] * n[3],
  m[0] * n[1] + m[1] * n[4],
  m[0] * n[2] + m[1] * n[5] + m[2],
  m[3] * n[0] + m[4] * n[3],
  m[3] * n[1] + m[4] * n[4],
  m[3] * n[2] + m[4] * n[5] + m[5],
];
export const apply = (m: M, p: P): P => ({ x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5] });
export const translate = (x: number, y: number): M => [1, 0, x, 0, 1, y];
export const rotate = (deg: number): M => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, -s, 0, s, c, 0];
};
export const scale = (sx: number, sy: number): M => [sx, 0, 0, 0, sy, 0];
/** Ölçek determinantı (alan çarpanı) */
export const det = (m: M) => m[0] * m[4] - m[1] * m[3];

const STEP = Math.PI / 180; // 1° (daire alan hatası ≈ %0,005)

export function sampleArc(c: P, r: number, a0: number, a1: number): P[] {
  // açılar radyan, saat yönü tersine a0 → a1
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(sweep / STEP));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
  }
  return out;
}

export function sampleEllipse(c: P, major: P, ratio: number, t0: number, t1: number): P[] {
  let sweep = t1 - t0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(sweep / STEP));
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (sweep * i) / n;
    out.push({ x: c.x + major.x * Math.cos(t) + minor.x * Math.sin(t), y: c.y + major.y * Math.cos(t) + minor.y * Math.sin(t) });
  }
  return out;
}

/** Bulge'lı polyline köşelerini noktalara açar (bulge = tan(θ/4)). */
export function expandBulges(v: { x: number; y: number; bulge?: number }[], closed: boolean): P[] {
  const out: P[] = [];
  const n = v.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    out.push({ x: a.x, y: a.y });
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) > 1e-12) {
      const theta = 4 * Math.atan(bulge);
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      if (chord < 1e-12) continue;
      const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const h = r * Math.cos(theta / 2); // merkezden kirişe uzaklık (işaretli)
      const ux = (b.x - a.x) / chord;
      const uy = (b.y - a.y) / chord;
      // merkez: bulge>0 (saat yönü tersine) kirişin solunda
      const center = theta > 0 ? { x: mx - uy * h, y: my + ux * h } : { x: mx + uy * h, y: my - ux * h };
      const a0 = Math.atan2(a.y - center.y, a.x - center.x);
      const steps = Math.max(2, Math.ceil(Math.abs(theta) / STEP));
      for (let k = 1; k < steps; k++) {
        const t = a0 + (theta * k) / steps;
        out.push({ x: center.x + r * Math.cos(t), y: center.y + r * Math.sin(t) });
      }
    }
  }
  if (!closed && n > 0) out.push({ x: v[n - 1].x, y: v[n - 1].y });
  return out;
}

/** NURBS/B-spline örnekleme (de Boor). */
export function sampleSpline(ctrl: P[], knots: number[], degree: number, weights?: number[], fit?: P[]): P[] {
  if ((!ctrl || ctrl.length < 2) && fit && fit.length >= 2) return fit;
  if (!ctrl || ctrl.length < 2 || !knots || knots.length < ctrl.length + degree + 1) return ctrl ?? [];
  const w = weights && weights.length === ctrl.length ? weights : ctrl.map(() => 1);
  const lo = knots[degree];
  const hi = knots[knots.length - degree - 1];
  const n = Math.max(16, ctrl.length * 8);
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = lo + ((hi - lo) * i) / n;
    let k = degree;
    while (k < knots.length - degree - 2 && t >= knots[k + 1]) k++;
    const d: { x: number; y: number; w: number }[] = [];
    for (let j = 0; j <= degree; j++) {
      const c = ctrl[k - degree + j];
      const ww = w[k - degree + j];
      d.push({ x: c.x * ww, y: c.y * ww, w: ww });
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const idx = k - degree + j;
        const den = knots[idx + degree - r + 1] - knots[idx];
        const a = den === 0 ? 0 : (t - knots[idx]) / den;
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
      }
    }
    out.push({ x: d[degree].x / d[degree].w, y: d[degree].y / d[degree].w });
  }
  return out;
}

export function length(pts: P[], closed = false): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 2) s += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return s;
}

/** İşaretli alan (saat yönü tersine pozitif). */
export function signedArea(pts: P[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return -s / 2;
}
export const area = (pts: P[]) => Math.abs(signedArea(pts));

export function pointInPolygon(p: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Sutherland–Hodgman: halkanın dışbükey (saat yönü tersine) çokgen içinde kalan kısmı. İçbükey halka sınırı
 *  birden çok kez keserse parçalar kırpma kenarı boyunca sıfır genişlikli köprüyle bağlanır. */
export function clipConvex(ring: P[], clip: P[]): P[] {
  let out = ring;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: P) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const src = out;
    out = [];
    for (let j = 0; j < src.length; j++) {
      const p = src[j];
      const q = src[(j + 1) % src.length];
      const [sp, sq] = [side(p), side(q)];
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

/** Çok halkalı bölge alanı: iç içe derinliği çift olan halka eklenir, tek olan çıkarılır. */
export function regionArea(loops: P[][]): number {
  const valid = loops.filter((l) => l.length >= 3);
  let s = 0;
  for (let i = 0; i < valid.length; i++) {
    const probe = valid[i][0];
    let depth = 0;
    for (let j = 0; j < valid.length; j++) if (i !== j && area(valid[j]) > area(valid[i]) && pointInPolygon(probe, valid[j])) depth++;
    s += (depth % 2 === 0 ? 1 : -1) * area(valid[i]);
  }
  return s;
}

export function bbox(pts: P[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
