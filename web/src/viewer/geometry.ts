// 3B görüntüleyicinin saf geometri yardımcıları (three.js'den bağımsız, test edilebilir).
export type V2 = [number, number];
export type V3 = [number, number, number];

const ringArea = (l: V2[]) => {
  let a = 0;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) a += l[j][0] * l[i][1] - l[i][0] * l[j][1];
  return a / 2;
};
const inside = (p: V2, l: V2[]) => {
  let c = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++)
    if (l[i][1] > p[1] !== l[j][1] > p[1] && p[0] < ((l[j][0] - l[i][0]) * (p[1] - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) c = !c;
  return c;
};

/** Tarama halkalarını şekillere ayırır: büyükten küçüğe; bir şeklin içine düşen halka boşluk, değilse yeni şekil. */
export function splitShapes(loops: V2[][]): { outer: V2[]; holes: V2[][] }[] {
  const sorted = loops.filter((l) => l.length >= 3).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const shapes: { outer: V2[]; holes: V2[][] }[] = [];
  for (const l of sorted) {
    const host = shapes.find((s) => inside(l[0], s.outer) && !s.holes.some((h) => inside(l[0], h)));
    if (host) host.holes.push(l);
    else shapes.push({ outer: l, holes: [] });
  }
  return shapes;
}

/** Çizgi boyunca z0 → z1 düşey şerit üçgenleri (x, y, z düz dizi). */
export function ribbonPositions(path: V2[], closed: boolean, z0: number, z1: number): Float32Array {
  const n = closed ? path.length : path.length - 1;
  const out = new Float32Array(Math.max(0, n) * 18);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[(i + 1) % path.length];
    for (const v of [ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z0, bx, by, z1, ax, ay, z1]) out[k++] = v;
  }
  return out;
}

/** Düzlemsel dışbükey çokgenleri yelpaze üçgenlerine böler (x, y, z düz dizi). */
export function meshPositions(faces: V3[][]): Float32Array {
  const out: number[] = [];
  for (const f of faces) for (let i = 1; i + 1 < f.length; i++) out.push(...f[0], ...f[i], ...f[i + 1]);
  return new Float32Array(out);
}

export function measure(a: V3, b: V3): { d: number; horizontal: number; dz: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return { d: Math.hypot(dx, dy, dz), horizontal: Math.hypot(dx, dy), dz: Math.abs(dz) };
}

/** Tolerans içindeki en yakın köşe (yapışma); yoksa null. */
export function nearestVertex(p: V3, verts: V3[], tol: number): V3 | null {
  let best: V3 | null = null;
  let bd = tol;
  for (const v of verts) {
    const d = Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]);
    if (d <= bd) ((bd = d), (best = v));
  }
  return best;
}
