// Mahal sınırları (A_Nplt_Area) ile mahal etiketlerini (A_Anno_Rmname) eşleştirir.
// Kullanım: npx tsx scripts/takeoff/rooms.ts <plan.dxf> [blokAdıFiltresi]
import { readDxf } from './lib/dxf';
import { flatten, type Flat } from './lib/flatten';
import { area, bbox, pointInPolygon, type P } from './lib/geom';

export interface RoomPoly {
  id: number;
  pts: P[];
  verts?: { x: number; y: number; bulge: number }[];
  area: number; // m²
  block: string;
  kind: string;
}
export interface RoomLabel {
  inst: number;
  code: string | null;
  name: string;
  labelArea: number | null;
  at: P;
  block: string;
}

const AREA_RE = /^(\d+(?:[.,]\d+)?)\s*(m²|m2)?$/i;
const CODE_RE = /^[A-Z]{2}-\d+[A-Z]?$/;

export function extractRooms(flat: Flat[], blockFilter?: RegExp) {
  const inBlock = (f: Flat) => !blockFilter || f.path.some((p) => blockFilter.test(p));
  const polys: RoomPoly[] = [];
  flat.forEach((f) => {
    if (f.layer !== 'A_Nplt_Area' || !f.closed || !f.pts || !inBlock(f)) return;
    polys.push({ id: polys.length + 1, pts: f.pts, verts: f.verts, area: area(f.pts) / 1e6, block: f.path[0] ?? '(model)', kind: f.t });
  });
  const byInst = new Map<number, Flat[]>();
  for (const f of flat) if (f.layer === 'A_Anno_Rmname' && f.t === 'TEXT' && f.inst && inBlock(f)) byInst.set(f.inst, [...(byInst.get(f.inst) ?? []), f]);
  const anchors = new Map<number, P>();
  for (const f of flat) if (f.t === 'INSERT' && f.inst && byInst.has(f.inst) && f.at) anchors.set(f.inst, f.at);
  const labels: RoomLabel[] = [];
  for (const [inst, texts] of byInst) {
    let code: string | null = null;
    let labelArea: number | null = null;
    const names: string[] = [];
    for (const t of texts) {
      const s = (t.text ?? '').trim();
      if (!s) continue;
      if (CODE_RE.test(s)) code = s;
      else if (AREA_RE.test(s)) labelArea = parseFloat(s.replace(',', '.'));
      else names.push(s);
    }
    const at = anchors.get(inst) ?? texts[0].at!;
    labels.push({ inst, code, name: names.join(' '), labelArea, at, block: texts[0].path[0] ?? '(model)' });
  }
  // her etiketi, konumunu içeren en küçük sınıra bağla
  const match = new Map<number, RoomPoly | null>();
  for (const l of labels) {
    const cands = polys.filter((p) => pointInPolygon(l.at, p.pts)).sort((a, b) => a.area - b.area);
    match.set(l.inst, cands[0] ?? null);
  }
  return { polys, labels, match };
}

if (process.argv[1]?.endsWith('rooms.ts')) {
  const flat = flatten(readDxf(process.argv[2]));
  const filter = process.argv[3] ? new RegExp(process.argv[3]) : undefined;
  const { polys, labels, match } = extractRooms(flat, filter);
  console.log(`Sınır: ${polys.length} · etiket: ${labels.length}`);
  const used = new Set<number>();
  const rows = labels
    .map((l) => ({ l, p: match.get(l.inst) }))
    .sort((a, b) => (a.l.code ?? 'ZZ').localeCompare(b.l.code ?? 'ZZ'));
  let sumLabel = 0;
  let sumPoly = 0;
  for (const { l, p } of rows) {
    if (p) used.add(p.id);
    sumLabel += l.labelArea ?? 0;
    sumPoly += p?.area ?? 0;
    const diff = p && l.labelArea ? (((p.area - l.labelArea) / l.labelArea) * 100).toFixed(1) + '%' : '';
    console.log(
      `${(l.code ?? '—').padEnd(7)} ${l.name.slice(0, 28).padEnd(28)} etiket=${(l.labelArea?.toFixed(2) ?? '—').padStart(8)}  sınır=${(p ? p.area.toFixed(2) : 'YOK').padStart(8)} ${diff.padStart(7)}  #${p?.id ?? ''} ${l.block}`,
    );
  }
  console.log(`Toplam etiket=${sumLabel.toFixed(2)} sınır(eşleşen)=${sumPoly.toFixed(2)}`);
  console.log('\nEtiketsiz sınırlar:');
  for (const p of polys.filter((q) => !used.has(q.id))) {
    const b = bbox(p.pts);
    console.log(`  #${p.id} ${p.kind} ${p.area.toFixed(2)} m²  merkez=(${((b.minX + b.maxX) / 2000).toFixed(1)}, ${((b.minY + b.maxY) / 2000).toFixed(1)}) m  ${p.block}`);
  }
}
