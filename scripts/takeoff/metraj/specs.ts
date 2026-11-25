// Malzeme özellikleri: siparişte belirtilmesi gereken teknik özellikler, kalem başına.
// Paftada / detayda okunan değer kaynağıyla yazılır; projede olmayan alan null kalır (uygulamada "tanımlanmalı").
import type { Spec } from '../../../shared/types';

/** Değer ya da [değer, kaynak pafta/detay]. */
type V = string | [string, string];

const D100 = '00-09-100 sistem detayı';
const D101 = '02-09-101 sistem detayı';
const GOR = 'görünüş paftaları (malzeme etiketi)';
const TAV = '01-05-100 tavan planı lejantı';

function sp(fields: string[], known: Record<string, V> = {}): Spec[] {
  const out: Spec[] = fields.map((label) => ({ label, value: null }));
  for (const [label, v] of Object.entries(known)) {
    const [value, source] = typeof v === 'string' ? [v, undefined] : v;
    const row = out.find((r) => r.label === label) ?? out[out.push({ label, value: null }) - 1];
    row.value = value;
    if (source) row.source = source;
  }
  return out;
}

// Malzeme türüne göre sipariş alanları
const ALU = ['Proje kodu', 'Levha / panel tipi', 'Alaşım / temper', 'Kalınlık', 'Renk (RAL)', 'Yüzey kaplaması (PVDF / toz boya)', 'Panel ölçüsü / modül', 'Alt konstrüksiyon / ankraj', 'Yangın sınıfı (EN 13501-1)'];
const TAS = ['Proje kodu', 'Taş türü', 'Kalınlık', 'Plaka ölçüsü', 'Yüzey işlemi', 'Renk / ocak', 'Montaj sistemi (ankraj / alt konstrüksiyon)', 'Su emme / eğilme dayanımı (TS EN 1469)'];
const CAM = ['Proje kodu', 'Cam kombinasyonu (dış / boşluk / iç)', 'Cam kalınlıkları', 'Isıl geçirgenlik Ug / Ucw', 'Güneş kontrol (g değeri)', 'Profil sistemi', 'Profil rengi (RAL)', 'Bölme yüksekliği'];
const BOYA = ['Proje kodu', 'Sıva tipi', 'Boya tipi', 'Renk (RAL / NCS)', 'Parlaklık', 'Kat sayısı'];
const ALCI = ['Proje kodu', 'Levha tipi', 'Levha kalınlığı', 'Taşıyıcı sistem', 'Tavan yüksekliği (CH)', 'Boya rengi (RAL)'];
const METAL_TAVAN = ['Proje kodu', 'Malzeme', 'Kalınlık', 'Modül / profil ölçüsü', 'Renk (RAL)', 'Delik deseni / akustik', 'Tavan yüksekliği (CH)'];
const AHSAP = ['Proje kodu', 'Ahşap türü / kaplama', 'Panel kalınlığı', 'Modül ölçüsü', 'Renk / vernik', 'Akustik (delikli / αw)', 'Yangın sınıfı (EN 13501-1)', 'Tavan yüksekliği (CH)'];
const YALITIM_SU = ['Tip', 'Kalınlık', 'Kat sayısı', 'Standart', 'Renk'];
const YALITIM_ISI = ['Tip', 'Kalınlık', 'Isıl iletkenlik λ', 'Basınç dayanımı', 'Yangın sınıfı (EN 13501-1)'];
const LEVHA = ['Tip', 'Levha kalınlığı', 'Levha ölçüsü', 'Kat sayısı', 'Yangın sınıfı (EN 13501-1)'];
const BETON = ['Beton / şap sınıfı', 'Kalınlık', 'Donatı / hasır', 'Not'];
const CELIK = ['Profil / ebat', 'Çelik sınıfı', 'Korozyon koruma / boya', 'Yangın koruma'];
const KAPI = ['Kanat ölçüsü', 'Kapı yüksekliği', 'Kanat malzemesi', 'Kasa', 'Yangın dayanımı', 'Kilit / donanım', 'Renk / kaplama'];

