// Zemin kat planından (01-02-100) çıkan kalemler: alanlar, duvarlar, kapılar, taşıyıcılar, hareketli bölme.
import { extractDoors, type Door } from '../doors';
import type { RawDxf } from '../lib/dxf';
import type { Flat } from '../lib/flatten';
import { area, bbox, clipConvex, length, pointInPolygon, regionArea, type P } from '../lib/geom';
import { decomposeArea, decomposeLength, decomposeRegion, mergeRows, type CalcRow } from '../lib/decompose';
import type { RoomRow, TakeoffItem } from './model';
import { ShapeUtils, Vector2 } from 'three';
import { model3d, type Raw3 } from './model3d';
import { roomsNear } from './rooms-index';

const GF = '4199-A-DD-01-02-100';
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Planda bazı kapıların (ör. küçük salon girişleri) önünde duvar taraması kesilmeden devam ediyor. 3B'de açıklık duvardan
 * çıkarılır, üstünde kapı yüksekliğinden duvar üstüne lento kalır. Açıklık: kapı bloğu çizgilerinin duvar boyunca uzanımı ×
 * kapı noktasından ±0,40 m. Kesilen duvar önce üçgenlere bölünür (boşluklu/içbükey taramada kesme çizgisi sahte yüzey
 * bırakmasın diye; dışbükey parça dışbükey bölgeyle kırpılınca tek parça kalır), sonra mesh olarak çizilir.
 * Taraması kapıda kesik olan (iki yanında duvar biten) kapılarda da açıklığın üstüne aynı lento eklenir.
 * G.1/G.2 değişmez; duvar yüzey alanı (G.3.x) açıklıkları kullanır: kesik taramaya lento eklenir, kesilmeyenden kapı düşülür.
 * shortcut: kapı yüksekliği 2,20 m (kapı pinleriyle aynı; planda yok), kesit/görünüşten alınırsa güncellenir.
 */
