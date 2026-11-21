// Metrajı DWG'lerden baştan üretir → work/metraj.json + work/MSK_Metraj_DWG.xlsx
// Kullanım: node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs scripts/takeoff/metraj/build.ts
import { existsSync, writeFileSync } from 'node:fs';
import { readDxf } from '../lib/dxf';
import { flatten } from '../lib/flatten';
import { makeMeasurer } from '../lib/regions';
import { gfItems } from './gf-items';
import { model3d } from './model3d';
import { setRooms } from './rooms-index';
import { bbox } from '../lib/geom';
import type { CalcRow } from '../lib/decompose';
import type { Takeoff, TakeoffItem } from './model';
import { writeReport } from './report';
import { buildGfRooms } from './rooms-gf';
import { evaluate } from '../../../shared/formula/evaluate';
import { parseFormula } from '../../../shared/formula/parse';

const GROUPS = [
  { key: 'A', title: 'GENEL ALANLAR' },
  { key: 'B', title: 'ÇATI' },
  { key: 'C', title: 'CEPHE' },
  { key: 'D', title: 'TAVANLAR' },
  { key: 'F', title: 'DÖŞEME, TEMEL, DIŞ MEKÂN' },
  { key: 'G', title: 'DUVARLAR VE BÖLMELER' },
  { key: 'H', title: 'KAPILAR' },
  { key: 'I', title: 'TAŞIYICI ELEMANLAR (bilgi amaçlı – statik projeye göre kesinleşir)' },
  { key: 'J', title: 'ISLAK HACİMLER' },
];

