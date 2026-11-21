// Zemin kat planından (01-02-100) çıkan kalemler: alanlar, duvarlar, kapılar, taşıyıcılar, hareketli bölme.
import { extractDoors } from '../doors';
import type { RawDxf } from '../lib/dxf';
import type { Flat } from '../lib/flatten';
import { area, bbox, length, pointInPolygon, regionArea, type P } from '../lib/geom';
import type { RoomRow, TakeoffItem } from './model';

const GF = '4199-A-DD-01-02-100';
const r2 = (v: number) => Math.round(v * 100) / 100;

export function gfItems(dxf: RawDxf, flat: Flat[], rooms: RoomRow[], plate: { pts: P[]; area: number }): TakeoffItem[] {
  const items: TakeoffItem[] = [];
  const top = (f: Flat) => f.path[0] ?? '';
  const gfRooms = rooms.filter((r) => r.floor === 'Zemin Kat');
  const mfRooms = rooms.filter((r) => r.floor !== 'Zemin Kat');
  const roomLine = (r: RoomRow) => ({
    label: `${r.code.startsWith('SINIR') ? r.code : r.code} ${r.name}`.trim(),
    value: r2(r.area),
    unit: 'm²',
    note: r.areaSource === 'sınır' ? 'mahal sınır çizgisinden (A_Nplt_Area)' : r.areaSource === 'etiket' ? 'mahal sınırı yok; etiket alanı (kontrol ölçümüyle doğrulandı)' : 'duvar iç yüzlerinden ölçüm',
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
  const per = length(plate.pts, true) / 1000;
  items.push({
    poz: 'A.3', group: 'A', name: 'Zemin kat brüt alanı (dış yüzden)', unit: 'm²', value: r2(plate.area),
    method:
      'Mimarın çizdiği kat genel sınırı (dış duvar ve cam cephe dış yüzü) alanı. Plandaki "Zemin Kat Toplam: 6886.90 m²" notuyla uyumlu. Bağımsız kontrol: duvar ve cam çizgilerinden dış konturun ızgara ölçümü 6.898,5 m² (fark, cam cephe dikme kanatlarından).',
    sources: [{ drawing: GF, where: 'blok 4199_AMH-Alanlar · katman A_Nplt_Area · kat genel sınırı (en büyük kapalı çizgi)' }],
    confidence: 'Yüksek',
    lines: [
      { label: 'Kat genel sınırı alanı', value: r2(plate.area), unit: 'm²' },
      { label: 'Plandaki not', value: 6886.9, unit: 'm²', note: 'Zemin Kat Toplam (A_Anno_Text_1)' },
    ],
  });
  items.push({
    poz: 'A.4', group: 'A', name: 'Zemin kat dış çevre uzunluğu', unit: 'm', value: r2(per),
    method: 'Kat genel sınırının çevresi (avlu yarım daireleri dahil, eğriler yay uzunluğuyla).',
    sources: [{ drawing: GF, where: 'blok 4199_AMH-Alanlar · katman A_Nplt_Area · kat genel sınırı' }],
    confidence: 'Yüksek',
    lines: [{ label: 'Kat genel sınırı çevresi', value: r2(per), unit: 'm' }],
  });

  // --- Duvarlar (A_Patt_Wall taramaları)
  const walls = flat.filter((f) => top(f) === '4199_AMH_Walls_GF' && f.layer === 'A_Patt_Wall' && f.t === 'HATCH' && f.loops);
  const cls = new Map<number, { n: number; L: number; A: number; ext: number }>();
  for (const h of walls) {
    const A = regionArea(h.loops!);
    const Pm = h.loops!.reduce((s, l) => s + length(l, true), 0);
    const disc = (Pm / 2) ** 2 - 4 * A;
    const t = disc > 0 ? (Pm / 2 - Math.sqrt(disc)) / 2 : Math.sqrt(A);
    const L = A / t;
    const tc = Math.max(100, Math.round(t / 50) * 50);
    const b = bbox(h.loops![0]);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const ext = plate.pts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < Math.max(1000, L / 2));
    const k = cls.get(tc) ?? { n: 0, L: 0, A: 0, ext: 0 };
    k.n++;
    k.L += L;
    k.A += A;
    if (ext) k.ext += L;
    cls.set(tc, k);
  }
  const wallLines = [...cls.entries()].sort((a, b) => a[0] - b[0]).map(([tc, k]) => ({
    label: `~${tc / 10} cm kalınlık (${k.n} parça)`,
    value: r2(k.L / 1000),
    unit: 'm',
    note: `taban izi ${r2(k.A / 1e6)} m²; dış kontura yakın ${r2(k.ext / 1000)} m`,
  }));
  const wallL = [...cls.values()].reduce((s, k) => s + k.L, 0) / 1000;
  const wallA = [...cls.values()].reduce((s, k) => s + k.A, 0) / 1e6;
  items.push({
    poz: 'G.1', group: 'G', name: 'Zemin kat duvarları – toplam uzunluk (eksen)', unit: 'm', value: r2(wallL),
    method:
      'Duvar taraması (katman A_Patt_Wall, ANSI31) her duvar parçası için ayrı bölge. Her bölgenin alanı A ve çevresi P ölçüldü; dikdörtgene eşdeğer kalınlık t = (P/2 − √((P/2)² − 4A)) / 2, uzunluk L = A / t. Kalınlık 5 cm sınıflarına yuvarlandı. Duvar malzemesi paftada belirtilmemiş.',
    sources: [{ drawing: GF, where: 'blok 4199_AMH_Walls_GF · katman A_Patt_Wall (183 tarama)' }],
    confidence: 'Orta',
    lines: wallLines,
    notes: ['Duvar yüzey alanı için duvar yükseklikleri kesitlerden alınmalı (bkz. G.3).'],
  });
  items.push({
    poz: 'G.2', group: 'G', name: 'Zemin kat duvarları – taban izi alanı', unit: 'm²', value: r2(wallA),
    method: 'Duvar taramalarının (A_Patt_Wall) toplam alanı.',
    sources: [{ drawing: GF, where: 'blok 4199_AMH_Walls_GF · katman A_Patt_Wall' }],
    confidence: 'Yüksek',
    lines: wallLines.map((l) => ({ ...l, value: r2(Number(l.note.split(' ')[2])), unit: 'm²', note: `uzunluk ${l.value} m` })),
  });

  // --- Hareketli bölme (movatech bloğu)
  const mov = flat.filter((f) => f.path.includes('movatech_hareetli_panel_plan_01'));
  const track = mov.filter((f) => f.layer === 'A_Trce_Hidn' && f.pts).reduce((s, f) => s + length(f.pts!), 0) / 1000;
  const panelCount = (name: string) => mov.filter((f) => f.t === 'INSERT' && f.name === name).length;
  items.push({
    poz: 'G.4', group: 'G', name: 'Hareketli bölme – ray hattı uzunluğu (salonlar arası)', unit: 'm', value: r2(track),
    method: 'Hareketli panel plan bloğundaki ray (gizli çizgi, katman A_Trce_Hidn) uzunlukları toplamı.',
    sources: [{ drawing: GF, where: 'blok movatech_hareetli_panel_plan_01 · katman A_Trce_Hidn' }],
    confidence: 'Yüksek',
    lines: [
      { label: 'Ray hattı toplamı', value: r2(track), unit: 'm' },
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
  sorted.forEach(([k, n], i) => {
    items.push({
      poz: `H.${i + 1}`, group: 'H', name: k, unit: 'adet', value: n,
      method: 'Kapı blokları (katman A_Door_Wood) sayıldı. Kanat genişliği, blok tanımındaki açılım yayının yarıçapından ölçüldü (ekleme ölçeği dahil); yay sayısı kanat sayısını verir.',
      sources: [{ drawing: GF, where: 'bloklar 4199_AMH_Walls_GF / 4199_AMG_Glass new2 / salon_giris_kutlesi · katman A_Door_Wood' }],
      confidence: 'Yüksek',
      lines: doors.filter((d) => {
        const kk = d.leaves.length === 0 ? 'Kanat yayı olmayan kapı (sürgülü/özel)' : d.leaves.length === 1 ? `Tek kanatlı kapı – kanat ${d.leaves[0] / 10} cm` : `Çift kanatlı kapı – kanatlar ${d.leaves.map((x) => x / 10).join(' + ')} cm`;
        return kk === k;
      }).map((d) => ({ label: `blok ${d.name}`, value: 1, unit: 'adet', note: `konum x=${(d.at.x / 1000).toFixed(1)} y=${(d.at.y / 1000).toFixed(1)} m (${d.block})` })),
    });
  });
  items.push({
    poz: `H.${sorted.length + 1}`, group: 'H', name: 'Toplam kapı (zemin kat)', unit: 'adet', value: doors.length,
    formula: sorted.map((_, i) => `H.${i + 1}`).join(' + '),
    method: 'Zemin kat kapı kalemlerinin toplamı.', sources: [], confidence: 'Yüksek', lines: [],
  });

  // --- Taşıyıcı kesitler
  const st = flat.filter((f) => top(f) === 'STRUCTURE_GF_NN' && f.layer === 'A_Stuc_Conc' && f.closed && f.pts);
  const kinds = new Map<string, { n: number; inside: number; A: number }>();
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
    const e = kinds.get(k) ?? { n: 0, inside: 0, A: 0 };
    e.n++;
    e.A += A;
    if (pointInPolygon(c, plate.pts)) e.inside++;
    kinds.set(k, e);
  }
  [...kinds.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, e], i) => {
    items.push({
      poz: `I.${i + 1}`, group: 'I', name: k, unit: 'adet', value: e.n,
      method: 'Zemin kat taşıyıcı bloğundaki kapalı kesitler (katman A_Stuc_Conc) sayıldı ve kesit alanına göre sınıflandı. Bilgi amaçlıdır; kesin değerler statik projeden alınır.',
      sources: [{ drawing: GF, where: 'blok STRUCTURE_GF_NN · katman A_Stuc_Conc' }],
      confidence: 'Yüksek',
      lines: [
        { label: 'Bina konturu içinde', value: e.inside, unit: 'adet' },
        { label: 'Bina konturu dışında (saçak/kanopi altı)', value: e.n - e.inside, unit: 'adet' },
        { label: 'Toplam kesit alanı', value: r2(e.A), unit: 'm²' },
      ],
    });
  });
  // --- Islak hacimler: kompakt laminat kabin kapıları (yay sayısı) ve klozetler
  const inB = (f: Flat) => !!f.pts && f.pts.some((p) => pointInPolygon(p, plate.pts));
  const cabinDoors = flat.filter((f) => f.layer === '_kompakt laminat' && f.t === 'ARC' && inB(f));
  const cabinPanels = flat.filter((f) => f.layer === '_kompakt laminat' && f.t === 'PLINE' && inB(f));
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
