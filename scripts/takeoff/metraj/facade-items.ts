// Cephe kalemleri.
// - Görünüş alanları: görünüş paftalarındaki malzeme taramalarının birleşimi (50 mm tarama ızgarası, taş deseninin
//   XCLIP kırpması uygulanmış) → scripts/out/facade/final.ts. Değerler izdüşümdür.
// - Cam (FG-01): zemin kat planındaki cam cephe dikmelerinin zinciri → gerçek (açınım) uzunluk × cam yüksekliği.
// - Saçak bantları: bant yüksekliği × saçak serbest kenar uzunluğu (B.7) → formül.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readDxf } from '../lib/dxf';
import { flatten } from '../lib/flatten';
import { readFileSync } from 'node:fs';
import { decomposeRegion, mergeRows, type CalcRow } from '../lib/decompose';
import { pointInPolygon, type P } from '../lib/geom';
import type { Line, TakeoffItem } from './model';
import { formatTr } from '../../../shared/number';
import { model3d } from './model3d';
import { roomsAlong, roomsNear, sideOf } from './rooms-index';

const ELEVS = [
  { key: 'SE', name: 'Güneydoğu', dwg: '4199-A-DD-01-04-100' },
  { key: 'NE', name: 'Kuzeydoğu', dwg: '4199-A-DD-01-04-200' },
  { key: 'NW', name: 'Kuzeybatı', dwg: '4199-A-DD-01-04-300' },
  { key: 'SW', name: 'Güneybatı', dwg: '4199-A-DD-01-04-400' },
] as const;
type Mat = { gross: number; net: number; src: string; rects: [number, number, number, number][]; hatches: P[][][] | null };
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Görünüş ölçümündeki çalışma adları → projedeki adlandırma. */
const MAT_TR: Record<string, string> = {
  'FG-01 glass': 'FG-01 cam',
  'FG-01? slot glazing (unlabelled)': 'taş arası dar cam (etiketsiz)',
  'FS-01 stone': 'FP-01 traverten (görünüşte FS-01)',
  'FM-01 hall shell': 'FM-01 salon kabuğu',
  'FM-04 rear shell (visible part)': 'FM-04 kabuk arka yüzü (görünen kısım)',
  'shell misc (unlabelled)': 'kabuk – diğer parçalar (etiketsiz)',
  'FM-01 eave top band': 'FM-01 saçak üst bandı',
  'FM-02 eave fascia': 'FM-02 saçak alın bandı',
  'FM-03 eave lower band': 'FM-03 saçak alt bandı',
  'eave soffit strip (unlabelled)': 'saçak altı şerit (etiketsiz)',
  'FM-05 service band': 'FM-05 servis bloğu üst bandı',
  'FP-01 dark plaster (2f3031)': 'FP-01 koyu sıva',
  'COLUMN (unlabelled)': 'kolon kaplaması (etiketsiz)',
  'door frames/louvres/misc': 'kapı kasası / panjur / diğer',
};
const matTr = (m: string) => MAT_TR[m] ?? m;

