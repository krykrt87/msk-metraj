// Çatı planından (01-02-300) çıkan kalemler: uzay kafes, salon çatıları, çakıllı teras, alçak çatılar,
// saçak, parapetler, gizli dere, süzgeçler, iniş boruları. Asma kat (01-02-200) yalnız bulgular için okunur.
import { readDxf, val, type RawDxf } from '../lib/dxf';
import { cleanText, flatten, type Flat } from '../lib/flatten';
import { area, bbox, length, pointInPolygon, type P } from '../lib/geom';
import { decomposeLength, decomposeRegion, gridRects, mergeRows, type CalcRow } from '../lib/decompose';
import type { Line, TakeoffItem } from './model';
import { model3d } from './model3d';
import { roomAt, roomsNear } from './rooms-index';
const exA = (l: P[]) => decomposeRegion([l]).reduce((t, r) => t + r.value, 0) * 1e6; // mm², cetvel toplamı
const csum = (rows: CalcRow[]) => rows.reduce((t, r) => t + r.value, 0);
/** Satırlardan ara toplam cetveli (her satır bir 'kalem' satırı). */
const subtotal = (ls: Line[]): CalcRow[] => ls.map((l) => ({ kind: 'kalem', unit: l.unit, label: l.label, name: l.label, adet: 1, sign: (l.value ?? 0) < 0 ? -1 : 1, value: l.value ?? 0 }));
/** Polyline'ın c0 → c1 (mm, baştan uzunluk) arasındaki parçası. */
function subLine(pts: P[], c0: number, c1: number): P[] {
  const out: P[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const at = (c: number) => ({ x: a.x + ((b.x - a.x) * (c - acc)) / L, y: a.y + ((b.y - a.y) * (c - acc)) / L });
    if (L > 0 && acc + L >= c0 && acc <= c1) {
      if (!out.length) out.push(at(Math.max(c0, acc)));
      out.push(acc + L <= c1 ? b : at(c1));
    }
    acc += L;
  }
  return out;
}
const neg = (rows: CalcRow[]): CalcRow[] => rows.map((r) => ({ ...r, sign: (-r.sign) as 1 | -1, value: -r.value }));
const rc = (b: { minX: number; minY: number; maxX: number; maxY: number }): P[] => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }];

const ROOF = '4199-A-DD-01-02-300';
const MF = '4199-A-DD-01-02-200';
const ROOF_FILE = 'work/dxf/4199-A-DD-01-02-300.dxf';
const MF_FILE = 'work/dxf/4199-A-DD-01-02-200.dxf';

type Finding = { topic: string; drawings: string; finding: string; suggestion: string };

const r2 = (v: number) => Math.round(v * 100) / 100;
const M = (mm: number) => mm / 1000; // mm → m
const M2 = (mm2: number) => mm2 / 1e6; // mm² → m²
const pt = (x: number, y: number): P => ({ x: x * 1000, y: y * 1000 }); // m → mm
const fmt = (v: number) => r2(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const xy = (p: P) => `(${(p.x / 1000).toFixed(2)}; ${(p.y / 1000).toFixed(2)})`;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`roof-items: bulunamadı → ${what}`);
  return v;
}

/** Bir polyline üzerinde q noktasına en yakın konumun baştan uzunluğu (mm). */
function chainageAt(pts: P[], q: P): number {
  let best = Infinity;
  let at = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const t = L > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (L * L))) : 0;
    const d = Math.hypot(a.x + t * (b.x - a.x) - q.x, a.y + t * (b.y - a.y) - q.y);
    if (d < best) {
      best = d;
      at = acc + t * L;
    }
    acc += L;
  }
  if (best > 50) throw new Error(`roof-items: nokta polyline üzerinde değil ${xy(q)} (sapma ${best.toFixed(0)} mm)`);
  return at;
}

/** Blok içindeki MULTILEADER yazıları (flatten bu varlığı okumaz). */
function multileaderTexts(dxf: RawDxf, block: string): string[] {
  const b = dxf.blocks.get(block);
  if (!b) return [];
  return b.entities.filter((e) => e.type === 'MULTILEADER').map((e) => cleanText(val(e, 304)));
}

/** Basit tek bağlantılı kümeleme (yarıçap mm). */
function cluster(points: P[], radius: number): P[][] {
  const groups: P[][] = [];
  for (const p of points) {
    const hits = groups.filter((g) => g.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= radius));
    if (!hits.length) groups.push([p]);
    else {
      const merged = [p, ...hits.flat()];
      for (const h of hits) groups.splice(groups.indexOf(h), 1);
      groups.push(merged);
    }
  }
  return groups;
}

let roofDxf: { dxf: RawDxf; flat: Flat[] } | null = null;
/** Çatı paftası bir kez okunur (duvar üst kotu ve çatı kalemleri ortak kullanır). */
function loadRoof() {
  if (!roofDxf) {
    const dxf = readDxf(ROOF_FILE);
    roofDxf = { dxf, flat: flatten(dxf) };
  }
  return roofDxf;
}
const siteOf = (flat: Flat[]) => flat.filter((f) => f.path[0] === 'SITEPLAN_L');

/** +3,70 alçak çatılar: KD (tek halkalı AR-SAND + dış dikdörtgen) ve KB (açık çizgi çifti: dış / iç kutu). */
function lowRoofs(site: Flat[]) {
  const sandSingles = site.filter((f) => f.t === 'HATCH' && f.pattern === 'AR-SAND' && f.loops?.length === 1);
  const neHatch = must(sandSingles.find((h) => bbox(h.loops![0]).minX > 700e3), 'KD alçak çatı taraması');
  const neB = bbox(neHatch.loops![0]);
  const neOuter = must(site.find((f) => f.closed && f.pts && f.pts.length === 4 && f.layer === 'A_Elev_1' && (() => { const b = bbox(f.pts!); return b.minX <= neB.minX + 1 && b.maxX >= neB.maxX - 1 && b.minY <= neB.minY + 1 && b.maxY >= neB.maxY - 1 && M2(area(f.pts!)) < 100; })()), 'KD alçak çatı dış dikdörtgeni');
  const nwPl = site.filter((f) => f.layer === 'A_Elev_1' && f.t === 'PLINE' && !f.closed && f.pts!.length === 3 && (() => { const b = bbox(f.pts!); return b.minX < 640e3 && b.minY > 6019e3 && b.maxX > 659e3; })());
  if (nwPl.length !== 2) throw new Error(`roof-items: KB kutusu çizgileri 2 bekleniyordu, ${nwPl.length}`);
  const [nwO, nwI] = nwPl.map((f) => bbox(f.pts!)).sort((a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY));
  return { sandSingles, neHatch, neB, neOuter, neOB: bbox(neOuter.pts!), nwO, nwI };
}

/**
 * Zemin kat duvarının üst kotu, üstündeki çatıya göre: +3,70 alçak çatıların (dış kutu) altında 3,70; başka her yerde
 * +7,10 (teras döşemesi; salonlarda +7,10 üstü kabuk duvar C.4 ayrı kalemde).
 * shortcut: döşeme kalınlığı düşülmedi ve asma kat (+3,80) altı ayrılmadı; kesit/döşeme kalınlığı netleşince güncellenir.
 */
export function wallTopAt(): (p: P) => { z: number; where: string } {
  const { neOB, nwO } = lowRoofs(siteOf(loadRoof().flat));
  const inB = (p: P, b: ReturnType<typeof bbox>) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
  return (p) => (inB(p, neOB) || inB(p, nwO) ? { z: 3.7, where: '+3,70 alçak çatı altı' } : { z: 7.1, where: '+7,10 çatı döşemesi altı' });
}

