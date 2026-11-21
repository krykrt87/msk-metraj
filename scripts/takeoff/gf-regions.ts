// Doldurma yönteminin doğrulaması: sınırı olan mahallerde mimarın sınırıyla karşılaştırır.
// Kullanım: npx tsx scripts/takeoff/gf-regions.ts [dxf]
import { readDxf } from './lib/dxf';
import { flatten } from './lib/flatten';
import { makeMeasurer } from './lib/regions';
import { extractRooms } from './rooms';

const flat = flatten(readDxf(process.argv[2] ?? 'work/dxf/4199-A-DD-01-02-100.dxf'));
const measureAt = makeMeasurer(flat);
const { labels, match } = extractRooms(flat, /4199_AMH-Alanlar$/);
console.log('Kod     Ad                            sınır     doldurma   fark');
for (const l of labels.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))) {
  const p = match.get(l.inst);
  const own = p && p.area < 3000 ? p.area : null;
  const big = own !== null && own > 400;
  const m = measureAt(l.at, big ? 60000 : 35000, big ? 40 : 15);
  const diff = own && m.area ? (((m.area - own) / own) * 100).toFixed(1) + '%' : '';
  console.log(
    `${(l.code ?? '—').padEnd(7)} ${l.name.slice(0, 28).padEnd(28)} ${(own?.toFixed(2) ?? 'YOK').padStart(8)} ${(m.leaked ? 'SIZINTI' : m.area.toFixed(2)).padStart(10)} ${diff.padStart(7)}`,
  );
}
