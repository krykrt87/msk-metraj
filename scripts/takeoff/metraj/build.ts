// Metrajı DWG'lerden baştan üretir → work/metraj.json + work/MSK_Metraj_DWG.xlsx
// Kullanım: node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs scripts/takeoff/metraj/build.ts
import { existsSync, writeFileSync } from 'node:fs';
import { readDxf } from '../lib/dxf';
import { flatten } from '../lib/flatten';
import { makeMeasurer } from '../lib/regions';
import { gfItems } from './gf-items';
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
  const items: TakeoffItem[] = [...gfItems(gfDxf, gfFlat, gf.rows, gf.plate)];
  const findings: Takeoff['findings'] = gf.notes.map((n) => ({ topic: 'Mahal alanı', drawings: '4199-A-DD-01-02-100', finding: n, suggestion: 'Mahal sınırını/etiketini düzeltin.' }));

  // Döşeme kaplaması: halı salonlarda (döşeme detayı HALI KAPLAMA), diğer mahaller ID projesine göre
  const carpet = gf.rows.filter((r) => /^(KÜÇÜK )?SALON \d+$/.test(r.name));
  carpet.forEach((r) => (r.flooring = 'Halı kaplama'));
  gf.rows.filter((r) => r.floor === 'Zemin Kat' && !carpet.includes(r)).forEach((r) => (r.flooring = 'ID projesine göre'));
  items.push({
    poz: 'F.1', group: 'F', name: 'Halı kaplama – salonlar ve küçük salonlar', unit: 'm²', value: Math.round(carpet.reduce((s, r) => s + r.area, 0) * 100) / 100,
    method: 'Döşeme detayında (00-09-100) HALI KAPLAMA / ŞAP / SAHA BETONU dizilimi salon kesitinde gösteriliyor. Halı, Salon 01/02/03 ve Küçük Salon 01/02/03 mahallerinin net alanlarına (mahal sınırlarından) uygulandı.',
    sources: [{ drawing: '4199-A-DD-00-09-100', where: 'döşeme dizilimi (HALI KAPLAMA 10 mm)' }, { drawing: '4199-A-DD-01-02-100', where: 'mahal sınırları A_Nplt_Area' }],
    confidence: 'Orta', lines: carpet.map((r) => ({ label: `${r.code} ${r.name}`, value: Math.round(r.area * 100) / 100, unit: 'm²' })),
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
  for (const i of items.filter((x) => x.formula && !(x.poz in vals))) findings.push({ topic: 'Formül', drawings: '-', finding: `${i.poz} formülü hesaplanamadı: ${i.formula}`, suggestion: 'Başvurulan kalemi kontrol edin.' });

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
