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
  let cur = vertsMm;
  for (let k = 0; k < 8; k++) {
    const res = decomposeOnce(cur);
    if (res.ok) return res.rows;
    // ince eğri bantlarda büyük yayların kirişleri birbirini keser → yayları ikiye böl, tekrar dene
    const next: V[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      const bu = a.bulge ?? 0;
      if (Math.abs(bu) < 1e-9) {
        next.push(a);
        continue;
      }
      const th = 4 * Math.atan(bu); // işaretli
      const c = Math.hypot(b.x - a.x, b.y - a.y);
      const r = c / (2 * Math.sin(Math.abs(th) / 2));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const sag = r - Math.sqrt(Math.max(0, r * r - (c / 2) ** 2)); // kiriş ortasından yaya
      const h = Math.abs(th) > Math.PI ? 2 * r - sag : sag;
      const nx = -(b.y - a.y) / c;
      const ny = (b.x - a.x) / c;
      const sgn = -Math.sign(bu); // pozitif bulge: yay kirişin sağında (saat yönü tersine giderken)
      const nb = Math.tan(th / 8);
      next.push({ x: a.x, y: a.y, bulge: nb }, { x: mx + sgn * nx * h, y: my + sgn * ny * h, bulge: nb });
    }
    cur = next;
  }
  return decomposeOnce(cur).rows;
}

function decomposeOnce(vertsMm: V[]): { rows: CalcRow[]; ok: boolean } {
  // yerel orijine taşı (6 km'lik koordinatlarda kayan nokta gürültüsünü önler)
  const ox = vertsMm[0]?.x ?? 0;
  const oy = vertsMm[0]?.y ?? 0;
  const v = vertsMm.map((p) => ({ x: (p.x - ox) / 1000, y: (p.y - oy) / 1000, bulge: p.bulge ?? 0 }));
  if (v.length > 1 && Math.hypot(v[0].x - v[v.length - 1].x, v[0].y - v[v.length - 1].y) < EPS) v.pop();
  const n = v.length;
  if (n < 2) return { rows: [], ok: true };

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
  let ok = true;
  // kiriş çokgeni: en uzun kenara hizalayıp yatay dilimlerle yamuk/dikdörtgen
  if (n >= 3 && Math.abs(chordSigned) > EPS) {
    const chordSign = (Math.sign(chordSigned) * orient) as 1 | -1;
    const slabs = slabRows(v);
    const exact = slabs.reduce((t, r) => t + (r.exact ?? 0), 0);
    if (Math.abs(exact - Math.abs(chordSigned)) > 1e-6 * Math.max(1, Math.abs(chordSigned))) ok = false; // kendini kesiyor
    for (const { exact: _e, ...r } of slabs) if (r.value !== 0) rows.push({ ...r, sign: chordSign, value: chordSign * r.value }); // sıfır yükseklikli dilim yazılmaz
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
  return { rows, ok };
}

/** Birkaç kenar yönünü dener; en az satır, sonra en küçük yuvarlama farkı veren hizalamayı seçer. */
function slabRows(v0: { x: number; y: number }[]): (Omit<CalcRow, 'sign'> & { exact?: number })[] {
  const n = v0.length;
  const edges = v0.map((a, i) => {
    const b = v0[(i + 1) % n];
    return { L: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  });
  const cands: number[] = [];
  for (const e of edges.slice().sort((p, q) => q.L - p.L)) {
    const a = ((e.ang % Math.PI) + Math.PI) % Math.PI;
    if (!cands.some((c) => Math.abs(c - a) < 1e-6 || Math.abs(Math.abs(c - a) - Math.PI) < 1e-6)) cands.push(a);
    if (cands.length >= 6) break;
  }
  let best: ReturnType<typeof slabRowsAt> | null = null;
  let bestErr = Infinity;
  for (const a of cands) {
    const rows = slabRowsAt(v0, a);
    const exact = rows.reduce((t, r) => t + (r.exact ?? 0), 0);
    const err = Math.abs(rows.reduce((t, r) => t + r.value, 0) - exact);
    if (!best || rows.length < best.length || (rows.length === best.length && err < bestErr - 1e-9)) ((best = rows), (bestErr = err));
  }
  return best ?? [];
}

/** Çokgeni en uzun kenarına hizalar, köşe y'lerinden yatay dilimlere böler; aynı kenarlar arasında kalan dilimleri birleştirir. */
function slabRowsAt(v0: { x: number; y: number }[], ang: number): (Omit<CalcRow, 'sign'> & { exact: number })[] {
  const n = v0.length;
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
    const exact = ((o.a + o.b) / 2) * h;
    if (rect) return { kind: 'dikdörtgen' as const, label: 'Dikdörtgen: en × boy', adet: 1, en, boy: hh, value: en * hh, exact };
    const a = mm3(o.a);
    const b = mm3(o.b);
    return { kind: 'yamuk' as const, label: `Yamuk: (${a.toFixed(3)} + ${b.toFixed(3)}) / 2 × ${hh.toFixed(3)}`, adet: 1, en: mm3((a + b) / 2), boy: hh, a, b, value: ((a + b) / 2) * hh, exact };
  });
}