const DOOR_H = 2.2;
type Opening = { d: Door; wall: Raw3; lintel: Raw3; width: number; cut: boolean };
function cutDoorOpenings(doors: Door[], walls: Raw3[], flat: Flat[], name: (d: Door) => string, thick: Map<Raw3, number>): Opening[] {
  const out: Opening[] = [];
  const T = 400;
  const B = 1e6;
  const doorPts = new Map<number, P[]>();
  for (const f of flat) if (f.layer === 'A_Door_Wood' && f.pts && f.inst) doorPts.set(f.inst, [...(doorPts.get(f.inst) ?? []), ...f.pts]);
  const segDist = (p: P, a: P, b: P) => {
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
  };
  const inside = (p: P, rings: P[][]) => rings.filter((r) => pointInPolygon(p, r)).length % 2 === 1;
  /** Halkalar → üçgenler (büyükten küçüğe: içine düşen halka boşluk, değilse yeni dış halka). */
  const triangles = (rings: P[][]): P[][] => {
    const shapes: { outer: P[]; holes: P[][] }[] = [];
    for (const r of [...rings].sort((a, b) => area(b) - area(a))) {
      const host = shapes.find((s) => pointInPolygon(r[0], s.outer) && !s.holes.some((h) => pointInPolygon(r[0], h)));
      if (host) host.holes.push(r);
      else shapes.push({ outer: r, holes: [] });
    }
    const v = (r: P[]) => r.map((p) => new Vector2(p.x, p.y));
    return shapes.flatMap((s) => {
      const all = [s.outer, ...s.holes].flat();
      return ShapeUtils.triangulateShape(v(s.outer), s.holes.map(v)).map((t) => t.map((i) => all[i]));
    });
  };
  /** Dışbükey parçalardan katı: alt, üst ve yan yüzler (iç yan yüzler duvarın içinde kalır). */
  const solid = (polys: P[][], z0: number, z1: number) =>
    polys.flatMap((q) => [
      q.map((p) => ({ ...p, z: z1 })),
      [...q].reverse().map((p) => ({ ...p, z: z0 })),
      ...q.map((a, i) => {
        const b = q[(i + 1) % q.length];
        return [{ ...a, z: z0 }, { ...b, z: z0 }, { ...b, z: z1 }, { ...a, z: z1 }];
      }),
    ]);
  const cutParts = new Map<Raw3, P[][]>(); // kesilen duvarın güncel dışbükey parçaları
  const keep = (q: P[]) => q.length >= 3 && area(q) > 1e3;
  for (const d of doors) {
    const dp = d.inst ? doorPts.get(d.inst) : undefined;
    if (!dp?.length) continue;
    // duvar doğrultusu: kapı noktasına yakın uzun duvar kenarları, yakından uzağa. Geniş kapıda nokta açıklığın ortasında
    // (duvar ucuna ~1,3 m) ve en yakın kenar dik bir duvarın olabilir; açıklığa uyan ilk kenar alınır.
    const cands: { a: P; b: P; dist: number; w: Raw3 }[] = [];
    for (const w of walls)
      for (const r of w.loops!)
        r.forEach((a, i) => {
          const b = r[(i + 1) % r.length];
          const dist = Math.hypot(b.x - a.x, b.y - a.y) > 300 ? segDist(d.at, a, b) : Infinity;
          if (dist <= 1600) cands.push({ a, b, dist, w });
        });
    cands.sort((p, q) => p.dist - q.dist);
    for (const { a, b, dist, w: bw } of cands.slice(0, 8)) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      const at = (s: number, t: number): P => ({ x: d.at.x + u.x * s - u.y * t, y: d.at.y + u.y * s + u.x * t });
      const ss = dp.map((p) => (p.x - d.at.x) * u.x + (p.y - d.at.y) * u.y);
      const [s0, s1] = [Math.min(...ss), Math.max(...ss)];
      if (s1 - s0 < 500) continue;
      const mid = at((s0 + s1) / 2, 0);
      const parts = (w: Raw3) => cutParts.get(w) ?? triangles(w.loops!);
      const hosts = walls.filter((w) => (cutParts.has(w) ? parts(w).some((q) => pointInPolygon(mid, q)) : inside(mid, w.loops!))); // açıklığın ortası taramanın içindeyse kesilmemiş
      const rect = (sa: number, sb: number, ta: number, tb: number) => [at(sa, ta), at(sb, ta), at(sb, tb), at(sa, tb)];
      const width = (s1 - s0) / 1000;
      const label = `Kapı üstü duvar (lento, +${DOOR_H.toFixed(2).replace('.', ',')} → üst) – ${name(d)}`;
      if (!hosts.length) {
        // tarama kapıda kesik: açıklık boştur ve iki yanında duvar sürer → üstüne o duvar kalınlığında lento
        const e = -u.y * (a.x - d.at.x) + u.x * (a.y - d.at.y); // duvar kenarının kapı noktasına dik uzaklığı
        const sm = ((a.x + b.x) / 2 - d.at.x) * u.x + ((a.y + b.y) / 2 - d.at.y) * u.y;
        const sg = inside(at(sm, e + 20), bw.loops!) ? 1 : -1;
        const tw = thick.get(bw)!;
        const tm = e + (sg * tw) / 2;
        const wallAt = (p: P) => walls.some((w) => inside(p, w.loops!));
        if (wallAt(at((s0 + s1) / 2, tm)) || !wallAt(at(s0 - 150, tm)) || !wallAt(at(s1 + 150, tm))) continue;
        const lintel = model3d.add({ layer: bw.layer, kind: 'mesh', items: [], label, faces: solid([rect(s0, s1, e, e + sg * tw)], DOOR_H, bw.z1), z0: DOOR_H, z1: bw.z1 });
        out.push({ d, wall: bw, lintel, width, cut: false });
        break;
      }
      if (dist > 500) continue; // kesilmemiş taramada kapı noktası duvar kenarında olmalı
      const box = rect(s0, s1, -T, T);
      const rest = [rect(-B, s0, -B, B), rect(s1, B, -B, B), rect(s0, s1, T, B), rect(s0, s1, -B, -T)];
      for (const w of hosts) {
        const ps = parts(w);
        const lintel = ps.map((q) => clipConvex(q, box)).filter(keep);
        cutParts.set(w, ps.flatMap((q) => rest.map((c) => clipConvex(q, c))).filter(keep));
        if (lintel.length) out.push({ d, wall: w, width, cut: true, lintel: model3d.add({ layer: w.layer, kind: 'mesh', items: [...w.items], lines: { ...w.lines }, label, faces: solid(lintel, DOOR_H, w.z1), z0: DOOR_H, z1: w.z1 }) });
      }
      break;
    }
  }
  // loops kalır (cephe/çatı betikleri duvar konumunu okur); 3B çıktısı mesh yüzlerinden
  for (const [w, ps] of cutParts) Object.assign(w, { kind: 'mesh', faces: solid(ps, w.z0, w.z1) });
  return out;
}

