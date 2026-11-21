// Parse OBJECTS: DICTIONARY + SPATIAL_FILTER → clipFor(insert) returning block-space boundary polygon
import { readFileSync } from 'node:fs';
import type { RawEnt } from '../lib/dxf';
import type { P } from '../lib/geom';
export function makeClipFor(file: string) {
  const txt = readFileSync(file, 'utf8');
  const start = txt.lastIndexOf('\nOBJECTS');
  const lines = txt.slice(start).split(/\r?\n/);
  const objs = new Map<string, { type: string; pairs: [number, string][] }>();
  let cur: { type: string; pairs: [number, string][] } | null = null;
  for (let i = 2; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim());
    const v = lines[i + 1];
    if (c === 0) {
      cur = { type: v.trim(), pairs: [] };
      continue;
    }
    if (!cur) continue;
    cur.pairs.push([c, v.trim()]);
    if (c === 5) objs.set(v.trim(), cur);
  }
  const dictGet = (h: string | undefined, key: string) => {
    const d = h ? objs.get(h) : undefined;
    if (!d) return undefined;
    for (let k = 0; k < d.pairs.length - 1; k++) if (d.pairs[k][0] === 3 && d.pairs[k][1] === key) return d.pairs[k + 1][1];
    return undefined;
  };
  let n = 0;
  const clipFor = (e: RawEnt): P[] | undefined => {
    const i = e.pairs.findIndex(([c, v]) => c === 102 && v.trim() === '{ACAD_XDICTIONARY');
    if (i < 0) return undefined;
    const xd = e.pairs[i + 1]?.[1]?.trim();
    const f = dictGet(dictGet(xd, 'ACAD_FILTER'), 'SPATIAL');
    const sf = f ? objs.get(f) : undefined;
    if (!sf || sf.type !== 'SPATIAL_FILTER') return undefined;
    const xs = sf.pairs.filter(([c]) => c === 10).map(([, v]) => +v);
    const ys = sf.pairs.filter(([c]) => c === 20).map(([, v]) => +v);
    const m40 = sf.pairs.filter(([c]) => c === 40).map(([, v]) => +v);
    const enabled = sf.pairs.find(([c]) => c === 71)?.[1] !== '0';
    if (!enabled) return undefined;
    let pts: P[] = xs.map((x, k) => ({ x, y: ys[k] }));
    if (pts.length === 2) pts = [pts[0], { x: pts[1].x, y: pts[0].y }, pts[1], { x: pts[0].x, y: pts[1].y }];
    const a = m40.slice(0, 12); // inverse insert matrix, 3x4 row-major
    n++;
    return pts.map((p) => ({ x: a[0] * p.x + a[1] * p.y + a[3], y: a[4] * p.x + a[5] * p.y + a[7] }));
  };
  return { clipFor, count: () => n };
}