function elevationAreas(): Record<string, Record<string, Mat>> {
  // ayrı süreçte (bellek): scripts/takeoff/facade/elevations.ts → work/facade-areas.json
  const res = spawnSync(process.execPath, ['--max-old-space-size=8192', join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/takeoff/facade/elevations.ts'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64e6 });
  if (res.status !== 0) throw new Error(`Görünüş ölçümü çalışmadı: ${res.stderr?.slice(0, 500)}`);
  return JSON.parse(readFileSync('work/facade-areas.json', 'utf8'));
}

/**
 * Görünüş satırının cetveli. Taramalar birbiriyle çakışmıyor ve önde başka malzeme yoksa taramanın kendi şekli
 * (dikdörtgen/yamuk; eğik kenarlar tam). Aksi halde ızgarada görünen hücrelerin dikdörtgenleri (5 cm adım).
 */
function elevCalc(m: Mat): { value: number; calc: CalcRow[]; how: string } {
  if (m.hatches && Math.abs(m.gross - m.net) < 0.05) {
    const calc = mergeRows(m.hatches.flatMap((l) => decomposeRegion(l)));
    const v = calc.reduce((s, r) => s + r.value, 0);
    if (Math.abs(v - m.gross) <= Math.max(0.3, m.gross * 0.005)) return { value: v, calc, how: 'tarama şeklinden (çakışma yok, önünde başka malzeme yok)' };
  }
  const calc = mergeRows(m.rects.map(([w, h]) => ({ kind: 'dikdörtgen' as const, label: 'görünen alan', adet: 1, en: w, boy: h, sign: 1 as const, value: w * h })));
  calc.sort((a, b) => b.value - a.value);
  const hidden = m.gross - m.net >= 0.05 ? `; önde kalan malzemenin kapattığı ${r2(m.gross - m.net)} m² düşüldü` : '';
  return { value: calc.reduce((s, r) => s + r.value, 0), calc, how: `görünen alan 5 cm ızgarada dikdörtgenlere ayrıldı (taramalar çakışıyor${hidden})` };
}

/**
 * Görünüşte ölçülen bir malzemeyi 3B'ye taşır. Plandaki cephe kaplama şeritlerinin (CEPHE KAPLAMA, SOLID) dış yüzleri
 * hangi görünüşe bakıyorsa o görünüşün malzeme dikdörtgenleri (konumlu) bu yüzlere yatay konumuna göre izdüşürülür.
 * Kalibrasyon: salon bloğunun görünüşteki (kabuk) ve plandaki (parapet dış yüzü) yatay merkezi; genişlikler 0,6 m içinde. Görünüş z'leri
 * −0,40 saha kotundan ölçülür (salon kabuk üstleri ve parapetler kesitle karşılaştırıldı).
 */
/**
 * Görünüşte taş görünen ama gerçekte başka bir yüzeyin önünde/arkasında kalan şerit kenarları (proje ekibi bildirimi,
 * 2026-11-22). Görünüş → plan eşlemesi derinliğe ve yüzey yüksekliğine bakmadığı için taş bu kenarlara da kopyalanıyordu;
 * aynı taş, öndeki/yüksek duvarda zaten modelde (CEP-202 Küçük Salon 01 eğik duvarı, CEP-179 kuzeydoğu kanadı). Nokta: kenar üstünde, mm.
 * shortcut: elle liste; görünüşte başka yanlış kopya bulunursa buraya eklenir, çok olursa yüzey yükseklikli gizli yüzey ayıklaması gerekir.
 */
const NOT_STONE: P[] = [
  { x: 639472, y: 6023901 }, // mutfak batı yüzü (GB görünüşünde Küçük Salon 01 önde)
  { x: 674672, y: 6023451 }, // depo/teknik alan arası girinti yüzü (GB görünüşünde arkada)
  { x: 715522, y: 6025676 }, // kuzey kanadın alçak ön yüzü (KB görünüşünde +3,95 üstü arkadaki duvar)
  { x: 718222, y: 6025676 },
];
/** Planda cephe kaplama şeridi çizilmemiş (kapı/cam açıklığı) ama görünüşte üstünde taş olan cephe yüzleri: dış yüz çizgisi, mm. */
const NO_STRIP_FACES: { a: P; b: P }[] = [
  { a: { x: 637372, y: 6022128 }, b: { x: 639472, y: 6022128 } }, // Küçük Salon 01 – mutfak arası kapı yüzü (DON-56), KB görünüşü
];
const distToSeg = (p: P, a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
};

const kot = (z: number) => `${z < 0 ? '−' : '+'}${Math.abs(z).toFixed(2).replace('.', ',')}`;
const m3f = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');
/** Görünüş başına: 3B yüzey satırları (CEP), görünüşte olup modelde yeri bulunamayan parçalar, iki yüzeye yerleşen alan (m², izdüşüm). */
type StoneView = { rows: CalcRow[]; missing: CalcRow[]; overlap: number };

function elevationToModel(A: Record<string, Record<string, Mat>>, mat: string, poz: string, layerLabel: string): Record<string, StoneView> {
  const flat = flatten(readDxf('work/dxf/4199-A-DD-01-02-100.dxf'));
  const plate = model3d.find((e) => e.items.includes('A.3'))[0]?.loops?.[0];
  const hallPts = model3d.find((e) => e.items.includes('B.9')).flatMap((e) => e.path ?? e.faces?.flat() ?? []);
  if (!plate || !hallPts.length) return {};
  const hb = { minX: Math.min(...hallPts.map((p) => p.x)), maxX: Math.max(...hallPts.map((p) => p.x)), minY: Math.min(...hallPts.map((p) => p.y)), maxY: Math.max(...hallPts.map((p) => p.y)) };
  const Z0 = -0.4;
  const inPoly = (p: P, poly: P[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
    return c;
  };
  // görünüş: bakış yönü (cephenin dış normali) ve plan ↔ görünüş yatay eşlemesi (mm)
  const views = ELEVS.map((e) => {
    const shell = A[e.key]?.['FM-01 hall shell']?.rects ?? [];
    const u0 = Math.min(...shell.map((r) => r[2])) * 1000;
    const u1 = Math.max(...shell.map((r) => r[2] + r[0])) * 1000;
    const dir = { SE: { x: 0, y: -1 }, NE: { x: 1, y: 0 }, NW: { x: 0, y: 1 }, SW: { x: -1, y: 0 } }[e.key];
    // plan noktası → görünüş yatay koordinatı (mm)
    // merkezden hizalama: görünüşteki kabuk, kaplaması nedeniyle plandaki parapet dış yüzünden 0,3–0,4 m geniş
    const uc = (u0 + u1) / 2;
    const cx = (hb.minX + hb.maxX) / 2;
    const cy = (hb.minY + hb.maxY) / 2;
    const toU = {
      SE: (p: P) => uc + (p.x - cx),
      NW: (p: P) => uc + (cx - p.x),
      NE: (p: P) => uc + (p.y - cy),
      SW: (p: P) => uc + (cy - p.y),
    }[e.key];
    // görünüş yatay koordinatı → plandaki bakış hattı üstünde bir nokta (toU'nun tersi; derinlik 0)
    const fromU = {
      SE: (u: number): P => ({ x: u - uc + cx, y: 0 }),
      NW: (u: number): P => ({ x: uc + cx - u, y: 0 }),
      NE: (u: number): P => ({ x: 0, y: u - uc + cy }),
      SW: (u: number): P => ({ x: 0, y: uc + cy - u }),
    }[e.key];
    const planW = e.key === 'SE' || e.key === 'NW' ? hb.maxX - hb.minX : hb.maxY - hb.minY;
    return { e, dir, toU, fromU, scaleOk: Math.abs(u1 - u0 - planW) < 600, rects: A[e.key]?.[mat]?.rects ?? [] };
  });
  const out: Record<string, StoneView> = {};
  const viewOf = (k: string) => (out[k] ??= { rows: [], missing: [], overlap: 0 });
  // "görünüş:dikdörtgen" → yerleşen yatay aralıklar; row yoksa yüz bu görünüşte ikincil (alanı başka görünüşten sayıldı)
  const pieces = new Map<string, { lo: number; hi: number; row?: CalcRow }[]>();
  const addPiece = (key: string, piece: { lo: number; hi: number; row?: CalcRow }) => pieces.set(key, [...(pieces.get(key) ?? []), piece]);
  const strips = flat.filter((f) => f.path[0] === 'CEPHE KAPLAMA' && f.t === 'HATCH' && f.pattern === 'SOLID' && f.loops);
  const faces: { a: P; b: P; nx: number; ny: number }[] = [];
  for (const { a, b } of NO_STRIP_FACES) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const [nx, ny] = [-(b.y - a.y) / L, (b.x - a.x) / L];
    const out = !inPoly({ x: (a.x + b.x) / 2 + nx * 150, y: (a.y + b.y) / 2 + ny * 150 }, plate);
    faces.push({ a, b, nx: out ? nx : -nx, ny: out ? ny : -ny });
  }
  for (const h of strips)
    for (const loop of h.loops!)
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 250) continue;
        let nx = -(b.y - a.y) / L;
        let ny = (b.x - a.x) / L;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (inPoly({ x: m.x + nx * 20, y: m.y + ny * 20 }, loop)) ((nx = -nx), (ny = -ny)); // şeridin dışına bakan normal
        if (inPoly({ x: m.x + nx * 150, y: m.y + ny * 150 }, plate)) continue; // iç yüz (bina içine bakıyor)
        if (NOT_STONE.some((p) => distToSeg(p, a, b) < 100)) continue;
        faces.push({ a, b, nx, ny });
      }
  for (const { a, b, nx, ny } of faces) {
    const facing = (w: (typeof views)[number]) => nx * w.dir.x + ny * w.dir.y;
    const v = views.reduce((best, w) => (facing(w) > facing(best) ? w : best));
    if (facing(v) < 0.3 || !v.scaleOk) continue;
    // eğik yüz ikinci görünüşte de görünür: oradaki taş bu yüzün (aynı fiziksel alan) — örtülü sayılır, alan eklenmez
    for (const w of views) {
      if (w === v || facing(w) < 0.3 || !w.scaleOk) continue;
      const [wa, wb] = [w.toU(a), w.toU(b)];
      w.rects.forEach(([rw, , rx], k) => {
        const lo = Math.max(Math.min(wa, wb), rx * 1000);
        const hi = Math.min(Math.max(wa, wb), (rx + rw) * 1000);
        if (hi - lo >= 10) addPiece(`${w.e.key}:${k}`, { lo, hi });
      });
    }
    const ua = v.toU(a);
    const ub = v.toU(b);
    v.rects.forEach(([w, hh, x, z], k) => {
      const r0 = x * 1000;
      const r1 = (x + w) * 1000;
      const lo = Math.max(Math.min(ua, ub), r0);
      const hi = Math.min(Math.max(ua, ub), r1);
      if (hi - lo < 10) return;
      const at = (t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const [p0, p1] = [at((lo - ua) / (ub - ua)), at((hi - ua) / (ub - ua))];
      const en = Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y)) / 1000;
      const boy = Math.round(hh * 1000) / 1000;
      const room = roomsNear({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, 3000)[0]?.label;
      const row: CalcRow = { kind: 'dikdörtgen', label: 'taş yüzeyi', name: `${room ? room + ' dış yüzü' : 'dış yüz'}, ${kot(z + Z0)} → ${kot(z + hh + Z0)}`, adet: 1, en, boy, sign: 1, value: en * boy };
      model3d.add({ layer: 'cephe', kind: 'ribbon', items: [poz], lines: { [poz]: `${v.e.name} görünüşü (${v.e.dwg})` }, row, label: `${layerLabel} – ${v.e.name} cephesi (${(z + Z0).toFixed(2)} → ${(z + hh + Z0).toFixed(2)})`, path: [p0, p1], z0: z + Z0, z1: z + hh + Z0 });
      viewOf(v.e.key).rows.push(row);
      addPiece(`${v.e.key}:${k}`, { lo, hi, row });
    });
  }
  /** Görünüşteki u konumunda bakana en yakın bina dış yüzünün hemen içindeki mahal (kat genel sınırıyla kesişim). */
  const roomAtU = (v: (typeof views)[number], u: number): string | undefined => {
    const o = v.fromU(u);
    const d = v.dir;
    let best = -Infinity;
    for (let i = 0; i < plate.length; i++) {
      const p = plate[i];
      const q = plate[(i + 1) % plate.length];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p.x - o.x) * ey - (p.y - o.y) * ex) / den; // bakış hattı boyunca derinlik
      const sg = ((p.x - o.x) * d.y - (p.y - o.y) * d.x) / den; // kenar üstündeki konum
      if (sg >= 0 && sg <= 1 && t > best) best = t;
    }
    if (best === -Infinity) return undefined;
    return roomsNear({ x: o.x + d.x * (best - 600), y: o.y + d.y * (best - 600) }, 4000)[0]?.label;
  };
  // görünüşle karşılaştırma: her görünüş dikdörtgeni yüzeylerce tam bir kez örtülmeli
  const clash = new Set<CalcRow>();
  for (const v of views)
    v.rects.forEach(([w, hh, x, z], k) => {
      const o = viewOf(v.e.key);
      const gap = (g0: number, g1: number) => {
        if (g1 - g0 < 10) return;
        const en = Math.round(g1 - g0) / 1000;
        const boy = Math.round(hh * 1000) / 1000;
        const room = roomAtU(v, (g0 + g1) / 2);
        o.missing.push({ kind: 'dikdörtgen', label: 'görünüş parçası', name: `${room ? room + ' önü' : 'mahal bulunamadı'}, ${kot(z + Z0)} → ${kot(z + hh + Z0)} (görünüşte x ${m3f(g0)}–${m3f(g1)} m)`, adet: 1, en, boy, sign: 1, value: en * boy });
      };
      let cur = x * 1000;
      let last: { row?: CalcRow } | null = null;
      for (const p of (pieces.get(`${v.e.key}:${k}`) ?? []).sort((p, q) => p.lo - q.lo)) {
        if (last && p.lo < cur - 10) {
          // iki yüz de alan veriyorsa aynı görünüş alanı iki kez sayıldı
          if (p.row && last.row) ((o.overlap += ((Math.min(p.hi, cur) - p.lo) / 1000) * hh), clash.add(p.row).add(last.row));
        } else gap(cur, p.lo);
        if (p.hi > cur) ((cur = p.hi), (last = p));
      }
      gap(cur, (x + w) * 1000);
    });
  for (const r of clash) r.name += ' ⚠ görünüşte başka yüzeyle çakışıyor';
  return out;
}