async function main() {
  const t0 = Date.now();
  const gfDxf = readDxf('work/dxf/4199-A-DD-01-02-100.dxf');
  const gfFlat = flatten(gfDxf);
  const measure = makeMeasurer(gfFlat);
  const gf = buildGfRooms(gfFlat, measure);
  if (!gf.plate) throw new Error('Kat genel sınırı bulunamadı');
  // satır açıklamalarında projedeki mahal adları için (zemin kat mahalleri, aynı çizim çerçevesi)
  setRooms(gf.rows.filter((r) => r.floor === 'Zemin Kat' && gf.shapes.has(r.id)).map((r) => ({ code: r.code, name: r.name, pts: gf.shapes.get(r.id)! })));
  const items: TakeoffItem[] = [...gfItems(gfDxf, gfFlat, gf.rows, gf.plate)];
  const findings: Takeoff['findings'] = gf.notes.map((n) => ({ topic: 'Mahal alanı', drawings: '4199-A-DD-01-02-100', finding: n, suggestion: 'Mahal sınırını/etiketini düzeltin.' }));

  // Döşeme kaplaması: halı salonlarda (döşeme detayı HALI KAPLAMA), diğer mahaller ID projesine göre
  const carpet = gf.rows.filter((r) => /^(KÜÇÜK )?SALON \d+$/.test(r.name));
  carpet.forEach((r) => (r.flooring = 'Halı kaplama'));
  gf.rows.filter((r) => r.floor === 'Zemin Kat' && !carpet.includes(r)).forEach((r) => (r.flooring = 'ID projesine göre'));
  // 3B: döşeme plağı ve mahaller (asma kat çizimde +465,3 m doğuya kaydırılmış → geri; döşeme +3,80)
  model3d.add({ layer: 'döşeme', kind: 'prism', items: ['A.3', 'A.4'], lines: { 'A.3': 'Kat genel sınırı alanı', 'A.4': 'Kat genel sınırı çevresi' }, label: 'Zemin kat döşemesi (kat genel sınırı)', loops: [gf.plate.pts], z0: -0.3, z1: 0 });
  for (const r of gf.rows) {
    const sh = gf.shapes.get(r.id);
    if (!sh) continue;
    const mf = r.floor !== 'Zemin Kat';
    const dx = bbox(sh).minX > 1000e3 ? -465300 : 0;
    const z = mf ? 3.8 : 0.01;
    model3d.add({ layer: 'mahal', kind: 'flat', items: mf ? ['A.2'] : carpet.includes(r) ? ['A.1', 'F.1'] : ['A.1', 'F.2'], lines: mf ? { 'A.2': `${r.code} ${r.name}`.trim() } : carpet.includes(r) ? { 'A.1': `${r.code} ${r.name}`.trim(), 'F.1': `${r.code} ${r.name}` } : { 'A.1': `${r.code} ${r.name}`.trim() }, label: `${r.code} ${r.name} – ${r.area.toFixed(2)} m²`, loops: [sh.map((p) => ({ x: p.x + dx, y: p.y }))], z0: z, z1: z });
  }
  items.push({
    poz: 'F.1', group: 'F', name: 'Halı kaplama – salonlar ve küçük salonlar', unit: 'm²', value: Math.round(carpet.reduce((s, r) => s + r.area, 0) * 100) / 100,
    method: 'Döşeme detayında (00-09-100) HALI KAPLAMA / ŞAP / SAHA BETONU dizilimi salon kesitinde gösteriliyor. Halı, Salon 01/02/03 ve Küçük Salon 01/02/03 mahallerinin net alanlarına (mahal sınırlarından) uygulandı.',
    sources: [{ drawing: '4199-A-DD-00-09-100', where: 'döşeme dizilimi (HALI KAPLAMA 10 mm)' }, { drawing: '4199-A-DD-01-02-100', where: 'mahal sınırları A_Nplt_Area' }],
    confidence: 'Orta', lines: carpet.map((r) => ({ label: `${r.code} ${r.name}`, value: Math.round(r.area * 100) / 100, unit: 'm²', calc: r.calc })),
    notes: ['Detay yalnız salon kesitinde; küçük salonlarda da halı varsayıldı.'],
  });
  items.push({
    poz: 'F.2', group: 'F', name: 'Diğer mahaller – döşeme kaplaması (tür ID projesine göre)', unit: 'm²', value: null, formula: 'A.1 - F.1',
    method: 'Zemin kat net alanından halı alanı çıkarıldı. Kaplama türü mimari paftalarda tanımlı değil (Genel not: ID projesine göre).', sources: [], confidence: 'Orta', lines: [],
  });

  // Çatı planı
  if (existsSync('scripts/takeoff/metraj/roof-items.ts')) {
    const { roofItems } = await import('./roof-items');
    const r = roofItems();
    items.push(...r.items);
    findings.push(...r.findings);
  }

  // Tavan planları
  if (existsSync('scripts/takeoff/metraj/ceiling-items.ts')) {
    const { ceilingItems } = await import('./ceiling-items');
    const c = ceilingItems();
    items.push(...c.items);
    findings.push(...c.findings);
    for (const r of gf.rows) {
      const k = c.roomCeilings[`${r.code} ${r.name}`] ?? c.roomCeilings[r.code];
      if (k) Object.assign(r, { ceilingLower: k.lower, ceilingUpper: k.upper, ch: k.ch });
    }
  }

  for (const [file, fn] of [['facade-items', 'facadeItems'], ['layer-items', 'layerItems']] as const) {
    if (!existsSync(`scripts/takeoff/metraj/${file}.ts`)) continue;
    const mod = (await import(`./${file}`)) as Record<string, () => { items: TakeoffItem[]; findings: Takeoff['findings'] }>;
    const r = mod[fn]();
    items.push(...r.items);
    findings.push(...r.findings);
  }

  // Formüllü kalemlerin değerleri (uygulamadaki formül diliyle)
  const vals: Record<string, number | null> = Object.fromEntries(items.filter((i) => !i.formula).map((i) => [i.poz, i.value]));
  for (let pass = 0; pass < 10; pass++) {
    for (const i of items.filter((x) => x.formula)) {
      try {
        i.value = evaluate(parseFormula(i.formula!), { item: (id) => (id in vals ? vals[id] : undefined), rooms: [], facade: [] });
        if (i.value !== null) i.value = Math.round(i.value * 100) / 100;
        vals[i.poz] = i.value;
      } catch {
        /* bağımlı kalem henüz hesaplanmadı */
      }
    }
  }
  const formulaDone = new Set<string>();
  // "uzunluk × yükseklik" formülleri (ör. B.7 * 0,45): uzunluk kaleminin parçaları × yükseklik cetveli
  for (const i of items) {
    const m = /^([A-Z]\.\d+(?:\.\d+)?) \* (\d+(?:,\d+)?)$/.exec(i.formula ?? '');
    const ref = m ? items.find((x) => x.poz === m[1]) : undefined;
    if (!m || !ref || ref.unit !== 'm' || i.unit !== 'm²') continue;
    const h = Number(m[2].replace(',', '.'));
    const calc: CalcRow[] = ref.lines.flatMap((l) =>
      (l.calc?.length ? l.calc.map((r) => ({ adet: r.adet, L: r.value / r.adet })) : l.value ? [{ adet: 1, L: l.value }] : []).map(({ adet, L }) => {
        const boy = Math.round(L * 1000) / 1000;
        return { kind: 'dikdörtgen' as const, label: l.label, name: l.label, adet, en: h, boy, sign: 1 as const, value: adet * h * boy };
      }),
    );
    const v = Math.round(calc.reduce((s, r) => s + r.value, 0) * 100) / 100;
    i.lines.unshift({ label: `${ref.poz} ${ref.name} × ${m[2]} m`, value: v, unit: 'm²', note: `her parça: yükseklik ${m[2]} m × ${ref.poz} satırındaki uzunluk`, calc });
    formulaDone.add(i.poz);
  }
  // diğer formüller (ör. "B.3 + B.4", "A.1 - F.1", "C.4 * 2"): her terim bir 'kalem' satırı
  for (const i of items) {
    if (!i.formula || formulaDone.has(i.poz)) continue;
    const terms = i.formula.split(/\s*(?=[+-]\s)/).map((t) => t.trim());
    const calc: CalcRow[] = [];
    for (const t of terms) {
      const m = /^([+-])?\s*([A-Z]\.\d+(?:\.\d+)?)(?:\s*\*\s*(\d+(?:,\d+)?))?$/.exec(t);
      const ref = m ? items.find((x) => x.poz === m[2]) : undefined;
      if (!m || !ref || ref.value === null) {
        calc.length = 0;
        break;
      }
      const sign = m[1] === '-' ? -1 : 1;
      const n = m[3] ? Number(m[3].replace(',', '.')) : 1;
      calc.push({ kind: 'kalem', unit: i.unit, label: ref.poz, name: `${ref.poz} ${ref.name}`, adet: n, sign, value: sign * n * ref.value });
    }
    if (calc.length) i.lines.unshift({ label: `Formül: ${i.formula}`, value: Math.round(calc.reduce((s, r) => s + r.value, 0) * 100) / 100, unit: i.unit, note: 'başvurulan kalemlerin güncel miktarları', calc });
  }
  for (const i of items) {
    i.lines.forEach((l, k) => {
      if (l.calc?.length || l.value === null) return;
      // ara toplam satırları: önceki satırların toplamı
      if (l.note?.startsWith('yukarıdaki')) {
        const only = l.note.includes('karşılaştırma');
        l.calc = i.lines.slice(0, k).filter((p) => p.value !== null && p.unit === l.unit && (!only || p.label.startsWith('Karşılaştırma'))).map((p) => ({ kind: 'kalem' as const, unit: p.unit, label: p.label, name: p.label, adet: 1, sign: ((p.value ?? 0) < 0 ? -1 : 1) as 1 | -1, value: p.value ?? 0 }));
        return;
      }
      // sayım satırları
      if (l.unit === 'adet') l.calc = [{ kind: 'sayım', unit: 'adet', label: l.label, adet: l.value, sign: 1, value: l.value }];
    });
  }
  for (const i of items.filter((x) => x.formula && !(x.poz in vals))) findings.push({ topic: 'Formül', drawings: '-', finding: `${i.poz} formülü hesaplanamadı: ${i.formula}`, suggestion: 'Başvurulan kalemi kontrol edin.' });

  const origin = (() => { const b = bbox(gf.plate!.pts); return { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) }; })();
  const m3 = model3d.build(origin);
  writeFileSync('work/model3d.json', JSON.stringify(m3));
  console.log(`3B model: ${m3.elements.length} eleman`);
  // 3B eleman → hesap detayı satırı bağlantılarının hepsi gerçek bir satıra düşmeli
  const miss: string[] = [];
  for (const e of m3.elements)
    for (const [poz, ref] of Object.entries(e.lines ?? {})) {
      const it = items.find((x) => x.poz === poz);
      const ok = !!it && (typeof ref === 'number' ? ref < it.lines.length : it.lines.some((l) => l.label === ref));
      if (!ok) miss.push(`${poz} ← ${e.label} (${ref})`);
    }
  const linked = m3.elements.filter((e) => e.lines && Object.keys(e.lines).length).length;
  console.log(`3B satır bağlantısı: ${linked}/${m3.elements.length} eleman${miss.length ? `, ${miss.length} hatalı` : ''}`);
  if (miss.length) throw new Error('3B satır bağlantısı tutmuyor:\n' + [...new Set(miss)].slice(0, 15).join('\n'));

  const order = (p: string) => p.split('.').map((x) => (/^\d+$/.test(x) ? x.padStart(4, '0') : x)).join('.');
  items.sort((a, b) => order(a.poz).localeCompare(order(b.poz)));
  const takeoff: Takeoff = {
    generatedAt: new Date().toISOString(),
    groups: GROUPS,
    items,
    rooms: gf.rows,
    findings,
    method: [
      'Kaynak: 261102_4199_MSK-Kesin Proje Teslim, 40 DWG pafta. DWG\'lerin kopyaları AutoCAD 2027 (komut satırı, salt okunur) ile DXF\'e çevrildi; orijinal dosyalara dokunulmadı.',
      'Aynı paftanın 4 zone dosyası birebir aynı model alanını içeriyor; her pafta türü tek modelden ölçüldü. Zone birleştirme ve bindirme bölgesi sorunu yoktur.',
      'Bloklar iç içe açılarak tüm çizim nesneleri dünya koordinatına (mm) getirildi. Uzunluklar yay ve eğriler 1° örneklemle (hata < %0,005), alanlar kapalı çizgi ve tarama sınırlarından hesaplandı.',
      'Her kalemin "Hesap Detayı" sayfasında satır satır dökümü ve kullanılan pafta/blok/katman bilgisi vardır.',
      'Önceki ön metraj Excel\'indeki miktarlar kullanılmadı.',
    ],
  };
  writeFileSync('work/metraj.json', JSON.stringify(takeoff, null, 1));
  await writeReport(takeoff, 'work/MSK_Metraj_DWG.xlsx');
  console.log(`${items.length} kalem, ${gf.rows.length} mahal, ${findings.length} kontrol notu · ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
  for (const i of items) console.log(`${i.poz.padEnd(6)} ${i.name.slice(0, 60).padEnd(60)} ${String(i.value).padStart(10)} ${i.unit}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
