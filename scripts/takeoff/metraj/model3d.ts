// Metraj modülleri ölçtükleri geometriyi buraya 3B eleman olarak bırakır; build.ts work/model3d.json yazar.
import type { El3, Layer3, Model3 } from '../../../shared/model3d';
import type { P } from '../lib/geom';

export type Raw3 = { layer: Layer3; kind: El3['kind']; items: string[]; lines?: Record<string, string | number>; label: string; loops?: P[][]; path?: P[]; closed?: boolean; z0: number; z1: number };
const raw: Raw3[] = [];

export const model3d = {
  /** Eklenen nesneyi döndürür (satır adı sonradan belli olursa lines güncellenebilir). */
  add(e: Raw3): Raw3 {
    raw.push(e);
    return e;
  },
  /** Daha önce eklenmiş elemanlar (ör. cephe, çatıdaki salon parapetlerinden kalibrasyon alır). */
  find(pred: (e: Raw3) => boolean): Raw3[] {
    return raw.filter(pred);
  },
  clear() {
    raw.length = 0;
  },
  /** Kalemlerin pozları build sonunda değişirse (ör. sıralama) eşleme tablosu ile güncellenir. */
  build(origin: P): Model3 {
    const tr = (p: P): [number, number] => [Math.round(p.x - origin.x) / 1000, Math.round(p.y - origin.y) / 1000];
    const elements: El3[] = raw.map((e, i) => ({
      id: `e${i}`,
      layer: e.layer,
      kind: e.kind,
      items: [...new Set(e.items)],
      ...(e.lines ? { lines: e.lines } : {}),
      label: e.label,
      ...(e.loops ? { loops: e.loops.map((l) => simplify(dedupe(l), 15).map(tr)).filter((l) => l.length >= 3) } : {}),
      ...(e.path ? { path: simplify(dedupe(e.path), 15, !!e.closed).map(tr) } : {}),
      ...(e.closed ? { closed: true } : {}),
      z0: Math.round(e.z0 * 1000) / 1000,
      z1: Math.round(e.z1 * 1000) / 1000,
    }));
    return { generatedAt: new Date().toISOString(), origin: [origin.x, origin.y], elements: elements.filter((e) => (e.loops ? e.loops.length > 0 : (e.path?.length ?? 0) > 0)) };
  },
};

const dedupe = (l: P[]) => l.filter((q, i) => i === 0 || Math.hypot(q.x - l[i - 1].x, q.y - l[i - 1].y) > 1);

/** Douglas–Peucker (mm toleransı); pin gibi tek noktalı çizgileri olduğu gibi bırakır. */
export function simplify(pts: P[], tol: number, closed = true): P[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a];
    const B = pts[b];
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? Math.hypot(pts[i].x - A.x, pts[i].y - A.y) : Math.abs((B.x - A.x) * (A.y - pts[i].y) - (A.x - pts[i].x) * (B.y - A.y)) / L;
      if (d > bd) ((bd = d), (best = i));
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  // kapalı halkada başlangıç ve bitiş aynı noktaysa tekini at
  if (closed && out.length > 3 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1) out.pop();
  return out;
}