/**
 * Görünüşte cam cephenin arkasında kalan, taş kaplı dış duvarlar (proje ekibinin bildirimi, 2026-11-22): küçük salonların
 * güneye bakan dış duvarları. Duvar, plandaki A_Patt_Wall parçası (ağırlık merkezi, mm) ile seçilir; taş, parçanın bina dışına
 * bakan uzun yüzüne ±0,00'dan saçak altına (+5,90) ya da duvar üstüne (+7,10) kadar konur.
 */
const HIDDEN_STONE_WALLS = [
  { at: { x: 611827, y: 6007953 }, z1: 7.1, where: 'açıkta, duvar üstüne kadar' },
  { at: { x: 619787, y: 5996631 }, z1: 5.9, where: 'saçak altı, saçak altı kotuna kadar' },
  { at: { x: 626948, y: 5997611 }, z1: 5.9, where: 'saçak altı, saçak altı kotuna kadar' },
];
function hiddenStoneWalls(poz: string, lineLabel: string): Line | null {
  const plate = model3d.find((e) => e.items.includes('A.3'))[0]?.loops?.[0];
  if (!plate) return null;
  const walls = model3d.find((e) => e.layer === 'duvar' && e.kind === 'prism' && !!e.loops);
  const centroid = (l: P[]) => ({ x: l.reduce((s, p) => s + p.x, 0) / l.length, y: l.reduce((s, p) => s + p.y, 0) / l.length });
  const calc: CalcRow[] = [];
  for (const w of HIDDEN_STONE_WALLS) {
    const wall = walls.find((e) => Math.hypot(centroid(e.loops![0]).x - w.at.x, centroid(e.loops![0]).y - w.at.y) < 200);
    if (!wall) throw new Error(`Taş kaplı duvar planda bulunamadı (${w.at.x}, ${w.at.y})`);
    const l = wall.loops![0];
    // dış yüz: uzun kenarlardan, normali bina dışına (kat genel sınırının dışına) bakan
    const face = l
      .map((a, i) => ({ a, b: l[(i + 1) % l.length] }))
      .filter(({ a, b }) => Math.hypot(b.x - a.x, b.y - a.y) > 1000)
      .find(({ a, b }) => {
        const c = centroid(l);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const d = Math.hypot(m.x - c.x, m.y - c.y);
        return !inPolygon({ x: m.x + ((m.x - c.x) / d) * 500, y: m.y + ((m.y - c.y) / d) * 500 }, plate);
      });
    if (!face) throw new Error(`Taş kaplı duvarın dış yüzü bulunamadı (${w.at.x}, ${w.at.y})`);
    const en = Math.round(Math.hypot(face.b.x - face.a.x, face.b.y - face.a.y)) / 1000;
    const room = roomsNear(centroid(l), 3000)[0]?.label ?? 'mahal bulunamadı';
    const row: CalcRow = { kind: 'dikdörtgen', label: `${room} dış duvarı (${w.where})`, name: `${room} dış duvarı, ±0,00 → ${kot(w.z1)} (${w.where})`, adet: 1, en, boy: w.z1, sign: 1, value: en * w.z1 };
    model3d.add({ layer: 'cephe', kind: 'ribbon', items: [poz], lines: { [poz]: lineLabel }, row, label: `Traverten (FP-01) – ${room} dış duvarı (±0,00 → +${w.z1.toFixed(2).replace('.', ',')})`, path: [face.a, face.b], z0: 0, z1: w.z1 });
    calc.push(row);
  }
  return { label: lineLabel, value: r2(calc.reduce((s, r) => s + r.value, 0)), unit: 'm²', note: 'görünüşte cam cephenin arkasında kaldığı için görünüş ölçümünde yok; plandaki duvar dış yüzü uzunluğu × yükseklik (proje ekibi bildirimi)', calc };
}