export function roofItems(): { items: TakeoffItem[]; findings: Finding[] } {
  const { dxf, flat } = loadRoof();
  const top = (f: Flat) => f.path[0] ?? '';
  const inBlk = (b: string) => flat.filter((f) => top(f) === b);
  const site = siteOf(flat);
  const drain = inBlk('Catı_su_tahliye');
  const items: TakeoffItem[] = [];
  const findings: Finding[] = [];

  // ---------------------------------------------------------------- ortak geometri
  // Çakıllı teras taraması (AR-SAND, 11 halka, ada stili "outer")
  const gravel = must(site.find((f) => f.t === 'HATCH' && f.pattern === 'AR-SAND' && (f.loops?.length ?? 0) >= 10), 'AR-SAND teras taraması');
  const loops = gravel.loops!;
  const outer = loops.reduce((a, b) => (area(b) > area(a) ? b : a));
  const depth = (l: P[]) => loops.filter((o) => o !== l && area(o) > area(l) && pointInPolygon(l[0], o)).length;
  const holes = loops.filter((l) => l !== outer && depth(l) === 1);
  const hallBlock = must(holes.find((h) => M2(area(h)) > 3000), 'salon bloğu adası');
  const circles = holes.filter((h) => h.length >= 300).sort((a, b) => area(b) - area(a));
  const bigCircle = must(circles[0], 'büyük dairesel boşluk');
  const smallCircle = must(circles[1], 'küçük dairesel boşluk');
  const courtyard = must(holes.find((h) => h !== hallBlock && h.length < 300), 'avlu (yamuk) boşluğu');
  /** Boşluğun yanındaki zemin kat mahali (planda boşlukların adı yok). */
  const besideRoom = (l: P[]) => {
    const b = bbox(l);
    const r = roomsNear({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, Math.max(b.maxX - b.minX, b.maxY - b.minY))[0];
    return r ? ` – ${r.label} yanında` : '';
  };
  const voids = [
    { label: `Büyük dairesel boşluk (Ø≈13,6 m, iç ±0,00)${besideRoom(bigCircle)}`, loop: bigCircle },
    { label: `Küçük dairesel boşluk (Ø≈6,6 m, iç ±0,00)${besideRoom(smallCircle)}`, loop: smallCircle },
    { label: `Yamuk avlu (ağaçlı, iç ±0,00)${besideRoom(courtyard)}`, loop: courtyard },
  ];
  const netGravel = exA(outer) - sum(holes.map(exA));
  const inTerrace = (p: P) => pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h));

  // Salon parapet dikdörtgenleri (dış/iç yüz)
  const rects = site.filter((f) => f.layer === 'A_Elev_1' && f.t === 'PLINE' && f.closed && f.pts!.length === 4 && M2(area(f.pts!)) > 700);
  const outers = rects.filter((r) => !rects.some((o) => o !== r && area(o.pts!) > area(r.pts!) && pointInPolygon(r.pts![0], o.pts!))).sort((a, b) => bbox(a.pts!).minX - bbox(b.pts!).minX);
  const halls = outers.map((o, i) => {
    const inner = must(rects.find((r) => r !== o && pointInPolygon(r.pts![0], o.pts!)), `salon iç parapet ${i}`);
    const b = bbox(o.pts!);
    // projedeki mahal adı: parapet içinin ortasındaki zemin kat mahali (GF-03 SALON 01 …)
    const ib = bbox(inner.pts!);
    const room = roomAt({ x: (ib.minX + ib.maxX) / 2, y: (ib.minY + ib.maxY) / 2 });
    return { name: room?.label ?? ['Batı salon', 'Orta salon', 'Doğu salon'][i] ?? `Salon ${i + 1}`, code: room?.code ?? `S${i + 1}`, outer: o.pts!, inner: inner.pts!, b };
  });
  if (halls.length !== 3) throw new Error(`roof-items: 3 salon bekleniyordu, ${halls.length} bulundu`);
  const hallOf = (p: P) => halls.find((h) => pointInPolygon(p, h.outer));
  /** Uzay kafes parçasının adı: üstünde olduğu salon ya da iki salon arasındaki derz. */
  const ukName = (pts: P[]) => {
    const b = bbox(pts);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    if (M(b.maxX - b.minX) >= 3) return `${hallOf(c)?.name ?? 'salon'} üstü`;
    const left = halls.filter((h) => h.b.maxX <= c.x + 500).sort((p, q) => q.b.maxX - p.b.maxX)[0];
    const right = halls.filter((h) => h.b.minX >= c.x - 500).sort((p, q) => p.b.minX - q.b.minX)[0];
    return `${left?.code ?? '?'} – ${right?.code ?? '?'} arası derz şeridi`;
  };

  // ---------------------------------------------------------------- B.1 uzay kafes
  const uk = inBlk('UZAY KAFES').filter((f) => f.closed && f.pts).sort((a, b) => bbox(a.pts!).minX - bbox(b.pts!).minX);
  const ukB = bbox(uk.flatMap((f) => f.pts!));
  const ukSum = sum(uk.map((f) => area(f.pts!)));
  const ukUnion = (ukB.maxX - ukB.minX) * (ukB.maxY - ukB.minY);
  const ukNotes = multileaderTexts(dxf, 'SITEPLAN_L');
  let hi = 0;
  let si = 0;
  items.push({
    poz: 'B.1', group: 'B', name: 'Uzay kafes çelik konstrüksiyon – izdüşüm alanı (3 salon üstü)', unit: 'm²', value: r2(M2(ukSum)),
    method:
      `Çatı planındaki "UZAY KAFES" bloğunun (katman A_Trce_Hidn, gizli çizgi) ${uk.length} kapalı çizgisinin alanı toplandı: 3 salon paneli ile aralarındaki 2 derz şeridi. Parçalar birbirine bitişik ve örtüşmüyor; birleşimleri tek bir ${fmt(M(ukB.maxX - ukB.minX))} × ${fmt(M(ukB.maxY - ukB.minY))} m dikdörtgen (${fmt(M2(ukUnion))} m²), yani toplamda çift sayım yok. Kafesin dış hattı olduğu, plandaki "${ukNotes.find((t) => /UZAY KAFES/.test(t)) ?? 'UZAY KAFES ÇELİK KONSTRÜKSİYON DIŞ HATTI'}" notuyla doğrulandı. Zemin kat ve asma kat paftalarında aynı blok iki kez yerleştirilmiş (zemin kat konumu ile x +465,28 m'deki asma kat kopyası, her biri ≈3.035,80 m²); orada görülen 6.071,60 m² iki kopyanın toplamıdır, burada tek kopya alındı.`,
    sources: [{ drawing: ROOF, where: 'blok UZAY KAFES · katman A_Trce_Hidn · 5 kapalı LWPOLYLINE' }],
    confidence: 'Yüksek',
    lines: [
      ...uk.map((f): Line => {
        const b = bbox(f.pts!);
        const w = M(b.maxX - b.minX);
        const strip = w < 3;
        return { label: ukName(f.pts!), value: r2(M2(area(f.pts!))), unit: 'm²', note: `${fmt(w)} × ${fmt(M(b.maxY - b.minY))} m`, calc: mergeRows(decomposeRegion([f.pts!])) };
      }),
      { label: 'Birleşim dikdörtgeni (kontrol)', value: r2(M2(ukUnion)), unit: 'm²', note: 'toplamla aynı → örtüşme yok', calc: decomposeRegion([rc(ukB)]) },
    ],
    notes: ['01-02-100 / 01-02-200 paftalarındaki UZAY KAFES bloğu iki kopya içerir (zemin kat + asma kat ötelemesi); blok tanımları y yönünde 0,10 m farklı (43,00 m yerine 43,10 m).'],
  });

  // ---------------------------------------------------------------- gizli dere eksenleri (B.2 yüzey biçimi, B.10)
  const diag = site.filter((f) => f.layer === 'A_Elev_3' && f.t === 'PLINE' && !f.closed && f.pts!.length === 2 && M(length(f.pts!)) > 40);
  const gutterLines = halls.map((h) => {
    const ls = diag.filter((d) => pointInPolygon({ x: (d.pts![0].x + d.pts![1].x) / 2, y: (d.pts![0].y + d.pts![1].y) / 2 }, h.outer));
    if (ls.length !== 2) throw new Error(`roof-items: ${h.name} için 2 dere çizgisi bekleniyordu, ${ls.length}`);
    const [a, b] = ls.map((l) => l.pts!);
    const ux = (a[1].x - a[0].x) / length(a);
    const uy = (a[1].y - a[0].y) / length(a);
    const w = Math.abs((b[0].x - a[0].x) * uy - (b[0].y - a[0].y) * ux);
    const la = Math.round(length(a)) / 1000;
    const lb = Math.round(length(b)) / 1000;
    const calc: CalcRow[] = [
      { kind: 'doğru', unit: 'm', label: '1. kenar', name: '1. kenar çizgisi (ortalama için ½)', adet: 0.5, boy: la, sign: 1, value: la / 2 },
      { kind: 'doğru', unit: 'm', label: '2. kenar', name: '2. kenar çizgisi (ortalama için ½)', adet: 0.5, boy: lb, sign: 1, value: lb / 2 },
    ];
    return { h, L: ((la + lb) / 2) * 1000, w, calc, a, b };
  });

  // ---------------------------------------------------------------- salon çatı biçimi (3B ve bulgular)
  // Salon çatıları dağ gibi: dere köşegeninin iki ucu (alçak köşeler) en düşük, öbür iki köşe tepe. Her kenar alçak
  // köşeden tepeye z = alçak + yükselti·s^p (s 0→1) eğrisiyle yükselir; çatı yüzeyi dereye paralel çizgiler boyunca aynı kotta.
  // Parapet üstü: görünüş 01-04-100 kabuk taraması (cati_kaplama_on1) üst kenarı, −0,40 saha kotundan; tepeler kesitteki
  // "Parapet Hizası" +16,06 / +17,87 ile uyumlu. Çatı yüzeyi alçak kotu: kesit 01-03-100'de dere kutusunun üstü.
  // shortcut: çatı yüzeyi parapet eğrisine paralel varsayıldı (kesitteki çatı çizgileriyle fark ≤0,5 m); çatı kesiti/detayı gelince düzeltilir.
  type Hall = (typeof halls)[number];
  type P3 = P & { z: number };
  const bigHall = halls.reduce((a, h) => (area(h.inner) > area(a.inner) ? h : a));
  const shape = (h: Hall) => (h === bigHall ? { top: 11.874, roof: 10.81, rise: 6, p: 1.9 } : { top: 12.084, roof: 11.45, rise: 4, p: 2 });
  const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  /** Dikdörtgenin dere ekseni uçlarına en yakın iki köşesi (alçak köşeler); karşılıklı olmalı. */
  const lowCorners = (rect: P[], axis: P[], h: Hall) => {
    const lo = axis.map((q) => rect.reduce((a, b) => (Math.hypot(a.x - q.x, a.y - q.y) < Math.hypot(b.x - q.x, b.y - q.y) ? a : b)));
    if (Math.abs(rect.indexOf(lo[0]) - rect.indexOf(lo[1])) !== 2) throw new Error(`roof-items: ${h.name} deresi köşegen değil`);
    return lo;
  };
  const N3 = 16; // kenar başına şerit
  const kz = (z: number) => `+${z.toFixed(2).replace('.', ',')}`;
  const b2Line = (h: Hall) => `${h.name} (parapet içi, eğik yüzey)`;
  const hallGeo = gutterLines.map(({ h, a: axis }) => {
    const S = shape(h);
    const zAt = (base: number, s: number) => base + S.rise * s ** S.p;
    const up = S.top - S.roof;
    // çatı yüzeyi: her tepe köşesine doğru dereye paralel düzlemsel şeritler
    const [l1, l2] = lowCorners(h.inner, axis, h);
    const roof: P3[][] = [];
    for (const H of h.inner.filter((c) => c !== l1 && c !== l2))
      for (let k = 0; k < N3; k++) {
        const [s0, s1] = [k / N3, (k + 1) / N3];
        const [z0, z1] = [zAt(S.roof, s0), zAt(S.roof, s1)];
        roof.push([{ ...lerp(l1, H, s0), z: z0 }, { ...lerp(l2, H, s0), z: z0 }, { ...lerp(l2, H, s1), z: z1 }, { ...lerp(l1, H, s1), z: z1 }]);
      }
    // dış yüzün her kenarı alçak köşeden tepeye: kabuk +7,10 → çatı, parapet çatı → parapet üstü
    const lo = lowCorners(h.outer, axis, h);
    const shell: P3[][] = [];
    const parapet: P3[][] = [];
    for (let i = 0; i < 4; i++) {
      let [a, b] = [h.outer[i], h.outer[(i + 1) % 4]];
      if (!lo.includes(a)) [a, b] = [b, a];
      for (let k = 0; k < N3; k++) {
        const [p0, p1] = [lerp(a, b, k / N3), lerp(a, b, (k + 1) / N3)];
        const [t0, t1] = [zAt(S.top, k / N3), zAt(S.top, (k + 1) / N3)];
        shell.push([{ ...p0, z: 7.1 }, { ...p1, z: 7.1 }, { ...p1, z: t1 - up }, { ...p0, z: t0 - up }]);
        parapet.push([{ ...p0, z: t0 - up }, { ...p1, z: t1 - up }, { ...p1, z: t1 }, { ...p0, z: t0 }]);
      }
    }
    // eğik yüzey cetveli: her şerit düzlemsel yamuk; paralel kenarlar dere doğrultusunda (sabit kot), yükseklik eğik mesafe
    const m3 = (x: number) => Math.round(x * 1000) / 1000;
    const diagL = Math.hypot(l2.x - l1.x, l2.y - l1.y) / 1000;
    const calc: CalcRow[] = [];
    for (const H of h.inner.filter((c) => c !== l1 && c !== l2)) {
      const D = Math.abs((l2.x - l1.x) * (H.y - l1.y) - (l2.y - l1.y) * (H.x - l1.x)) / 1e6 / diagL; // tepenin dereye uzaklığı, m
      for (let k = 0; k < N3; k++) {
        const [s0, s1] = [k / N3, (k + 1) / N3];
        const [a, b, hh] = [m3((1 - s0) * diagL), m3((1 - s1) * diagL), m3(Math.hypot((s1 - s0) * D, zAt(S.roof, s1) - zAt(S.roof, s0)))];
        calc.push({ kind: 'yamuk', label: `Yamuk: (${a.toFixed(3)} + ${b.toFixed(3)}) / 2 × ${hh.toFixed(3)}`, name: `${k + 1}. şerit (${kz(zAt(S.roof, s0))} → ${kz(zAt(S.roof, s1))})`, adet: 1, en: m3((a + b) / 2), boy: hh, a, b, sign: 1, value: ((a + b) / 2) * hh });
      }
    }
    const H0 = h.inner.find((c) => c !== l1 && c !== l2)!;
    const D0 = Math.abs((l2.x - l1.x) * (H0.y - l1.y) - (l2.y - l1.y) * (H0.x - l1.x)) / 1e6 / diagL;
    // iki yarı eş (dikdörtgen): aynı şeritler adet 2 olarak birleşir
    return { h, S, roof, shell, parapet, calc: mergeRows(calc), surf: sum(calc.map((r) => r.value)), slope: (S.rise * S.p) / D0 };
  });
  const roofZ = (h: Hall) => shape(h).roof;

  // ---------------------------------------------------------------- B.2 salon çatı örtüsü
  const lineHatches = site.filter((f) => f.t === 'HATCH' && f.pattern === 'LINE' && f.loops);
  const covering = sum(lineHatches.map((h) => exA(h.loops![0])));
  const innerSum = sum(halls.map((h) => area(h.inner)));
  const surfSum = sum(hallGeo.map((g) => g.surf));
  items.push({
    poz: 'B.2', group: 'B', name: 'Salon çatıları – çatı örtüsü alanı (parapet içi, eğik yüzey)', unit: 'm²', value: r2(surfSum),
    method:
      'Üç salonun çatısı, çatı planında (SITEPLAN_L bloğu, katman A_Elev_1) her salon için çizilmiş iki dikdörtgenle tanımlı: parapetin dış yüzü ve iç yüzü (parapet kalınlığı 0,30 m; salonlar arasında 0,80 m derz). Parapet iç yüzündeki dikdörtgen çatının izdüşümüdür; çatı ise düz değil, dağ gibi eğimli: köşegen gizli derenin iki ucundaki köşeler en alçak, öbür iki köşe tepe. Her kenar alçak köşeden tepeye eğrisel yükselir (parapet üstü görünüş 01-04-100\'den, dere kotu kesit 01-03-100\'den; küçük salonlarda +11,45 → +15,45, büyük salonda +10,81 → +16,81), yüzey dereye paralel çizgiler boyunca aynı kottadır. Çatı örtüsü alanı bu eğik yüzeyin gerçek alanıdır: yüzey her tepe köşesine doğru 16 şeride bölündü; her şerit düzlemsel bir yamuktur (paralel kenarlar dere doğrultusunda, yükseklik iki kenar arasındaki eğik mesafe). İzdüşüm alanı ve örtü taraması (iki üçgen LINE taraması, dere şeridi hariç) bilgi satırı olarak verildi, toplama katılmadı.',
    sources: [
      { drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_1 · 6 kapalı LWPOLYLINE (salon başına dış + iç parapet yüzü) + katman A_Elev_3 dere köşegenleri' },
      { drawing: '4199-A-DD-01-04-100', where: 'görünüşler · salon kabuk taraması (cati_kaplama_on1 / sol1) üst kenarı: parapet üstü eğrisi' },
      { drawing: '4199-A-DD-01-03-100', where: 'kesitler · salon çatısında gizli dere kutusunun üst kotu' },
      { drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Patt_Othr · 6 HATCH LINE (45°/135°, ölçek 150)' },
    ],
    confidence: 'Orta',
    notes: ['Çatı yüzeyi parapet üstü eğrisine paralel varsayıldı; kesitteki çatı çizgileriyle kot farkı yer yer 0,5 m\'ye varıyor. Bunun alana etkisi ±%0,5 mertebesinde. Kesin yüzey için çatı detay/kesit paftası istenmeli.'],
    lines: [
      ...hallGeo.map(({ h, surf, calc }): Line => ({ label: b2Line(h), value: r2(surf), unit: 'm²', note: `izdüşüm ${fmt(r2(M2(area(h.inner))))} m² (+%${fmt(Math.round((surf / M2(area(h.inner)) - 1) * 1000) / 10)}) · dış yüz ${fmt(M(h.b.maxX - h.b.minX))} × ${fmt(M(h.b.maxY - h.b.minY))} m`, calc })),
      { label: 'İzdüşüm – parapet içi dikdörtgenler (bilgi)', value: r2(M2(innerSum)), unit: 'm²', note: 'toplama katılmadı', calc: halls.flatMap((h) => decomposeRegion([h.inner]).map((r) => ({ ...r, name: h.name }))) },
      { label: 'Örtü taraması toplamı (bilgi, dere şeridi hariç)', value: r2(M2(covering)), unit: 'm²', note: `${lineHatches.length} üçgen LINE taraması; toplama katılmadı`, calc: mergeRows(lineHatches.flatMap((h) => decomposeRegion([h.loops![0]]))) },
    ],
  });

  // ---------------------------------------------------------------- B.3 çakıllı teras
  const facade = must(drain.find((f) => f.layer === 'A_Anno_Axis' && f.pts && f.pts.length > 300 && Math.hypot(f.pts[0].x - f.pts[f.pts.length - 1].x, f.pts[0].y - f.pts[f.pts.length - 1].y) < 10), 'cephe hattı (A_Anno_Axis kapalı çizgi)');
  const fb = bbox(outer);
  const step = 250;
  let outside = 0;
  const gnx = Math.ceil((fb.maxX - fb.minX) / step);
  const gny = Math.ceil((fb.maxY - fb.minY) / step);
  const outMask = new Uint8Array(gnx * gny);
  for (let gy = 0; gy < gny; gy++)
    for (let gx = 0; gx < gnx; gx++) {
      const p = { x: fb.minX + (gx + 0.5) * step, y: fb.minY + (gy + 0.5) * step };
      if (inTerrace(p) && !pointInPolygon(p, facade.pts!)) ((outMask[gy * gnx + gx] = 1), outside++);
    }
  const outsideM2 = (outside * step * step) / 1e6;
  items.push({
    poz: 'B.3', group: 'B', name: 'Betonarme teras çatı (çakıllı) +7,10 – net alan', unit: 'm²', value: r2(M2(netGravel)),
    method:
      `Çakıllı teras, SITEPLAN_L bloğundaki AR-SAND taramasıdır (katman A_Patt_Othr, 11 halka, ada stili "outer" (kod 75=1)). Bu stilde yalnız birinci derece adalar boşluk sayılır; içteki halkalar (salon iç parapetleri, daire iç yüzleri) yeniden taranmaz. Net alan = dış halka − salon bloğu − üç boşluk. Dış halka parapetlerin iç yüzünden geçer; MF-01 üstündeki kuzey şeridi teras içindedir, +3,70'teki iki alçak çatı dışındadır. Genel amaçlı regionArea bu taramada 7.313,81 m² verir, çünkü iç halkaları geri ekler; bu değer yanlış. Kotu planda "+7.10 SSL / +28.80" olarak 4 noktada yazılı.`,
    sources: [
      { drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Patt_Othr · HATCH AR-SAND (11 halka, ilişkili, stil outer)' },
      { drawing: ROOF, where: 'blok kotlar · katman A_Anno_Level · "+7.10 SSL"' },
    ],
    confidence: 'Yüksek',
    lines: [
      { label: 'Dış halka (parapet iç yüzü)', value: r2(M2(exA(outer))), unit: 'm²', note: `çevre ${fmt(M(length(outer, true)))} m`, calc: mergeRows(decomposeRegion([outer])) },
      { label: 'Eksi: salon bloğu (3 salon + derzler)', value: r2(-M2(exA(hallBlock))), unit: 'm²', note: `${fmt(M(bbox(hallBlock).maxX - bbox(hallBlock).minX))} × ${fmt(M(bbox(hallBlock).maxY - bbox(hallBlock).minY))} m`, calc: neg(mergeRows(decomposeRegion([hallBlock]))) },
      ...voids.map((v): Line => ({ label: `Eksi: ${v.label}`, value: r2(-M2(exA(v.loop))), unit: 'm²', note: 'dış yüz; gökyüzüne açık', calc: neg(mergeRows(decomposeRegion([v.loop]))) })),
      { label: 'Net çakıllı teras', value: r2(M2(netGravel)), unit: 'm²', note: 'yukarıdaki satırların toplamı' },
      { label: 'Bunun cephe hattı dışında kalan kısmı (bilgi)', value: r2(outsideM2), unit: 'm²', calc: gridRects(outMask, gnx, gny, step / 1000), note: '0,25 m ızgarayla; çatı planındaki cephe hattına göre (Catı_su_tahliye / A_Anno_Axis, 6.902,15 m²)' },
    ],
    notes: [
      `Teras alanının yaklaşık ${fmt(outsideM2)} m²'si cephe hattının dışında kalıyor: güney eğrisel cephe ile parapet arasındaki örtülü dış bant ve kuzey servis girişi girintisi. Zemin kat brüt sınırına (01-02-100, 6.886,53 m²) göre bağımsız kontrol: ≈633,5 m². Bu alanın altında soffit/tavan kaplaması gerekir.`,
    ],
  });

  // ---------------------------------------------------------------- B.4 / B.5 alçak çatılar +3,70
  const { sandSingles, neHatch, neB, neOuter, neOB, nwO, nwI } = lowRoofs(site);
  const under = (b: ReturnType<typeof bbox>) => {
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    return roomAt(c) ?? roomsNear(c, 8000)[0] ?? null; // altında mahal yoksa en yakın mahal
  };
  const neName = under(neB)?.label ?? 'kuzeydoğu';
  items.push({
    poz: 'B.4', group: 'B', name: `Alçak çatı +3,70 – ${neName} üstü (çakıllı)`, unit: 'm²', value: r2(M2(area(neHatch.loops![0]))),
    method:
      'Kuzeydoğu köşedeki küçük alçak çatı, "+3.70 SSL / +25.40" kotlu. Alan, SITEPLAN_L bloğundaki tek halkalı AR-SAND taramasından (parapet iç yüzü) alındı; dış dikdörtgen bilgi satırı olarak verildi. Bir Wavin süzgeci var (bkz. B.11).',
    sources: [{ drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Patt_Othr · HATCH AR-SAND (1 halka) + katman A_Elev_1 kapalı dikdörtgen' }],
    confidence: 'Yüksek',
    lines: [
      { label: 'Çakıllı alan (tarama, parapet içi)', value: r2(M2(area(neHatch.loops![0]))), unit: 'm²', note: `${fmt(M(neB.maxX - neB.minX))} × ${fmt(M(neB.maxY - neB.minY))} m`, calc: decomposeRegion(neHatch.loops!) },
      { label: 'Dış dikdörtgen (bilgi)', value: r2(M2(area(neOuter.pts!))), unit: 'm²', note: `${fmt(M(neOB.maxX - neOB.minX))} × ${fmt(M(neOB.maxY - neOB.minY))} m`, calc: decomposeRegion([neOuter.pts!]) },
    ],
  });
  const rectA = (b: ReturnType<typeof bbox>) => (b.maxX - b.minX) * (b.maxY - b.minY);
  const nwName = under(nwI)?.label ?? 'kuzeybatı';
  items.push({
    poz: 'B.5', group: 'B', name: `Alçak çatı/teras +3,70 – ${nwName} üstü (kaplama belirsiz)`, unit: 'm²', value: r2(M2(rectA(nwI))),
    method:
      'Kuzey cephede, batı salonunun kuzeyindeki dikdörtgen alan "+3.70 SSL / +25.40" kotlu. Çakıl taraması yok. Planda eğim okları ve bir Wavin süzgeci var, dolayısıyla açık bir çatı yüzeyi. Alan, parapet iç yüzünü gösteren dikdörtgenden (A_Elev_1, köşe noktaları) alındı; dış yüz bilgi satırında. Asma kat planında (01-02-200) bu alan çarpı işaretli ve batı kenarında iki kapı var; MF-01 sınırının dışında. Gezilebilir açık teras gibi görünüyor, ancak kaplama türü belirtilmemiş.',
    sources: [
      { drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_1 · açık LWPOLYLINE çifti (dış/iç yüz) + blok kotlar "+3.70 SSL"' },
      { drawing: MF, where: 'asma kat ötelemesi x+465,28 m · çarpı işaretli dikdörtgen + 2 kapı (*U166, *U167)' },
    ],
    confidence: 'Düşük',
    lines: [
      { label: 'Parapet içi alan', value: r2(M2(rectA(nwI))), unit: 'm²', note: `${fmt(M(nwI.maxX - nwI.minX))} × ${fmt(M(nwI.maxY - nwI.minY))} m`, calc: decomposeRegion([rc(nwI)]) },
      { label: 'Dış yüz alanı (bilgi)', value: r2(M2(rectA(nwO))), unit: 'm²', note: `${fmt(M(nwO.maxX - nwO.minX))} × ${fmt(M(nwO.maxY - nwO.minY))} m`, calc: decomposeRegion([rc(nwO)]) },
    ],
    notes: ['Kaplama (çakıl / yürünebilir döşeme) ve erişim mimarla teyit edilmeli.'],
  });

  // ---------------------------------------------------------------- B.6 / B.7 saçak
  const e1 = site.filter((f) => f.layer === 'A_Elev_1' && !f.closed && f.pts && f.t !== 'TEXT');
  const near = (a: P, x: number, y: number) => Math.hypot(a.x - x * 1000, a.y - y * 1000) < 30;
  const seg = (x0: number, y0: number, x1: number, y1: number): P[] => {
    const f = must(
      e1.find((g) => (near(g.pts![0], x0, y0) && near(g.pts![g.pts!.length - 1], x1, y1)) || (near(g.pts![0], x1, y1) && near(g.pts![g.pts!.length - 1], x0, y0))),
      `çizgi ${x0},${y0} → ${x1},${y1}`,
    );
    return near(f.pts![0], x0, y0) ? f.pts! : [...f.pts!].reverse();
  };
  const canopyEdge = [
    { label: 'Kuzeybatı bağlantı', pts: seg(628.47, 5997.52, 617.47, 5996.02) },
    { label: 'Batı kenar', pts: seg(617.47, 5996.02, 606.04, 5974.22) },
    { label: 'Güney eğrisel kenar (yay)', pts: seg(606.04, 5974.22, 743.51, 5956.1) },
    { label: 'Doğu kenar', pts: seg(743.51, 5956.1, 733.66, 5984.88) },
    { label: 'Kuzeydoğu bağlantı', pts: seg(733.66, 5984.88, 722.97, 5984.88) },
  ];
  const parapetOut = [
    seg(722.97, 5983.21, 722.97, 5981.38), seg(722.97, 5981.38, 722.97, 5981.58), seg(722.97, 5981.58, 731.3, 5981.58), seg(731.3, 5981.58, 739.51, 5957.58),
    seg(739.51, 5957.58, 610.05, 5974.76), seg(610.05, 5974.76, 614.27, 5982.82), seg(614.27, 5982.82, 619.77, 5993.3), seg(619.77, 5993.3, 628.23, 5994.43), seg(628.23, 5994.43, 628.23, 5997.48),
  ];
  const canopyPoly = [...canopyEdge.flatMap((s) => s.pts), ...parapetOut.flat()];
  const canopyA = exA(canopyPoly);
  const edgeCalc = canopyEdge.map((s) => decomposeLength(s.pts, false));
  const canopyL = sum(edgeCalc.map(csum)) * 1000;
  const arcDup = site.filter((f) => f.t === 'ARC' && f.pts && Math.abs(length(f.pts) - length(canopyEdge[2].pts)) < 20 && near(f.pts[0], 606.04, 5974.22));
  items.push({
    poz: 'B.6', group: 'B', name: 'Saçak (kanopi) – izdüşüm alanı', unit: 'm²', value: r2(M2(canopyA)),
    method:
      'Saçak, güney, batı ve doğu yönünde parapetin dışına 2,6–4 m taşan çatı kenarıdır. Zemin kat planında aynı yay "üstte kalan" gizli çizgi olarak çizilmiş (4199_AMG_Glass new2 / A_Trce_Hidn). Alan, saçak serbest kenarı (SITEPLAN_L / A_Elev_1: yay + 4 doğru) ile parapet dış yüzü (yay + kırıklar) arasındaki kapalı çokgenden hesaplandı; yaylar 1°lik noktalarla örneklendi. Aynı yay A_Elev_3 katmanında ikinci kez çizilmiş; bir kez alındı. Saçak kotu ve kalınlığı planda yok.',
    sources: [{ drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_1 · ARC (saçak yayı, L=143,31) + LINE kenarlar; parapet dış yüzü ARC (L=134,58) + LINE kırıklar' }],
    confidence: 'Orta',
    lines: [
      { label: 'Saçak çokgeni (serbest kenar ↔ parapet dış yüzü)', value: r2(M2(canopyA)), unit: 'm²', calc: mergeRows(decomposeRegion([canopyPoly])) },
      { label: 'Serbest kenar uzunluğu (bilgi, bkz. B.7)', value: r2(M(canopyL)), unit: 'm', calc: edgeCalc.flat() },
    ],
    notes: [`Saçak yayı ${arcDup.length} kez çizilmiş (A_Elev_1 + A_Elev_3); tek sayıldı.`],
  });
  items.push({
    poz: 'B.7', group: 'B', name: 'Saçak serbest kenar uzunluğu', unit: 'm', value: r2(M(canopyL)),
    method: 'Saçağın binadan bağımsız (serbest) kenarı: güney eğrisel yay ile batı ve doğu dönüşleri, ve parapete bağlanan iki kısa parça. Uzunluklar SITEPLAN_L / A_Elev_1 çizgilerinden ölçüldü; yay örneklenmiş noktalarla ölçüldü. Yinelenen A_Elev_3 yayı hariç tutuldu.',
    sources: [{ drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_1 · 1 ARC + 4 LINE' }],
    confidence: 'Orta',
    lines: canopyEdge.map((s, k): Line => ({ label: s.label, value: r2(csum(edgeCalc[k])), unit: 'm', note: `${xy(s.pts[0])} → ${xy(s.pts[s.pts.length - 1])}`, calc: edgeCalc[k] })),
  });

  // ---------------------------------------------------------------- B.8 teras parapetleri
  const green = must(drain.find((f) => f.layer === 'A_Anno_Axis' && f.pts && f.pts.length < 100 && !f.closed), 'K/D/B parapet dış yüz çizgisi (A_Anno_Axis açık çizgi)');
  const g = green.pts!;
  const ch = (x: number, y: number) => chainageAt(g, pt(x, y));
  const gTot = length(g);
  const eastL = ch(715.27, 6016.78) - ch(722.97, 5981.58);
  const neBoxL = ch(715.27, 6025.68) - ch(715.27, 6016.78);
  const northL = ch(659.77, 6025.68) - ch(715.27, 6025.68);
  const nwBoxL = ch(639.47, 6022.13) - ch(659.77, 6025.68);
  const westL = gTot - ch(639.47, 6022.13);
  const southChain = [seg(722.97, 5981.58, 731.3, 5981.58), seg(731.3, 5981.58, 739.51, 5957.58), seg(739.51, 5957.58, 610.05, 5974.76), seg(610.05, 5974.76, 614.27, 5982.82), seg(614.27, 5982.82, 619.77, 5993.3), seg(619.77, 5993.3, 628.23, 5994.43), seg(628.23, 5994.43, 628.23, 5997.48)];
  const southL = sum(southChain.map((p) => length(p)));
  const neInt = 2 * (neOB.maxX - neOB.minX + (neOB.maxY - neOB.minY)) - neBoxL;
  const nwInt = 2 * (nwO.maxX - nwO.minX + (nwO.maxY - nwO.minY)) - nwBoxL;
  const voidCalc = voids.flatMap((v) => mergeRows(decomposeLength(v.loop, true)));
  const southCalc = southChain.flatMap((p) => decomposeLength(p, false));
  const part = (c0: number, c1: number) => mergeRows(decomposeLength(subLine(g, c0, c1), false));
  const westCalc = part(ch(639.47, 6022.13), gTot);
  const northCalc = part(ch(715.27, 6025.68), ch(659.77, 6025.68));
  const eastCalc = part(ch(722.97, 5981.58), ch(715.27, 6016.78));
  const neBoxCalc = part(ch(715.27, 6016.78), ch(715.27, 6025.68));
  const nwBoxCalc = part(ch(659.77, 6025.68), ch(639.47, 6022.13));
  const box = (b: ReturnType<typeof bbox>, name: string): CalcRow[] => {
    const w = Math.round(b.maxX - b.minX) / 1000;
    const h = Math.round(b.maxY - b.minY) / 1000;
    return [
      { kind: 'doğru', unit: 'm', label: name, name: `${name} kutusu yatay kenar`, adet: 2, boy: w, sign: 1, value: 2 * w },
      { kind: 'doğru', unit: 'm', label: name, name: `${name} kutusu düşey kenar`, adet: 2, boy: h, sign: 1, value: 2 * h },
    ];
  };
  const named = (rows: CalcRow[], name: string) => rows.map((r) => ({ ...r, name }));
  const intCalc = [...box(neOB, neName), ...neg(named(neBoxCalc, `${neName} üstü dış kenar (yukarıdaki satırda)`)), ...box(nwO, nwName), ...neg(named(nwBoxCalc, `${nwName} üstü dış kenar (yukarıdaki satırda)`))];
  const parLines: Line[] = [
    { label: 'Güney eğrisel parapet (dış yüz)', value: r2(csum(southCalc)), unit: 'm', note: 'SITEPLAN_L / A_Elev_1 yay + kırıklar; iç yüz ≈202,20 m', calc: southCalc },
    { label: 'Batı (yıldız) cephe parapeti (dış yüz)', value: r2(csum(westCalc)), unit: 'm', note: 'cephe dış yüz çizgisinden', calc: westCalc },
    { label: 'Kuzey cephe parapeti, MF-01 üstü (dış yüz)', value: r2(csum(northCalc)), unit: 'm', calc: northCalc },
    { label: 'Doğu kademeli cephe parapeti (dış yüz)', value: r2(csum(eastCalc)), unit: 'm', note: 'parapet bandı 0,40 m; bant çevresi 99,18 m iki yüzü birden içerir', calc: eastCalc },
    { label: '+3,70 alçak çatıların dış kenarları', value: r2(csum(neBoxCalc) + csum(nwBoxCalc)), unit: 'm', note: `${neName} üstü ${fmt(csum(neBoxCalc))} + ${nwName} üstü ${fmt(csum(nwBoxCalc))}`, calc: [...named(neBoxCalc, `${neName} üstü`), ...named(nwBoxCalc, `${nwName} üstü`)] },
    { label: '+7,10 → +3,70 iç kademe duvarları', value: r2(csum(intCalc)), unit: 'm', note: `kutu çevresi − dış kenarı; terasın ${neName} ve ${nwName} üstündeki alçak çatılara bakan kenarı`, calc: intCalc },
    { label: 'Boşluk çevre duvarları (2 daire + avlu, dış yüz)', value: r2(csum(voidCalc)), unit: 'm', note: voids.map((v) => v.label).join(' + '), calc: voidCalc },
  ];
  items.push({
    poz: 'B.8', group: 'B', name: 'Teras çatı parapetleri – uzunluk (dış yüz)', unit: 'm', value: r2(sum(parLines.map((l) => l.value ?? 0))),
    method:
      `Parapet dış yüz uzunluğu iki çizgiden ölçüldü. Kuzey, doğu ve batı için çatı planındaki dış yüz çizgisi (Catı_su_tahliye / A_Anno_Axis açık çizgi, ${fmt(M(gTot))} m) kullanıldı ve köşe noktalarından bölümlere ayrıldı. Güney için SITEPLAN_L / A_Elev_1'deki parapet dış yüzü (yay + kırıklar) kullanıldı. Doğu parapet bandının çevresi (99,18 m) ve kuzey bant çizgisinin uzunluğu (188,40 m) parapetin iki yüzünü birden içerdiği için kullanılmadı; yerlerine yalnız dış yüz alındı. Karar: dairesel boşlukların ve avlunun 0,30 m'lik çevre duvarları parapet sayıldı. Bu boşluklar çakıllı çatıda gökyüzüne açıktır ve çizimde diğer parapetlerle aynı çift çizgiyle gösterilmiştir; korkuluk ve su yalıtımı yukarı dönüşü gerektirir. Terasın +3,70 alçak çatılara bakan iç kademe duvarları da parapet olarak eklendi. Hepsi ayrı satırlarda; gerekirse çıkarılabilir. Parapet üst kotu planda yok.`,
    sources: [
      { drawing: ROOF, where: 'blok Catı_su_tahliye · katman A_Anno_Axis · açık LWPOLYLINE (35 köşe, K/D/B dış yüz)' },
      { drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_1 · güney parapet dış yüzü ARC + LINE; kapalı daire/avlu halkaları (AR-SAND taraması adaları)' },
    ],
    confidence: 'Orta',
    lines: parLines,
    notes: ['Boşluk çevre duvarlarının parapet sayılması bir karardır; parapet detayı (yükseklik, harpuşta) kesitlerle teyit edilmeli.'],
  });

  // ---------------------------------------------------------------- B.9 salon parapetleri
  items.push({
    poz: 'B.9', group: 'B', name: 'Salon çatı parapetleri – uzunluk (dış yüz)', unit: 'm', value: r2(sum(halls.map((h) => csum(decomposeLength(h.outer, true))))),
    method: 'Her salonun çatısını çevreleyen 0,30 m parapetin dış yüz çevresi, SITEPLAN_L / A_Elev_1 dış dikdörtgenlerinden ölçüldü. Salonlar arasında 0,80 m derz olduğundan her salonun kendi parapeti ayrı sayıldı. İç yüz çevresi notta.',
    sources: [{ drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_1 · salon başına dış parapet dikdörtgeni' }],
    confidence: 'Yüksek',
    lines: halls.map((h): Line => ({ label: h.name, value: r2(csum(decomposeLength(h.outer, true))), unit: 'm', note: `iç yüz ${fmt(M(length(h.inner, true)))} m`, calc: mergeRows(decomposeLength(h.outer, true)) })),
  });

  // ---------------------------------------------------------------- B.10 gizli dere
  const dereNote = ukNotes.find((t) => /DERE/.test(t));
  items.push({
    poz: 'B.10', group: 'B', name: 'Yağmur suyu toplama kanalı / gizli dere (salon çatıları, ~30 cm)', unit: 'm', value: r2(M(sum(gutterLines.map((x) => x.L)))),
    method: `Her salon çatısında köşegen boyunca uzanan gizli dere, SITEPLAN_L / A_Elev_3 katmanında iki paralel çizgiyle çizilmiş. Uzunluk iki çizginin ortalaması (eksen) olarak alındı; genişlik iki çizgi arasındaki dik mesafedir. Elemanın kimliği, planda dereyi gösteren "${dereNote ?? 'YAĞMUR SUYU TOPLAMA KANALI/ GİZLİ DERE'}" notuyla (MULTILEADER) doğrulandı. Örtü taraması dere şeridini dışarıda bırakıyor; şerit alanı ≈ eksen × genişlik.`,
    sources: [{ drawing: ROOF, where: 'blok SITEPLAN_L · katman A_Elev_3 · 6 LWPOLYLINE (salon başına 2 paralel köşegen) + katman A_Anno_Text_1 MULTILEADER' }],
    confidence: 'Yüksek',
    lines: gutterLines.map((x): Line => ({ label: x.h.name, value: r2(M(x.L)), unit: 'm', calc: x.calc, note: `genişlik ≈${fmt(M(x.w))} m · şerit ≈${fmt(M(x.L) * M(x.w))} m²` })),
  });

  // ---------------------------------------------------------------- B.11 / B.12 süzgeçler
  const outlets = drain.filter((f) => f.t === 'INSERT' && f.path.length === 1 && (f.name ?? '').startsWith('PF_QS-M-75'));
  const onTerrace = outlets.filter((o) => inTerrace(o.at!));
  const lowRoof = outlets.filter((o) => !inTerrace(o.at!));
  const inBox = (p: P, b: ReturnType<typeof bbox>) => p.x >= b.minX - 50 && p.x <= b.maxX + 50 && p.y >= b.minY - 50 && p.y <= b.maxY + 50;
  items.push({
    poz: 'B.11', group: 'B', name: 'Çatı süzgeci (Wavin QS-M-75 bitümlü)', unit: 'adet', value: outlets.length,
    method: 'Çatı drenaj bloğundaki (Catı_su_tahliye, katman A_X_Mech) "PF_QS-M-75 Roofoutlet_Wavin – QS-M-75-260 for bitumen roofing" blok eklemeleri sayıldı. Her birinin yanında "d" yazısı var ve içinde bir Ø110 iniş borusu bloğu bulunuyor. Konumları çakıllı teras halkasına ve alçak çatı dikdörtgenlerine göre sınıflandı.',
    sources: [{ drawing: ROOF, where: 'blok Catı_su_tahliye · katman A_X_Mech · INSERT PF_QS-M-75 Roofoutlet_Wavin …' }],
    confidence: 'Yüksek',
    lines: [
      { label: '+7,10 çakıllı teras', value: onTerrace.length, unit: 'adet' },
      { label: '+3,70 alçak çatılar', value: lowRoof.length, unit: 'adet', note: lowRoof.map((o) => `${inBox(o.at!, neOB) ? neName : inBox(o.at!, nwO) ? nwName : '?'} üstü ${xy(o.at!)}`).join(', ') },
    ],
  });
  const hallDrains = drain.filter((f) => f.t === 'INSERT' && f.path.length === 1 && f.name === 'A$C74180FAC');
  items.push({
    poz: 'B.12', group: 'B', name: 'Gizli dere süzgeci', unit: 'adet', value: hallDrains.length,
    method: 'Salon çatılarındaki gizli dere boyunca dizilmiş süzgeç blokları (Catı_su_tahliye içinde A$C74180FAC eklemeleri, katman C_Site_Patt_SoftScpe) sayıldı. Hepsi salon bloğu içinde ve dere köşegenlerinin üzerinde; salonlara göre dağılımı aşağıda.',
    sources: [{ drawing: ROOF, where: 'blok Catı_su_tahliye · katman C_Site_Patt_SoftScpe · INSERT A$C74180FAC' }],
    confidence: 'Orta',
    lines: halls.map((h): Line => ({ label: h.name, value: hallDrains.filter((d) => hallOf(d.at!) === h).length, unit: 'adet' })),
    notes: ['Blok adı anonim (A$C74180FAC); süzgeç tipi planda yazılı değil (sifonik olabilir), tesisat projesiyle teyit edilmeli.'],
  });

  // ---------------------------------------------------------------- B.13 iniş boruları
  const pipesNested = flat.filter((f) => f.t === 'INSERT' && f.name === 'yagmur inis 110' && f.path.length === 2 && top(f) === 'Catı_su_tahliye');
  const pipesLoose = drain.filter((f) => f.t === 'INSERT' && f.path.length === 1 && f.name === 'yagmur inis 110');
  const groups = cluster([...pipesNested, ...pipesLoose].map((f) => f.at!), 1000);
  const looseOnly = groups.filter((gr) => !gr.some((p) => pipesNested.some((n) => n.at === p)));
  const looseMergedToOutlet = pipesLoose.filter((l) => groups.some((gr) => gr.includes(l.at!) && gr.some((p) => pipesNested.some((n) => n.at === p)))).length;
  const stackExtras = sum(looseOnly.map((gr) => gr.length - 1));
  items.push({
    poz: 'B.13', group: 'B', name: 'Yağmur iniş borusu Ø110', unit: 'adet', value: groups.length,
    method: `Ø110 iniş borusu blokları ("yagmur inis 110") iki yerde var. ${pipesNested.length} tanesi Wavin süzgeç bloklarının içinde (her süzgeçte bir). ${pipesLoose.length} tanesi Catı_su_tahliye bloğuna doğrudan eklenmiş (katman C_Site_Patt_SoftScpe). Tüm konumlar 1,0 m yarıçapla kümelendi ve her küme bir boru sayıldı. Böylece ${looseMergedToOutlet} serbest blok, aynı noktadaki süzgecin borusuyla birleşti (2'si tam üst üste, 1'i 0,43 m yakın). Üst üste yığılmış ${stackExtras} kopya da elendi: (722,86; 5981,8–5982,5) ve (623,17; 5987,8–5988,5) noktalarında üçer blok. Uzak "kare_kesitli_gider" blokları ((412–465; 0) civarı, 4 adet) çizim dışı artık olarak hariç tutuldu.`,
    sources: [{ drawing: ROOF, where: 'blok Catı_su_tahliye · INSERT "yagmur inis 110" (süzgeç bloğu içinde ve katman C_Site_Patt_SoftScpe)' }],
    confidence: 'Orta',
    lines: [
      { label: 'Süzgeç bloklarındaki borular', value: pipesNested.length, unit: 'adet' },
      { label: 'Ek serbest borular (tekilleştirilmiş)', value: looseOnly.length, unit: 'adet', note: looseOnly.map((gr) => xy(gr[0]) + (gr.length > 1 ? ` ×${gr.length}→1` : '')).join(', ') },
      { label: 'Elenen kopyalar (bilgi)', value: pipesLoose.length - looseOnly.length, unit: 'adet', note: `${looseMergedToOutlet} süzgeç borusuyla çakışan + ${stackExtras} yığın kopyası` },
    ],
  });

  // ---------------------------------------------------------------- bulgular
  const slopes = multileaderTexts(dxf, 'Catı_su_tahliye').filter((t) => /EĞİM/i.test(t));
  const slopeVals = [...new Set(slopes.map((t) => t.replace(/\s+/g, ' ')))];
  const ps = must(sandSingles.find((h) => h !== neHatch), 'enerji merkezi taraması');
  const psB = bbox(ps.loops![0]);
  const psOuter = site.find((f) => f.closed && f.pts && M2(area(f.pts)) > 290 && M2(area(f.pts)) < 320);
  const psLabel = flat.find((f) => f.t === 'TEXT' && /POWER STATION/i.test(f.text ?? '') && f.at && inBox(f.at, psB));

  // asma kat (01-02-200): MF mahal alanları, kat toplamı notu, trafo bloğu yazıları
  const mfDxf = readDxf(MF_FILE);
  const mfFlat = flatten(mfDxf);
  const mfPolys = mfFlat.filter((f) => top(f) === '4199_AMH-Alanlar2' && f.layer === 'A_Nplt_Area' && f.closed && f.pts && M2(area(f.pts)) > 1);
  const mfSum = sum(mfPolys.map((f) => M2(area(f.pts!))));
  const mfNote = mfFlat.find((f) => f.t === 'TEXT' && /Üst Kat Toplam/i.test(f.text ?? ''));
  const trafoTexts = [...new Set(mfFlat.filter((f) => f.t === 'TEXT' && f.at && inBox(f.at, { minX: psB.minX - 5000, minY: psB.minY - 25000, maxX: psB.maxX + 40000, maxY: psB.maxY + 5000 }) && /TRAFO|SU DEPOSU|ENERJİ/i.test(f.text ?? '')).map((f) => f.text!))];

  findings.push({
    topic: 'Çatı – kapsam',
    drawings: `${ROOF}, ${MF}`,
    finding: `Binanın kuzeybatısındaki ayrı yapı "POWER STATION" olarak etiketli${psLabel ? '' : ' (etiket bulunamadı)'}. Dış alanı ${fmt(M2(area(psOuter?.pts ?? ps.loops![0])))} m², çatısında ${fmt(M2(area(ps.loops![0])))} m² çakıl taraması var. Asma kat paftasında aynı yerde trafo ve su deposu yerleşimi bulunuyor (${trafoTexts.slice(0, 4).join('; ') || 'trafo yazısı'}). "MEVCUT" diye işaretli değil; komşu duvar ve otoparkta bu işaret var. Bu yapının çatısı yukarıdaki kalemlere dahil edilmedi.`,
    suggestion: 'Enerji merkezi + su deposu yapısının metraj kapsamında olup olmadığını (yeni yapı mı, mevcut mu, ayrı sözleşme mi) işverenle netleştirin; kapsamdaysa ayrı kalem açın.',
  });
  findings.push({
    topic: 'Çatı – kotlar',
    drawings: ROOF,
    finding: 'Çatı planında yalnız döşeme (SSL) kotları var: teras +7.10 (+28.80), alçak çatılar +3.70 (+25.40), boşluk içleri ±0.00 (+21.70). Salon çatılarının (uzay kafes üstü) kotu, parapet üst kotları ("Top of Parapet") ve saçak kotu verilmemiş. Plandaki tek ölçü/ölçek bilgisi bunlar. 3B model için salon kotları görünüş 01-04-100 ve kesit 01-03-100\'den alındı: parapet üstü küçük salonlarda +12,08 → +16,08, büyük salonda +11,87 → +17,87; çatı yüzeyi dere köşegeninde +11,45 / +10,81.',
    suggestion: 'Salon çatı kotu, parapet üst kotları ve saçak kalınlığı için kesit paftalarına (01-04-xxx) bakın veya mimardan isteyin; parapet yüksekliği ve harpuşta metrajı bunlara bağlı.',
  });
  findings.push({
    topic: 'Asma kat alanı',
    drawings: MF,
    finding: `Asma kat paftasındaki not "${mfNote?.text ?? 'Üst Kat Toplam: 580 m²'}" diyor, ancak mahal sınırları MF-01 TEKNİK ALAN 766,18 m² ve MF-02 ELEKTRİK ODASI 7,62 m², toplam ${fmt(mfSum)} m². Ayrıca MF-01 içinde 7 bağımsız kolon var (2,88 m²) ve alandan düşülmemiş. Asma kat, paftada zemin kata göre x +465,28 m ötelenmiş; paftanın sol yarısında zemin kat içeriği (GF mahalleri, duvarlar) tekrar ediyor.`,
    suggestion: 'Kat toplamı notunu güncelleyin (≈773,80 m²) ya da 580 m²nin neyi kapsadığını açıklayın; asma kat paftasındaki zemin kat kopyası metrajda sayılmamalı.',
  });
  findings.push({
    topic: 'Çatı – kuzeybatı +3,70 alanı',
    drawings: `${ROOF}, ${MF}`,
    finding: `Kuzeybatıdaki ${fmt(M2(rectA(nwI)))} m² (dış ${fmt(M2(rectA(nwO)))} m²) alan çatı planında +3.70 SSL kotlu, eğimli ve süzgeçli, ancak çakıl taraması yok. Asma kat planında çarpı işaretli, iki kapılı ve MF-01 sınırının dışında. Açık teras mı, alçak çatı mı, yoksa döşeme boşluğu mu belirsiz.`,
    suggestion: 'Alanın işlevini ve kaplamasını (çakıl / yürünebilir teras döşemesi / boşluk) mimarla teyit edin; B.5 buna göre güncellenmeli.',
  });
  findings.push({
    topic: 'Çizim tekrarları',
    drawings: `${ROOF}, ${MF}, 4199-A-DD-01-02-100`,
    finding: `Çatı planında üst üste çizilmiş elemanlar var:
- saçak yayı iki kez (A_Elev_1 + A_Elev_3, 143,31 m);
- doğu kenar çizgisi (731,30; 5981,58)→(739,51; 5957,58) iki kez;
- drenaj bölmesi kapalı çizgisi (156,91 m²) iki kez;
- Ø110 iniş borusu bloğu iki noktada üçer kopya.
Ayrıca 4 adet "kare_kesitli_gider" çizim dışında, (412–465; 0) civarında duruyor. Zemin kat ve asma kat paftalarında UZAY KAFES bloğu iki kez yerleştirilmiş (6.071,60 m² = 2 × 3.035,80); ağaç, çevre ve peyzaj blokları asma kat paftasında iki kopya. Model uzayında lejant ve antet artıkları da var (x −514…−100), katman toplamlarını şişiriyor.`,
    suggestion: 'Tekrarları silin; metrajda bina penceresi (x 600–745 m, y 5945–6035 m) ve adı belli bloklar dışındaki varlıkları kullanmayın.',
  });
  findings.push({
    topic: 'Çatı – eğim',
    drawings: ROOF,
    finding: `Çatı drenaj bloğunda ${slopes.length} eğim notu var (MULTILEADER): ${slopeVals.join(', ') || '—'}. Bunlara eşlik eden ${drain.filter((f) => f.layer === 'CATI_SLOPE').length} eğim oku (CATI_SLOPE) bulunuyor. Teras ve alçak çatılar %1 eğimli; şap/eğim betonu kalınlığı bu eğim ve süzgeç aralıklarına göre hesaplanmalı. Salon çatıları ise düz değil (görünüş 01-04-100, kesit 01-03-100): dere köşegenindeki iki köşe en alçak, öbür iki köşe tepe; yüzey dereye eğrisel iner, tepe yakınında eğim ≈%${Math.round(Math.max(...hallGeo.map((g) => g.slope)) * 100)}. Eğik yüzey alanı izdüşümden fazla: ${hallGeo.map((g) => `${g.h.name} ${fmt(r2(g.surf))} m² (izdüşüm ${fmt(r2(M2(area(g.h.inner))))} m²)`).join(', ')}; B.2 bu eğik yüzey alanını kullanır.`,
    suggestion: 'Eğim betonu ortalama kalınlığını bu %1 eğim ve drenaj bölmeleriyle (A_Trce_Hidn mahya/dere çizgileri) hesaplayın; düz çatı için %1 alt sınırdır, yalıtım üreticisinin onayı alınmalı.',
  });

  // ---------------------------------------------------------------- 3B
  // Kotlar (kesit 01-03-100): teras +7,10 (parapet üstü +7,60), alçak çatılar +3,70, saçak +6,00 → +7,60; salonlar hallGeo'da.
  model3d.add({ layer: 'çatı', kind: 'flat', items: ['B.3'], lines: { 'B.3': 'Dış halka (parapet iç yüzü)' }, label: 'Çakıllı teras çatı +7,10', loops: [outer, ...holes], z0: 7.1, z1: 7.1 });
  model3d.add({ layer: 'çatı', kind: 'flat', items: ['B.4'], lines: { 'B.4': 'Çakıllı alan (tarama, parapet içi)' }, label: `Alçak çatı +3,70 – ${neName} üstü`, loops: neHatch.loops!, z0: 3.7, z1: 3.7 });
  model3d.add({ layer: 'çatı', kind: 'flat', items: ['B.5'], lines: { 'B.5': 'Parapet içi alan' }, label: `Alçak çatı/teras +3,70 – ${nwName} üstü`, loops: [rc(nwI)], z0: 3.7, z1: 3.7 });
  model3d.add({ layer: 'çatı', kind: 'flat', items: ['B.6'], lines: { 'B.6': 'Saçak çokgeni (serbest kenar ↔ parapet dış yüzü)' }, label: 'Saçak (kanopi) üstü +7,60', loops: [canopyPoly], z0: 7.6, z1: 7.6 });
  for (const e of canopyEdge) model3d.add({ layer: 'cephe', kind: 'ribbon', items: ['B.7'], lines: { 'B.7': e.label }, label: `Saçak serbest kenarı – ${e.label} (+6,00 → +7,60)`, path: e.pts, z0: 6.0, z1: 7.6 });
  for (const { h, S, roof, shell, parapet } of hallGeo) {
    const [r1, t0, t1] = [S.roof + S.rise, S.top, S.top + S.rise];
    model3d.add({ layer: 'çatı', kind: 'mesh', items: ['B.2'], lines: { 'B.2': b2Line(h) }, label: `${h.name} çatısı (parapet içi) ${kz(S.roof)} dere → ${kz(r1)} tepe`, faces: roof, z0: S.roof, z1: r1 });
    model3d.add({ layer: 'cephe', kind: 'mesh', items: ['B.9'], lines: { 'B.9': h.name }, label: `${h.name} parapeti (dış yüz, üstü ${kz(t0)} → ${kz(t1)})`, faces: parapet, z0: S.roof, z1: t1 });
    model3d.add({ layer: 'cephe', kind: 'mesh', items: ['C.2', 'C.3'], label: `${h.name} kabuğu (+7,10 → çatı)`, faces: shell, z0: 7.1, z1: r1 });
  }
  let uh = 0;
  let us = 0;
  for (const f of uk) {
    const ub = bbox(f.pts!);
    const ul = ukName(f.pts!);
    model3d.add({ layer: 'çatı', kind: 'flat', items: ['B.1'], lines: { 'B.1': ul }, label: `Uzay kafes izdüşümü – ${ul}`, loops: [f.pts!], z0: 9.1, z1: 9.1 }); // kesitte alt başlığın en düşük yeri ≈ +9,10; eğrisel çatının altında kalır
  }
  const parPaths: [string, P[], boolean, string][] = [
    ...southChain.map((p): [string, P[], boolean, string] => ['Güney eğrisel parapet', p, false, 'Güney eğrisel parapet (dış yüz)']),
    ['Batı (yıldız) cephe parapeti', subLine(g, ch(639.47, 6022.13), gTot), false, 'Batı (yıldız) cephe parapeti (dış yüz)'],
    ['Kuzey cephe parapeti', subLine(g, ch(715.27, 6025.68), ch(659.77, 6025.68)), false, 'Kuzey cephe parapeti, MF-01 üstü (dış yüz)'],
    ['Doğu kademeli cephe parapeti', subLine(g, ch(722.97, 5981.58), ch(715.27, 6016.78)), false, 'Doğu kademeli cephe parapeti (dış yüz)'],
    ...voids.map((v): [string, P[], boolean, string] => [v.label, v.loop, true, 'Boşluk çevre duvarları (2 daire + avlu, dış yüz)']),
  ];
  for (const [label, p, closed, line] of parPaths) model3d.add({ layer: 'cephe', kind: 'ribbon', items: ['B.8'], lines: { 'B.8': line }, label, path: p, closed, z0: 7.1, z1: 7.6 });
  for (const x of gutterLines) for (const l of [x.a, x.b]) model3d.add({ layer: 'çatı', kind: 'ribbon', items: ['B.10'], lines: { 'B.10': x.h.name }, label: `Gizli dere – ${x.h.name}`, path: l, z0: roofZ(x.h), z1: roofZ(x.h) + 0.15 });
  for (const o of outlets) model3d.add({ layer: 'donatı', kind: 'pin', items: ['B.11'], lines: { 'B.11': inTerrace(o.at!) ? '+7,10 çakıllı teras' : '+3,70 alçak çatılar' }, label: 'Çatı süzgeci (Wavin QS-M-75)', path: [o.at!], z0: inTerrace(o.at!) ? 7.1 : 3.7, z1: (inTerrace(o.at!) ? 7.1 : 3.7) + 0.4 });
  for (const d of hallDrains) {
    const h = hallOf(d.at!);
    if (h) model3d.add({ layer: 'donatı', kind: 'pin', items: ['B.12'], lines: { 'B.12': h.name }, label: `Gizli dere süzgeci – ${h.name}`, path: [d.at!], z0: roofZ(h), z1: roofZ(h) + 0.4 });
  }
  // Boru tepesi bulunduğu çatının kotunda (salon / +3,70 alçak çatı / +7,10 teras). Duvar, kolon ya da
  // parapete 1 m'den uzak boru (fuaye ortası gibi) zemine inemez: düşey hattı planda yok, yalnız süzgeç
  // altındaki tavan boşluğu parçası çizilir.
  const hosts: P[][] = model3d.find((e) => (e.layer === 'duvar' || e.layer === 'kolon') && !!e.loops).map((e) => e.loops![0]);
  // teras dış sınırı kullanılmaz: alçak çatıya geçiş çizgisi mutfak gibi mahallerin ortasından geçiyor
  const parapets = [...parPaths.map(([, p]) => p), ...halls.map((h) => h.outer)];
  const segDist = (p: P, l: P[], closed: boolean) => {
    let best = Infinity;
    for (let i = 0; i < (closed ? l.length : l.length - 1); i++) {
      const a = l[i];
      const b = l[(i + 1) % l.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    return best;
  };
  const nearHost = (p: P) => hosts.some((l) => pointInPolygon(p, l) || segDist(p, l, true) < 1000) || parapets.some((l) => segDist(p, l, false) < 1000);
  for (const gr of groups) {
    const p = gr[0];
    const h = hallOf(p);
    const zTop = h ? roofZ(h) : !inTerrace(p) && (inBox(p, neOB) || inBox(p, nwO)) ? 3.7 : 7.1;
    const free = !nearHost(p);
    const where = h ? ` – ${h.name} (dere ucu)` : zTop === 3.7 ? ' – +3,70 alçak çatı' : '';
    model3d.add({ layer: 'donatı', kind: 'pin', items: ['B.13'], label: `Yağmur iniş borusu Ø110${where}${free ? ' – süzgeç altı; düşey hat planda yok (duvar/kolondan uzak)' : ''}`, path: [p], z0: free ? zTop - 0.6 : 0, z1: zTop });
  }
  return { items, findings };
}
