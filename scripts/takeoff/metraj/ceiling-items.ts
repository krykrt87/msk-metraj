// Tavan planlarından (01-05-100 alt kat / 01-05-200 üst kat) çıkan D grubu kalemleri.
// İki paftanın model alanı birebir aynıdır; her ikisi de iki tavan bloğunu içerir:
//   lower_level_ceiling_finish  → zemin kat alçak tavanları (x≈600–745 m)
//   upper_level_ceiling_finish  → yüksek hacimler (salonlar, küçük salonlar, fuaye), saçak altı ve asma kat;
//                                 asma kat çerçevesinde, +465,3 m doğuya kaydırılmış çizilmiş.
// Mahal adları zemin kat planındaki (01-02-100) mahal etiketlerinden alınır.
import { readDxf, type RawDxf, type RawEnt } from '../lib/dxf';
import { flatten, type Flat } from '../lib/flatten';
import { area, bbox, pointInPolygon, regionArea, type P } from '../lib/geom';
import { decomposeRegion, gridRects, mergeRows, type CalcRow } from '../lib/decompose';
import { extractRooms, type RoomLabel, type RoomPoly } from '../rooms';
import type { Line, Source, TakeoffItem } from './model';
import { model3d } from './model3d';
import { roomsNear, sideOf } from './rooms-index';

const CEIL = '4199-A-DD-01-05-100 / 05-200';
const PLAN = '4199-A-DD-01-02-100';
const LOWER = 'lower_level_ceiling_finish';
const UPPER = 'upper_level_ceiling_finish';
/** Üst tavan bloğunun zemin kata göre x kayması (STRUCTURE_FF_NN ↔ STRUCTURE_GF_NN, CEPHE KAPLAMA_MF ↔ CEPHE KAPLAMA). */
const DX = 465300;
/** Bina pencereleri (mm) — dışındaki her şey (lejant örnekleri, uzak çöp) hariç. */
const WIN = { L: [590e3, 5935e3, 750e3, 6040e3], U: [1060e3, 5935e3, 1220e3, 6040e3] } as const;
const RASTER = 50; // mm, çakışma ölçümü ızgarası

type Lvl = 'L' | 'U';
type Finding = { topic: string; drawings: string; finding: string; suggestion: string };
type RoomCeiling = { lower: string | null; upper: string | null; ch: string | null };

interface CH {
  idx: number; // çizimdeki HATCH sıra no (DFS)
  code: string;
  lvl: Lvl;
  f: Flat;
  loops: P[][]; // kendi çerçevesinde
  g: P[][]; // zemin kat çerçevesinde (üst için −DX)
  area: number; // m² (cetvel toplamı: yaylar tam, ölçüler mm)
  calc: CalcRow[];
  col: string;
  scale: string;
  mf: RoomLabel | null; // asma kat mahalinin tavanı ise
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const tr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const inWin = (p: P, w: readonly number[]) => p.x >= w[0] && p.x <= w[2] && p.y >= w[1] && p.y <= w[3];
const shift = (loops: P[][], dx: number) => loops.map((l) => l.map((p) => ({ x: p.x + dx, y: p.y })));
const inR = (p: P, loops: P[][]) => loops.reduce((acc, l) => (pointInPolygon(p, l) ? !acc : acc), false);
const centre = (loops: P[][]): P => {
  const b = bbox(loops.flat());
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};
const cleanLayer = (l: string) => l.replace(/^\$0\$/, '').replace(/^DRC-LLA-A-DD-CCP-Ceiling Finish Legend\$0\$/, 'DRC:');

/** Bölge içinde kalan bir nokta (orta satır taramasındaki en uzun açıklığın ortası). */
function interiorPoint(loops: P[][]): P {
  const b = bbox(loops.flat());
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = b.minY + (b.maxY - b.minY) * t;
    const xs: number[] = [];
    for (const l of loops)
      for (let i = 0, j = l.length - 1; i < l.length; j = i++) if (l[i].y > y !== l[j].y > y) xs.push(((l[j].x - l[i].x) * (y - l[i].y)) / (l[j].y - l[i].y) + l[i].x);
    xs.sort((a, c) => a - c);
    let best: P | null = null;
    let len = -1;
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > len) ((len = xs[k + 1] - xs[k]), (best = { x: (xs[k] + xs[k + 1]) / 2, y }));
    if (best) return best;
  }
  return centre(loops);
}

/** Ham HATCH öznitelikleri (renk 62, desen ölçeği 41) — flatten ile aynı DFS sırasında. */
function hatchProps(d: RawDxf): { col: string; scale: string }[] {
  const out: { col: string; scale: string }[] = [];
  const g = (e: RawEnt, c: number) => e.pairs.find(([cc]) => cc === c)?.[1]?.trim();
  const walk = (e: RawEnt, depth: number) => {
    if (e.type === 'HATCH') out.push({ col: g(e, 62) ?? 'BL', scale: g(e, 41) ?? '-' });
    if (e.type === 'INSERT') {
      const blk = d.blocks.get(g(e, 2) ?? '');
      const n = Math.max(1, parseInt(g(e, 70) ?? '1', 10)) * Math.max(1, parseInt(g(e, 71) ?? '1', 10));
      for (let i = 0; i < n; i++) if (blk && depth < 12) for (const c of blk.entities) walk(c, depth + 1);
    }
  };
  for (const e of d.entities) if (g(e, 67) !== '1') walk(e, 0);
  return out;
}

/** Lejant eşlemesi (model alanındaki "TAVAN KAPLAMALARI LEJANTI", x≈1306–1309 m, satır satır örnek tarama ↔ kod). */
function codeOf(f: Flat, col: string): string | null {
  const L = cleanLayer(f.layer);
  const p = f.pattern ?? '';
  if (/CA2O_12_elev1$/.test(L) && p === 'AR-RROOF') return 'C-W03';
  if (/A_Patt_Elev$/.test(L) && p === 'AR-SAND') return col === '219' ? 'C-G02' : 'C-G01';
  if (/A_Patt_ClngFnsh$/.test(L) && p === 'DASH') return 'C-G03';
  if (/A_Patt_Elev$/.test(L) && p === 'HEX') return 'C-G04';
  if (/A_Patt_Elev$/.test(L) && p === 'GOST_WOOD') return 'C-W01';
  if (/A_Patt_Othr$/.test(L) && p === 'AR-RROOF') return 'C-W02';
  if (/A_Mat_Tmbr$/.test(L) && p === 'ANSI32') return 'C-B01';
  if (/A_Patt_ClngFnsh$/.test(L) && p === 'CROSS') return 'C-P01';
  if (/A_Patt_ClngFnsh$/.test(L) && p === 'NET') return L.startsWith('DRC:') ? 'C-M01' : 'C-M02';
  if (/A_Mat_Mtal$/.test(L) && p === 'SOLID') return 'C-M03';
  if (/A_Patt_ClngFnsh$/.test(L) && p === 'TRIANG') return 'SOFFIT';
  return null;
}

