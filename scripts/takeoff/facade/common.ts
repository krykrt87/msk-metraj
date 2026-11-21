import { readFileSync } from 'node:fs';
import { readDxf } from '../lib/dxf';
import { flatten, type Flat } from './flatc';
import { makeClipFor } from './xclip';
import { bbox, regionArea, type P } from '../lib/geom';
export const ELEV = {
  SE: { sheet: '01-04-100', blk: 'on', win: [48.3e3, 172.5e3, 274.6e3, 230.1e3] },
  NE: { sheet: '01-04-200', blk: 'sag', win: [48.3e3, 114.9e3, 274.6e3, 172.5e3] },
  NW: { sheet: '01-04-300', blk: 'arka', win: [326.8e3, 172.4e3, 553.1e3, 230.0e3] },
  SW: { sheet: '01-04-400', blk: 'sol', win: [326.8e3, 114.8e3, 553.1e3, 172.4e3] },
} as const;
export function layerColors(file: string): Map<string, number> {
  const txt = readFileSync(file, 'utf8');
  const a = txt.indexOf('\nTABLES'); const b = txt.indexOf('ENDSEC', txt.indexOf('\nLAYER', a + 10) );
  const lines = txt.slice(a, txt.indexOf('\nBLOCKS')).split(/\r?\n/);
  const m = new Map<string, number>();
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === '0' && lines[i + 1].trim() === 'LAYER') {
      let name = '', col = 7;
      for (let j = i + 2; j < lines.length - 1; j += 2) {
        const c = lines[j].trim(); const v = lines[j + 1];
        if (c === '0') break;
        if (c === '2') name = v.trim();
        if (c === '62') col = Math.abs(parseInt(v));
      }
      if (name) m.set(name, col);
    }
  }
  return m;
}
export function load(file: string) {
  const dxf = readDxf(file);
  const flat = flatten(dxf, { clipFor: makeClipFor(file).clipFor });
  const lc = layerColors(file);
  for (const f of flat) if (f.color === 256) (f as any).colorEff = lc.get(f.layer) ?? 7; else (f as any).colorEff = f.color;
  return { dxf, flat, lc };
}
export const center = (f: Flat): P | undefined => {
  const pts = f.loops?.[0] ?? f.pts ?? (f.at ? [f.at] : undefined);
  if (!pts || !pts.length) return undefined;
  const b = bbox(pts); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};
export const inWin = (p: P | undefined, w: readonly number[]) => !!p && p.x >= w[0] && p.x <= w[2] && p.y >= w[1] && p.y <= w[3];
export const hArea = (f: Flat) => (f.loops ? regionArea(f.loops) : 0);
export const colStr = (f: Flat) => (f.tc !== undefined ? 'tc#' + (f.tc >>> 0).toString(16).padStart(6, '0') : 'aci' + (f as any).colorEff);
export { bbox, regionArea };
export type { Flat, P };
