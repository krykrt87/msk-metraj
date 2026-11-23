// Katman (dizilim) kalemleri: sistem detaylarındaki katmanlar, ana alanlara formülle bağlanır.
// Kalınlıklar ve metre başına açınımlar detay DWG'lerinden ölçüldü (00-09-100, 01/02-09-101, 00-09-102).
import type { Line, TakeoffItem } from './model';

const D100 = '4199-A-DD-00-09-100';
const D101 = '4199-A-DD-02-09-101';
type F = { topic: string; drawings: string; finding: string; suggestion: string };

function layer(poz: string, group: string, name: string, unit: string, formula: string, method: string, src: { drawing: string; where: string }[], stack: Line[], notes: string[] = [], conf: 'Yüksek' | 'Orta' | 'Düşük' = 'Orta'): TakeoffItem {
  // kopya: build formül satırını lines'a ekliyor; ortak dizi aynı dizilimin bütün kalemlerine yığılırdı
  return { poz, group, name, unit, value: null, formula, method, sources: src, confidence: conf, lines: [...stack], notes };
}

export function layerItems(): { items: TakeoffItem[]; findings: F[] } {
  const items: TakeoffItem[] = [];
  const st = (label: string, mm: number | null, note?: string): Line => ({ label, value: mm, unit: 'mm', note });

  // --- Uzay kafes çatı dizilimi (02-09-101) → B.2 salon çatı örtüsü alanı
  const sfStack = [
    st('TPU MEMBRAN', null, 'kalınlık verilmemiş'),
    st('SU YALITIMI', null),
    st('2x ÇİMENTO ESASLI LEVHA', null, 'levha kalınlığı verilmemiş'),
    st('ÇELİK AŞIK (EBAT BELİRLENECEK)', null),
    st('AŞIK ARASI ISI YALITIMI', 100, 'aşık bloğu 100×100'),
    st('ÇİMENTO ESASLI LEVHA', null),
    st('UZAY KAFES', null),
  ];
  const sfSrc = [{ drawing: D101, where: 'salon çatısı ve kabuk duvar kesiti (dizilim etiketleri)' }];
  const sfM = 'Uzay kafes çatı dizilimi sistem detayından (02-09-101). Katman alanı salon çatı örtüsü alanına (B.2, parapet içi eğik yüzey) eşittir.';
  const sfNote = ['B.2 eğik yüzeyin gerçek alanıdır (izdüşümden ≈%2 fazla).'];
  items.push(layer('B.2.1', 'B', 'TPU membran', 'm²', 'B.2', sfM, sfSrc, sfStack, sfNote));
  items.push(layer('B.2.2', 'B', 'Su yalıtımı (uzay kafes çatı)', 'm²', 'B.2', sfM, sfSrc, sfStack, sfNote));
  items.push(layer('B.2.3', 'B', 'Çimento esaslı levha – üst, 2 kat', 'm²', 'B.2 * 2', `${sfM} Üstte 2 kat levha olduğu için alan × 2.`, sfSrc, sfStack, sfNote));
  items.push(layer('B.2.4', 'B', 'Çelik aşık (kaplanan alan; ebat belirlenecek)', 'm²', 'B.2', sfM, sfSrc, sfStack, ['Tonaj statik projeden alınmalı.', ...sfNote], 'Düşük'));
  items.push(layer('B.2.5', 'B', 'Aşık arası ısı yalıtımı (~100 mm)', 'm²', 'B.2', sfM, sfSrc, sfStack, sfNote));
  items.push(layer('B.2.6', 'B', 'Çimento esaslı levha – alt', 'm²', 'B.2', sfM, sfSrc, sfStack, sfNote));

  // --- Teras çatı dizilimi (00-09-100) → B.3 + B.4
  const tStack = [
    st('ÇAKIL', 65, '02-09-101 alçak çatıda 50 mm'),
    st('GEOTEKSTİL', 10),
    st('XPS YALITIM LEVHASI (2×50)', 100, '02-09-101 alçak çatıda 120 mm (2×60)'),
    st('SU YALITIM MEMBRANI', null),
    st('EĞİM ŞAPI / BETONU', 50, 'eğim %1'),
    st('BETONARME DÖŞEME', 200, 'statik projeye göre'),
  ];
  const tSrc = [{ drawing: D100, where: 'kesit A/B teras çatı dizilimi' }, { drawing: D101, where: 'alçak çatı dizilimi' }];
  const tM = 'Teras çatı dizilimi sistem detayından. Katman alanı = teras çatı net alanı (B.3) + kuzeydoğu alçak çatı (B.4). Kuzeybatı alçak çatı (B.5) kaplaması belirsiz olduğu için dahil edilmedi.';
  const tNote = ['00-09-100 ile 02-09-101 dizilimleri farklı (çakıl 65/50 mm, XPS 100/120 mm).'];
  for (const [p, n] of [['B.3.1', 'Çakıl (koruma tabakası)'], ['B.3.2', 'Geotekstil'], ['B.3.3', 'XPS ısı yalıtım levhası'], ['B.3.4', 'Su yalıtım membranı (teras)'], ['B.3.5', 'Eğim şapı / eğim betonu (%1)'], ['B.3.6', 'Betonarme çatı döşemesi (statik projeye göre)']] as const) {
    items.push(layer(p, 'B', n, 'm²', 'B.3 + B.4', tM, tSrc, tStack, tNote));
  }

  // --- Kabuk duvar dizilimi (02-09-101) → C.4
  const sStack = [
    st('ALÜMİNYUM LEVHA KAPLAMA', 3),
    st('Alt karkas 40×40 kutu', 80),
    st('ARA BAĞLANTI KARKAS VE ISI YALITIM', 60),
    st('ÇİMENTO ESASLI LEVHA 12,5 mm', 12.5),
    st('ÇELİK KARKAS (içinde 50 mm yalıtım)', 94),
    st('ÇİMENTO ESASLI LEVHA 2×12,5 mm', 25),
  ];
  const sSrc = [{ drawing: D101, where: 'salon kabuk duvarı kesiti' }];
  const sM = 'Salon kabuk duvar dizilimi sistem detayından (toplam ~285 mm). Katman alanı = kabuk duvar yüzeyi (C.4).';
  const sNote = ['Etiketlerde 2×12,5 mm levha dışta, çizimde içte (sıra çelişkisi).'];
  items.push(layer('C.4.1', 'C', 'Kabuk duvar – alüminyum levha kaplama 3 mm', 'm²', 'C.4', sM, sSrc, sStack, sNote));
  items.push(layer('C.4.2', 'C', 'Kabuk duvar – alt karkas 40×40 + ısı yalıtımı 60 mm', 'm²', 'C.4', sM, sSrc, sStack, sNote));
  items.push(layer('C.4.3', 'C', 'Kabuk duvar – çimento esaslı levha 12,5 mm (1 kat)', 'm²', 'C.4', sM, sSrc, sStack, sNote));
  items.push(layer('C.4.4', 'C', 'Kabuk duvar – çelik karkas 94 mm + 50 mm yalıtım', 'm²', 'C.4', sM, sSrc, sStack, ['Profil ebatları belirtilmemiş.', ...sNote], 'Düşük'));
  items.push(layer('C.4.5', 'C', 'Kabuk duvar – çimento esaslı levha 2×12,5 mm', 'm²', 'C.4 * 2', `${sM} İki kat olduğu için alan × 2.`, sSrc, sStack, sNote));

  // --- Harpuşta / alın kaplaması (00-09-100)
  items.push(layer('C.15', 'C', 'Saçak harpuşta alüminyum levha (FP-03, açınım 0,704 m)', 'm²', 'B.7 * 0,704',
    'Sistem detayında saçak üstü harpuşta alüminyum levhasının açınım genişliği ölçüldü (0,704 m); saçak serbest kenar uzunluğu (B.7) ile çarpıldı.',
    [{ drawing: D100, where: 'kesit A, parapet/saçak alnı (FP-03 3 mm)' }],
    [{ label: 'Harpuşta açınım genişliği', value: 0.704, unit: 'm', note: 'detayda ölçüldü' }, { label: 'Alın yüz paneli (saçak bantları C.5–C.8 ile aynı yüzey)', value: 2.107, unit: 'm', note: 'tekrar sayılmadı' }]));
  items.push(layer('C.16', 'C', 'Salon kabuk duvarı harpuşta alüminyum (açınım ~0,68 m)', 'm²', 'B.9 * 0,68',
    'Kabuk duvar tepesindeki harpuşta açınımı (~0,68 m, 2 mm alüminyum) × salon parapet uzunluğu (B.9).',
    [{ drawing: D101, where: 'kabuk duvar tepesi harpuşta' }],
    [{ label: 'Harpuşta açınım genişliği', value: 0.68, unit: 'm' }], [], 'Düşük'));

  // --- Döşeme dizilimi (00-09-100)
  const fStack = [st('HALI KAPLAMA', 10), st('ŞAP', 90), st('SAHA BETONU', 200), st('SU YALITIMI', null), st('KORUMA BETONU', 50)];
  const fSrc = [{ drawing: D100, where: 'döşeme dizilimi' }];
  items.push(layer('F.3', 'F', 'Şap 90 mm (zemin kat)', 'm²', 'A.1', 'Şap, zemin kat net mahal alanına (A.1) uygulanır.', fSrc, fStack));
  items.push(layer('F.4', 'F', 'Saha betonu 200 mm', 'm²', 'A.3', 'Saha betonu ve altındaki katmanlar zemin kat brüt alanına (A.3, dış yüzden) uygulanır.', fSrc, fStack));
  items.push(layer('F.5', 'F', 'Döşeme altı su yalıtımı', 'm²', 'A.3', 'Zemin kat brüt alanı (A.3).', fSrc, fStack));
  items.push(layer('F.6', 'F', 'Koruma betonu 50 mm', 'm²', 'A.3', 'Zemin kat brüt alanı (A.3).', fSrc, fStack));

  // --- Temel çevresi (00-09-100): metre başına açınımlar × dış çevre A.4
  const tmSrc = [{ drawing: D100, where: 'kesit A, temel ve temel perdesi' }];
  const tmStack = [st('EĞİM BETONU', 60), st('SU YALITIMI', null), st('XPS', 60), st('DRENAJ LEVHASI', 25), st('BETONARME TEMEL 2000×600', 600), st('Temel perdesi', 200)];
  items.push(layer('F.7', 'F', 'Temel perdesi ve temel üstü su yalıtımı membranı', 'm²', 'A.4 * 6,8', 'Detayda temel perdesi dış yüzü, temel üstü ve yanları boyunca su yalıtımı membranının açınımı metre başına ~6,8 m ölçüldü; bina dış çevresi (A.4) ile çarpıldı.', tmSrc, [{ label: 'Membran açınımı', value: 6.8, unit: 'm²/m' }, ...tmStack]));
  items.push(layer('F.8', 'F', 'XPS 60 mm (temel perdesi dış yüzü ve temel üstü)', 'm²', 'A.4 * 4,8', 'XPS açınımı metre başına ~4,8 m (temel altında yok); dış çevre (A.4) ile çarpıldı.', tmSrc, [{ label: 'XPS açınımı', value: 4.8, unit: 'm²/m' }, ...tmStack]));
  items.push(layer('F.9', 'F', 'Drenaj levhası', 'm²', 'A.4 * 0,9', 'Drenaj levhası temel perdesi dış yüzünde, ±0,00\'dan temel üstüne kadar (0,90 m); dış çevre (A.4) ile çarpıldı.', tmSrc, [{ label: 'Drenaj levhası yüksekliği', value: 0.9, unit: 'm' }, ...tmStack], [], 'Düşük'));
  items.push(layer('F.10', 'F', 'Temel üstü eğim betonu 60 mm', 'm²', 'A.4 * 0,9', 'Temel üstü eğim betonu genişliği detayda ~0,90 m (2,00 m temelin perde dışında kalan kısmı); dış çevre (A.4) ile çarpıldı.', tmSrc, tmStack, ['Genişlik detaydan yaklaşık ölçüldü.'], 'Düşük'));
  items.push({
    poz: 'F.11', group: 'F', name: 'Betonarme temel, grobeton, koruma betonu, sıkıştırılmış dolgu', unit: '—', value: null,
    method: 'Mimari paftada yalnız katman olarak gösteriliyor (temel altı: koruma betonu 100, su yalıtımı, grobeton 100, sıkıştırılmış toprak 250 mm). Miktarlar statik projeye göre.',
    sources: tmSrc, confidence: null, lines: [], notes: ['Statik projeden alınacak.'],
  });

  // --- Rampalar ve dış merdivenler (01-01-100, 00-09-102)
  items.push({
    poz: 'F.12', group: 'F', name: 'Araç rampası (%8) – uzunluk', unit: 'm', value: 75.04,
    method: 'Vaziyet planında rampa uzunluk yazıları ve kot değerleri: kuzey rampası −0,40 → +1,25 (20,625 m) ve +1,25 → +2,60 (16,880 m); doğu rampası −0,40 → +2,60 (37,530 m). Yol 7,0 m, iki yanda ~1,5 m kaldırım.',
    sources: [{ drawing: '4199-A-DD-01-01-100', where: 'rampa yazıları ve kotlar' }],
    confidence: 'Yüksek',
    lines: [
      { label: 'Kuzey rampası 1. kol (−0,40 → +1,25)', value: 20.625, unit: 'm' },
      { label: 'Kuzey rampası 2. kol (+1,25 → +2,60)', value: 16.88, unit: 'm' },
      { label: 'Doğu rampası (−0,40 → +2,60)', value: 37.53, unit: 'm' },
    ],
    notes: ['Rampa yüzey kaplaması ve alanı için rampa sınırları ayrıca ölçülmeli.'],
  });
  items.push({
    poz: 'F.13', group: 'F', name: 'Dış çelik merdiven (kuzey cephesi)', unit: 'adet', value: 2,
    method: '1. kat planında kuzey cephesi boyunca iki dış merdiven; her biri 23 rıht, 1,20 m genişlik.',
    sources: [{ drawing: '4199-A-DD-01-02-200', where: 'kuzey cephesi dış merdivenleri' }],
    confidence: 'Yüksek',
    lines: [{ label: 'Rıht sayısı (her merdiven)', value: 23, unit: 'adet' }, { label: 'Merdiven genişliği', value: 1.2, unit: 'm' }],
  });

  const findings: F[] = [
    { topic: 'Detay – dizilim çelişkisi', drawings: '00-09-100, 02-09-101', finding: 'Teras çatı dizilimleri farklı: çakıl 65/50 mm, XPS 100/120 mm, eğim şapı düz/%1.', suggestion: 'Tek dizilim belirlenmeli.' },
    { topic: 'Detay – kabuk duvar', drawings: '02-09-101', finding: 'Çimento levha sırası: etiketlerde 2×12,5 mm dışta, çizimde içte.', suggestion: 'Doğru sıra teyit edilmeli.' },
    { topic: 'Detay – traverten duvar', drawings: '00-09-100', finding: 'Traverten duvar yalıtımı kesitte 80 mm, planda 100 mm.', suggestion: 'Kalınlık teyit edilmeli.' },
    { topic: 'Detay – rampa eğimi', drawings: '00-09-102', finding: 'Rampa detayı 03: geometri 450 mm / 11,41 m = %3,9, etiket "SLOPE %2".', suggestion: 'Eğim teyit edilmeli.' },
    { topic: 'Detay – tanımsız malzemeler', drawings: 'tüm detaylar', finding: 'Aşık ve çelik karkas ebatları, TPU/membran türleri, yalıtım türleri, çatı çimento levha kalınlığı, çakıl granülometrisi belirtilmemiş.', suggestion: 'Şartnamede tanımlanmalı.' },
  ];
  // Detaydan / vaziyet planından okunan sabitler: 'değer' cetvel satırı (katman kalınlıkları (mm) dizilim bilgisidir, miktar değil)
  for (const i of items)
    for (const l of i.lines)
      if (!l.calc && l.value !== null && l.unit !== 'mm' && l.unit !== 'adet')
        l.calc = [{ kind: 'değer', unit: l.unit, label: l.label, name: i.poz === 'F.12' ? 'vaziyet planındaki rampa uzunluk yazısı' : 'detay paftasından ölçülen / yazılı değer', adet: 1, sign: 1, value: l.value }];
  return { items, findings };
}
