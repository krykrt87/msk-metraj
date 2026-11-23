// 3B plan altlığı: 01-02-100'deki zemin kat ve ara kat planlarının çizgileri, katman katman (work/underlay.json).
// Ara kat planı çizimde +465,3 m doğuya kaydırılmış (build.ts mahalleriyle aynı); geri alınır ve +3,80'e konur.
import type { Underlay } from '../../../shared/model3d';
import type { Flat } from '../lib/flatten';
import { bbox, type P } from '../lib/geom';
import { simplify } from './model3d';

const MF_DX = -465300;
const MARGIN = 60000; // plan çevresindeki saha çizgileri için (mm)

export function buildUnderlay(flat: Flat[], plate: P[], origin: P): Underlay {
  const b = bbox(plate);
  const inWin = (p: P) => p.x > b.minX - MARGIN && p.x < b.maxX + MARGIN && p.y > b.minY - MARGIN && p.y < b.maxY + MARGIN;
  const layers = new Map<string, Underlay['layers'][number]>();
  const cm = (v: number, o: number) => Math.round((v - o) / 10);
  // aks balonları: yazı balonun (aynı blok eklemesindeki dairenin) merkezine ortalanır
  const bubble = new Map<number, P>();
  for (const f of flat)
    if (f.t === 'CIRCLE' && f.inst !== undefined && f.layer.endsWith('A_Anno_Axis') && f.pts?.length) {
      const c = bbox(f.pts);
      bubble.set(f.inst, { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 });
    }
  for (const f of flat) {
    const p0 = f.t === 'TEXT' ? f.at : f.pts?.[0];
    if (!p0 || f.t === 'HATCH') continue;
    const plan = p0.x > 1000e3 ? 'ara' : 'zemin';
    const dx = plan === 'ara' ? MF_DX : 0;
    if (!inWin({ x: p0.x + dx, y: p0.y })) continue;
    // alan bloğu (zemin: 4199_AMH-Alanlar, ara kat: …Alanlar2) kendi katmanlarından ayrılıp tek giriş olur, yazılarıyla
    const block = /^4199_AMH-Alanlar/.test(f.path[0] ?? '');
    const axis = f.layer.endsWith('A_Anno_Axis');
    if (f.t === 'TEXT' && (!(block || axis) || !f.text?.trim())) continue;
    if (f.t !== 'TEXT' && (!f.pts || f.pts.length < 2)) continue;
    // xref önekleri (…$0$A_Furn_Lose) atılır: aynı adlı katmanlar birlikte açılıp kapanır
    const name = block ? '4199_AMH-Alanlar (blok)' : f.layer.split('$0$').pop()!;
    const L = layers.get(name) ?? { name, lines: {} };
    layers.set(name, L);
    if (f.t === 'TEXT') {
      const c = axis && f.inst !== undefined ? bubble.get(f.inst) : undefined;
      const q = c ?? p0;
      const t: [number, number, number, string, 1?] = [cm(q.x + dx, origin.x), cm(q.y, origin.y), Math.round(f.height! / 10), f.text!.trim()];
      if (c) t.push(1);
      ((L.texts ??= {})[plan] ??= []).push(t);
      continue;
    }
    const pts = simplify(f.pts!, 10, !!f.closed);
    if (f.closed) pts.push(pts[0]);
    (L.lines[plan] ??= []).push(pts.flatMap((p) => [cm(p.x + dx, origin.x), cm(p.y, origin.y)]));
  }
  return {
    plans: [
      { key: 'zemin', label: 'Zemin kat planı', z: 0.02 },
      { key: 'ara', label: 'Ara kat planı', z: 3.82 },
    ],
    layers: [...layers.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
  };
}
