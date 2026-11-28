// Statik projeden kaba inşaat 3B modeli (yalnız görsel; metraj kalemi yok): temeller, kolon/perdeler, kirişler.
// Girdi: work/dxf/statik/*.dxf — "Projeler/261022-MSK-Statik Proje Draft Set/DWG" içindeki KalP/TemP paftalarından
// accoreconsole ile DXFOUT (2018, 16 hane); betiğin sonunda boş satır olmamalı, yoksa DXFOUT yinelenip konsol bekler.
import { existsSync } from 'node:fs';
import { readDxf } from '../lib/dxf';
import { flatten, type Flat } from '../lib/flatten';
import { bbox, length, type P } from '../lib/geom';
import { model3d } from './model3d';

const DIR = 'work/dxf/statik';
/** Statik kotu (mutlak) → mimari z: ±0,00 = +21,80. */
const Z = (abs: number) => Math.round((abs - 21.8) * 100) / 100;
const BEAM_H = 0.6; // shortcut: kirişlerin çoğu 600/600; kesit yazısından okunmuyor, kiriş bazında gerekirse emir-beam-size eşlenir

/** Paftayı mimari zemin kat çizim koordinatına taşıyan öteleme: statik kolon merkezleri ↔ mimari kolon merkezleri. */
function align(cols: P[], arch: P[]): P | null {
  let best = { n: 0, d: null as P | null };
  for (const a of arch.slice(0, 40))
    for (const c of cols) {
      const dx = a.x - c.x;
      const dy = a.y - c.y;
      const n = cols.filter((q) => arch.some((r) => Math.abs(r.x - q.x - dx) < 100 && Math.abs(r.y - q.y - dy) < 100)).length;
      if (n > best.n) best = { n, d: { x: dx, y: dy } };
    }
  return best.n >= Math.min(20, cols.length * 0.8) ? best.d : null;
}

const mid = (pts: P[]): P => {
  const b = bbox(pts);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};

/** archCols: mimari plandaki kolon kesitleri; plate: kat genel sınırı (pafta dışı çizimleri — kesitler, antet — ayıklamak için). */
export function structure3d(archCols: P[][], plate: P[]): string[] {
  const file = (s: string) => `${DIR}/AKM-S-${s}-R01.dxf`;
  const sheets = ['TemP-01-01', 'KalP-01-01', 'KalP-02-01', 'KalP-03-01'];
  if (!sheets.every((s) => existsSync(file(s)))) return [`Statik DXF yok (${DIR}); kaba inşaat modeli atlandı.`];
  const arch = archCols.map(mid);
  const pb = bbox(plate);
  const near = (p: P) => p.x > pb.minX - 15000 && p.x < pb.maxX + 15000 && p.y > pb.minY - 15000 && p.y < pb.maxY + 15000;
  const load = (s: string, ref?: P) => {
    const fl = flatten(readDxf(file(s)));
    const cols = fl.filter((f) => f.layer.startsWith('KOLON-PERDE') && f.closed && f.pts);
    const d = cols.length >= 20 ? align(cols.map((f) => mid(f.pts!)), arch) : ref;
    if (!d) throw new Error(`${s}: statik pafta mimari plana hizalanamadı`);
    const mv = (pts: P[]) => pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
    const pick = (pred: (f: Flat) => boolean) => fl.filter((f) => pred(f) && f.pts && f.pts.length > 1).map((f) => ({ f, pts: mv(f.pts!) })).filter((e) => near(mid(e.pts)));
    return { d, pick, cols: pick((f) => f.layer.startsWith('KOLON-PERDE') && !!f.closed) };
  };
  const tem = load('TemP-01-01');
  const k1 = load('KalP-01-01');
  const k2 = load('KalP-02-01');
  // +29,80 paftasında kolon kesiti az (4); paftalar ortak çerçevede 376 m arayla dizili → KalP-01-01 ötelemesinden
  const k3 = load('KalP-03-01', { x: k1.d.x - 376000, y: k1.d.y });

  const add = (label: string, kind: 'prism' | 'ribbon', pts: P[], z0: number, z1: number, closed = true) =>
    model3d.add({ layer: 'kaba', kind, items: [], label, ...(kind === 'prism' ? { loops: [pts] } : { path: pts, closed }), z0, z1 });

  // Temeller: +21,50 üst, h=600 (temel planı genel kotu)
  const feet = tem.pick((f) => f.layer === 'emir-foundation' && !!f.closed);
  for (const e of feet) add('Temel (TemP-01-01, üst +21,50, h=600)', 'prism', e.pts, Z(21.5) - 0.6, Z(21.5));

  // Kolon/perde: temelden +28,80 (KalP-02'de varsa) ya da +25,40'a; +29,80 paftasında altında kolon görünen +29,80'e
  const has = (list: { pts: P[] }[], p: P) => list.some((e) => Math.hypot(mid(e.pts).x - p.x, mid(e.pts).y - p.y) < 150);
  const below3 = k3.pick((f) => f.layer === 'emir-column-below' && !!f.closed);
  for (const e of k1.cols) {
    const c = mid(e.pts);
    const top = has(below3, c) ? 29.8 : has(k2.cols, c) ? 28.8 : 25.4;
    add(`Kolon/perde (statik, üst +${top.toFixed(2).replace('.', ',')})`, 'prism', e.pts, Z(21.5), Z(top));
  }

  // Kirişler: kalıp çizgileri boyunca kat kotunun 60 cm altına inen düşey yüzeyler
  for (const [k, abs, s] of [[k1, 25.4, 'KalP-01-01'], [k2, 28.8, 'KalP-02-01'], [k3, 29.8, 'KalP-03-01']] as const)
    for (const e of k.pick((f) => f.layer === 'emir-formwork' && length(f.pts!) > 50)) add(`Kiriş / kalıp çizgisi (${s}, +${abs.toFixed(2).replace('.', ',')})`, 'ribbon', e.pts, Z(abs) - BEAM_H, Z(abs), !!e.f.closed);

  return [`Kaba inşaat: ${feet.length} temel, ${k1.cols.length} kolon/perde (statik paftalardan, yalnız görsel).`];
}
