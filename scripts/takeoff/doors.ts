// Kapılar: A_Door_Wood katmanındaki blok eklemeleri. Kanat genişliği, blok tanımındaki 90° bulge yaylarının
// yarıçapından (yarıçap = kanat genişliği), ekleme ölçeğiyle çarpılarak bulunur. Yay sayısı = kanat sayısı.
import { readDxf, val, type RawDxf } from './lib/dxf';
import { flatten, type Flat } from './lib/flatten';
import type { P } from './lib/geom';

export interface Door { name: string; block: string; at: P; leaves: number[]; layer: string }

export function leafRadii(dxf: RawDxf, name: string, depth = 0): number[] {
  const b = dxf.blocks.get(name);
  if (!b || depth > 3) return [];
  const out: number[] = [];
  for (const e of b.entities) {
    if (e.type === 'LWPOLYLINE') {
      const v: { x: number; y: number; bulge: number }[] = [];
      for (const [c, s] of e.pairs) {
        if (c === 10) v.push({ x: +s, y: 0, bulge: 0 });
        else if (c === 20 && v.length) v[v.length - 1].y = +s;
        else if (c === 42 && v.length) v[v.length - 1].bulge = +s;
      }
      const closed = (parseInt(val(e, 70, '0'), 10) & 1) === 1;
      for (let i = 0; i < v.length; i++) {
        const a = v[i];
        const nb = v[(i + 1) % v.length];
        if (!closed && i === v.length - 1) break;
        const theta = 4 * Math.atan(Math.abs(a.bulge));
        if (theta < (60 * Math.PI) / 180 || theta > (120 * Math.PI) / 180) continue; // ~90° açılım yayı
        const chord = Math.hypot(nb.x - a.x, nb.y - a.y);
        out.push(chord / (2 * Math.sin(theta / 2)));
      }
    } else if (e.type === 'ARC') {
      let sweep = parseFloat(val(e, 51, '0')) - parseFloat(val(e, 50, '0'));
      while (sweep <= 0) sweep += 360;
      if (sweep > 60 && sweep < 120) out.push(parseFloat(val(e, 40, '0')));
    }
  }
  return out;
}

export function extractDoors(dxf: RawDxf, flat: Flat[], blockRe: RegExp, win: (p: P) => boolean): Door[] {
  const doors: Door[] = [];
  for (const f of flat) {
    if (f.t !== 'INSERT' || f.layer !== 'A_Door_Wood' || !f.at || !win(f.at)) continue;
    if (!f.path.length || !blockRe.test(f.path[0])) continue;
    const s = Math.sqrt(f.scaleDet ?? 1);
    const leaves = leafRadii(dxf, f.name!).map((r) => Math.round((r * s) / 10) * 10).filter((r) => r >= 500 && r <= 2000);
    doors.push({ name: f.name!, block: f.path[0], at: f.at, leaves, layer: f.layer });
  }
  return doors;
}

if (process.argv[1]?.endsWith('doors.ts')) {
  const dxf = readDxf(process.argv[2] ?? 'work/dxf/4199-A-DD-01-02-100.dxf');
  const flat = flatten(dxf);
  const W = { minX: 595000, minY: 5935000, maxX: 760000, maxY: 6035000 };
  const doors = extractDoors(dxf, flat, /.*/, (p) => p.x > W.minX && p.x < W.maxX && p.y > W.minY && p.y < W.maxY);
  const g = new Map<string, number>();
  for (const d of doors) {
    const k = d.leaves.length === 0 ? `yay yok: ${d.name} (${d.block})` : `${d.leaves.length} kanat: ${d.leaves.map((r) => r / 10).join('+')} cm`;
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  console.log(`Kapı bloğu: ${doors.length}`);
  for (const [k, n] of [...g.entries()].sort()) console.log(`  ${String(n).padStart(3)} × ${k}`);
}