/** Bölgeleri ızgaraya basar (çift-tek kural, satır taraması). */
function raster(list: P[][][]): Uint8Array {
  const [x0, y0, x1, y1] = WIN.L;
  const W = Math.ceil((x1 - x0) / RASTER);
  const H = Math.ceil((y1 - y0) / RASTER);
  const g = new Uint8Array(W * H);
  for (const loops of list) {
    const b = bbox(loops.flat());
    for (let r = Math.max(0, Math.floor((b.minY - y0) / RASTER)); r <= Math.min(H - 1, Math.ceil((b.maxY - y0) / RASTER)); r++) {
      const y = y0 + (r + 0.5) * RASTER;
      const xs: number[] = [];
      for (const l of loops)
        for (let i = 0, j = l.length - 1; i < l.length; j = i++) if (l[i].y > y !== l[j].y > y) xs.push(((l[j].x - l[i].x) * (y - l[i].y)) / (l[j].y - l[i].y) + l[i].x);
      xs.sort((a, c) => a - c);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let c = Math.max(0, Math.ceil((xs[k] - x0) / RASTER - 0.5)); c <= Math.min(W - 1, Math.floor((xs[k + 1] - x0) / RASTER - 0.5)); c++) g[r * W + c] = 1;
    }
  }
  return g;
}
/** İki ızgaranın kesişimi → dikdörtgen cetveli (eksi). */
function overlapRects(a: Uint8Array, b: Uint8Array): CalcRow[] {
  const [x0, , x1] = WIN.L;
  const W = Math.ceil((x1 - x0) / RASTER);
  const m = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) m[i] = a[i] && b[i] ? 1 : 0;
  return gridRects(m, W, a.length / W, RASTER / 1000).map((r) => ({ ...r, sign: -1, value: -r.value }));
}
const overlapM2 = (a: Uint8Array, b: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++;
  return (n * RASTER * RASTER) / 1e6;
};