// ---------------------------------------------------------------------------
// Örneklenmiş eğriler (tarama halkaları, 1° adımla) için: yayları geri tanı, boşlukları düş, uzunluğu parçala.
type Pt = { x: number; y: number };
const TOL = 1; // mm, nokta çembere / doğruya uzaklık toleransı

function circle3(a: Pt, b: Pt, c: Pt): { x: number; y: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}
const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  return L < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(cross(a, b, p)) / L;
};

/** Yay olarak kabul: en az 3 kiriş, her kiriş ≤ 6°, tüm noktalar çemberde ve aynı yöne dönüyor. */
function arcFits(p: Pt[], i: number, j: number): { bulge: number } | null {
  if (j - i < 3) return null;
  const c = circle3(p[i], p[Math.floor((i + j) / 2)], p[j]);
  if (!c || c.r > 1e6) return null;
  const s = Math.sign(cross(p[i], p[i + 1], p[i + 2]));
  if (!s) return null;
  let sweep = 0;
  let cMin = Infinity;
  let cMax = 0;
  for (let k = i; k < j; k++) {
    if (Math.abs(Math.hypot(p[k].x - c.x, p[k].y - c.y) - c.r) > TOL) return null;
    if (k + 2 <= j && Math.sign(cross(p[k], p[k + 1], p[k + 2])) !== s) return null;
    const ch = Math.hypot(p[k + 1].x - p[k].x, p[k + 1].y - p[k].y);
    cMin = Math.min(cMin, ch);
    cMax = Math.max(cMax, ch);
    const da = 2 * Math.asin(Math.min(1, ch / (2 * c.r)));
    if (da > (6 * Math.PI) / 180) return null;
    sweep += da;
  }
  if (Math.abs(Math.hypot(p[j].x - c.x, p[j].y - c.y) - c.r) > TOL) return null;
  if (cMax > cMin * 1.05 + 0.5) return null; // örneklenmiş yayın kirişleri eşittir
  if (sweep > Math.PI + 1e-9) return null; // tam daire iki yarım daire olur
  return { bulge: s * Math.tan(sweep / 4) };
}

function refitOpen(p: Pt[]): { x: number; y: number; bulge: number }[] {
  const out: { x: number; y: number; bulge: number }[] = [];
  let i = 0;
  while (i < p.length - 1) {
    let j = i + 3;
    let fit = j < p.length ? arcFits(p, i, j) : null;
    if (fit) {
      while (j + 1 < p.length) {
        const f = arcFits(p, i, j + 1);
        if (!f) break;
        fit = f;
        j++;
      }
      out.push({ ...p[i], bulge: fit.bulge });
      i = j;
      continue;
    }
    // doğru parça: doğrusal ara noktaları atla
    j = i + 1;
    while (j + 1 < p.length && segDist(p[j], p[i], p[j + 1]) < TOL && !arcFits(p, j, Math.min(p.length - 1, j + 3))) j++;
    out.push({ ...p[i], bulge: 0 });
    i = j;
  }
  out.push({ ...p[p.length - 1], bulge: 0 });
  return out;
}

