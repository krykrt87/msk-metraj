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

const ELEVS = [
  { key: 'SE', name: 'Güneydoğu', dwg: '4199-A-DD-01-04-100' },
  { key: 'NE', name: 'Kuzeydoğu', dwg: '4199-A-DD-01-04-200' },
  { key: 'NW', name: 'Kuzeybatı', dwg: '4199-A-DD-01-04-300' },
  { key: 'SW', name: 'Güneybatı', dwg: '4199-A-DD-01-04-400' },
] as const;
type Mat = { gross: number; net: number; src: string; rects: [number, number][]; hatches: P[][][] | null };
const r2 = (v: number) => Math.round(v * 100) / 100;

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
  chains.forEach((c, i) => {
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
        label: `Cam hattı ${i + 1}: ${normal.length} bölme, başlangıç (${(c.pts[0].x / 1000).toFixed(1)}; ${(c.pts[0].y / 1000).toFixed(1)}) m`,
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
    lines: chains.flatMap((c, i) => c.bays.filter((b) => b > 2.0).map((b) => { const L = Math.round(b * 1000) / 1000; return { label: `Cam hattı ${i + 1} – geniş bölme`, value: r2(L), unit: 'm', calc: [{ kind: 'doğru' as const, unit: 'm', label: 'bölme', name: 'iki dikme arası mesafe', adet: 1, boy: L, sign: 1 as const, value: L }] }; })),
  });

  // --- Görünüş alanından gelen kalemler
  const fromElev = (poz: string, code: string | null, name: string, mats: string[], conf: 'Yüksek' | 'Orta' | 'Düşük', notes: string[] = []) => {
    const lines = mats.flatMap((m) => elevLines(m).map((l) => ({ ...l, label: mats.length > 1 ? `${l.label} – ${m}` : l.label })));
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
