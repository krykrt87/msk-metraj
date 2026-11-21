// Bir DXF'in düzleştirilmiş envanteri: üst blok × katman bazında sayı, uzunluk, alan, tarama, blok, yazı.
// Kullanım: npx tsx scripts/takeoff/survey.ts <dxf> [--texts]
import { readDxf } from './lib/dxf';
import { flatten, type Flat } from './lib/flatten';
import { area, length, regionArea } from './lib/geom';

const file = process.argv[2];
const showTexts = process.argv.includes('--texts');
const dxf = readDxf(file);
const flat = flatten(dxf);
console.log(`Dosya: ${file}  birim(INSUNITS)=${dxf.insunits}  blok tanımı=${dxf.blocks.size}  düz varlık=${flat.length}`);

interface Agg {
  n: number;
  types: Map<string, number>;
  len: number;
  closedArea: number;
  hatchArea: number;
  patterns: Map<string, number>;
  inserts: Map<string, number>;
  texts: string[];
}
const groups = new Map<string, Agg>();
const key = (f: Flat) => `${f.path[0] ?? '(model)'} | ${f.layer}`;
for (const f of flat) {
  const k = key(f);
  let g = groups.get(k);
  if (!g) groups.set(k, (g = { n: 0, types: new Map(), len: 0, closedArea: 0, hatchArea: 0, patterns: new Map(), inserts: new Map(), texts: [] }));
  g.n++;
  g.types.set(f.t, (g.types.get(f.t) ?? 0) + 1);
  if (f.pts && f.t !== 'TEXT') {
    g.len += length(f.pts, f.closed);
    if (f.closed) g.closedArea += area(f.pts);
  }
  if (f.t === 'HATCH' && f.loops) {
    g.hatchArea += regionArea(f.loops);
    g.patterns.set(f.pattern ?? '?', (g.patterns.get(f.pattern ?? '?') ?? 0) + 1);
  }
  if (f.t === 'INSERT' && f.name) g.inserts.set(f.name, (g.inserts.get(f.name) ?? 0) + 1);
  if (f.t === 'TEXT' && f.text && g.texts.length < 400) g.texts.push(f.text);
}
const m = (v: number) => (v / 1000).toFixed(1);
const m2 = (v: number) => (v / 1e6).toFixed(2);
const top = (mp: Map<string, number>, n = 6) => [...mp.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join(', ');
for (const [k, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const parts = [`n=${g.n}`, top(g.types)];
  if (g.len) parts.push(`L=${m(g.len)} m`);
  if (g.closedArea) parts.push(`kapalı=${m2(g.closedArea)} m²`);
  if (g.hatchArea) parts.push(`tarama=${m2(g.hatchArea)} m² [${top(g.patterns, 4)}]`);
  if (g.inserts.size) parts.push(`blok: ${top(g.inserts, 5)}`);
  console.log(`${k}\n    ${parts.join(' · ')}`);
  if (showTexts && g.texts.length) console.log(`    yazılar: ${[...new Set(g.texts)].slice(0, 60).join(' | ')}`);
}