const sacakAlu = (code: string, band: string): Spec[] =>
  sp(ALU, { 'Proje kodu': [code, GOR], 'Bant': [band, 'görünüş kotları'], 'Not': ['Sistem detayında saçak alnı tek parça FP-03 alüminyum levha (3 mm)', D100] });
const kapi = (w: string, tek = false) => sp(KAPI, { 'Kanat ölçüsü': [tek ? w : `${w} + ${w}`, 'kapı bloğu açılım yayı'], 'Kanat malzemesi': ['Ahşap (katman A_Door_Wood)', 'zemin kat planı'] });

export const SPECS: Record<string, Spec[]> = {
  // --- Çatı
  'B.1': sp(CELIK, { 'Sistem': 'Uzay kafes çelik konstrüksiyon', 'Not': 'Boru / küre ebatları statik projeden' }),
  'B.2.1': sp([...YALITIM_SU, 'UV dayanımı'], { Tip: ['TPU membran', D101], Kalınlık: ['verilmemiş', D101] }),
  'B.2.2': sp(YALITIM_SU, { Tip: ['Su yalıtımı (türü verilmemiş)', D101] }),
  'B.2.3': sp(LEVHA, { Tip: ['Çimento esaslı levha', D101], 'Kat sayısı': ['2', D101], 'Levha kalınlığı': ['verilmemiş', D101] }),
  'B.2.4': sp(CELIK, { 'Profil / ebat': ['belirlenecek (detayda "ebat belirlenecek")', D101] }),
  'B.2.5': sp(YALITIM_ISI, { Kalınlık: ['~100 mm (aşık bloğu 100×100)', D101] }),
  'B.2.6': sp(LEVHA, { Tip: ['Çimento esaslı levha', D101], 'Kat sayısı': '1' }),
  'B.3.1': sp(['Granülometri', 'Kalınlık', 'Tür (dere / kırma)'], { Kalınlık: ['65 mm (02-09-101 alçak çatıda 50 mm)', D100] }),
  'B.3.2': sp(['Tip (dokuma / dokusuz)', 'Gramaj (g/m²)', 'Kalınlık'], { Kalınlık: ['10 mm', D100] }),
  'B.3.3': sp(YALITIM_ISI, { Tip: ['XPS levha', D100], Kalınlık: ['100 mm (2×50); 02-09-101 alçak çatıda 120 mm (2×60)', D100] }),
  'B.3.4': sp(YALITIM_SU, { Tip: ['Su yalıtım membranı (türü verilmemiş)', D100] }),
  'B.3.5': sp(BETON, { Kalınlık: ['50 mm (ort.), eğim %1', D100] }),
  'B.3.6': sp(BETON, { Kalınlık: ['200 mm (statik projeye göre)', D100] }),
  'B.8': sp(['Malzeme', 'Kalınlık', 'Yükseklik'], { Kalınlık: ['0,30 m', 'çatı planı'] }),
  'B.9': sp(['Malzeme', 'Kalınlık', 'Yükseklik'], { Kalınlık: ['0,30 m', 'çatı planı'] }),
  'B.10': sp(['Malzeme', 'Genişlik', 'Derinlik', 'Kalınlık'], { Genişlik: ['~30 cm', 'çatı planı (A_Elev_3)'] }),
  'B.11': sp(['Marka / model', 'Çap', 'Çatı tipi', 'Malzeme', 'Isıtıcı'], { 'Marka / model': ['Wavin QS-M-75-260', 'çatı drenaj planı (blok adı)'], 'Çatı tipi': 'Bitümlü çatı', 'Çap': ['Ø75 / iniş Ø110', 'çatı drenaj planı'] }),
  'B.12': sp(['Marka / model', 'Tip (sifonik / gravite)', 'Çap', 'Malzeme'], { 'Tip (sifonik / gravite)': ['planda yazılı değil; tesisat projesiyle teyit', 'çatı drenaj planı'] }),
  'B.13': sp(['Malzeme', 'Çap', 'Et kalınlığı / SDR'], { Çap: ['Ø110', 'çatı drenaj planı'] }),
  // --- Cephe
  'C.1': sp(CAM, { 'Proje kodu': ['FG-01', GOR], 'Bölme yüksekliği': ['5,35 m (+0,10 → +5,45); sistem detayında 5,50 m', 'görünüş / kesit'] }),
  'C.2': sp(ALU, { 'Proje kodu': ['FM-01', GOR] }),
  'C.3': sp(ALU, { 'Proje kodu': ['FM-04', GOR] }),
  'C.4.1': sp(ALU, { 'Levha / panel tipi': ['Alüminyum levha kaplama', D101], Kalınlık: ['3 mm', D101] }),
  'C.4.2': sp(['Karkas profili', 'Yalıtım tipi', 'Yalıtım kalınlığı', 'Isıl iletkenlik λ'], { 'Karkas profili': ['40×40 kutu', D101], 'Yalıtım kalınlığı': ['60 mm', D101] }),
  'C.4.3': sp(LEVHA, { Tip: ['Çimento esaslı levha', D101], 'Levha kalınlığı': ['12,5 mm', D101], 'Kat sayısı': '1' }),
  'C.4.4': sp([...CELIK, 'Yalıtım'], { 'Profil / ebat': ['94 mm çelik karkas (profil ebatı belirtilmemiş)', D101], Yalıtım: ['50 mm (türü verilmemiş)', D101] }),
  'C.4.5': sp(LEVHA, { Tip: ['Çimento esaslı levha', D101], 'Levha kalınlığı': ['12,5 mm', D101], 'Kat sayısı': '2' }),
  'C.5': sacakAlu('FM-01', '+7,15 → +7,60 (0,45 m)'),
  'C.6': sacakAlu('FM-02', '+6,00 → +7,15 (1,15 m)'),
  'C.7': sacakAlu('FM-03', '+5,65 → +6,00 (0,35 m)'),
  'C.8': sp(ALU, { Bant: ['+5,45 → +5,65 (0,20 m), kodsuz', 'görünüş kotları'] }),
  'C.17': sp(ALU, { 'Levha / panel tipi': ['Alüminyum levha kaplama (cam üstü bandı)', D100], Bant: ['+5,45 → +5,90 (0,45 m), kodsuz', 'görünüş cam üstü / tavan planı CH 590'] }),
  'C.9': sp(ALU, { 'Proje kodu': ['FM-05', GOR] }),
  'C.10': sp(TAS, { 'Proje kodu': ['FP-01 (görünüşte FS-01)', D100], 'Taş türü': ['Traverten', D100], Kalınlık: ['30 mm (kesit B ve detay planındaki taş katmanından ölçüldü; yazıyla verilmemiş)', D100] }),
  'C.11': sp(BOYA, { 'Proje kodu': ['FP-01', GOR], 'Renk (RAL / NCS)': ['Koyu (kodu verilmemiş)', GOR] }),
  'C.12': sp(['Malzeme', 'Kalınlık', 'Renk', 'Kolon kaplama genişliği'], { 'Kolon kaplama genişliği': ['0,70 m', 'görünüş'] }),
  'C.15': sp(ALU, { 'Proje kodu': ['FP-03', D100], 'Levha / panel tipi': 'Harpuşta alüminyum levha', Kalınlık: ['3 mm', D100], 'Açınım genişliği': ['0,704 m', D100] }),
  'C.16': sp(ALU, { 'Levha / panel tipi': 'Harpuşta alüminyum levha', Kalınlık: ['2 mm', D101], 'Açınım genişliği': ['~0,68 m', D101] }),
  // --- Tavan
  'D.1': sp(ALCI, { 'Proje kodu': ['C-G01', TAV], 'Levha tipi': ['Alçıpan', TAV], 'Boya rengi (RAL)': ['RAL 9010', TAV], 'Tavan yüksekliği (CH)': ['salon bantlarında CH 690', '01-05-100 tavan planı'] }),
  'D.2': sp(ALCI, { 'Proje kodu': ['C-G02', TAV], 'Levha tipi': ['Alçıpan', TAV], 'Boya rengi (RAL)': ['RAL 9005', TAV], 'Tavan yüksekliği (CH)': ['CH 550 (küçük salonlar)', '01-05-100 tavan planı'] }),
  'D.3': sp(ALCI, { 'Proje kodu': ['C-G03', TAV], 'Levha tipi': ['Neme dayanıklı alçıpan', TAV] }),
  'D.4': sp([...ALCI, 'Delik deseni / ses yutma (αw)'], { 'Proje kodu': ['C-G04', TAV], 'Levha tipi': ['Akustik alçıpan', TAV], 'Tavan yüksekliği (CH)': ['CH 550', '01-05-100 tavan planı'] }),
  'D.5': sp(METAL_TAVAN, { 'Proje kodu': ['C-M01', TAV], Malzeme: ['Metal asma tavan', TAV] }),
  'D.6': sp(METAL_TAVAN, { 'Proje kodu': ['C-M02', TAV], Malzeme: ['Alüminyum petek', TAV], 'Tavan yüksekliği (CH)': ['CH 260', '01-05-100 tavan planı'] }),
  'D.7': sp(METAL_TAVAN, { 'Proje kodu': ['C-M03', TAV], Malzeme: ['Alüminyum lineer kanal', TAV], 'Modül / profil ölçüsü': ['350 mm genişlik', '01-05-100 tavan planı'] }),
  'D.8': sp(BOYA, { 'Proje kodu': ['C-P01', TAV] }),
  'D.9': sp(AHSAP, { 'Proje kodu': ['C-W01', TAV], 'Tavan yüksekliği (CH)': ['CH 300', '01-05-100 tavan planı'] }),
  'D.10': sp(AHSAP, { 'Proje kodu': ['C-W02', TAV], 'Tavan yüksekliği (CH)': ['CH 300', '01-05-100 tavan planı'] }),
  'D.11': sp(AHSAP, { 'Proje kodu': ['C-W03', TAV], 'Modül ölçüsü': ['1,88 × 1,88 m (iki panelli modül)', '01-05-100 tavan planı (190_TAVAN MODÜL)'] }),
  'D.12': sp(METAL_TAVAN, { 'Proje kodu': ['C-B01', TAV], Malzeme: ['Alüminyum baffle', TAV], 'Tavan yüksekliği (CH)': ['CH 532', '01-05-100 tavan planı'] }),
  'D.13': sp(ALU, { 'Levha / panel tipi': ['Alüminyum levha kaplama (altında 2×12,5 mm çimento esaslı levha)', '01-03-100 / 01-09-101 kesitler'], 'Tavan yüksekliği (CH)': ['CH 590 / BOC +6,00', '01-05-100 tavan planı'] }),
  // --- Döşeme, temel
  'F.1': sp(['Tip (karo / rulo)', 'Toplam kalınlık', 'Hav tipi / yüksekliği', 'Renk / desen', 'Yangın sınıfı (EN 13501-1)', 'Kullanım sınıfı (EN 1307)'], { 'Toplam kalınlık': ['10 mm', D100] }),
  'F.2': sp(['Kaplama türü', 'Ebat', 'Kalınlık', 'Renk'], { 'Kaplama türü': ['ID projesine göre (mimari paftada yok)', 'genel not'] }),
  'F.3': sp(BETON, { Kalınlık: ['90 mm', D100] }),
  'F.4': sp(BETON, { Kalınlık: ['200 mm', D100] }),
  'F.5': sp(YALITIM_SU, { Tip: ['Döşeme altı su yalıtımı (türü verilmemiş)', D100] }),
  'F.6': sp(BETON, { Kalınlık: ['50 mm', D100] }),
  'F.7': sp(YALITIM_SU, { Tip: ['Su yalıtım membranı (türü verilmemiş)', D100] }),
  'F.8': sp(YALITIM_ISI, { Tip: ['XPS levha', D100], Kalınlık: ['60 mm', D100] }),
  'F.9': sp(['Tip', 'Kalınlık', 'Yükseklik'], { Yükseklik: ['0,90 m (±0,00 → temel üstü)', D100] }),
  'F.10': sp(BETON, { Kalınlık: ['60 mm', D100] }),
  'F.13': sp([...CELIK, 'Basamak kaplaması', 'Korkuluk'], { 'Merdiven ölçüsü': ['23 rıht, 1,20 m genişlik (2 adet)', '1. kat planı'] }),
  // --- Duvar, bölme
  'G.1': sp(['Duvar malzemesi', 'Blok / tuğla ölçüsü', 'Duvar kalınlıkları', 'Harç / yapıştırıcı', 'Sıva'], { 'Duvar malzemesi': ['paftada belirtilmemiş', 'zemin kat planı'], 'Duvar kalınlıkları': ['taramadan 5 cm sınıflarında (hesap detayında)', 'zemin kat planı'] }),
  'G.2': sp(['Duvar malzemesi', 'Blok / tuğla ölçüsü', 'Duvar kalınlıkları', 'Harç / yapıştırıcı', 'Sıva'], { 'Duvar malzemesi': ['paftada belirtilmemiş', 'zemin kat planı'], 'Duvar kalınlıkları': ['taramadan 5 cm sınıflarında (hesap detayında)', 'zemin kat planı'] }),
  // shortcut: G.3.n ↔ kalınlık eşlemesi şimdiki taramadaki sınıflardan (10/15/20/25 cm); sınıf eklenirse güncellenir
  ...Object.fromEntries([10, 15, 20, 25].map((t, i) => [`G.3.${i + 1}`, sp(['Duvar malzemesi', 'Blok / tuğla ölçüsü', 'Duvar kalınlığı', 'Harç / yapıştırıcı', 'Sıva'], { 'Duvar malzemesi': ['paftada belirtilmemiş', 'zemin kat planı'], 'Duvar kalınlığı': [`~${t} cm (taramadan)`, 'zemin kat planı'] })])),
  'G.4': sp(['Marka / sistem', 'Ray tipi', 'Ses yalıtımı (Rw)', 'Panel yüksekliği'], { 'Marka / sistem': ['Movatech (plan bloğu adı)', 'zemin kat planı'] }),
  'G.5': sp(['Marka / sistem', 'Panel tipleri', 'Panel kalınlığı', 'Ses yalıtımı (Rw)', 'Yüzey kaplaması', 'Panel yüksekliği'], { 'Marka / sistem': ['Movatech (plan bloğu adı)', 'zemin kat planı'], 'Panel tipleri': ['standart + teleskopik + kapılı', 'zemin kat planı'] }),
  // --- Kapılar
  'H.1': kapi('101 cm'),
  'H.2': kapi('115 cm'),
  'H.3': kapi('120 cm'),
  'H.4': kapi('125 cm'),
  'H.5': kapi('90 cm'),
  'H.6': kapi('91 cm'),
  'H.7': kapi('103 cm', true),
  'H.8': kapi('69 cm', true),
  'H.9': kapi('86 cm', true),
  'H.10': kapi('94 cm', true),
  // --- Islak hacim
  'J.1': sp(['Malzeme', 'Panel kalınlığı', 'Renk', 'Kabin yüksekliği', 'Donanım (menteşe / kilit)'], { Malzeme: ['Kompakt laminat', 'zemin kat planı (katman _kompakt laminat)'] }),
  'J.2': sp(['Marka / seri', 'Tip', 'Rezervuar', 'Renk'], { Tip: ['Asma klozet', 'zemin kat planı'], 'Marka / seri': ['Duravit (kulis/engelli WC bloğu adı); kabin içi belirtilmemiş', 'zemin kat planı'] }),
};
