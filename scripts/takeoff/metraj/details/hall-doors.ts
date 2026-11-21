// Salon (GF-03/04/05) sınırları üzerindeki kapı eklemelerini sayar (pafta 01-02-100, A_Door_Wood).
// Kullanım (kontrol): npx tsx scripts/takeoff/metraj/details/hall-doors.ts
import { readDxf } from '../../lib/dxf';
import { flatten, type Flat } from '../../lib/flatten';
import { bbox, length, type P } from '../../lib/geom';
import { extractRooms } from '../../rooms';

export interface HallDoors {
  code: string;
  name: string;
  perimeter: number; // m (mahal sınırı)
  doors: { name: string; at: P; width: number; dist: number }[];
}

const DIST = parseFloat(process.env.HALL_DOOR_DIST ?? "1.6");
const segDist = (p: P, a: P, b: P) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const polyDist = (p: P, poly: P[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
};

export function hallDoors(flat?: Flat[]): HallDoors[] {
  const f = flat ?? flatten(readDxf('work/dxf/4199-A-DD-01-02-100.dxf'));
  const { labels, match } = extractRooms(f, /^4199_AMH-Alanlar2?$/);
  // kapı eklemeleri: A_Door_Wood katmanındaki en dış kapı blokları (iç içe kanatları değil)
  const doorIns = f.filter((x) => x.t === 'INSERT' && x.layer === 'A_Door_Wood' && x.at && x.path.length <= 2);
  // kapı genişliği: aynı eklemenin çizgilerinin bbox'ının büyük kenarı
  const byInst = new Map<number, P[]>();
  for (const x of f) if (x.inst && x.pts && x.layer === 'A_Door_Wood') byInst.set(x.inst, [...(byInst.get(x.inst) ?? []), ...x.pts]);
  const out: HallDoors[] = [];
  for (const code of ['GF-03', 'GF-04', 'GF-05']) {
    const l = labels.find((x) => x.code === code);
    const poly = l ? match.get(l.inst) : null;
    if (!l || !poly) continue;
    const doors = doorIns
      .map((d) => {
        const pts = byInst.get(d.inst!) ?? [];
        const b = pts.length ? bbox(pts) : null;
        const c = b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : d.at!;
        const w = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : 0;
        return { name: d.name ?? '?', at: c, width: w / 1000, dist: polyDist(c, poly.pts) / 1000 };
      })
      .filter((d) => d.dist < DIST && d.width > 0.6);
    out.push({ code, name: l.name, perimeter: length(poly.pts, true) / 1000, doors });
  }
  return out;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('details/hall-doors.ts')) {
  for (const h of hallDoors()) {
    console.log(`${h.code} ${h.name} çevre=${h.perimeter.toFixed(2)} m kapı=${h.doors.length}`);
    for (const d of h.doors) console.log(`   ${d.name.padEnd(28)} w=${d.width.toFixed(2)} m dist=${d.dist.toFixed(2)} @ ${(d.at.x / 1000).toFixed(2)},${(d.at.y / 1000).toFixed(2)}`);
  }
}
