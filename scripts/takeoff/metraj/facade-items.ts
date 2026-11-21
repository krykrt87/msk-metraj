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
import type { P } from '../lib/geom';
import type { Line, TakeoffItem } from './model';
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
  'FS-01 stone': 'FS-01 doğal taş',
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
function elevationToModel(A: Record<string, Record<string, Mat>>, mat: string, poz: string, layerLabel: string): number {
  const flat = flatten(readDxf('work/dxf/4199-A-DD-01-02-100.dxf'));
  const plate = model3d.find((e) => e.items.includes('A.3'))[0]?.loops?.[0];
  const hallPts = model3d.find((e) => e.items.includes('B.9')).flatMap((e) => e.path ?? []);
  if (!plate || !hallPts.length) return 0;
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
    const planW = e.key === 'SE' || e.key === 'NW' ? hb.maxX - hb.minX : hb.maxY - hb.minY;
    return { e, dir, toU, scaleOk: Math.abs(u1 - u0 - planW) < 600, rects: A[e.key]?.[mat]?.rects ?? [] };
  });
  let n = 0;
  const strips = flat.filter((f) => f.path[0] === 'CEPHE KAPLAMA' && f.t === 'HATCH' && f.pattern === 'SOLID' && f.loops);
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
        const v = views.reduce((best, w) => (nx * w.dir.x + ny * w.dir.y > nx * best.dir.x + ny * best.dir.y ? w : best));
        if (nx * v.dir.x + ny * v.dir.y < 0.3 || !v.scaleOk) continue;
        const ua = v.toU(a);
        const ub = v.toU(b);
        for (const [w, hh, x, z] of v.rects) {
          const r0 = x * 1000;
          const r1 = (x + w) * 1000;
          const lo = Math.max(Math.min(ua, ub), r0);
          const hi = Math.min(Math.max(ua, ub), r1);
          if (hi - lo < 10) continue;
          const t0 = (lo - ua) / (ub - ua);
          const t1 = (hi - ua) / (ub - ua);
          const at = (t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          model3d.add({ layer: 'cephe', kind: 'ribbon', items: [poz], lines: { [poz]: `${v.e.name} görünüşü (${v.e.dwg})` }, label: `${layerLabel} – ${v.e.name} cephesi (${(z + Z0).toFixed(2)} → ${(z + hh + Z0).toFixed(2)})`, path: [at(t0), at(t1)], z0: z + Z0, z1: z + hh + Z0 });
          n++;
        }
      }
  return n;
}

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
  chains.forEach((c, i) => {
    // 3B: ardışık dikmeler arası; dar bölmeler cam (+0,10 → +5,45), geniş bölmeler kapı (C.14)
    const along = roomsAlong(c.pts, 4000).map((r) => r.label);
    const mid = c.pts[Math.floor(c.pts.length / 2)];
    const c1Line = `Cam hattı ${i + 1} (${c.bays.filter((b) => b <= 2.0).length} bölme): ${along.length ? along.join(', ') + ' önü' : 'mahal bulunamadı'}${c.bays.length > 4 ? `, ${sideOf(mid)} kesimi` : ''}`;
    c.bays.forEach((b, k) => {
      const wide = b > 2.0;
      model3d.add({ layer: 'cephe', kind: 'ribbon', items: wide ? ['C.14'] : ['C.1'], lines: wide ? { 'C.14': wideNo++ } : { 'C.1': c1Line }, label: `${wide ? 'Cam cephe kapı bölmesi' : 'Cam bölmesi'} – hat ${i + 1}, ${b.toFixed(3)} m`, path: [c.pts[k], c.pts[k + 1]], z0: wide ? 0 : 0.1, z1: wide ? 3.0 : 5.45 });
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
  fromElev('C.10', 'FS-01', 'Doğal taş cephe kaplaması (traverten)', ['FS-01 stone'], 'Orta', ['Açılı duvarlarda görünüş izdüşümü gerçek alandan biraz küçüktür.', 'Sistem detayında bu duvar FP-01 TRAVERTEN 30 mm olarak geçiyor (kod çakışması).']);
  const stone3d = elevationToModel(A, 'FS-01 stone', 'C.10', 'Doğal taş (FS-01)');
  console.log(`3B doğal taş: ${stone3d} yüzey parçası`);
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
    { topic: 'Cephe – kod çakışması', drawings: '00-09-100, görünüşler', finding: 'FM-01 hem salon kabuğu hem saçak üst bandı için kullanılmış; FP-01 detayda TRAVERTEN, görünüşte SIVA+BOYA; FP-03 görünüşlerde yok.', suggestion: 'Tek malzeme kod listesi hazırlanmalı.' },
    { topic: 'Cephe – etiketsiz malzeme', drawings: 'görünüşler', finding: 'Kolon kaplamaları, yatay lamel bandı (~252 m²), kuzeydoğu koyu paneller ve güneybatı cephesindeki cam etiketsiz.', suggestion: 'Malzeme kodları eklenmeli.' },
    { topic: 'Cephe – eğrisel cephe', drawings: '01-04-100', finding: `Güney cam cephesi eğrisel; görünüşlerdeki cam izdüşümleri toplamı ${projGlass} m² (aynı cam birden çok görünüşte), plandaki gerçek açınımla hesaplanan cam ${r2(devL * H + extraA)} m².`, suggestion: 'Cam miktarı plandan alındı.' },
  );
  return { items, findings };
}