const inPolygon = (p: P, poly: P[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (poly[i].y > p.y !== poly[j].y > p.y && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
  return c;
};

/** Cam cephe dikmeleri → zincirler → ardışık dikmeler arası mesafeler (gerçek cephe boyunca). */
export function glassChains(): { chains: { pts: P[]; bays: number[] }[] } {
  const flat = flatten(readDxf('work/dxf/4199-A-DD-01-02-100.dxf'));
  const raw = flat.filter((f) => f.t === 'INSERT' && f.path[0] === '4199_AMG_Glass new2' && f.path.length === 1 && /^(cephe profıl|\*U8[346])$/.test(f.name ?? '') && f.at);
  const pts: P[] = [];
  for (const f of raw) if (!pts.some((p) => Math.hypot(p.x - f.at!.x, p.y - f.at!.y) < 300)) pts.push(f.at!);
  const used = new Set<number>();
  const chains: { pts: P[]; bays: number[] }[] = [];
  const near = (i: number) => {
    let best = -1;
    let bd = 3500;
    pts.forEach((q, j) => {
      if (used.has(j)) return;
      const d = Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
      if (d < bd) ((bd = d), (best = j));
    });
    return best;
  };
  while (used.size < pts.length) {
    // zincir ucu: en az komşusu olan kullanılmamış nokta
    let start = -1;
    let minDeg = Infinity;
    pts.forEach((p, i) => {
      if (used.has(i)) return;
      const deg = pts.filter((q, j) => j !== i && !used.has(j) && Math.hypot(q.x - p.x, q.y - p.y) < 3500).length;
      if (deg < minDeg) ((minDeg = deg), (start = i));
    });
    const chain = [pts[start]];
    used.add(start);
    let cur = start;
    for (let nx = near(cur); nx >= 0; nx = near(cur)) {
      chain.push(pts[nx]);
      used.add(nx);
      cur = nx;
    }
    const bays = chain.slice(1).map((p, k) => Math.hypot(p.x - chain[k].x, p.y - chain[k].y) / 1000);
    if (bays.length) chains.push({ pts: chain, bays });
  }
  return { chains };
}

export function facadeItems(): { items: TakeoffItem[]; findings: { topic: string; drawings: string; finding: string; suggestion: string }[] } {
  const A = elevationAreas();
  const items: TakeoffItem[] = [];
  const findings: { topic: string; drawings: string; finding: string; suggestion: string }[] = [];
  const elevLines = (mat: string, useNet = true): Line[] =>
    ELEVS.filter((e) => A[e.key]?.[mat]).map((e) => {
      const c = useNet ? elevCalc(A[e.key][mat]) : null;
      return {
        label: `${e.name} görünüşü (${e.dwg})`,
        value: r2(c ? c.value : A[e.key][mat].gross),
        unit: 'm²',
        note: `${c ? c.how : 'tarama birleşimi'}; kaynak: ${A[e.key][mat].src}`,
        ...(c ? { calc: c.calc } : {}),
      };
    });
  const sum = (ls: Line[]) => r2(ls.reduce((s, l) => s + (l.value ?? 0), 0));
  const elevSources = ELEVS.map((e) => ({ drawing: e.dwg, where: 'görünüş blokları · malzeme taramaları (SOLID / DOTS / AR-SAND), malzeme etiketleri A_Anno_Text_Mat' }));
  const UNION =
    'Görünüş paftalarındaki malzeme taramaları 50 mm ızgarada birleştirildi (üst üste binen taramalar bir kez sayıldı); doğal taş deseninin XCLIP kırpması uygulandı; malzeme, A_Anno_Text_Mat etiketinin ucunun düştüğü taramadan belirlendi. Değerler görünüşteki izdüşüm alanıdır. Cetvel: taramalar çakışmıyorsa ve önlerinde başka malzeme yoksa taramanın kendi şekli (dikdörtgen/yamuk, eğik kenarlar tam); aksi halde görünen alan 5 cm ızgarada dikdörtgenlere ayrıldı.';

  // --- C.1 Cam cephe (FG-01): plandaki dikme zincirinden gerçek uzunluk
  const H = 5.35;
  const { chains } = glassChains();
  const glassLines: Line[] = [];
  let devL = 0;
  let doorL = 0;
  let wideNo = 0;
  // Alüminyum doğrama (00-09-100 detay planı / kesit A): dikme 80 × 200 mm, kayıt 200 × 50 mm; cam profilin dış yüzünde, profil içe doğru
  const MW = 40; // dikme yarı genişliği, mm
  const MD = 200; // profil derinliği, mm
  const plate = model3d.find((e) => e.items.includes('A.3'))[0]?.loops?.[0];
  const unit = (a: P, b: P): P => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  };
  /** Bölmenin bina içine bakan birim normali (kat genel sınırına göre). */
  const inward = (a: P, b: P): P => {
    const t = unit(a, b);
    const n = { x: -t.y, y: t.x };
    const probe = { x: (a.x + b.x) / 2 + n.x * 300, y: (a.y + b.y) / 2 + n.y * 300 };
    return plate && !pointInPolygon(probe, plate) ? { x: -n.x, y: -n.y } : n;
  };
  const rect = (o: P, t: P, n: P, l0: number, l1: number): P[] => [l0, l1].flatMap((l, j) => (j ? [0, MD] : [MD, 0]).map((d) => ({ x: o.x + t.x * l + n.x * d, y: o.y + t.y * l + n.y * d })));
  const headLines: Line[] = [];
  chains.forEach((c, i) => {
    // 3B: ardışık dikmeler arası; dar bölmeler cam (+0,10 → +5,45), geniş bölmeler kapı (C.14)
    const along = roomsAlong(c.pts, 4000).map((r) => r.label);
    const mid = c.pts[Math.floor(c.pts.length / 2)];
    const c1Line = `Cam hattı ${i + 1} (${c.bays.filter((b) => b <= 2.0).length} bölme): ${along.length ? along.join(', ') + ' önü' : 'mahal bulunamadı'}${c.bays.length > 4 ? `, ${sideOf(mid)} kesimi` : ''}`;
    const chainL = Math.round(c.bays.reduce((s, b) => s + b, 0) * 1000) / 1000;
    const headLine = `Cam hattı ${i + 1} üstü: ${along.length ? along.join(', ') + ' önü' : 'mahal bulunamadı'}${c.bays.length > 4 ? `, ${sideOf(mid)} kesimi` : ''}`;
    headLines.push({ label: headLine, value: r2(chainL * 0.45), unit: 'm²', note: `cam hattı uzunluğu ${formatTr(chainL)} m (kapı bölmeleri dahil) × 0,45 m`, calc: [{ kind: 'dikdörtgen', label: 'bant', name: 'cam hattı uzunluğu × bant yüksekliği', adet: 1, en: chainL, boy: 0.45, sign: 1, value: chainL * 0.45 }] });
    c.bays.forEach((b, k) => {
      const wide = b > 2.0;
      const [p0, p1] = [c.pts[k], c.pts[k + 1]];
      const own: { items: string[]; lines: Record<string, string | number> } = wide ? { items: ['C.14'], lines: { 'C.14': wideNo } } : { items: ['C.1'], lines: { 'C.1': c1Line } };
      model3d.add({ layer: 'cephe', kind: 'ribbon', ...own, label: `${wide ? 'Cam cephe kapı bölmesi' : 'Cam bölmesi'} – hat ${i + 1}, ${b.toFixed(3)} m`, path: [p0, p1], z0: wide ? 0 : 0.1, z1: wide ? 3.0 : 5.45 });
      const [t, n] = [unit(p0, p1), inward(p0, p1)];
      const kayit = rect(p0, t, n, 0, b * 1000);
      model3d.add({ layer: 'cephe', kind: 'prism', ...own, label: `Alüminyum doğrama üst kayıt 200×50 – hat ${i + 1}`, loops: [kayit], z0: wide ? 3.0 : 5.4, z1: wide ? 3.05 : 5.45 });
      if (!wide) model3d.add({ layer: 'cephe', kind: 'prism', ...own, label: `Alüminyum doğrama alt kayıt 200×50 – hat ${i + 1}`, loops: [kayit], z0: 0.1, z1: 0.15 });
      model3d.add({ layer: 'cephe', kind: 'ribbon', items: ['C.17'], lines: { 'C.17': headLine }, label: `Cam üstü alüminyum kaplama – hat ${i + 1} (+5,45 → +5,90)`, path: [p0, p1], z0: 5.45, z1: 5.9 });
      if (wide) wideNo++;
    });
    // dikmeler: her bölme ucunda, iki komşu bölmenin ortalama doğrultusunda (yalnız kapı bölmeli hatta C.1 satırı yok → C.14)
    const mOwn = c.bays.some((b) => b <= 2.0) ? { items: ['C.1'], lines: { 'C.1': c1Line } } : { items: ['C.14'] };
    c.pts.forEach((p, k) => {
      const a = c.pts[Math.max(0, k - 1)];
      const b = c.pts[Math.min(c.pts.length - 1, k + 1)];
      const bay = k < c.bays.length ? k : k - 1;
      model3d.add({ layer: 'cephe', kind: 'prism', ...mOwn, label: `Alüminyum doğrama dikme 80×200 – hat ${i + 1}`, loops: [rect(p, unit(a, b), inward(c.pts[bay], c.pts[bay + 1]), -MW, MW)], z0: 0, z1: 5.45 });
    });
    const normal = c.bays.filter((b) => b <= 2.0);
    const wide = c.bays.filter((b) => b > 2.0);
    const calc = mergeRows(
      normal.map((b) => {
        const en = Math.round(b * 1000) / 1000;
        return { kind: 'dikdörtgen' as const, label: 'cam bölmesi', name: 'cam bölmesi', adet: 1, en, boy: H, sign: 1 as const, value: en * H };
      }),
    ).sort((a, b) => b.adet - a.adet);
    const L = calc.reduce((s, r) => s + r.value, 0) / H;
    devL += L;
    doorL += wide.reduce((s, b) => s + Math.round(b * 1000) / 1000, 0);
    if (L > 0)
      glassLines.push({
        label: c1Line,
        value: r2(L * H),
        unit: 'm²',
        note: `bölme genişlikleri toplamı ${r2(L)} m × cam yüksekliği ${H} m${wide.length ? `; ${wide.length} geniş (kapı) bölme hariç: ${wide.map((b) => b.toFixed(2)).join(', ')} m` : ''}`,
        calc,
      });
  });
  // zincirde olmayan düzlemsel camlar: kuzeybatı arka cephe ve kuzeydoğu taş arası dar camlar (görünüşten)
  const extra = [...elevLines('FG-01 glass').filter((l) => l.label.startsWith('Kuzeybatı')), ...elevLines('FG-01? slot glazing (unlabelled)').map((l) => ({ ...l, label: l.label + ' – taş arası dar cam' }))];
  glassLines.push(...extra.map((l) => ({ ...l, note: 'düzlemsel cephe; görünüş alanı = gerçek alan' })));
  const extraA = sum(extra);
  const projGlass = sum([...elevLines('FG-01 glass'), ...elevLines('FG-01? slot glazing (unlabelled)')]);
  for (const l of elevLines('FG-01 glass').filter((x) => !x.label.startsWith('Kuzeybatı'))) glassLines.push({ ...l, label: 'Karşılaştırma (katılmadı) – ' + l.label, note: 'eğrisel güney camının bu görünüşteki izdüşümü; zincirle zaten sayıldı' });
  items.push({
    poz: 'C.1', group: 'C', code: 'FG-01', name: 'Cam giydirme cephe (gerçek açınım alanı)', unit: 'm²', value: r2(devL * H + extraA),
    method: `Zemin kat planındaki cam cephe dikmeleri (blok 4199_AMG_Glass new2 içindeki "cephe profıl" ve dinamik dikme blokları) cephe boyunca zincirlendi; ardışık dikmeler arası mesafeler toplanarak eğrisel cephenin gerçek uzunluğu bulundu. 2,0 m'den geniş bölmeler kapı bölmesi sayılıp ayrıldı. Cam yüksekliği görünüş ve kesitlerden ${H} m (+0,10 → +5,45). Dikme zincirinde olmayan düzlemsel camlar (kuzeybatı arka cephe, kuzeydoğu taş arası dar camlar) görünüş alanlarından eklendi. Güneydoğu/kuzeydoğu/güneybatı görünüşlerindeki cam, eğrisel güney camının izdüşümü olduğu için karşılaştırma satırı olarak verildi, toplama katılmadı.`,
    sources: [{ drawing: '4199-A-DD-01-02-100', where: 'blok 4199_AMG_Glass new2 · cephe profıl / dikme blokları' }, ...elevSources],
    confidence: 'Orta',
    lines: glassLines,
    notes: [`Sistem detayında (00-09-100) cam yüksekliği 550 cm (+21,80 → +27,30) yazıyor; görünüşteki cam ${H} m alındı.`, `Geniş (kapı) bölmeler toplamı ${r2(doorL)} m, cam alanına katılmadı (bkz. C.14).`],
  });

  items.push({
    poz: 'C.14', group: 'C', code: 'FG-01', name: 'Cam cephe – kapı (geniş) bölmeleri toplam genişliği', unit: 'm', value: r2(doorL),
    method: 'Cam cephe dikme zincirinde 2,0 m\'den geniş bölmeler (giriş kapıları) toplandı. Kapı tipleri ve kanat sayıları için H grubu ve görünüşler.',
    sources: [{ drawing: '4199-A-DD-01-02-100', where: 'blok 4199_AMG_Glass new2 · dikme aralıkları > 2,0 m' }],
    confidence: 'Düşük',
    lines: chains.flatMap((c, i) => c.bays.map((b, k) => ({ b, k })).filter(({ b }) => b > 2.0).map(({ b, k }) => { const L = Math.round(b * 1000) / 1000; const mid = { x: (c.pts[k].x + c.pts[k + 1].x) / 2, y: (c.pts[k].y + c.pts[k + 1].y) / 2 }; const r = roomsNear(mid, 4000)[0]; return { label: `${r ? r.label + ' girişi' : 'Giriş'} – cam hattı ${i + 1}`, note: `dikme arası ${L.toFixed(3)} m`, value: r2(L), unit: 'm', calc: [{ kind: 'doğru' as const, unit: 'm', label: 'bölme', name: 'iki dikme arası mesafe', adet: 1, boy: L, sign: 1 as const, value: L }] }; })),
  });

  items.push({
    poz: 'C.17', group: 'C', code: null, name: 'Alüminyum levha kaplama – cam üstü bandı (+5,45 → +5,90)', unit: 'm²', value: r2(headLines.reduce((s, l) => s + (l.value ?? 0), 0)),
    method:
      'Cam cephenin üst kaydı (+5,45) ile saçak / konsol altı tavanı (D.13, CH 590 → +5,90) arasındaki 0,45 m yüksekliğindeki alüminyum kaplama bandı. Uzunluk, C.1\'deki cam cephe dikme zincirlerinin toplam uzunluğudur (kapı bölmeleri dahil; bant kapıların üstünden de geçer). Görünüşlerde bu bant saçak alnının arkasında kaldığı için taranmamış; sistem detayı kesit A\'da (00-09-100) cam başında 171×50 mm alüminyum başlık profili ve üstünde 325×900 mm alüminyum kaplı kutu görülüyor.',
    sources: [{ drawing: '4199-A-DD-01-02-100', where: 'blok 4199_AMG_Glass new2 · cam cephe dikme zincirleri (C.1 ile aynı)' }, { drawing: '4199-A-DD-00-09-100', where: 'DETAY KESİTİ A · A_Mat_Mtal cam başı profili ve kaplama kutusu' }, { drawing: '4199-A-DD-01-05-100', where: 'saçak altı CH 590' }],
    confidence: 'Düşük',
    lines: headLines,
    notes: ['Bant yüksekliği kotlardan (cam üstü +5,45 görünüşten, saçak altı CH 590 tavan planından) çıkarıldı; detay kesitte kaplama kutusu 0,90 m. Gerçek bant yüksekliği ve kapıların üstü (+3,00 → +5,45) mimarla teyit edilmeli.'],
  });

  // --- Görünüş alanından gelen kalemler
  const fromElev = (poz: string, code: string | null, name: string, mats: string[], conf: 'Yüksek' | 'Orta' | 'Düşük', notes: string[] = []) => {
    const lines = mats.flatMap((m) => elevLines(m).map((l) => ({ ...l, label: mats.length > 1 ? `${l.label} – ${matTr(m)}` : l.label })));
    items.push({ poz, group: 'C', code, name, unit: 'm²', value: sum(lines), method: UNION, sources: elevSources, confidence: conf, lines, notes });
  };
  fromElev('C.2', 'FM-01', 'Alüminyum panel – salon kabukları (görünen)', ['FM-01 hall shell'], 'Yüksek');
  fromElev('C.3', 'FM-04', 'Alüminyum panel – kabuk arka yüzleri (görünen kısım)', ['FM-04 rear shell (visible part)', 'shell misc (unlabelled)'], 'Orta', ['Etiketsiz kabuk parçaları dahil.']);
  items.push({
    poz: 'C.4', group: 'C', name: 'Salon kabuk duvarları – toplam yüzey (görünen)', unit: 'm²', value: null, formula: 'C.2 + C.3',
    method: 'Kabuk duvar sistemi (alüminyum levha / alt karkas + yalıtım / çimento esaslı levhalar / çelik karkas) için görünüşlerde görünen kabuk yüzeylerinin toplamı.',
    sources: elevSources, confidence: 'Orta', lines: [],
    notes: ['Salonlar arasındaki 0,80 m derzlere bakan yüzler görünüşlerde görünmediği için dahil değildir; bu yüzler sistem malzemesi için ayrıca hesaplanmalı.'],
  });
  fromElev('C.9', 'FM-05', 'Alüminyum panel – servis bloğu üst bandı', ['FM-05 service band'], 'Orta');
  // C.10: hesap = 3B model (her CEP yüzeyi bir satır); görünüş kontrol. Görünüşte olup yüzeyi bulunamayan taş ayrı satırda toplama katılır.
  const elevStone = elevLines('FS-01 stone');
  const stone = elevationToModel(A, 'FS-01 stone', 'C.10', 'Traverten (FP-01)');
  const rowSum = (rs: CalcRow[]) => r2(rs.reduce((s, r) => s + r.value, 0));
  const c10Lines: Line[] = ELEVS.flatMap((e) => {
    const s = stone[e.key];
    if (!s) return [];
    const label = `${e.name} görünüşü (${e.dwg})`;
    const ev = elevStone.find((l) => l.label === label)?.value ?? 0;
    const ls: Line[] = [];
    if (s.rows.length) ls.push({ label, value: rowSum(s.rows), unit: 'm²', note: `3B taş yüzeyleri: plandaki gerçek uzunluk × görünüşteki yükseklik. Görünüş ölçümü ${formatTr(ev)} m² (izdüşüm).${s.overlap >= 0.05 ? ` ⚠ ${formatTr(r2(s.overlap))} m² görünüş alanı iki yüzeye yerleşti (çakışan satırlar işaretli).` : ''}`, calc: s.rows });
    if (s.missing.length) ls.push({ label: `${e.name} görünüşü – modelde yeri bulunamayan taş`, value: rowSum(s.missing), unit: 'm²', note: 'Görünüşte taş var, plandaki cephe kaplama şeritlerinde karşılığı yok; görünüş izdüşüm alanı toplama katıldı. 3B modelde görünmez.', calc: s.missing });
    return ls;
  });
  const hiddenStone = hiddenStoneWalls('C.10', 'Güneydoğu görünüşünde cam arkasında kalan küçük salon dış duvarları');
  if (hiddenStone) c10Lines.push(hiddenStone);
  const missingA = r2(Object.values(stone).reduce((s, v) => s + rowSum(v.missing), 0));
  const overlapA = r2(Object.values(stone).reduce((s, v) => s + v.overlap, 0));
  console.log(`3B traverten: ${Object.values(stone).reduce((s, v) => s + v.rows.length, 0)} yüzey, yeri bulunamayan ${missingA} m², çakışan ${overlapA} m²`);
  items.push({
    poz: 'C.10', group: 'C', code: 'FP-01', name: 'Traverten cephe kaplaması (30 mm)', unit: 'm²', value: sum(c10Lines),
    method: 'Görünüşlerdeki FS-01 taş taramaları, zemin kat planındaki cephe kaplama şeritlerinin (CEPHE KAPLAMA) o görünüşe bakan dış yüzlerine yatay konumlarına göre yerleştirildi; her yüzey 3B modelde bir CEP elemanı ve cetvelde bir satırdır (plandaki gerçek uzunluk × görünüşteki yükseklik). Görünüş taraması her yüzeyde tam bir kez kullanılmalı: görünüşte olup yüzeyi bulunamayan taş ayrı satırda izdüşüm alanıyla toplama katıldı, iki yüzeye yerleşen görünüş alanı satırda işaretlendi. Görünüşte cam arkasında kalan duvarlar proje ekibi bildirimiyle eklendi.',
    sources: [{ drawing: '4199-A-DD-01-02-100', where: 'katman CEPHE KAPLAMA (SOLID taramalar) · dış yüzler' }, { drawing: '4199-A-DD-00-09-100', where: 'FP-01 TRAVERTEN etiketleri · katman A_Mat_Stne (kesit B ve detay planı, kalınlık 30 mm)' }, ...elevSources],
    confidence: 'Orta',
    lines: c10Lines,
    notes: [
      ...(missingA > 0 ? [`Görünüşte olup modelde yeri bulunamayan ${formatTr(missingA)} m² taş var (ilgili satırlar). Yeri belirlenince model ve hesap birlikte düzelir.`] : []),
      ...(overlapA > 0 ? [`${formatTr(overlapA)} m² görünüş alanı iki ayrı yüzeye yerleşti (⚠ işaretli satırlar); biri yanlışsa bildirin.`] : []),
      'Kod ve kalınlık sistem detayından (4199-A-DD-00-09-100): FP-01 TRAVERTEN; kaplama kalınlığı 30 mm (kesit B ve detay planındaki A_Mat_Stne taş katmanından ölçüldü, yazıyla verilmemiş). Görünüşlerde aynı taş FS-01 etiketli.',
    ],
  });
  fromElev('C.11', 'FP-01', 'Dış cephe sıva + boya (koyu)', ['FP-01 dark plaster (2f3031)'], 'Orta', ['Kuzeydoğu görünüşündeki koyu paneller etiketsiz; aynı renk olduğu için FP-01 sayıldı.']);
  fromElev('C.12', null, 'Kolon kaplaması 0,70 m (kodsuz)', ['COLUMN (unlabelled)'], 'Düşük', ['Görünüşte malzeme kodu yok.']);
  fromElev('C.13', null, 'Kapı kasası / panjur / diğer cephe elemanları (kodsuz)', ['door frames/louvres/misc'], 'Düşük');

  // --- Saçak bantları: yükseklik × saçak kenar uzunluğu (B.7)
  const bands: [string, string | null, string, string, number, string][] = [
    ['C.5', 'FM-01', 'Alüminyum panel – saçak üst bandı (+7,15 → +7,60)', 'FM-01 eave top band', 0.45, '0,45'],
    ['C.6', 'FM-02', 'Alüminyum panel – saçak alın bandı (+6,00 → +7,15)', 'FM-02 eave fascia', 1.15, '1,15'],
    ['C.7', 'FM-03', 'Alüminyum panel – saçak alt bandı (+5,65 → +6,00)', 'FM-03 eave lower band', 0.35, '0,35'],
    ['C.8', null, 'Saçak altı şerit (+5,45 → +5,65, kodsuz)', 'eave soffit strip (unlabelled)', 0.2, '0,2'],
  ];
  for (const [poz, code, name, mat, h, hs] of bands) {
    const ls = elevLines(mat);
    items.push({
      poz, group: 'C', code, name, unit: 'm²', value: null, formula: `B.7 * ${hs}`,
      method: `Bant yüksekliği (${h} m, görünüş kotlarından) × saçak serbest kenar uzunluğu (B.7, çatı planından, eğrisel kenar yay uzunluğuyla). Görünüşlerdeki izdüşüm alanları karşılaştırma için satırlarda.`,
      sources: [{ drawing: '4199-A-DD-01-02-300', where: 'saçak serbest kenarı (B.7)' }, ...elevSources],
      confidence: 'Orta',
      lines: [...ls.map((l) => ({ ...l, label: `Karşılaştırma – ${l.label}` })), { label: 'Görünüş izdüşüm toplamı (miktara katılmadı)', value: sum(ls), unit: 'm²', note: 'yukarıdaki karşılaştırma satırlarının toplamı' }],
      notes: ['Sistem detayında (00-09-100) saçak alnı tek parça FP-03 alüminyum levha (yüz 2,11 m) olarak çizilmiş; görünüşte bantlara ayrılmış ve FM kodlarıyla etiketlenmiş.'],
    });
  }
  findings.push(
    { topic: 'Cephe – kod çakışması', drawings: '00-09-100, görünüşler', finding: 'FM-01 hem salon kabuğu hem saçak üst bandı için kullanılmış; FP-01 detayda TRAVERTEN (metrajda C.10 bu kodla), görünüşte taş FS-01 etiketli, koyu SIVA+BOYA ise FP-01 (C.11); FP-03 görünüşlerde yok.', suggestion: 'Tek malzeme kod listesi hazırlanmalı.' },
    { topic: 'Cephe – etiketsiz malzeme', drawings: 'görünüşler', finding: 'Kolon kaplamaları, yatay lamel bandı (~252 m²), kuzeydoğu koyu paneller ve güneybatı cephesindeki cam etiketsiz.', suggestion: 'Malzeme kodları eklenmeli.' },
    { topic: 'Cephe – eğrisel cephe', drawings: '01-04-100', finding: `Güney cam cephesi eğrisel; görünüşlerdeki cam izdüşümleri toplamı ${projGlass} m² (aynı cam birden çok görünüşte), plandaki gerçek açınımla hesaplanan cam ${r2(devL * H + extraA)} m².`, suggestion: 'Cam miktarı plandan alındı.' },
  );
  return { items, findings };
}
