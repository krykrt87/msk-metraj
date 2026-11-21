// Görünüş paftalarından cephe malzeme alanları: taramalar 50 mm ızgarada birleştirilir (XCLIP kırpması uygulanır),
// önde olan malzeme önceliklidir (MATS sırası). Her malzemenin görünen hücreleri dikdörtgenlere ayrılır (cetvel).
// Çıktı: work/facade-areas.json  { [görünüş]: { [malzeme]: { gross, net, src, rects: [genişlik, yükseklik, x, z][] (m) } } }
// Çalıştırma (depo kökünden): node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs scripts/takeoff/facade/elevations.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { ELEV, load, center, inWin, bbox, colStr, type Flat } from './common';
import { hatchSpans, cellA, CELL } from './raster';
import { renderPng } from '../lib/render';
import { pointInPolygon } from '../lib/geom';
const solid = (c: string) => c.slice(0, c.lastIndexOf(',')) + ',1)';
const COL = ['rgba(90,90,90,0.55)','rgba(37,99,235,0.45)','rgba(14,165,233,0.6)','rgba(234,179,8,0.5)','rgba(220,38,38,0.35)','rgba(249,115,22,0.35)','rgba(250,204,21,0.3)','rgba(147,51,234,0.5)','rgba(236,72,153,0.5)','rgba(16,185,129,0.6)','rgba(100,116,139,0.5)','rgba(20,184,166,0.6)','rgba(30,30,30,0.6)','rgba(132,204,22,0.5)'];
const { flat } = load('work/dxf/4199-A-DD-01-04-100.dxf');
const ground: Record<string, number> = { SE: 187.5, NW: 187.5, NE: 129.9, SW: 129.8 };
const MATS = ['COLUMN (unlabelled)', 'FG-01 glass', 'FG-01? slot glazing (unlabelled)', 'FS-01 stone', 'FM-01 hall shell', 'FM-04 rear shell (visible part)', 'shell misc (unlabelled)',
  'FM-01 eave top band', 'FM-02 eave fascia', 'FM-03 eave lower band', 'eave soffit strip (unlabelled)', 'FM-05 service band', 'FP-01 dark plaster (2f3031)', 'door frames/louvres/misc'] as const;
