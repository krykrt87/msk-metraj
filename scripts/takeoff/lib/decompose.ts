// Bir alanı metraj cetveli satırlarına ayırır: dikdörtgen (en × boy), yamuk ((a + b) / 2 × h),
// daire parçası (r²/2 × (θ − sin θ)). Girdi: kapalı çokgen köşeleri (mm) + DXF bulge değerleri.
import type { CalcRow } from '../../../shared/types';
export type { CalcRow };
interface V {
  x: number;
  y: number;
  bulge?: number;
}

const EPS = 1e-6; // m
const mm3 = (x: number) => Math.round(x * 1000) / 1000; // ölçüler milimetreye

export function decomposeArea(vertsMm: V[]): CalcRow[] {
  // yerel orijine taşı (6 km'lik koordinatlarda kayan nokta gürültüsünü önler)
  const ox = vertsMm[0]?.x ?? 0;
  const oy = vertsMm[0]?.y ?? 0;
  const v = vertsMm.map((p) => ({ x: (p.x - ox) / 1000, y: (p.y - oy) / 1000, bulge: p.bulge ?? 0 }));
  if (v.length > 1 && Math.hypot(v[0].x - v[v.length - 1].x, v[0].y - v[v.length - 1].y) < EPS) v.pop();
  const n = v.length;
  if (n < 2) return [];

  // kiriş çokgeninin işaretli alanı ve yay parçaları
  let chordSigned = 0;
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    chordSigned += a.x * b.y - b.x * a.y;
  }
  chordSigned /= 2;
  const arcs: { r: number; theta: number; seg: number; bsign: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = v[i];
    if (Math.abs(a.bulge) < 1e-9) continue;
    const b = v[(i + 1) % n];
    const c = Math.hypot(b.x - a.x, b.y - a.y);
    if (c < EPS) continue;
    const theta = 4 * Math.atan(Math.abs(a.bulge));
    const r = c / (2 * Math.sin(theta / 2));
    arcs.push({ r, theta, seg: ((r * r) / 2) * (theta - Math.sin(theta)), bsign: Math.sign(a.bulge) });
  }
  const totalSigned = chordSigned + arcs.reduce((s, x) => s + x.bsign * x.seg, 0);
  const orient = totalSigned >= 0 ? 1 : -1;

  const rows: CalcRow[] = [];
  // kiriş çokgeni: en uzun kenara hizalayıp yatay dilimlerle yamuk/dikdörtgen
  if (n >= 3 && Math.abs(chordSigned) > EPS) {
    const chordSign = (Math.sign(chordSigned) * orient) as 1 | -1;
    for (const r of slabRows(v)) rows.push({ ...r, sign: chordSign, value: chordSign * r.value });
  }
  for (const a of arcs) {
    const sign = (a.bsign * orient) as 1 | -1;
    rows.push({
      kind: 'daire parçası',
      label: `Daire parçası r=${a.r.toFixed(2)} m, merkez açısı ${((a.theta * 180) / Math.PI).toFixed(2)}° → r²/2 × (θ − sin θ)`,
      adet: 1,
      r: mm3(a.r),
      angle: (a.theta * 180) / Math.PI,
      sign,
      value: sign * a.seg,
    });
  }
  return rows;
}

/** Çokgeni en uzun kenarına hizalar, köşe y'lerinden yatay dilimlere böler; aynı kenarlar arasında kalan dilimleri birleştirir. */
function slabRows(v0: { x: number; y: number }[]): Omit<CalcRow, 'sign'>[] {
  const n = v0.length;
  let best = 0;
  let ang = 0;
  for (let i = 0; i < n; i++) {
    const a = v0[i];
    const b = v0[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > best) ((best = L), (ang = Math.atan2(b.y - a.y, b.x - a.x)));
  }
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  const v = v0.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const edges = v.map((a, i) => ({ a, b: v[(i + 1) % n], id: i })).filter((e) => Math.abs(e.a.y - e.b.y) > EPS);
  const ys = [...new Set(v.map((p) => Math.round(p.y / EPS) * EPS))].sort((p, q) => p - q);
  const xAt = (e: (typeof edges)[number], y: number) => e.a.x + ((e.b.x - e.a.x) * (y - e.a.y)) / (e.b.y - e.a.y);

  type Open = { L: number; R: number; y0: number; y1: number; a: number; b: number };
  const done: Open[] = [];
  let open: Open[] = [];
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k];
    const y1 = ys[k + 1];
    if (y1 - y0 < EPS) continue;
    const ym = (y0 + y1) / 2;
    const cross = edges
      .filter((e) => Math.min(e.a.y, e.b.y) < ym && Math.max(e.a.y, e.b.y) > ym)
      .sort((p, q) => xAt(p, ym) - xAt(q, ym));
    const next: Open[] = [];
    for (let j = 0; j + 1 < cross.length; j += 2) {
      const L = cross[j];
      const R = cross[j + 1];
      const a = xAt(R, y0) - xAt(L, y0);
      const b = xAt(R, y1) - xAt(L, y1);
      const prev = open.find((o) => o.L === L.id && o.R === R.id && Math.abs(o.y1 - y0) < EPS);
      if (prev) {
        prev.y1 = y1;
        prev.b = b;
        next.push(prev);
      } else next.push({ L: L.id, R: R.id, y0, y1, a, b });
    }
    for (const o of open) if (!next.includes(o)) done.push(o);
    open = next;
  }
  done.push(...open);
  return done.map((o) => {
    const h = o.y1 - o.y0;
    const rect = Math.abs(o.a - o.b) < 1e-4;
    const en = mm3(rect ? o.a : (o.a + o.b) / 2);
    const hh = mm3(h);
    return rect
      ? { kind: 'dikdörtgen' as const, label: 'Dikdörtgen: en × boy', adet: 1, en, boy: hh, value: en * hh }
      : { kind: 'yamuk' as const, label: `Yamuk: (${o.a.toFixed(3)} + ${o.b.toFixed(3)}) / 2 × ${hh.toFixed(3)}`, adet: 1, en, boy: hh, a: mm3(o.a), b: mm3(o.b), value: en * hh };
  });
}