/** Kapalı halka (açık için closed=false): örneklenmiş yayları tek bulge köşesine, doğrusal noktaları teke indirir. */
export function refitArcs(pts: Pt[], closed = true): { x: number; y: number; bulge: number }[] {
  let p = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) > 0.01); // birleşimdeki çift noktalar
  if (p.length > 1 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6) p.pop();
  if (!closed) return refitOpen(p);
  if (p.length < 3) return p.map((q) => ({ ...q, bulge: 0 }));
  // başlangıcı en keskin köşeye al (yay ortasında başlamasın)
  const n = p.length;
  let k0 = 0;
  let best = -1;
  for (let k = 0; k < n; k++) {
    const a = p[(k - 1 + n) % n];
    const b = p[k];
    const c = p[(k + 1) % n];
    const t = Math.abs(Math.atan2(cross(a, b, c), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
    if (t > best) ((best = t), (k0 = k));
  }
  p = [...p.slice(k0), ...p.slice(0, k0), p[k0]];
  const v = refitOpen(p);
  v.pop(); // kapanış noktası
  // başlangıç noktası doğrusal ise sil
  if (v.length > 3 && v[v.length - 1].bulge === 0 && v[0].bulge === 0 && segDist(v[0], v[v.length - 1], v[1]) < TOL) v.shift();
  return v;
}

/** Çok halkalı tarama bölgesi: her halka ayrıştırılır; çift-tek kurala göre boşluk halkaları eksi satır olur. */
export function decomposeRegion(loops: Pt[][]): CalcRow[] {
  const inside = (p: Pt, l: Pt[]) => {
    let c = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) if (l[i].y > p.y !== l[j].y > p.y && p.x < ((l[j].x - l[i].x) * (p.y - l[i].y)) / (l[j].y - l[i].y) + l[i].x) c = !c;
    return c;
  };
  const rows: CalcRow[] = [];
  for (const l of loops) {
    if (l.length < 3) continue;
    const probe = { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 };
    const depth = loops.filter((o) => o !== l && inside(probe, o)).length;
    const s = depth % 2 === 0 ? 1 : -1;
    for (const r of decomposeArea(refitArcs(l))) rows.push({ ...r, sign: (r.sign * s) as 1 | -1, value: r.value * s });
  }
  return rows;
}

/** Aynı tür, ölçü ve işaretteki satırları adet olarak birleştirir. */
export function mergeRows(rows: CalcRow[]): CalcRow[] {
  const m = new Map<string, CalcRow>();
  const k3 = (x?: number) => (x === undefined ? '' : x.toFixed(3));
  for (const r of rows) {
    const key = [r.kind, r.unit ?? '', k3(r.en), k3(r.boy), k3(r.a), k3(r.b), k3(r.r), r.angle === undefined ? '' : r.angle.toFixed(2), r.sign].join('|');
    const e = m.get(key);
    if (e) {
      e.adet += r.adet;
      e.value += r.value;
    } else m.set(key, { ...r });
  }
  return [...m.values()];
}

/** Çizgi uzunluğu: doğru parçalar (boy) ve yaylar (r × θ). */
export function decomposeLength(pts: Pt[], closed: boolean): CalcRow[] {
  const v = refitArcs(pts, closed);
  const n = closed ? v.length : v.length - 1;
  const rows: CalcRow[] = [];
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    const c = Math.hypot(b.x - a.x, b.y - a.y) / 1000;
    if (c < EPS) continue;
    if (Math.abs(a.bulge) < 1e-9) {
      rows.push({ kind: 'doğru', unit: 'm', label: 'Doğru parça', adet: 1, boy: mm3(c), sign: 1, value: mm3(c) });
    } else {
      const th = 4 * Math.atan(Math.abs(a.bulge));
      const r = c / (2 * Math.sin(th / 2));
      rows.push({ kind: 'yay', unit: 'm', label: 'Yay: r × θ', adet: 1, r: mm3(r), angle: (th * 180) / Math.PI, sign: 1, value: r * th });
    }
  }
  return rows;
}