function classify(f: Flat, name: string, zb: number[]): string | null {
  const p = f.path.join('>'); const last = f.path.slice(-1)[0] ?? ''; const pat = f.pattern ?? '';
  if (/^cevre_/.test(p) || f.layer === 'A_Anno_Level') return null;
  if (/KOLON/.test(last)) return MATS[0];
  if (/4185_PP_STONE/.test(last)) return MATS[3];
  if (pat === 'DOTS') return MATS[1];
  if (last === 'GÖRÜNÜŞ04_ÖN' && pat === 'AR-SAND') return MATS[1];
  if (last === 'GÖRÜNÜŞ04_YAN' && pat === 'AR-SAND') return MATS[2];
  if (/cati_kaplama_(on1|arka1|sol1)/.test(last)) return MATS[4];
  if (/cati_kaplama_(on2|arka2)|cati_sag_gor/.test(last)) return MATS[5];
  if (/^(cati_sol|ÇATI GÖRÜNÜŞ|cati_gor_arka)$/.test(last)) return MATS[6];
  if (f.tc !== undefined && (f.tc & 0xffffff) === 0x2f3031) return MATS[12];
  const [z0, z1] = zb; const mid = (z0 + z1) / 2;
  if (pat === 'SOLID' && /SAÇAK|GÖRÜNÜŞ_01|ÖNCEPHE|GÖRÜNÜŞ04_ÖN|ARKA1|sol_cephe/.test(last) && z0 >= 5.8) {
    if (mid >= 7.55) return MATS[7]; if (mid >= 6.4) return MATS[8]; if (z0 >= 5.98) return MATS[9]; return MATS[10];
  }
  if (pat === 'SOLID' && /A_Patt_Othr/.test(f.layer) && /AKRA2|arka_gor|GÖRÜNÜŞ04_YAN/.test(last) && ((z0 >= 4.0 && z1 <= 4.4) || z0 >= 7.15)) return MATS[11];
  return MATS[13];
}
const result: Record<string, Record<string, { gross: number; net: number; src: string; rects: [number, number, number, number][]; hatches: { x: number; y: number }[][][] | null }>> = {};
for (const [name, e] of Object.entries(ELEV)) {
  const nx = Math.ceil((e.win[2] - e.win[0]) / CELL), ny = Math.ceil((e.win[3] - e.win[1]) / CELL);
  const owner = new Int8Array(nx * ny).fill(-1); const gross = new Array(MATS.length).fill(0);
  const per: { mi: number; spans: Map<number, number[]>; loops: { x: number; y: number }[][]; clipped: boolean }[] = [];
  const hk = new Map<string, Set<string>>(); const hls: any[] = [];
  for (const f of flat) {
    if (f.t !== 'HATCH' || !f.loops?.length) continue;
    const c = f.clips ? (() => { const b = bbox(f.clips![f.clips!.length - 1]); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; })() : center(f);
    if (!inWin(c, e.win)) continue;
    const spans = hatchSpans(f, e.win); if (!spans.size) continue;
    const rows = [...spans.keys()]; const zb = [Math.min(...rows), Math.max(...rows) + 1].map((r) => (e.win[1] + r * CELL) / 1000 - ground[name]);
    const m = classify(f, name, zb); if (!m) continue;
    const mi = MATS.indexOf(m as any); per.push({ mi, spans, loops: f.loops!, clipped: !!f.clips }); hls.push({ loops: f.clips ? [f.clips[f.clips.length - 1]] : f.loops!, fill: COL[mi], stroke: solid(COL[mi]) });
    const key = `${f.path.slice(-1)[0] ?? '-'}|${f.layer}|${f.pattern}`; (hk.get(m) ?? hk.set(m, new Set()).get(m)!).add(key);
  }
  // gross union per material
  for (let mi = 0; mi < MATS.length; mi++) {
    const s = new Uint8Array(nx * ny); let n = 0;
    for (const h of per) if (h.mi === mi) for (const [r, sp] of h.spans) { if (r < 0 || r >= ny) continue; for (let q = 0; q < sp.length; q += 2) for (let cc = Math.max(0, sp[q]); cc < Math.min(nx, sp[q + 1]); cc++) { const i = r * nx + cc; if (!s[i]) { s[i] = 1; n++; } if (owner[i] < 0 || owner[i] > mi) owner[i] = mi; } }
    gross[mi] = n;
  }
  const net = new Array(MATS.length).fill(0); for (const o of owner) if (o >= 0) net[o]++;
  {
    const base = flat.filter((f) => f.t !== 'TEXT' && f.t !== 'HATCH' && f.pts && !f.path.some((p) => /^cevre_|SDHTRHT|TREE/.test(p)) && inWin(f.pts[0], e.win) && (!f.clips || f.pts.every((q) => f.clips!.every((c) => pointInPolygon(q, c)))));
    const xs = hls.flatMap((h) => h.loops.flat().map((p: any) => p.x));
    const x0 = Math.min(...xs) - 3000, x1 = Math.max(...xs) + 3000, g0 = ground[name] * 1000;
    const marks = MATS.map((m, i) => ({ at: { x: x0 + 1500 + (i % 5) * ((x1 - x0) / 5), y: g0 + 21500 - Math.floor(i / 5) * 1300 }, text: m, color: solid(COL[i]) }));
    mkdirSync('work/png/facade', { recursive: true });
    renderPng(`work/png/facade/mat_${name}.png`, { base, highlights: hls, marks, window: { minX: x0, minY: g0 - 1500, maxX: x1, maxY: g0 + 23000 }, width: 2400, title: `${name} ${e.sheet} — hatch-based material map (XCLIP applied)` });
  }
  // görünen hücreler → dikdörtgenler (aynı sütun aralığındaki ardışık satırlar birleşir; her hücre tek dikdörtgende)
  const rectsOf = (mi: number): [number, number, number, number][] => {
    const out: [number, number, number, number][] = [];
    let open = new Map<string, number>();
    for (let r = 0; r <= ny; r++) {
      const cur = new Map<string, number>();
      if (r < ny)
        for (let c = 0; c < nx; ) {
          if (owner[r * nx + c] !== mi) {
            c++;
            continue;
          }
          const c0 = c;
          while (c < nx && owner[r * nx + c] === mi) c++;
          const k = `${c0},${c}`;
          cur.set(k, open.get(k) ?? r);
        }
      for (const [k, r0] of open)
        if (cur.get(k) !== r0) {
          const [c0, c1] = k.split(',').map(Number);
          // [genişlik, yükseklik, sol x (görünüş, m), alt z (±0,00'dan, m)]
          out.push([((c1 - c0) * CELL) / 1000, ((r - r0) * CELL) / 1000, (e.win[0] + c0 * CELL) / 1000, (e.win[1] + r0 * CELL) / 1000 - ground[name]]);
        }
      open = cur;
    }
    return out;
  };
  result[name] = {};
  MATS.forEach((m, i) => {
    if (gross[i]) result[name][m] = { gross: gross[i] * cellA, net: net[i] * cellA, src: [...(hk.get(m) ?? [])].join('; '), rects: rectsOf(i), hatches: per.some((h) => h.mi === i && h.clipped) ? null : per.filter((h) => h.mi === i).map((h) => h.loops) };
  });
  console.log(`\n===== ${name} (${e.sheet}, block ${e.blk})`);
  MATS.forEach((m, i) => { if (gross[i]) console.log(`${m.padEnd(34)} gross ${(gross[i] * cellA).toFixed(1).padStart(7)}  net-visible ${(net[i] * cellA).toFixed(1).padStart(7)}   <- ${[...(hk.get(m) ?? [])].join('; ')}`); });
}
writeFileSync('work/facade-areas.json', JSON.stringify(result));
