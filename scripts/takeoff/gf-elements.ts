// Zemin kat elemanları: dış kontur (brüt alan, çevre), duvarlar (kalınlık sınıfı × uzunluk), kapılar, kolonlar.
import { writeFileSync } from 'node:fs';
import { readDxf } from './lib/dxf';
import { flatten, type Flat } from './lib/flatten';
import { area, bbox, length, pointInPolygon, regionArea, type P } from './lib/geom';
import { Grid } from './lib/raster';

const file = process.argv[2] ?? 'work/dxf/4199-A-DD-01-02-100.dxf';
const flat = flatten(readDxf(file));
const top = (f: Flat) => f.path[0] ?? '';
const WIN = { minX: 595000, minY: 5935000, maxX: 760000, maxY: 6035000 };
const inWin = (p: P) => p.x > WIN.minX && p.x < WIN.maxX && p.y > WIN.minY && p.y < WIN.maxY;
const out: Record<string, unknown> = {};

// --- 1. Dış kontur: duvar + cam + taşıyıcı çizgileri; dışarıdan doldur, kalan en büyük bölge = bina
{
  const BL = /^(4199_AMH_Walls_GF|4199_AMG_Glass new2|STRUCTURE_GF_NN|vestibule|salon_giris_kutlesi)$/;
  const LY = /^(A_Wall|A_Mat_Glas|A_Mat_Mtal|A_Stuc_Conc|A_Patt_Wall|A_Mat_Othr)/; // kapılar hariç: dışa açılan kanat yayları konturu şişirmesin
  const g = new Grid(WIN, 25);
  for (const f of flat) {
    if (!BL.test(top(f)) || !LY.test(f.layer) || f.path.includes('cephe profıl')) continue; // cam cephe dikme kanatları hariç
    if (f.loops) f.loops.forEach((l) => g.polyline(l, true));
    else if (f.pts && f.pts.some(inWin)) g.polyline(f.pts, !!f.closed);
  }
  // kat genel sınırı (iç yüz) kapı boşluklarından içeri sızmayı önler
  for (const f of flat) if (f.layer === 'A_Nplt_Area' && top(f) === '4199_AMH-Alanlar' && f.closed && f.pts && area(f.pts) > 6e9) g.polyline(f.pts, true);
  const outside = g.fill({ x: WIN.minX + 100, y: WIN.minY + 100 });
  for (let i = 0; i < g.cells.length; i++) g.cells[i] = g.cells[i] === 2 ? 0 : 2;
  const outline = g.outline();
  const A = area(outline) / 1e6;
  const L = length(outline, true) / 1000;
  out.footprint = { area: A, perimeter: L, outsideCells: outside.cells, outline };
  console.log(`Dış kontur (duvar/cam dış yüzü): alan ${A.toFixed(2)} m², çevre ${L.toFixed(2)} m (ızgara 25 mm)`);
}

// --- 2. Duvarlar: A_Patt_Wall taramaları (Walls_GF). Her bölge için alan A, çevre P → kalınlık t, uzunluk L
{
  const walls = flat.filter((f) => top(f) === '4199_AMH_Walls_GF' && f.layer === 'A_Patt_Wall' && f.t === 'HATCH' && f.loops);
  const outline = (out.footprint as { outline: P[] }).outline;
  const classes = new Map<number, { n: number; L: number; A: number; ext: number }>();
  const pieces: { t: number; L: number; A: number; ext: boolean; c: P }[] = [];
  for (const h of walls) {
    const A = regionArea(h.loops!);
    const Pm = h.loops!.reduce((s, l) => s + length(l, true), 0);
    const disc = (Pm / 2) ** 2 - 4 * A;
    const t = disc > 0 ? (Pm / 2 - Math.sqrt(disc)) / 2 : Math.sqrt(A);
    const L = A / t;
    const tc = Math.round(t / 50) * 50; // 5 cm sınıfı
    const b = bbox(h.loops![0]);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    // dış duvar: kontura 1 m'den yakın
    const near = outline.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < Math.max(1000, L / 2));
    pieces.push({ t, L, A, ext: near, c });
    const k = classes.get(tc) ?? { n: 0, L: 0, A: 0, ext: 0 };
    k.n++;
    k.L += L;
    k.A += A;
    if (near) k.ext += L;
    classes.set(tc, k);
  }
  console.log(`\nDuvar taramaları (A_Patt_Wall, ${walls.length} adet):`);
  let sumL = 0;
  let sumA = 0;
  for (const [tc, k] of [...classes.entries()].sort((a, b) => a[0] - b[0])) {
    sumL += k.L;
    sumA += k.A;
    console.log(`  t≈${(tc / 10).toFixed(0).padStart(3)} cm: ${String(k.n).padStart(3)} parça, L=${(k.L / 1000).toFixed(1)} m (dış yakını ${(k.ext / 1000).toFixed(1)} m), taban ${(k.A / 1e6).toFixed(2)} m²`);
  }
  console.log(`  TOPLAM L=${(sumL / 1000).toFixed(1)} m, taban izi ${(sumA / 1e6).toFixed(2)} m²`);
  out.walls = { classes: Object.fromEntries(classes), pieces };
}