/** wallTop: duvarın üst kotu (m) ve dayanağı, üstündeki çatıya göre (roof-items wallTopAt). */
export function gfItems(dxf: RawDxf, flat: Flat[], rooms: RoomRow[], plate: { pts: P[]; verts?: { x: number; y: number; bulge: number }[]; area: number }, wallTop: (p: P) => { z: number; where: string }): TakeoffItem[] {
  const items: TakeoffItem[] = [];
  const top = (f: Flat) => f.path[0] ?? '';
  const gfRooms = rooms.filter((r) => r.floor === 'Zemin Kat');
  const mfRooms = rooms.filter((r) => r.floor !== 'Zemin Kat');
  const roomLine = (r: RoomRow) => ({
    label: `${r.code.startsWith('SINIR') ? r.code : r.code} ${r.name}`.trim(),
    value: r2(r.area),
    unit: 'm²',
    note: r.areaSource === 'sınır' ? 'mahal sınır çizgisinden (A_Nplt_Area)' : r.areaSource === 'etiket' ? 'mahal sınırı yok; etiket alanı (kontrol ölçümüyle doğrulandı)' : 'duvar iç yüzlerinden ölçüm',
    calc: r.calc,
  });

  items.push({
    poz: 'A.1', group: 'A', name: 'Zemin kat net mahal alanı (toplam)', unit: 'm²',
    value: r2(gfRooms.reduce((s, r) => s + r.area, 0)),
    method:
      'Her mahalin alanı, mimarın zemin kat planına çizdiği mahal sınır çizgisinden (katman A_Nplt_Area) hesaplandı ve mahal etiketiyle eşleştirildi. Sınırı çizilmemiş 8 mahalde etiket alanı alındı; her biri duvar iç yüzlerinden ayrıca ölçülerek doğrulandı. Etiketi hatalı olan GF-36 WC için ölçüm kullanıldı. Etiketsiz iki sınır da dahil edildi.',
    sources: [{ drawing: GF, where: 'blok 4199_AMH-Alanlar · katman A_Nplt_Area (mahal sınırları) + A_Anno_Rmname (mahal etiketleri)' }],
    confidence: 'Yüksek',
    lines: gfRooms.map(roomLine),
  });
  items.push({
    poz: 'A.2', group: 'A', name: 'Asma kat (teknik alan) net alanı', unit: 'm²',
    value: r2(mfRooms.reduce((s, r) => s + r.area, 0)),
    method: 'Asma kat mahal sınır çizgilerinden (zemin kat paftasında ayrı çizilmiş asma kat alan bloğu).',
    sources: [{ drawing: GF, where: 'blok 4199_AMH-Alanlar2 · katman A_Nplt_Area' }],
    confidence: 'Yüksek',
    lines: mfRooms.map(roomLine),
  });
  const perCalc = mergeRows(decomposeLength(plate.pts, true));
  const per = perCalc.reduce((t, r) => t + r.value, 0); // yaylar tam (r × θ)
  items.push({
    poz: 'A.3', group: 'A', name: 'Zemin kat brüt alanı (dış yüzden)', unit: 'm²', value: r2(plate.area),
    method:
      'Mimarın çizdiği kat genel sınırı (dış duvar ve cam cephe dış yüzü) alanı. Plandaki "Zemin Kat Toplam: 6886.90 m²" notuyla uyumlu. Bağımsız kontrol: duvar ve cam çizgilerinden dış konturun ızgara ölçümü 6.898,5 m² (fark, cam cephe dikme kanatlarından).',
    sources: [{ drawing: GF, where: 'blok 4199_AMH-Alanlar · katman A_Nplt_Area · kat genel sınırı (en büyük kapalı çizgi)' }],
    confidence: 'Yüksek',
    lines: [
      { label: 'Kat genel sınırı alanı', value: r2(plate.area), unit: 'm²', calc: decomposeArea(plate.verts ?? plate.pts.map((q) => ({ ...q, bulge: 0 }))) },
      { label: 'Plandaki not (karşılaştırma)', value: 6886.9, unit: 'm²', note: 'Zemin Kat Toplam (A_Anno_Text_1)', calc: [{ kind: 'değer', unit: 'm²', label: 'not', name: 'plandaki "Zemin Kat Toplam" yazısı', adet: 1, sign: 1, value: 6886.9 }] },
    ],
  });
  items.push({
    poz: 'A.4', group: 'A', name: 'Zemin kat dış çevre uzunluğu', unit: 'm', value: r2(per),
    method: 'Kat genel sınırının çevresi (avlu yarım daireleri dahil, eğriler yay uzunluğuyla).',
    sources: [{ drawing: GF, where: 'blok 4199_AMH-Alanlar · katman A_Nplt_Area · kat genel sınırı' }],
    confidence: 'Yüksek',
    lines: [{ label: 'Kat genel sınırı çevresi', value: r2(per), unit: 'm', calc: perCalc }],
  });

  // --- Duvarlar (A_Patt_Wall taramaları)
  const walls = flat.filter((f) => top(f) === '4199_AMH_Walls_GF' && f.layer === 'A_Patt_Wall' && f.t === 'HATCH' && f.loops);
  type Piece = { t: number; L: number; raw: Raw3; c: P; top: { z: number; where: string } };
  const cls = new Map<number, { n: number; L: number; A: number; ext: number; pcs: Piece[] }>();
  const wallRaws: { raw: Raw3; tc: number }[] = [];
  for (const h of walls) {
    const b = bbox(h.loops![0]);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    // shortcut: yükseklik parçanın orta noktasına göre; iki çatı bölgesine taşan parça tek yükseklik alır
    const wt = wallTop(c);
    const wallRaw = model3d.add({ layer: 'duvar', kind: 'prism', items: ['G.1', 'G.2'], label: 'Duvar (A_Patt_Wall taraması)', loops: h.loops!, z0: 0, z1: wt.z });
    const A = regionArea(h.loops!);
    const Pm = h.loops!.reduce((s, l) => s + length(l, true), 0);
    const disc = (Pm / 2) ** 2 - 4 * A;
    const t = disc > 0 ? (Pm / 2 - Math.sqrt(disc)) / 2 : Math.sqrt(A);
    const L = A / t;
    const tc = Math.max(100, Math.round(t / 50) * 50);
    const ext = plate.pts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < Math.max(1000, L / 2));
    const k = cls.get(tc) ?? { n: 0, L: 0, A: 0, ext: 0, pcs: [] };
    k.pcs.push({ t, L, raw: wallRaw, c, top: wt });
    wallRaws.push({ raw: wallRaw, tc });
    k.n++;
    k.L += L;
    k.A += A;
    if (ext) k.ext += L;
    cls.set(tc, k);
  }
  const mm3 = (x: number) => Math.round(x) / 1000;
  // Birleştirilmez: her parça kendi 3B elemanına bağlı satır (ref) taşır; eleman hem G.1 hem G.2 satırına bağlanır.
  const wallCalc = (k: { pcs: Piece[] }, unit: 'm' | 'm²'): CalcRow[] =>
    k.pcs
      .slice()
      .sort((a, b) => b.L - a.L)
      .map((p) => {
        const en = mm3(p.t);
        const boy = mm3(p.L);
        const row: CalcRow = { kind: 'duvar', unit, label: 'Duvar parçası', adet: 1, en, boy, sign: 1, value: unit === 'm' ? boy : en * boy };
        p.raw.row = [...[p.raw.row ?? []].flat(), row];
        return row;
      });
  const wallLines = [...cls.entries()].sort((a, b) => a[0] - b[0]).map(([tc, k]) => ({
    label: `~${tc / 10} cm kalınlık (${k.n} parça)`,
    value: r2(k.L / 1000),
    unit: 'm',
    note: `taban izi ${r2(k.A / 1e6)} m²; dış kontura yakın ${r2(k.ext / 1000)} m`,
    calc: wallCalc(k, 'm'),
    calcA: wallCalc(k, 'm²'),
  }));
  /** Duvar yüzey alanı kalemleri: kalınlık sınıfı başına G.3.n (inceden kalına). */
  const g3Poz = new Map([...cls.keys()].sort((a, b) => a - b).map((tc, i) => [tc, `G.3.${i + 1}`]));
  for (const w of wallRaws) {
    const label = `~${w.tc / 10} cm kalınlık (${cls.get(w.tc)!.n} parça)`;
    const p3 = g3Poz.get(w.tc)!;
    w.raw.items.unshift(p3); // 3B'de tıklanınca ilk kalem açılır: kalınlık sınıfının yüzey alanı
    w.raw.lines = { 'G.1': label, 'G.2': label, [p3]: 'Duvar yüzleri' };
    w.raw.label = `Duvar ~${w.tc / 10} cm (A_Patt_Wall taraması)`;
  }
  const wallL = [...cls.values()].reduce((s, k) => s + k.L, 0) / 1000;
  const wallA = [...cls.values()].reduce((s, k) => s + k.A, 0) / 1e6;
  items.push({
    poz: 'G.1', group: 'G', name: 'Zemin kat duvarları – toplam uzunluk (eksen)', unit: 'm', value: r2(wallL),
    method:
      'Duvar taraması (katman A_Patt_Wall, ANSI31) her duvar parçası için ayrı bölge. Her bölgenin alanı A ve çevresi P ölçüldü; dikdörtgene eşdeğer kalınlık t = (P/2 − √((P/2)² − 4A)) / 2, uzunluk L = A / t. Kalınlık 5 cm sınıflarına yuvarlandı. Duvar malzemesi paftada belirtilmemiş.',
    sources: [{ drawing: GF, where: 'blok 4199_AMH_Walls_GF · katman A_Patt_Wall (183 tarama)' }],
    confidence: 'Orta',
    lines: wallLines.map(({ calcA: _a, ...l }) => l),
    notes: ['Duvar yüzey alanı kalınlık sınıflarına göre G.3.x kalemlerinde.'],
  });
  items.push({
    poz: 'G.2', group: 'G', name: 'Zemin kat duvarları – taban izi alanı', unit: 'm²', value: r2(wallA),
    method: 'Duvar taramalarının (A_Patt_Wall) toplam alanı.',
    sources: [{ drawing: GF, where: 'blok 4199_AMH_Walls_GF · katman A_Patt_Wall' }],
    confidence: 'Yüksek',
    lines: wallLines.map(({ calcA, ...l }) => ({ ...l, value: r2(Number(l.note.split(' ')[2])), unit: 'm²', note: `uzunluk ${l.value} m`, calc: calcA })),
  });

  // --- Hareketli bölme (movatech bloğu)
  const mov = flat.filter((f) => f.path.includes('movatech_hareetli_panel_plan_01'));
  const trackCalc = mergeRows(mov.filter((f) => f.layer === 'A_Trce_Hidn' && f.pts).flatMap((f) => decomposeLength(f.pts!, !!f.closed)));
  const track = trackCalc.reduce((t, r) => t + r.value, 0);
  for (const t of mov.filter((f) => f.layer === 'A_Trce_Hidn' && f.pts)) model3d.add({ layer: 'donatı', kind: 'ribbon', items: ['G.4', 'G.5'], lines: { 'G.4': 'Ray hattı toplamı' }, label: 'Hareketli bölme rayı', path: t.pts!, closed: !!t.closed, z0: 0, z1: 6.5 });
  const panelCount = (name: string) => mov.filter((f) => f.t === 'INSERT' && f.name === name).length;
  items.push({
    poz: 'G.4', group: 'G', name: 'Hareketli bölme – ray hattı uzunluğu (salonlar arası)', unit: 'm', value: r2(track),
    method: 'Hareketli panel plan bloğundaki ray (gizli çizgi, katman A_Trce_Hidn) uzunlukları toplamı.',
    sources: [{ drawing: GF, where: 'blok movatech_hareetli_panel_plan_01 · katman A_Trce_Hidn' }],
    confidence: 'Yüksek',
    lines: [
      { label: 'Ray hattı toplamı', value: r2(track), unit: 'm', calc: trackCalc },
      { label: 'Standart panel', value: panelCount('standart panel-1'), unit: 'adet' },
      { label: 'Kapalı teleskopik panel', value: panelCount('kapalı teleskopik panel-1'), unit: 'adet' },
      { label: 'Teleskopik panel', value: panelCount('teleskopik panel-1'), unit: 'adet' },
      { label: 'Kapılı panel (tek kanat)', value: panelCount('tek kanat kapı-1'), unit: 'adet' },
    ],
  });
  items.push({
    poz: 'G.5', group: 'G', name: 'Hareketli bölme – panel adedi', unit: 'adet',
    value: ['standart panel-1', 'kapalı teleskopik panel-1', 'teleskopik panel-1', 'tek kanat kapı-1'].reduce((s, n) => s + panelCount(n), 0),
    method: 'Hareketli panel plan bloğundaki panel bloklarının sayımı (standart + teleskopik + kapılı).',
    sources: [{ drawing: GF, where: 'blok movatech_hareetli_panel_plan_01 · panel blokları' }],
    confidence: 'Yüksek',
    lines: ['standart panel-1', 'kapalı teleskopik panel-1', 'teleskopik panel-1', 'tek kanat kapı-1'].map((n) => ({ label: n, value: panelCount(n), unit: 'adet' })),
  });

  // --- Kapılar
  const inPlan = (p: P) => pointInPolygon(p, plate.pts) || plate.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 3000);
  const doors = extractDoors(dxf, flat, /^(4199_AMH_Walls_GF|4199_AMG_Glass new2|salon_giris_kutlesi|vestibule)$/, inPlan);
  const doorGroups = new Map<string, number>();
  for (const d of doors) {
    const k = d.leaves.length === 0 ? 'Kanat yayı olmayan kapı (sürgülü/özel)' : d.leaves.length === 1 ? `Tek kanatlı kapı – kanat ${d.leaves[0] / 10} cm` : `Çift kanatlı kapı – kanatlar ${d.leaves.map((x) => x / 10).join(' + ')} cm`;
    doorGroups.set(k, (doorGroups.get(k) ?? 0) + 1);
  }
  const sorted = [...doorGroups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  /** Kapının bağladığı mahaller (projedeki adlarla); tek mahal varsa dış kapı. */
  const doorPlace = (p: P) => {
    const near = roomsNear(p, 1200).slice(0, 2).map((r) => r.label);
    return near.length === 2 ? `${near[0]} ↔ ${near[1]}` : near.length === 1 ? `${near[0]} – dış kapı` : 'mahal bulunamadı';
  };
  const doorKey = (d: (typeof doors)[number]) => (d.leaves.length === 0 ? 'Kanat yayı olmayan kapı (sürgülü/özel)' : d.leaves.length === 1 ? `Tek kanatlı kapı – kanat ${d.leaves[0] / 10} cm` : `Çift kanatlı kapı – kanatlar ${d.leaves.map((x) => x / 10).join(' + ')} cm`);
  const doorNo = new Map<string, number>();
  for (const d of doors) {
    const k = sorted.findIndex(([kk]) => kk === doorKey(d));
    const n = doorNo.get(doorKey(d)) ?? 0;
    doorNo.set(doorKey(d), n + 1);
    model3d.add({ layer: 'donatı', kind: 'pin', items: [`H.${k + 1}`, `H.${sorted.length + 1}`], lines: { [`H.${k + 1}`]: n }, label: `${doorKey(d)} (blok ${d.name})`, path: [d.at], z0: 0, z1: 2.2 });
  }
  const doorName = (d: Door) => `${doorKey(d)} – ${doorPlace(d.at)}`;
  const pieces = [...cls.values()].flatMap((k) => k.pcs);
  const openings = cutDoorOpenings(doors, wallRaws.map((w) => w.raw), flat, doorName, new Map(pieces.map((p) => [p.raw, p.t])));

  // --- Duvar yüzey alanı (tek yüz), kalınlık sınıfı başına: parça uzunluğu × üstündeki çatıya göre yükseklik ± kapı açıklıkları
  const kot = (z: number) => `+${z.toFixed(2).replace('.', ',')}`;
  const m3 = (x: number) => Math.round(x * 1000) / 1000;
  const tcOf = new Map(wallRaws.map((w) => [w.raw, w.tc]));
  const link = (r: Raw3, row: CalcRow) => (r.row = [...[r.row ?? []].flat(), row]);
  const csum = (rows: CalcRow[]) => rows.reduce((s, r) => s + r.value, 0);
  const LINTEL = 'Kapı üstü lentolar (taraması kapıda kesik)';
  const DOORCUT = 'Eksi: kapı boşlukları (taraması kapıda kesilmemiş)';
  const g3 = [...g3Poz].map(([tc, poz]): TakeoffItem => {
    const k = cls.get(tc)!;
    const face = k.pcs
      .slice()
      .sort((a, b) => b.L - a.L)
      .map((p) => {
        const near = roomsNear(p.c, 3000)[0]?.label;
        const en = mm3(p.L);
        const row: CalcRow = { kind: 'dikdörtgen', label: 'duvar yüzü', name: `${near ? `${near} yanında, ` : ''}±0,00 → ${kot(p.top.z)} (${p.top.where})`, adet: 1, en, boy: p.top.z, sign: 1, value: en * p.top.z };
        link(p.raw, row);
        return row;
      });
    const opRows = (cut: boolean, line: string) =>
      openings
        .filter((o) => o.cut === cut && tcOf.get(o.wall) === tc)
        .map((o) => {
          const [en, boy, sign] = cut ? [m3(o.width), DOOR_H, -1 as const] : [m3(o.width), m3(o.lintel.z1 - DOOR_H), 1 as const];
          const row: CalcRow = { kind: 'dikdörtgen', label: cut ? 'kapı boşluğu' : 'lento', name: `${doorName(o.d)}, ${cut ? `±0,00 → ${kot(DOOR_H)}` : `${kot(DOOR_H)} → ${kot(o.lintel.z1)}`}`, adet: 1, en, boy, sign, value: sign * en * boy };
          if (!o.lintel.items.includes(poz)) o.lintel.items.push(poz);
          o.lintel.lines = { ...o.lintel.lines, [poz]: line };
          link(o.lintel, row);
          return row;
        });
    const lintels = opRows(false, LINTEL);
    const cuts = opRows(true, DOORCUT);
    const total = csum(face) + csum(lintels) + csum(cuts);
    return {
      poz, group: 'G', name: `Zemin kat duvarı ~${tc / 10} cm – yüzey alanı (tek yüz)`, unit: 'm²', value: r2(total),
      method:
        `~${tc / 10} cm sınıfındaki her duvar parçasının (A_Patt_Wall taraması, uzunluğu G.1'deki gibi L = A / t) uzunluğu × yüksekliği. Yükseklik, parçanın üstündeki çatının döşeme kotundan: +3,70 alçak çatıların altında 3,70 m, diğer yerlerde (teras, salonlar) 7,10 m; salonlarda +7,10 üstündeki kabuk duvar C.4'te ayrı. Taraması kapıda kesik olan kapıların üstüne lento eklendi (kapı genişliği × (yükseklik − ${kot(DOOR_H).slice(1)})); taraması kapıdan kesilmeden geçen kapılarda kapı boşluğu düşüldü (genişlik × ${kot(DOOR_H).slice(1)}). Kapı genişliği, kapı bloğu çizgilerinin duvar boyunca uzanımı. Tek yüz alanıdır; sıva/boya için iki yüz ayrıca hesaplanmalı.`,
      sources: [
        { drawing: GF, where: 'blok 4199_AMH_Walls_GF · katman A_Patt_Wall · kapı blokları A_Door_Wood' },
        { drawing: '4199-A-DD-01-02-300', where: 'çatı planı · +3,70 alçak çatı kutuları, +7,10 teras kotu' },
      ],
      confidence: 'Orta',
      lines: [
        { label: 'Duvar yüzleri', value: r2(csum(face)), unit: 'm²', note: `${k.n} parça · toplam uzunluk ${r2(k.L / 1000)} m`, calc: face },
        ...(lintels.length ? [{ label: LINTEL, value: r2(csum(lintels)), unit: 'm²', note: `${lintels.length} kapı`, calc: lintels }] : []),
        ...(cuts.length ? [{ label: DOORCUT, value: r2(csum(cuts)), unit: 'm²', note: `${cuts.length} kapı`, calc: cuts }] : []),
      ],
      notes: [
        'Duvar yüksekliği döşeme üst kotuna kadar alındı; döşeme kalınlığı düşülmedi.',
        'Asma kat (+3,80) altındaki duvarlar ayrılmadı; orada da çatı kotu alındı.',
        `Kapı yüksekliği ${kot(DOOR_H).slice(1)} m varsayıldı (planda yok). Pencere/cam bölme açıklıkları düşülmedi (duvar taramasında zaten yoklar).`,
      ],
    };
  });
  items.push(...g3, {
    poz: 'G.3', group: 'G', name: 'Zemin kat duvarları – yüzey alanı toplamı (tek yüz)', unit: 'm²', value: r2(g3.reduce((s, i) => s + (i.value ?? 0), 0)),
    formula: g3.map((i) => i.poz).join(' + '),
    method: 'Kalınlık sınıflarına göre duvar yüzey alanı kalemlerinin toplamı.', sources: [], confidence: 'Orta', lines: [],
  });
  sorted.forEach(([k, n], i) => {
    items.push({
      poz: `H.${i + 1}`, group: 'H', name: k, unit: 'adet', value: n,
      method: 'Kapı blokları (katman A_Door_Wood) sayıldı. Kanat genişliği, blok tanımındaki açılım yayının yarıçapından ölçüldü (ekleme ölçeği dahil); yay sayısı kanat sayısını verir.',
      sources: [{ drawing: GF, where: 'bloklar 4199_AMH_Walls_GF / 4199_AMG_Glass new2 / salon_giris_kutlesi · katman A_Door_Wood' }],
      confidence: 'Yüksek',
      lines: doors.filter((d) => {
        const kk = d.leaves.length === 0 ? 'Kanat yayı olmayan kapı (sürgülü/özel)' : d.leaves.length === 1 ? `Tek kanatlı kapı – kanat ${d.leaves[0] / 10} cm` : `Çift kanatlı kapı – kanatlar ${d.leaves.map((x) => x / 10).join(' + ')} cm`;
        return kk === k;
      }).map((d) => ({ label: doorPlace(d.at), value: 1, unit: 'adet', note: `blok ${d.name} · konum x=${(d.at.x / 1000).toFixed(1)} y=${(d.at.y / 1000).toFixed(1)} m (${d.block})` })),
    });
  });
  items.push({
    poz: `H.${sorted.length + 1}`, group: 'H', name: 'Toplam kapı (zemin kat)', unit: 'adet', value: doors.length,
    formula: sorted.map((_, i) => `H.${i + 1}`).join(' + '),
    method: 'Zemin kat kapı kalemlerinin toplamı.', sources: [], confidence: 'Yüksek', lines: [],
  });

  // --- Taşıyıcı kesitler
  const stAll = flat.filter((f) => top(f) === 'STRUCTURE_GF_NN' && f.layer === 'A_Stuc_Conc' && f.closed && f.pts);
  // planda üst üste çizilmiş kesitler bir kez sayılır (aynı merkez ±5 cm, aynı alan ±%2)
  const mid = (f: Flat) => { const b = bbox(f.pts!); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; };
  const st = stAll.filter((f, i) => !stAll.slice(0, i).some((g) => Math.hypot(mid(f).x - mid(g).x, mid(f).y - mid(g).y) < 50 && Math.abs(area(f.pts!) - area(g.pts!)) < 0.02 * area(f.pts!)));
  const stDup = stAll.length - st.length;
  const kinds = new Map<string, { n: number; inside: number; A: number; calc: CalcRow[]; pts: P[][] }>();
  for (const f of st) {
    const A = area(f.pts!) / 1e6;
    const b = bbox(f.pts!);
    const w = (b.maxX - b.minX) / 10;
    let k: string;
    if (f.t === 'CIRCLE') k = `Betonarme kolon Ø${Math.round(w)} (dairesel)`;
    else if (Math.abs(A - 0.36) < 0.02) k = 'Betonarme kolon 60×60';
    else if (A < 0.6) k = `Betonarme kolon – diğer kesit ${A.toFixed(2)} m²`;
    else k = `Betonarme perde – kesit ${A.toFixed(2)} m²`;
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const e = kinds.get(k) ?? { n: 0, inside: 0, A: 0, calc: [], pts: [] as P[][] };
    e.pts.push(f.pts!);
    const rows = decomposeRegion([f.pts!]);
    e.calc = mergeRows([...e.calc, ...rows]);
    e.n++;
    e.A += rows.reduce((t, r) => t + r.value, 0);
    if (pointInPolygon(c, plate.pts)) e.inside++;
    kinds.set(k, e);
  }
  [...kinds.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, e], i) => {
    for (const p of e.pts) {
      const b = bbox(p);
      const inside = pointInPolygon({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, plate.pts);
      model3d.add({ layer: 'kolon', kind: 'prism', items: [`I.${i + 1}`], lines: { [`I.${i + 1}`]: inside ? 'Bina konturu içinde' : 'Bina konturu dışında (saçak/kanopi altı)' }, label: k, loops: [p], z0: 0, z1: 7.1 });
    }
    items.push({
      poz: `I.${i + 1}`, group: 'I', name: k, unit: 'adet', value: e.n,
      method: `Zemin kat taşıyıcı bloğundaki kapalı kesitler (katman A_Stuc_Conc) sayıldı ve kesit alanına göre sınıflandı.${stDup ? ` Planda üst üste iki kez çizilmiş ${stDup} kesit (aynı merkez, aynı alan) bir kez sayıldı.` : ''} Bilgi amaçlıdır; kesin değerler statik projeden alınır.`,
      sources: [{ drawing: GF, where: 'blok STRUCTURE_GF_NN · katman A_Stuc_Conc' }],
      confidence: 'Yüksek',
      lines: [
        { label: 'Bina konturu içinde', value: e.inside, unit: 'adet' },
        { label: 'Bina konturu dışında (saçak/kanopi altı)', value: e.n - e.inside, unit: 'adet' },
        { label: 'Toplam kesit alanı', value: r2(e.A), unit: 'm²', calc: e.calc },
      ],
    });
  });
  // --- Islak hacimler: kompakt laminat kabin kapıları (yay sayısı) ve klozetler
  const inB = (f: Flat) => !!f.pts && f.pts.some((p) => pointInPolygon(p, plate.pts));
  const cabinDoors = flat.filter((f) => f.layer === '_kompakt laminat' && f.t === 'ARC' && inB(f));
  const cabinPanels = flat.filter((f) => f.layer === '_kompakt laminat' && f.t === 'PLINE' && inB(f));
  for (const a of cabinDoors) model3d.add({ layer: 'donatı', kind: 'pin', items: ['J.1'], lines: { 'J.1': 'Kabin kapısı (açılım yayı)' }, label: 'WC kabin kapısı', path: [a.pts![0]], z0: 0, z1: 2.0 });
  items.push({
    poz: 'J.1', group: 'J', name: 'WC kabini – kompakt laminat (kabin kapısı adedi)', unit: 'adet', value: cabinDoors.length,
    method: 'Kompakt laminat katmanındaki (_kompakt laminat) kabin kapısı açılım yayları sayıldı; her yay bir kabin kapısıdır. Kabin bölme panelleri planda ayrıca çizgi olarak görünür.',
    sources: [{ drawing: GF, where: 'katman _kompakt laminat (WC modül blokları *U208, *U209 ve model alanı)' }],
    confidence: 'Orta',
    lines: [
      { label: 'Kabin kapısı (açılım yayı)', value: cabinDoors.length, unit: 'adet' },
      { label: 'Kapı kanadı çizgisi (kontrol)', value: cabinPanels.length, unit: 'adet' },
    ],
    notes: ['Bazı kabinlerde klozet sembolü yok (ör. engelli/temizlik kabini olabilir); kabin sayısı kapılardan alındı.'],
  });
  const wcSym = flat.filter((f) => f.t === 'INSERT' && f.name === 'A$C34C557C7' && f.at && pointInPolygon(f.at, plate.pts));
  const wcOther = flat.filter((f) => f.t === 'INSERT' && /^(Klozet_Duravit|ada closet set-flat-1)$/.test(f.name ?? '') && f.at && pointInPolygon(f.at, plate.pts));
  for (const w of [...wcSym, ...wcOther]) model3d.add({ layer: 'donatı', kind: 'pin', items: ['J.2'], lines: { 'J.2': w.name === 'A$C34C557C7' ? 'Kabin içi klozet (A$C34C557C7)' : w.name! }, label: `Klozet (${w.name})`, path: [w.at!], z0: 0, z1: 0.8 });
  items.push({
    poz: 'J.2', group: 'J', name: 'Klozet (asma, kabin içi + engelli/kulis WC)', unit: 'adet', value: wcSym.length + wcOther.length,
    method: 'Kabin içi klozet sembol blokları (A$C34C557C7) ile kulis/engelli WC klozet blokları (Klozet_Duravit, ada closet set) bina konturu içinde sayıldı.',
    sources: [{ drawing: GF, where: 'bloklar A$C34C557C7, Klozet_Duravit, ada closet set-flat-1 · katman A_Anno_Symb_Furn / A_Furn_Sanr' }],
    confidence: 'Orta',
    lines: [
      { label: 'Kabin içi klozet (A$C34C557C7)', value: wcSym.length, unit: 'adet' },
      ...[...new Set(wcOther.map((f) => f.name!))].map((n) => ({ label: n, value: wcOther.filter((f) => f.name === n).length, unit: 'adet' })),
    ],
    notes: ['Lavabo ve pisuvarlar WC modüllerinde bloksuz çizgi olarak çizilmiş; adetleri bu çalışmada sayılmadı (görsel sayım gerekli).'],
  });
  return items;
}
