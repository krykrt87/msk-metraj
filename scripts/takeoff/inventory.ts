// DXF envanteri: katmanlar, varlık türleri, blok sayıları, birimler.
import DxfParser from 'dxf-parser';
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const dxf = new DxfParser().parseSync(readFileSync(file, 'utf8')) as any;
const ents: any[] = dxf.entities;
const model = ents.filter((e) => !e.inPaperSpace);
const paper = ents.filter((e) => e.inPaperSpace);
console.log('Dosya:', file);
console.log('INSUNITS:', dxf.header?.$INSUNITS, 'EXTMIN:', JSON.stringify(dxf.header?.$EXTMIN), 'EXTMAX:', JSON.stringify(dxf.header?.$EXTMAX));
console.log('Varlık: model', model.length, 'kâğıt', paper.length);
const count = (xs: any[], key: (e: any) => string) => { const m = new Map<string, number>(); xs.forEach((e) => m.set(key(e), (m.get(key(e)) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
console.log('\nTürler (model):', count(model, (e) => e.type).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('\nKatmanlar (model, varlık sayısı):');
for (const [k, v] of count(model, (e) => e.layer)) console.log(`  ${v.toString().padStart(6)}  ${k}`);
console.log('\nBlok eklemeleri (model):');
for (const [k, v] of count(model.filter((e) => e.type === 'INSERT'), (e) => `${e.name} @${e.layer}`).slice(0, 60)) console.log(`  ${v.toString().padStart(5)}  ${k}`);
console.log('\nKâğıt uzayı viewport sayısı:', paper.filter((e) => e.type === 'VIEWPORT').length);
