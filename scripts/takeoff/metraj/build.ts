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
