// Zemin kat mahal dizini: satır açıklamalarında projedeki mahal adlarını kullanmak için ("GF-08 KÜÇÜK SALON 02").
// build.ts mahal şekilleriyle doldurur; çatı, tavan, cephe ve kapı modülleri konumdan ad sorar (aynı çizim çerçevesi).
import { area, pointInPolygon, type P } from '../lib/geom';

export interface RoomRef {
  code: string;
  name: string;
  label: string; // "GF-08 KÜÇÜK SALON 02"
  pts: P[];
  area: number;
}

let rooms: RoomRef[] = [];

export function setRooms(list: { code: string; name: string; pts: P[] }[]) {
  rooms = list
    .filter((r) => r.pts.length >= 3 && !r.code.startsWith('SINIR'))
    .map((r) => ({ ...r, label: `${r.code} ${r.name}`.trim(), area: area(r.pts) }));
}

/** Noktayı içeren en küçük mahal. */
export function roomAt(p: P): RoomRef | null {
  let best: RoomRef | null = null;
  for (const r of rooms) if (pointInPolygon(p, r.pts) && (!best || r.area < best.area)) best = r;
  return best;
}

const segDist = (p: P, a: P, b: P) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
};
/** Mahal sınırına uzaklık (içindeyse 0), mm. */
export function roomDistance(p: P, r: RoomRef): number {
  if (pointInPolygon(p, r.pts)) return 0;
  let d = Infinity;
  for (let i = 0; i < r.pts.length; i++) d = Math.min(d, segDist(p, r.pts[i], r.pts[(i + 1) % r.pts.length]));
  return d;
}

/** maxDist (mm) içindeki mahaller, yakından uzağa. */
export function roomsNear(p: P, maxDist: number): RoomRef[] {
  return rooms
    .map((r) => ({ r, d: roomDistance(p, r) }))
    .filter((x) => x.d <= maxDist)
    .sort((a, b) => a.d - b.d || a.r.area - b.r.area)
    .map((x) => x.r);
}

/** Bir dizi noktanın yakınındaki mahaller, ilk görülme sırasıyla (ör. cam cephe boyunca). */
export function roomsAlong(pts: P[], maxDist: number): RoomRef[] {
  const out: RoomRef[] = [];
  for (const p of pts) {
    const r = roomsNear(p, maxDist)[0];
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

/** Noktanın bina ortasına göre yönü (mahallerin sınır kutusu ortası): aynı adı taşıyan parçaları ayırmak için. */
export function sideOf(p: P, axis: 'any' | 'ew' = 'any'): 'kuzey' | 'güney' | 'doğu' | 'batı' {
  const xs = rooms.flatMap((r) => r.pts.map((q) => q.x));
  const ys = rooms.flatMap((r) => r.pts.map((q) => q.y));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return axis === 'ew' || Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'doğu' : 'batı') : dy >= 0 ? 'kuzey' : 'güney';
}