export function ceilingItems(
  dxfPath = 'work/dxf/4199-A-DD-01-05-100.dxf',
  planPath = 'work/dxf/4199-A-DD-01-02-100.dxf',
): { items: TakeoffItem[]; roomCeilings: Record<string, RoomCeiling>; findings: Finding[] } {
  const dxf = readDxf(dxfPath);
  const flat = flatten(dxf);
  const props = hatchProps(dxf);
  const nH = flat.filter((f) => f.t === 'HATCH').length;
  if (nH !== props.length) throw new Error(`HATCH sırası tutmadı: flatten ${nH}, ham ${props.length}`);

  // --- mahal etiketleri ve sınırları (zemin kat + asma kat alan blokları)
  const planFlat = flatten(readDxf(planPath));
  const { polys, labels, match } = extractRooms(planFlat, /^4199_AMH-Alanlar2?$/);
  const coded = labels.filter((l) => l.code);
  const gfLabels = coded.filter((l) => l.code!.startsWith('GF'));
  const mfLabels = coded.filter((l) => l.code!.startsWith('MF'));
  const ownPoly = (l: RoomLabel): RoomPoly | null => {
    const p = match.get(l.inst);
    return p && p.area < 3000 ? p : null;
  };
  const polyLabel = new Map<number, RoomLabel>();
  for (const l of coded) {
    const p = ownPoly(l);
    if (p && !polyLabel.has(p.id)) polyLabel.set(p.id, l);
  }
  const roomPolys = polys.filter((p) => p.area < 3000 && p.area >= 2);
  const lname = (l: RoomLabel) => `${l.code} ${l.name}`.trim();

  // --- tavan taramaları
  const hs: CH[] = [];
  const junk = { n: 0, area: 0 };
  let hi = 0;
  for (const f of flat) {
    if (f.t !== 'HATCH') continue;
    const pr = props[hi++];
    const lvl: Lvl | null = f.path[0] === LOWER ? 'L' : f.path[0] === UPPER ? 'U' : null;
    if (!lvl || !f.loops?.length) continue;
    const code = codeOf(f, pr.col);
    if (!code) continue;
    if (!inWin(centre(f.loops), WIN[lvl])) {
      junk.n++;
      junk.area += regionArea(f.loops) / 1e6;
      continue;
    }
    const calc = mergeRows(decomposeRegion(f.loops));
    hs.push({ idx: hi - 1, code, lvl, f, loops: f.loops, g: lvl === 'U' ? shift(f.loops, -DX) : f.loops, area: calc.reduce((t, r) => t + r.value, 0), calc, col: pr.col, scale: pr.scale, mf: null });
  }
  const lowerH = hs.filter((h) => h.lvl === 'L');
  const upperH = hs.filter((h) => h.lvl === 'U');
  for (const h of upperH) h.mf = mfLabels.find((l) => inR(l.at, h.loops)) ?? null;
  const upperGF = upperH.filter((h) => !h.mf);

  // model alanındaki lejant örnekleri ve uzak çöp (rapor için)
  const legendSw = flat.filter((f) => f.t === 'HATCH' && !f.path.length && f.loops?.length && inWin(centre(f.loops), [1300e3, 5870e3, 1315e3, 5900e3])).length;
  const legendPanels = flat.filter((f) => f.t === 'INSERT' && !f.path.length && f.name === '$0$salon tavan panel').length;
  const farModules = flat.filter((f) => f.t === 'INSERT' && !f.path.length && f.name === '190_TAVAN MODÜL').length;
  const dupOutlines = flat.filter((f) => f.path[0] === LOWER && f.layer === 'A_Elev_1' && f.closed && f.pts).length;

  // --- etiketler: tavan kodu (A_Anno_Symb_Clng) ve CH (A_Anno_Level)
  const texts = (blk: string, re: RegExp, lvl: Lvl) => flat.filter((f) => f.t === 'TEXT' && f.path[0] === blk && re.test(f.layer) && f.at && inWin(f.at, WIN[lvl]));
  const tagsL = texts(LOWER, /A_Anno_Symb_Clng/, 'L');
  const tagsU = texts(UPPER, /A_Anno_Symb_Clng/, 'U');
  const chOf = (f: Flat) => /^CH:\s*(\d+)/.exec(f.text ?? '')?.[1] ?? null;
  const chL = texts(LOWER, /A_Anno_Level/, 'L').filter(chOf);
  const chU = texts(UPPER, /A_Anno_Level/, 'U').filter(chOf);
  const tagHits = (t: Flat, pool: CH[]) => pool.filter((h) => inR(t.at!, h.loops) || inR({ x: t.at!.x + 300, y: t.at!.y + 100 }, h.loops));

  // alt planda kaymış etiketler: kod taramayla uyuşmuyor ve 8 m içinde taraması olmayan bir mahal var
  const hasLower = (p: P) => lowerH.some((h) => inR(p, h.loops));
  const hasUpperGF = (p: P) => upperGF.some((h) => inR(p, h.g));
  const displaced: { tag: Flat; room: RoomLabel; ch: Flat | null }[] = [];
  const conflicts: { tag: Flat; hatch: CH; room: string; ch: string | null }[] = [];
  for (const t of tagsL) {
    const hit = tagHits(t, lowerH);
    if (!hit.length || hit.some((h) => h.code === t.text)) continue;
    const cand = gfLabels
      .filter((l) => !hasLower(l.at) && !hasUpperGF(l.at))
      .map((l) => ({ l, d: Math.hypot(l.at.x - t.at!.x, l.at.y - t.at!.y) }))
      .filter((c) => c.d < 8000)
      .sort((a, b) => a.d - b.d)[0];
    const near = chL.map((c) => ({ c, d: Math.hypot(c.at!.x - t.at!.x, c.at!.y - t.at!.y) })).sort((a, b) => a.d - b.d)[0];
    if (cand) displaced.push({ tag: t, room: cand.l, ch: near && near.d < 1500 ? near.c : null });
    else conflicts.push({ tag: t, hatch: hit[0], room: '', ch: null });
  }
  const pairedCH = new Set(displaced.map((d) => d.ch).filter(Boolean) as Flat[]);
  const chIn = (loops: P[][], pool: Flat[], dx = 0) =>
    [...new Set(pool.filter((c) => !pairedCH.has(c) && inR({ x: c.at!.x + dx, y: c.at!.y }, loops)).map((c) => chOf(c)!))].sort();

  // --- tarama → mahal adı
  /** Taramanın mahali: içindeki mahal etiketleri; yoksa iç noktasını içeren mahal sınırı. */
  const roomInfo = (h: CH): { text: string; polys: P[][] } => {
    if (h.mf) return { text: lname(h.mf), polys: ownPoly(h.mf) ? [ownPoly(h.mf)!.pts] : [] };
    let ls = gfLabels.filter((l) => inR(l.at, h.g));
    if (h.lvl === 'U') ls = ls.filter((l) => !hasLower(l.at)); // alt tavanı olan kutular (rüzgarlık, vestiyer…) yukarıdaki taramaya ad vermez
    if (ls.length) {
      ls.sort((a, b) => a.at.x - b.at.x);
      return { text: ls.map(lname).join(' + '), polys: ls.map(ownPoly).filter((p): p is RoomPoly => !!p).map((p) => p.pts) };
    }
    const ip = interiorPoint(h.g);
    const p = roomPolys.find((q) => pointInPolygon(ip, q.pts));
    if (p) return { text: polyLabel.has(p.id) ? `${lname(polyLabel.get(p.id)!)} sınırı içinde` : `etiketsiz sınır #${p.id}`, polys: [p.pts] };
    // mahal dışında (ör. cephe dışı saçak altı): en yakın zemin kat mahalleriyle adlandır
    const near = roomsNear(ip, 12000).slice(0, 2).map((r) => r.label);
    return { text: near.length ? `${near.join(' / ')} önü – mahal dışı, ${sideOf(centre(h.g), 'ew')} kesimi` : `tarama #${h.idx} – mahal bulunamadı`, polys: [] };
  };
  const roomOf = (h: CH) => roomInfo(h).text;
  const planName = (h: CH) => (h.lvl === 'L' ? 'alt tavan planı' : 'üst tavan planı');
  const chUgf = chU.filter((c) => !upperH.some((h) => h.mf && inR(c.at!, h.loops))); // asma kat CH'leri hariç
  /** Taramanın CH'si: içindeki CH etiketleri; yoksa mahal sınırı içindekiler (aynı plan). */
  const hatchCH = (h: CH) => {
    const own = chIn(h.loops, h.lvl === 'L' ? chL : chU);
    if (own.length || h.mf) return own;
    const polys = roomInfo(h).polys;
    return polys.length ? (h.lvl === 'L' ? chIn(polys, chL) : chIn(polys, chUgf, -DX)) : [];
  };
  for (const c of conflicts) {
    c.room = roomOf(c.hatch);
    c.ch = hatchCH(c.hatch).join(' / ') || null;
  }
  const noteOf = (h: CH) =>
    `desen ${h.f.pattern} · katman ${h.f.layer} · renk ${h.col === 'BL' ? 'BYLAYER' : h.col} · ölçek ${Number(h.scale).toFixed(1)} · tarama #${h.idx}${h.loops.length > 1 ? ` · ${h.loops.length} halka (boşluklar düşülü)` : ''}`;
  const lineOf = new Map<CH, string>(); // 3B: taramanın hesap detayı satırı
  const hatchLine = (h: CH, chOverride?: string): Line => {
    const ch = chOverride ?? hatchCH(h).join(' / ');
    lineOf.set(h, `${roomOf(h)} (${planName(h)}${ch ? `, CH ${ch}` : ''})`);
    return { label: `${roomOf(h)} (${planName(h)}${ch ? `, CH ${ch}` : ''})`, value: r2(h.area), unit: 'm²', note: noteOf(h), calc: h.calc };
  };
  const srcOf = (list: CH[]): Source[] => {
    const seen = new Map<string, Source>();
    for (const h of list) {
      const where = `blok ${h.lvl === 'L' ? LOWER : UPPER}${h.f.path.length > 1 ? ' › ' + h.f.path.slice(1).join(' › ') : ''} · katman ${h.f.layer} · desen ${h.f.pattern}${h.col !== 'BL' ? ` (renk ${h.col})` : ''}`;
      if (!seen.has(where)) seen.set(where, { drawing: CEIL, where });
    }
    return [...seen.values(), { drawing: PLAN, where: 'mahal etiketleri (A_Anno_Rmname) ve sınırları (A_Nplt_Area) — satır adları için' }];
  };
  const sum = (list: CH[]) => list.reduce((s, h) => s + h.area, 0);
  const byCode = (c: string, lvl?: Lvl) => hs.filter((h) => h.code === c && (!lvl || h.lvl === lvl)).sort((a, b) => (a.lvl === b.lvl ? centre(a.g).x - centre(b.g).x : a.lvl === 'L' ? -1 : 1));
  const EXCL = `Hariç tutulanlar: model alanındaki lejant örnek taramaları (${legendSw} adet × 4,16 m²) ve ${legendPanels} "salon tavan panel" örnek bloğu; bina penceresi dışındaki çöp nesneler (model alanında y≈12 126 m'de ${farModules} adet 190_TAVAN MODÜL, uzak menfez/MEP sembolleri; tavan bloklarında pencere dışı tavan taraması ${junk.n} adet); tarama sınırlarını tekrar eden A_Elev_1 kapalı çizgileri (alt planda ${dupOutlines} adet) ayrıca sayılmadı.`;
  const COMMON = `Tavan paftası 01-05-100 ile 01-05-200 aynı model alanını içerir; tek dosyadan ölçüldü. Alt tavan planı "${LOWER}" bloğunda, üst tavan planı "${UPPER}" bloğunda (+465,3 m kaydırılmış; mahal eşlemesi için geri kaydırıldı). Kod, model alanındaki tavan lejantının örnek taramalarıyla (katman + desen + renk) eşlendi ve taramaların içindeki kod etiketleriyle (A_Anno_Symb_Clng) çapraz kontrol edildi. Alanlar tarama sınır halkalarından (iç boşluklar düşülerek) hesaplandı; aynı kodlu ya da farklı kodlu taramalar arasında plan içi çakışma yoktur (0,05 m ızgara kontrolü).`;

  const items: TakeoffItem[] = [];
  const lin = (list: CH[]) => list.map((h) => hatchLine(h));
  const mk = (poz: number, code: string | null, name: string, unit: string, value: number, method: string, sources: Source[], confidence: 'Yüksek' | 'Orta', lines: Line[], notes?: string[]) =>
    items.push({ poz: `D.${poz}`, group: 'D', name, code, unit, value: r2(value), method, sources, confidence, lines, ...(notes?.length ? { notes } : {}) });

  // D.1 C-G01
  const g01 = byCode('C-G01');
  mk(1, 'C-G01', 'Alçıpan asma tavan + RAL 9010 boya', 'm²', sum(g01),
    `C-G01 alanları, AR-SAND desenli ve rengi BYLAYER olan taramalardır (katman A_Patt_Elev): alt tavan planında ıslak hacim koridorları, ofisler, kulisler, mescitler ve vestiyerler; üst tavan planında üç büyük salonu çevreleyen ve salonları ayıran bantlar (CH 690). Aynı desenin 219 renklisi C-G02'dir; lejantta iki satır yalnızca renkle ayrılır, bu yüzden renk ham DXF'ten (grup kodu 62) okundu. ${COMMON} ${EXCL}`,
    srcOf(g01), 'Yüksek', lin(g01),
    ['Küçük salonlarda (GF-07/08/09) duvar dibinde taramasız kalan çevre bandı ve oradaki C-G01 etiketleri bu kaleme dahil edilmedi (bkz. kontrol notları).']);

  // D.2 C-G02
  const g02 = byCode('C-G02');
  mk(2, 'C-G02', 'Alçıpan tavan + RAL 9005 boya', 'm²', sum(g02),
    `C-G02, üst tavan planında küçük salonlardaki (GF-07/08/09) akustik tavanın içindeki koyu renkli dar şeritlerdir. AR-SAND desenli, katman A_Patt_Elev, renk 219 taramalardır (lejant örneği de 219 renklidir). Her salon tek tarama olarak çizilmiş, şeritler taramanın ayrı halkalarıdır (${g02.reduce((s, h) => s + h.loops.length, 0)} şerit). ${COMMON} ${EXCL}`,
    srcOf(g02), 'Yüksek', lin(g02));

  // D.3 C-G03
  const g03 = byCode('C-G03');
  mk(3, 'C-G03', 'Neme dayanıklı alçıpan tavan', 'm²', sum(g03),
    `C-G03, alt tavan planında DASH desenli taramalardır (katman "DRC-LLA-A-DD-CCP-Ceiling Finish Legend$0$A_Patt_ClngFnsh", ölçek 50): WC'ler, engelli WC'ler, soyunma odaları ve kulis WC'leri. GF-37 TEKNİK ALAN GİRİŞ'te tarama C-G03, etiket C-P01 gösteriyor; taramaya uyuldu (bkz. kontrol notları). ${COMMON} ${EXCL}`,
    srcOf(g03), 'Yüksek', lin(g03),
    conflicts.map((c) => `${c.room}: tarama ${c.hatch.code}, etiket ${c.tag.text} — taramaya uyuldu (${tr(c.hatch.area)} m²).`));

  // D.4 C-G04
  const g04 = byCode('C-G04');
  mk(4, 'C-G04', 'Akustik alçıpan tavan', 'm²', sum(g04),
    `C-G04, üst tavan planında küçük salonların (GF-07/08/09, CH 550) tavanıdır: HEX desenli, renk 251, katman A_Patt_Elev taramaları. C-G02 şeritleri taramanın boşluk halkalarıdır ve düşülmüştür; duvar dibindeki taramasız çevre bandı dahil değildir. ${COMMON} ${EXCL}`,
    srcOf(g04), 'Yüksek', lin(g04));

  // D.5 C-M01
  const m01 = byCode('C-M01');
  mk(5, 'C-M01', 'Metal asma tavan', 'm²', sum(m01),
    `C-M01, alt tavan planında NET desenli ve büyük ölçekli (≈189) taramalardır; katman "DRC-LLA-…$0$A_Patt_ClngFnsh" (rüzgarlıkta "$0$DRC-LLA-…" varyantı): mutfak, rüzgarlık, kafe mutfağı ve depo. C-M02 de NET desenlidir; ikisi katman (DRC-LLA önekli / önekiz A_Patt_ClngFnsh) ve desen ölçeği (189 / 31,5) ile ayrıldı ve içlerindeki kod etiketleri bunu doğruluyor. ${COMMON} ${EXCL}`,
    srcOf(m01), 'Yüksek', lin(m01),
    ['Rüzgarlık (GF-01) taramasının bir kısmı cephe dışına taşar ve saçak altı bandının altında kalır; saçak kaleminden düşülmedi.']);

  // D.6 C-M02
  const m02 = byCode('C-M02');
  mk(6, 'C-M02', 'Alüminyum petek tavan', 'm²', sum(m02),
    `C-M02, alt tavan planında NET desenli, küçük ölçekli (31,5) ve öneksiz A_Patt_ClngFnsh katmanındaki taramadır: GF-33 servis koridoru (CH 260). Koridorun üst tavan planında görünen C-P01 alanı asma kat teknik alanının tavanıdır, bu kaleme girmez. ${COMMON} ${EXCL}`,
    srcOf(m02), 'Yüksek', lin(m02));

  // D.7 C-M03 (uzunluk)
  const m03 = byCode('C-M03');
  const hallOf = (h: CH) => {
    const ip = interiorPoint(h.g);
    const p = roomPolys.find((q) => pointInPolygon(ip, q.pts));
    return p && polyLabel.has(p.id) ? polyLabel.get(p.id)! : null;
  };
  const w03 = byCode('C-W03');
  const hallCH = new Map<string, string>();
  for (const h of [...w03, ...m03]) {
    const l = hallOf(h);
    if (!l) continue;
    for (const v of chIn(h.loops, chU)) hallCH.set(l.code!, [...new Set([...(hallCH.get(l.code!)?.split(' / ') ?? []), v])].sort().join(' / '));
  }
  let m03Len = 0;
  const m03Lines: Line[] = [];
  const stripNo = new Map<string, number>();
  for (const h of m03) {
    const b = bbox(h.loops.flat());
    const len = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 1000;
    m03Len += Math.round(len * 1000) / 1000;
    const hall = hallOf(h);
    const key = hall ? lname(hall) : `hatch #${h.idx} – mahal bulunamadı`;
    const k = (stripNo.get(key) ?? 0) + 1;
    stripNo.set(key, k);
    const ch = hall ? hallCH.get(hall.code!) ?? '' : '';
    const lenR = Math.round(len * 1000) / 1000;
    lineOf.set(h, `${key} şerit ${k} (üst tavan planı${ch ? `, CH ${ch}` : ''})`);
    m03Lines.push({ label: `${key} şerit ${k} (üst tavan planı${ch ? `, CH ${ch}` : ''})`, value: r2(lenR), unit: 'm', calc: [{ kind: 'doğru', unit: 'm', label: 'şerit', name: 'şerit dikdörtgeninin uzun kenarı', adet: 1, boy: lenR, sign: 1, value: lenR }], note: `genişlik ${Math.round((h.area * 1e6) / (len * 1000))} mm, alan ${tr(h.area)} m² · ${noteOf(h)}` });
  }
  m03Lines.push({ label: 'Toplam şerit alanı (bilgi)', value: r2(sum(m03)), unit: 'm²', note: `${m03.length} şerit, SOLID taramaların toplam alanı`, calc: mergeRows(m03.flatMap((h) => h.calc)) });
  mk(7, 'C-M03', 'Alüminyum kanal (lineer)', 'm', m03Len,
    `C-M03, üst tavan planında büyük salonlardaki ahşap modül sıraları arasındaki 350 mm genişliğinde SOLID dolgulu şeritlerdir (katman A_Mat_Mtal; lejant örneği de A_Mat_Mtal SOLID). Her şeridin uzunluğu dikdörtgen sınırının uzun kenarından alındı; alan bilgi satırı olarak verildi. Şerit dış çizgileri (A_Mat_Mtal kapalı çizgileri) ayrıca sayılmadı. ${COMMON} ${EXCL}`,
    srcOf(m03), 'Yüksek', m03Lines);

  // D.8 C-P01
  const p01L = byCode('C-P01', 'L');
  const p01U = byCode('C-P01', 'U');
  const p01Lines = [...lin(p01L)];
  let p01Extra = 0;
  for (const d of displaced) {
    const a = d.room.labelArea ?? 0;
    if (d.tag.text !== 'C-P01') continue;
    p01Extra += a;
    p01Lines.push({ label: `${lname(d.room)} (alt tavan planı${d.ch ? `, CH ${chOf(d.ch)}` : ''})`, value: r2(a), unit: 'm²', calc: [{ kind: 'değer', unit: 'm²', label: 'etiket', name: 'mahal etiketindeki alan', adet: 1, sign: 1, value: a }], note: 'tarama yok, mahal etiketi alanı; C-P01 kod etiketi ve CH etiketi komşu mutfak taramasının içine kaymış' });
  }
  p01Lines.push(...lin(p01U));
  mk(8, 'C-P01', 'Sıva + boya tavan', 'm²', sum(p01L) + p01Extra + sum(p01U),
    `C-P01, CROSS desenli taramalardır (katman A_Patt_ClngFnsh, ölçek 50). Alt tavan planında teknik odalar, depolar ve elektrik odası; üst tavan planında asma kat teknik alanı ile elektrik odası (MF-01/MF-02, asma kat döşemesi +3,80) ve tam yükseklikteki bölücü depolar (GF-49/50, CH 785). Taraması olmayan GF-35 DEPO, kod etiketi C-P01 olduğu için mahal etiketindeki alanla eklendi. ${COMMON} ${EXCL}`,
    srcOf([...p01L, ...p01U]), 'Yüksek', p01Lines,
    ['Üst plandaki asma kat C-P01 alanı, alt plandaki zemin kat servis mahallerinin üzerindedir (farklı kat); çift sayım değildir.']);

  // D.9 C-W01
  const w01 = byCode('C-W01');
  mk(9, 'C-W01', 'Ahşap tavan paneli – Salon 01 önü giriş kutusu', 'm²', sum(w01),
    `C-W01, alt tavan planında GOST_WOOD desenli taramadır (katman $0$A_Patt_Elev, lejant örneğiyle aynı): fuaye içinde, Salon 01 önündeki giriş kutusunun tavanı (CH 300). Fuayenin baffle tavanı bu kutunun üstünden de geçer; C-B01 kaleminde bu kısım düşüldü. ${COMMON} ${EXCL}`,
    srcOf(w01), 'Yüksek', lin(w01));

  // D.10 C-W02
  const w02 = byCode('C-W02');
  mk(10, 'C-W02', 'Ahşap tavan paneli – salon girişleri (GF-14/GF-17) ve kafe (GF-26)', 'm²', sum(w02),
    `C-W02, alt tavan planında AR-RROOF desenli, 90° açılı taramalardır (katman A_Patt_Othr / $0$A_Patt_Othr, lejant örneğiyle aynı): iki salon girişi ve kafe (CH 300). Aynı desen CA2O_12_elev1 katmanında C-W03 modül panelleridir; katman ile ayrıldı. ${COMMON} ${EXCL}`,
    srcOf(w02), 'Yüksek', lin(w02));

  // D.11 C-W03
  const halls = new Map<string, { l: RoomLabel | null; hs: CH[]; mods: Set<number> }>();
  for (const h of w03) {
    const l = hallOf(h);
    const k = l ? l.code! : '?';
    const g = halls.get(k) ?? { l, hs: [], mods: new Set<number>() };
    g.hs.push(h);
    g.mods.add(h.f.inst ?? -h.idx);
    halls.set(k, g);
  }
  for (const [k, g] of halls) for (const h of g.hs) lineOf.set(h, `${g.l ? lname(g.l) : 'mahal bulunamadı'} (üst tavan planı${hallCH.get(k) ? `, CH ${hallCH.get(k)}` : ''})`);
  const w03Lines: Line[] = [...halls.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => ({
    label: `${g.l ? lname(g.l) : 'mahal bulunamadı'} (üst tavan planı${hallCH.get(k) ? `, CH ${hallCH.get(k)}` : ''})`,
    value: r2(sum(g.hs)),
    unit: 'm²',
    calc: mergeRows(g.hs.flatMap((h) => h.calc)),
    note: `${g.mods.size} modül × 2 panel (190_TAVAN MODÜL, 1,88×1,88 m) · desen AR-RROOF · katman CA2O_12_elev1 · ${g.hs.length} panel taraması`,
  }));
  const nMods = new Set(w03.map((h) => h.f.inst ?? -h.idx)).size;
  w03Lines.push({ label: 'Toplam modül sayısı', value: nMods, unit: 'adet', note: '190_TAVAN MODÜL eklemeleri (her biri 2 üçgen panel)' });
  mk(11, 'C-W03', 'Ahşap tavan modülü 1,88×1,88 (salonlar)', 'm²', sum(w03),
    `C-W03, üst tavan planında üç büyük salonun (GF-03/04/05) tavanını oluşturan "190_TAVAN MODÜL" blok eklemeleridir. Her modül 1,88×1,88 m'dir ve iki AR-RROOF taramalı panelden (katman CA2O_12_elev1) oluşur; dış çizgileri A_Mat_Tmbr katmanındadır. Lejanttaki C-W03 satırı aynı yapıdaki "salon tavan panel" bloğudur. Alan panel taramalarının toplamıdır; modüller salon sınırına göre gruplandı. Aynı konumda tekrar eden modül yoktur. Not: modül bloğunun ekleme noktası geometriden yaklaşık 6 km uzaktadır; eşleme geometriye göre yapıldı. ${COMMON} ${EXCL}`,
    srcOf(w03.slice(0, 1)), 'Yüksek', w03Lines);

  // D.12 C-B01 (net)
  const b01 = byCode('C-B01');
  const gB = raster(b01.map((h) => h.g));
  const b01Lines: Line[] = lin(b01).map((l) => ({ ...l, label: `Brüt: ${l.label}` }));
  let ovTot = 0;
  for (const h of lowerH) {
    const rh = raster([h.loops]);
    const ov = overlapM2(rh, gB);
    if (ov < 0.01) continue;
    const ovCalc = overlapRects(rh, gB);
    ovTot += ov;
    b01Lines.push({ label: `− ${roomOf(h)} üstü (alt tavan ${h.code}, ${tr(h.area)} m²)`, value: -r2(ov), unit: 'm²', calc: ovCalc, note: `alçak kutu tavanının üstünde kalan baffle alanı; ${RASTER / 1000} m ızgara ile ölçüldü · tarama #${h.idx}` });
  }
  const b01Net = sum(b01) - ovTot;
  b01Lines.push({ label: 'Net C-B01', value: r2(b01Net), unit: 'm²', note: 'yukarıdaki satırların toplamı' });
  mk(12, 'C-B01', 'Alüminyum baffle tavan', 'm²', b01Net,
    `C-B01, üst tavan planında ANSI32 desenli taramalardır (katman A_Mat_Tmbr; lejant örneği de A_Mat_Tmbr ANSI32): ana fuaye, küçük fuaye ve doğu koridoru (CH 532). Fuaye taraması, alt tavan planında kendi alçak tavanı olan kutuların (rüzgarlık, vestiyerler, salon girişleri) üstünden de geçer; bu kısım üst ve alt plan taramalarının ${RASTER / 1000} m ızgarada kesişiminden ölçülüp brüt alandan düşüldü (net). ${COMMON} ${EXCL}`,
    srcOf(b01), 'Orta', b01Lines,
    [`Brüt ${tr(sum(b01))} m², kutuların üstü ${tr(ovTot)} m², net ${tr(b01Net)} m². Baffle'ın kutuların üstünde devam edip etmediği mimarla teyit edilmeli.`]);

  // D.13 saçak altı
  const sof = byCode('SOFFIT');
  // iki iç içe bant: dıştaki (sınır kutusu büyük) saçak/kanopi altı, içteki teras döşemesinin cephe dışındaki altı
  const bboxA = (h: CH) => {
    const b = bbox(h.g.flat());
    return (b.maxX - b.minX) * (b.maxY - b.minY);
  };
  const outerSof = sof.reduce<CH | null>((a, h) => (!a || bboxA(h) > bboxA(a) ? h : a), null);
  const sofLines = sof.map((h) => {
    const l = hatchLine(h);
    // bant boyunca en sık en yakın mahal
    const votes = new Map<string, number>();
    const pts = h.g.flat();
    for (let k = 0; k < pts.length; k += Math.max(1, Math.floor(pts.length / 60))) {
      const r = roomsNear(pts[k], 15000)[0];
      if (r) votes.set(r.label, (votes.get(r.label) ?? 0) + 1);
    }
    const near = [...votes].sort((x, y) => y[1] - x[1])[0]?.[0];
    const what = h === outerSof ? 'Saçak (kanopi) altı – parapet dışı' : 'Teras döşemesi altı – cam cephe ile parapet arası';
    const ch = hatchCH(h).join(' / ');
    const label = `${what}${near ? `, ${near} önü` : ''} (üst tavan planı${ch ? `, CH ${ch}` : ''})`;
    lineOf.set(h, label);
    return { ...l, label };
  });
  const ovSofLower = overlapM2(raster(sof.map((h) => h.g)), raster(lowerH.map((h) => h.loops)));
  mk(13, null, 'Saçak altı alüminyum levha kaplama (dış tavan)', 'm²', sum(sof),
    `Saçak altı, üst tavan planında cam cephenin dışında binayı saran TRIANG desenli bant taramalarıdır (katman A_Patt_ClngFnsh, CH 590 / BOC +6,00). Bu desen tavan lejantında yoktur; kesitlerde (01-03-100, 01-09-101) saçak altı "çimento esaslı levha 2×12,5 mm + alüminyum levha kaplama" olarak tanımlıdır. Bant iki taramadan oluşur, aralarında çakışma yoktur. ${COMMON} ${EXCL}`,
    srcOf(sof), 'Orta', sofLines,
    [`Kaplama malzemesi lejantta tanımsız; kesit notlarından alındı. Cephe dışına taşan rüzgarlık kutusunun üstünde ${tr(ovSofLower)} m² saçak bandı var; düşülmedi.`]);

  // --- mahal → tavan eşlemesi
  const roomCeilings: Record<string, RoomCeiling> = {};
  const codeCount = new Map<string, number>();
  for (const l of coded) codeCount.set(l.code!, (codeCount.get(l.code!) ?? 0) + 1);
  const put = (key: string, v: RoomCeiling) => (roomCeilings[key] = v);
  const upName = (c: string) => (c === 'SOFFIT' ? 'Saçak altı' : c);
  for (const l of gfLabels) {
    const lo = lowerH.find((h) => inR(l.at, h.loops)) ?? null;
    const disp = displaced.find((d) => d.room === l);
    const poly = ownPoly(l);
    // üst tavan: mahal sınırı içindeki üst plan taramaları, alana göre büyükten küçüğe (salon: C-W03 + C-G01 + C-M03);
    // sınır yoksa ya da sınır içinde iç noktası olan tarama yoksa etiket noktasındaki tarama (ör. rüzgarlık üstündeki C-B01)
    let upper: string | null = null;
    if (poly) {
      const acc = new Map<string, number>();
      for (const h of upperGF) if (pointInPolygon(interiorPoint(h.g), poly.pts)) acc.set(h.code, (acc.get(h.code) ?? 0) + h.area);
      if (acc.size) upper = [...acc.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => upName(c)).join(' + ');
    }
    if (!upper) {
      const up = upperGF.find((h) => inR(l.at, h.g));
      upper = up ? upName(up.code) : null;
    }
    const R = poly ? [poly.pts] : lo ? lo.loops : (upperGF.find((h) => inR(l.at, h.g))?.g ?? null);
    let chs: string[] = [];
    if (disp?.ch) chs.push(chOf(disp.ch)!);
    if (R) chs.push(...chIn(R, chL), ...chIn(R, chUgf, -DX));
    chs = [...new Set(chs)];
    const v: RoomCeiling = { lower: lo?.code ?? (disp ? disp.tag.text! : null), upper, ch: chs.length ? chs.join(' / ') : null };
    put(lname(l), v);
    if (codeCount.get(l.code!) === 1) put(l.code!, v);
  }
  for (const l of mfLabels) {
    const up = upperH.find((h) => h.mf === l) ?? null;
    const chs = up ? chIn(up.loops, chU) : [];
    const v: RoomCeiling = { lower: null, upper: up?.code ?? null, ch: chs.length ? chs.join(' / ') : null };
    put(lname(l), v);
    if (codeCount.get(l.code!) === 1) put(l.code!, v);
  }
  // etiketsiz sınırlar (rooms-gf "SINIR-n" satırları)
  for (const p of roomPolys) {
    if (polyLabel.has(p.id)) continue;
    const ip = interiorPoint([p.pts]);
    const lo = lowerH.find((h) => inR(ip, h.loops)) ?? null;
    const up = upperGF.find((h) => inR(ip, h.g)) ?? null;
    if (!lo && !up) continue;
    const v: RoomCeiling = { lower: lo?.code ?? null, upper: up ? upName(up.code) : null, ch: [...new Set([...chIn([p.pts], chL), ...chIn([p.pts], chUgf, -DX)])].join(' / ') || null };
    put(`SINIR-${p.id} Etiketsiz mahal`, v);
    put(`SINIR-${p.id}`, v);
  }

  // --- kontrol notları
  const findings: Finding[] = [];
  const F = (topic: string, finding: string, suggestion: string, drawings = CEIL) => findings.push({ topic, drawings, finding, suggestion });
  F('Tavan paftaları', `01-05-100 (alt kat) ve 01-05-200 (üst kat) tavan paftalarının model alanı birebir aynıdır; ikisi de iki tavan bloğunu içerir. Üst tavan planı asma kat çerçevesinde +465,3 m doğuya kaydırılmış çizilmiştir (zemin kat planındaki STRUCTURE_FF_NN ve CEPHE KAPLAMA_MF ile aynı kayma).`, 'Tek dosyadan ölçün; iki paftayı ayrı ayrı toplarsanız tavanlar iki kez sayılır.');
  F('Lejant örnekleri', `Tavan lejantının ${legendSw} örnek taraması (her biri 4,16 m²) ve ${legendPanels} "salon tavan panel" örnek bloğu model alanında (x≈1306–1309 m) ve gerçek taramalarla aynı katman/desen adlarını taşıyor.`, 'Bina penceresi dışındaki taramaları dışlayın.');
  F('Uzak çöp nesneler', `Model alanında y≈12 126 m'de ${farModules} adet 190_TAVAN MODÜL eklemesi (iki çift üst üste), y≈−5 624 m'de menfez blokları; tavan bloklarında uzak MEP sembolleri var. Bina penceresi dışındaki tavan taraması: ${junk.n}.`, 'Çizimden temizlenmeli; metrajda dışlandı.');
  F('Mahal sınırı yok', `Tavan paftasında A_Nplt_Area nesnesi yok; yalnız bağlanmamış dış referansın katman adı (4199-A-DD-02-100|A_Nplt_Area) var. Zemin kat planında sınırı olmayan mahallerden ${['GF-34', 'GF-36', 'GF-37', 'GF-38', 'GF-39'].join(', ')} için alt tavan taramaları sınır yerine kullanılabilir (alanlar etiketlerle uyumlu); GF-35 DEPO'nun taraması da yok.`, 'Mahal sınırlarını zemin kat planına ekleyin.', `${PLAN}, ${CEIL}`);
  F('Tekrarlanan sınırlar', `Alt tavan planındaki ${dupOutlines} adet A_Elev_1 kapalı çizgisi tarama sınırlarının kopyasıdır.`, 'Tarama ile birlikte toplanmamalı; yalnız tarama alanı kullanıldı.');
  for (const d of displaced)
    F('Kaymış tavan etiketi', `${lname(d.room)}: taraması yok. ${d.tag.text} kod etiketi${d.ch ? ` ve CH ${chOf(d.ch)} etiketi` : ''} komşu ${tagHits(d.tag, lowerH)[0]?.code ?? ''} taramasının (mutfak) içine kaymış. Kalem, mahal etiketindeki ${tr(d.room.labelArea ?? 0)} m² ile hesaplandı.`, 'Mahale tavan taraması ekleyin ve etiketi mahalin içine taşıyın.');
  for (const c of conflicts)
    F('Tavan kodu çelişkisi', `${c.room}: tarama ${c.hatch.code} (${c.hatch.f.pattern}), içindeki etiket ${c.tag.text}${c.ch ? `, CH ${c.ch}` : ''}. Metrajda taramaya uyuldu (${tr(c.hatch.area)} m² ${c.hatch.code}).`, 'Mimardan doğru tavan tipini teyit edin.');
  const upMis = tagsU.filter((t) => {
    const hit = tagHits(t, upperH);
    return hit.length && !hit.some((h) => h.code === t.text);
  });
  if (upMis.length)
    F('Küçük salon etiketleri', `Üst tavan planında ${upMis.length} kod etiketi bulunduğu taramayla uyuşmuyor (${[...new Set(upMis.map((t) => t.text))].join(', ')}); hepsi küçük salonlarda: C-G02 etiketleri dar koyu şeritleri, C-G01 etiketleri duvar dibindeki bandı gösteriyor. Etiket, C-G04 taramasının üstüne yazılmış.`, 'Bilgi; metraj taramalara göre yapıldı.');
  // küçük salon çevre bandı
  const fan = gfLabels.filter((l) => upperGF.some((h) => h.code === 'C-G04' && inR(interiorPoint(h.g), ownPoly(l) ? [ownPoly(l)!.pts] : [])));
  let fanRes = 0;
  const fanTxt: string[] = [];
  for (const l of fan) {
    const p = ownPoly(l)!;
    const inside = upperGF.filter((h) => (h.code === 'C-G04' || h.code === 'C-G02') && pointInPolygon(interiorPoint(h.g), p.pts));
    const res = p.area - sum(inside);
    fanRes += res;
    fanTxt.push(`${l.code} ${tr(res)} m²`);
  }
  F('Küçük salon çevre bandı', `Küçük salonlarda mahal alanı ile C-G04 + C-G02 taramaları arasında toplam ${tr(fanRes, 1)} m² taramasız çevre bandı var (${fanTxt.join(', ')}). Bandın yanında C-G01 etiketleri duruyor. Metraja dahil edilmedi.`, 'Bandın C-G01 alçıpan mı, duvar kaplaması mı olduğunu detaydan teyit edin.');
  for (const code of ['GF-49', 'GF-50']) {
    const l = gfLabels.find((x) => x.code === code && /BÖLÜCÜ/.test(x.name));
    const h = l ? upperGF.find((x) => inR(l.at, x.g)) : null;
    if (l && h && l.labelArea && Math.abs(l.labelArea - h.area) > 0.5)
      F('Etiket / tarama farkı', `${lname(l)}: mahal etiketi ${tr(l.labelArea)} m², üst tavan planındaki C-P01 taraması (CH 785) ${tr(h.area)} m².`, 'Bölücü depo sınırını ve tavan taramasını karşılaştırın.', `${PLAN}, ${CEIL}`);
  }
  for (const l of mfLabels) {
    const h = upperH.find((x) => x.mf === l);
    if (h && l.labelArea && Math.abs(l.labelArea - h.area) > 0.5)
      F('Etiket / tarama farkı', `${lname(l)}: mahal etiketi ${tr(l.labelArea)} m², tavan taraması ${tr(h.area)} m².`, 'Asma kat sınırlarını kontrol edin.', `${PLAN}, ${CEIL}`);
  }
  const wc = gfLabels.find((l) => l.code === 'GF-36' && /WC/.test(l.name));
  const wcH = wc ? lowerH.find((h) => inR(wc.at, h.loops)) : null;
  if (wc && wcH) F('Hatalı mahal etiketi', `${lname(wc)}: etiket alanı ${tr(wc.labelArea ?? 0)} m² (Protokol Odası etiketinin kopyası); tavan taraması ${tr(wcH.area)} m².`, 'Etiketi düzeltin.', `${PLAN}, ${CEIL}`);
  const multi = lowerH.filter((h) => gfLabels.filter((l) => inR(l.at, h.loops)).length > 1);
  for (const h of multi)
    F('Ortak tarama', `${roomOf(h)} tek ${h.code} taramasıyla çizilmiş (${tr(h.area)} m²).`, 'Bilgi; mahal bazında ayrım gerekiyorsa sınırlardan bölün.');
  F('Baffle çakışması', `Üst plandaki C-B01 fuaye taraması, alçak tavanlı kutuların (rüzgarlık, vestiyerler, salon girişleri) üstünden geçiyor: ${tr(ovTot)} m². Net değer bu kısım düşülerek verildi.`, 'Baffle\'ın kutuların üstünde devam edip etmediğini teyit edin.');
  F('Desen ayrımı', 'C-G01 ile C-G02 aynı AR-SAND deseniyle çizilmiş, yalnızca renk farklı (BYLAYER / 219). C-M01 ile C-M02 aynı NET deseniyle çizilmiş, yalnızca katman öneki ve desen ölçeği farklı (189 / 31,5).', 'Çizimde ayırt edici desen kullanılmalı; metrajda renk/ölçek ham DXF\'ten okundu.');
  F('Saçak altı', `TRIANG desenli saçak altı bandı (${tr(sum(sof))} m², CH 590) tavan lejantında yok; malzeme kesit notlarından (alüminyum levha kaplama) alındı.`, 'Lejanta saçak altı kaplama tipi eklenmeli.', `${CEIL}, 4199-A-DD-01-03-100, 4199-A-DD-01-09-101`);

  // 3B: her tavan taraması kendi CH kotunda (asma kat tavanları +3,80 döşemesine göre)
  const pozOf = new Map(items.filter((i) => i.code).map((i) => [i.code!, i.poz] as const));
  pozOf.set('SOFFIT', 'D.13');
  for (const h of hs) {
    const poz = pozOf.get(h.code);
    if (!poz) continue;
    const ch = Number(hatchCH(h)[0]);
    const z = (h.mf ? 3.8 : 0) + (ch > 0 ? ch / 100 : h.code === 'SOFFIT' ? 5.9 : h.lvl === 'L' ? 3.0 : 6.5);
    const ln = lineOf.get(h);
    const line = !ln ? undefined : poz === 'D.12' ? `Brüt: ${ln}` : ln;
    // saçak / konsol altı dış kaplamadır: kapalı başlayan tavan katmanında değil, cephede görünür
    model3d.add({ layer: h.code === 'SOFFIT' ? 'cephe' : 'tavan', kind: 'flat', items: [poz], ...(line ? { lines: { [poz]: line } } : {}), label: h.code === 'SOFFIT' && ln ? `${ln} – ${h.area.toFixed(2)} m²` : `${h.code} – ${roomOf(h)} (CH ${ch > 0 ? ch : '?'}) – ${h.area.toFixed(2)} m²`, loops: h.g, z0: z, z1: z });
  }
  return { items, roomCeilings, findings };
}