// --- 3. Kapılar: A_Door_Wood katmanındaki blok eklemeleri; çocuk yayların yarıçapı = kanat genişliği
{
  const doorIns = flat.filter((f) => f.t === 'INSERT' && f.layer === 'A_Door_Wood' && f.path.length >= 1 && !f.path.some((p) => /kapi|U\d+$/.test(p) && false));
  const byInst = new Map<number, Flat[]>();
  for (const f of flat) if (f.inst) byInst.set(f.inst, [...(byInst.get(f.inst) ?? []), f]);
  const doors: { block: string; name: string; at: P; leaves: number[] }[] = [];
  for (const d of doorIns) {
    if (doorIns.some((o) => o !== d && o.inst !== undefined && d.path.includes(o.name!) && o.at && d.at && Math.hypot(o.at.x - d.at.x, o.at.y - d.at.y) < 3000)) continue; // iç içe kapı bloklarını bir kez say
    const kids = byInst.get(d.inst!) ?? [];
    const radii: number[] = [];
    for (const k of kids) {
      if ((k.t !== 'ARC' && k.t !== 'PLINE') || k.closed || !k.pts || k.pts.length < 5) continue;
      const [a, m, b] = [k.pts[0], k.pts[Math.floor(k.pts.length / 2)], k.pts[k.pts.length - 1]];
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      const sag = Math.abs((b.x - a.x) * (a.y - m.y) - (a.x - m.x) * (b.y - a.y)) / (chord || 1);
      const r = sag > 0 ? (chord * chord) / (8 * sag) + sag / 2 : 0;
      // gerçek yay mı: üç noktadan geçen çemberin merkezine tüm noktalar eşit uzaklıkta olmalı
      const ax = a.x, ay = a.y, bx = m.x, by = m.y, cx = b.x, cy = b.y;
      const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(dd) < 1e-9) continue;
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / dd;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / dd;
      const rr = Math.hypot(ax - ux, ay - uy);
      if (!k.pts.every((q) => Math.abs(Math.hypot(q.x - ux, q.y - uy) - rr) < rr * 0.01)) continue;
      if (r > 500 && r < 2000) radii.push(Math.round(r / 50) * 50);
    }
    if (d.at && inWin(d.at)) doors.push({ block: top(d), name: d.name!, at: d.at, leaves: radii });
  }
  const groups = new Map<string, number>();
  for (const d of doors) {
    const k = d.leaves.length === 0 ? `kanat yayı yok (${d.name})` : `${d.leaves.length === 1 ? 'tek' : d.leaves.length === 2 ? 'çift' : d.leaves.length + 'li'} kanat ${d.leaves.reduce((a, b) => a + b, 0) / 10} cm`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  console.log(`\nKapılar (${doors.length} blok):`);
  for (const [k, n] of [...groups.entries()].sort()) console.log(`  ${String(n).padStart(3)} × ${k}`);
  out.doors = doors;
}

// --- 4. Kolonlar ve perdeler: STRUCTURE_GF_NN / A_Stuc_Conc
{
  const st = flat.filter((f) => top(f) === 'STRUCTURE_GF_NN' && f.layer === 'A_Stuc_Conc' && f.closed && f.pts);
  const fp = (out.footprint as { outline: P[] }).outline;
  const kinds = new Map<string, { n: number; inside: number; A: number }>();
  for (const f of st) {
    const A = area(f.pts!) / 1e6;
    const b = bbox(f.pts!);
    const w = (b.maxX - b.minX) / 10;
    const h = (b.maxY - b.minY) / 10;
    let k: string;
    if (f.t === 'CIRCLE') k = `dairesel Ø${Math.round(w)}`;
    else if (Math.abs(A - 0.36) < 0.02) k = 'kare 60×60';
    else if (A < 0.6) k = `küçük kesit ${A.toFixed(2)} m²`;
    else k = `perde/büyük kesit ${A.toFixed(2)} m² (${Math.round(w)}×${Math.round(h)} cm kutu)`;
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const e = kinds.get(k) ?? { n: 0, inside: 0, A: 0 };
    e.n++;
    e.A += A;
    if (pointInPolygon(c, fp)) e.inside++;
    kinds.set(k, e);
  }
  console.log(`\nTaşıyıcı kesitler (A_Stuc_Conc kapalı, ${st.length}):`);
  for (const [k, e] of [...kinds.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(e.n).padStart(3)} × ${k}  (bina içinde ${e.inside}, toplam kesit ${e.A.toFixed(2)} m²)`);
}

writeFileSync('work/gf-elements.json', JSON.stringify(out));
