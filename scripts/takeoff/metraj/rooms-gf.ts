// Zemin kat ve asma kat mahal tablosu (pafta 01-02-100).
// Alan önceliği: mimarın mahal sınırı (A_Nplt_Area) → yoksa etiket alanı (doldurma ölçümüyle doğrulanır)
// → etiket ölçümle %25'ten fazla çelişiyorsa doldurma ölçümü.
import type { Flat } from '../lib/flatten';
import { area, bbox, pointInPolygon, type P } from '../lib/geom';
import { decomposeArea } from '../lib/decompose';
import { extractRooms } from '../rooms';
import type { RoomRow } from './model';

export interface GfRooms {
  rows: RoomRow[];
  plate: { pts: P[]; verts?: { x: number; y: number; bulge: number }[]; area: number } | null; // kat genel sınırı (brüt)
  notes: string[];
  /** 3B için mahal şekli (sınır ya da ölçüm konturu), satır id → noktalar (mm). */
  shapes: Map<string, P[]>;
}

export function buildGfRooms(flat: Flat[], measureAt: (seed: P, half?: number, res?: number) => { area: number; leaked: boolean; outline: P[] }): GfRooms {
  const notes: string[] = [];
  const { polys, labels, match } = extractRooms(flat, /^4199_AMH-Alanlar2?$/);
  const plateP = polys.find((p) => p.area > 5000) ?? null;
  if (plateP) plateP.area = decomposeArea(plateP.verts ?? plateP.pts.map((q) => ({ ...q, bulge: 0 }))).reduce((t, x) => t + x.value, 0);
  // zone çerçeveleri (A_Anno_Lay.Vprt) ve adları (A_Anno_Text_1 "ZONE n")
  const frames = flat.filter((f) => f.layer === 'A_Anno_Lay.Vprt' && f.closed && f.pts && area(f.pts) > 1e9 && area(f.pts) < 2e10);
  const zoneTexts = flat.filter((f) => f.t === 'TEXT' && /^ZONE \d$/.test(f.text ?? ''));
  const zoneOf = (c: P) => {
    for (const fr of frames) {
      if (!pointInPolygon(c, fr.pts!)) continue;
      const t = zoneTexts.find((z) => z.at && pointInPolygon(z.at, fr.pts!));
      if (t) return t.text!.replace('ZONE', 'Zone');
    }
    return '';
  };
  const used = new Set<number>();
  const shapes = new Map<string, P[]>();
  const rows: RoomRow[] = [];
  const codeCount = new Map<string, number>();
  for (const l of labels) if (l.code) codeCount.set(l.code, (codeCount.get(l.code) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const l of labels.filter((x) => x.code).sort((a, b) => a.code!.localeCompare(b.code!) || a.at.x - b.at.x)) {
    const code = l.code!;
    const n = (seen.get(code) ?? 0) + 1;
    seen.set(code, n);
    const id = codeCount.get(code)! > 1 ? `${code}~${n}` : code;
    const floor = code.startsWith('MF') ? 'Asma Kat (Teknik)' : 'Zemin Kat';
    const p = match.get(l.inst);
    const own = p && p.area < 3000 ? p : null;
    let areaV: number;
    let src: RoomRow['areaSource'];
    let measured: number | null = null;
    let note: string | null = null;
    let calc: RoomRow['calc'];
    if (own) {
      calc = decomposeArea(own.verts ?? own.pts.map((q) => ({ ...q, bulge: 0 })));
      own.area = calc.reduce((t, x) => t + x.value, 0); // yaylar tam formülle (örneklemeden hassas)
      used.add(own.id);
      shapes.set(id, own.pts);
      areaV = own.area;
      src = 'sınır';
      if (l.labelArea !== null && Math.abs(own.area - l.labelArea) > 0.05) note = `Etiket ${l.labelArea.toFixed(2)} m², sınır ${own.area.toFixed(2)} m².`;
    } else {
      const m = measureAt(l.at, 35000, 15);
      measured = m.leaked ? null : m.area;
      if (m.outline.length) shapes.set(id, m.outline);
      const measuredCalc = m.outline.length ? decomposeArea(m.outline.map((q) => ({ ...q, bulge: 0 }))) : undefined;
      if (l.labelArea !== null && measured !== null && Math.abs(measured - l.labelArea) / measured > 0.25) {
        src = 'ölçüm';
        calc = measuredCalc;
        areaV = calc ? calc.reduce((t, x) => t + x.value, 0) : measured; // cetvelle aynı: ölçüm konturu
        note = `Mahal sınırı çizilmemiş. Etiketteki ${l.labelArea.toFixed(2)} m² ölçümle çelişiyor (kopyalama hatası); duvar iç yüzlerinden çıkarılan kontur ${areaV.toFixed(2)} m² alındı (ızgara doldurma sayımı ${measured.toFixed(2)} m²).`;
        notes.push(`${code} ${l.name}: ${note}`);
      } else if (l.labelArea !== null) {
        areaV = l.labelArea;
        src = 'etiket';
        calc = [{ kind: 'değer', unit: 'm²', label: 'etiket', name: 'mahal etiketindeki alan (A_Anno_Rmname)', adet: 1, sign: 1, value: l.labelArea }];
        note = `Mahal sınırı çizilmemiş; etiket alanı alındı. Duvar iç yüzlerinden kontrol ölçümü: ${measured?.toFixed(2) ?? 'yapılamadı'} m².`;
      } else {
        src = 'ölçüm';
        calc = measuredCalc;
        areaV = calc ? calc.reduce((t, x) => t + x.value, 0) : (measured ?? 0);
        note = 'Mahal sınırı ve alan etiketi yok; duvar iç yüzlerinden ölçüldü.';
      }
    }
    rows.push({
      id, code, name: l.name, floor, zone: zoneOf(l.at), area: areaV, areaSource: src, labelArea: l.labelArea, measuredArea: measured,
      ceilingLower: null, ceilingUpper: null, ch: null, flooring: null, note, calc,
    });
  }
  // etiketsiz mahal sınırları (kolon kesitleri ve kat genel sınırı hariç)
  for (const p of polys) {
    if (used.has(p.id) || p === plateP || p.area < 2) continue;
    const b = bbox(p.pts);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const id = `SINIR-${p.id}`;
    shapes.set(id, p.pts);
    rows.push({
      id, code: id, name: 'Etiketsiz mahal', floor: p.block.endsWith('2') ? 'Asma Kat (Teknik)' : 'Zemin Kat', zone: zoneOf(c), area: p.area,
      areaSource: 'sınır', labelArea: null, measuredArea: null, ceilingLower: null, ceilingUpper: null, ch: null, flooring: null,
      calc: decomposeArea(p.verts ?? p.pts.map((q) => ({ ...q, bulge: 0 }))),
      note: 'Mahal sınırı çizili ama kod/ad etiketi yok.',
    });
    notes.push(`Etiketsiz mahal sınırı #${p.id}: ${p.area.toFixed(2)} m² (${zoneOf(c) || 'zone ?'}).`);
  }
  return { rows, plate: plateP ? { pts: plateP.pts, verts: plateP.verts, area: plateP.area } : null, notes, shapes };
}
