// Küçük DXF okuyucu: grup kodu çiftlerini sırasıyla saklar; HATCH, ATTRIB, MINSERT dahil.
import { readFileSync } from 'node:fs';

export type Pair = [number, string];
export interface RawEnt {
  type: string;
  pairs: Pair[];
  children: RawEnt[]; // VERTEX (POLYLINE) veya ATTRIB (INSERT)
}
export interface RawBlock {
  name: string;
  base: { x: number; y: number };
  layer: string;
  entities: RawEnt[];
}
export interface RawDxf {
  insunits: number;
  layers: string[];
  blocks: Map<string, RawBlock>;
  entities: RawEnt[];
}

export function readDxf(file: string): RawDxf {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1]]);

  let insunits = 0;
  const layers: string[] = [];
  const blocks = new Map<string, RawBlock>();
  const entities: RawEnt[] = [];
  let section = '';
  let i = 0;

  const readEntity = (): RawEnt => {
    const type = pairs[i][1].trim();
    const e: RawEnt = { type, pairs: [], children: [] };
    i++;
    while (i < pairs.length && pairs[i][0] !== 0) e.pairs.push(pairs[i++]);
    return e;
  };
  const readEntityList = (stop: Set<string>, out: RawEnt[]) => {
    while (i < pairs.length) {
      const [c, v] = pairs[i];
      const t = v.trim();
      if (c !== 0) {
        i++;
        continue;
      }
      if (stop.has(t)) return;
      const e = readEntity();
      if (e.type === 'POLYLINE' || (e.type === 'INSERT' && e.pairs.some(([cc, vv]) => cc === 66 && vv.trim() === '1'))) {
        while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1].trim() !== 'SEQEND') e.children.push(readEntity());
        if (i < pairs.length && pairs[i][1].trim() === 'SEQEND') readEntity();
      }
      out.push(e);
    }
  };

  while (i < pairs.length) {
    const [c, v] = pairs[i];
    const t = v.trim();
    if (c === 0 && t === 'SECTION') {
      section = pairs[i + 1][1].trim();
      i += 2;
      continue;
    }
    if (c === 0 && t === 'ENDSEC') {
      section = '';
      i++;
      continue;
    }
    if (section === 'HEADER' && c === 9 && t === '$INSUNITS') {
      insunits = parseInt(pairs[i + 1][1], 10);
      i += 2;
      continue;
    }
    if (section === 'TABLES' && c === 0 && t === 'LAYER') {
      const e = readEntity();
      const name = e.pairs.find(([cc]) => cc === 2)?.[1];
      if (name !== undefined) layers.push(name);
      continue;
    }
    if (section === 'BLOCKS' && c === 0 && t === 'BLOCK') {
      const head = readEntity();
      const get = (code: number) => head.pairs.find(([cc]) => cc === code)?.[1] ?? '';
      const b: RawBlock = { name: get(2), base: { x: +get(10) || 0, y: +get(20) || 0 }, layer: get(8), entities: [] };
      readEntityList(new Set(['ENDBLK']), b.entities);
      readEntity(); // ENDBLK
      blocks.set(b.name, b);
      continue;
    }
    if (section === 'ENTITIES' && c === 0) {
      readEntityList(new Set(['ENDSEC']), entities);
      continue;
    }
    i++;
  }
  return { insunits, layers, blocks, entities };
}

// --- Grup kodu yardımcıları
export const val = (e: RawEnt, code: number, def = ''): string => e.pairs.find(([c]) => c === code)?.[1] ?? def;
export const num = (e: RawEnt, code: number, def = 0): number => {
  const v = e.pairs.find(([c]) => c === code)?.[1];
  return v === undefined ? def : parseFloat(v);
};
export const nums = (e: RawEnt, code: number): number[] => e.pairs.filter(([c]) => c === code).map(([, v]) => parseFloat(v));
