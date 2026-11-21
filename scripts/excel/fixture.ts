// Test yardımcısı: gerçek Excel'in yapısını taklit eden küçük kitap (bellekte).
import ExcelJS from 'exceljs';

export async function buildFixtureWorkbook(opts: { omitSheet?: string; breakResult?: boolean } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const add = (name: string) => (opts.omitSheet === name ? null : wb.addWorksheet(name));

  const ozet = add('Özet');
  if (ozet) {
    ozet.getCell('A4').value = 'Başlıca Büyüklükler';
    ozet.getCell('A5').value = 'Zemin kat net mahal alanı';
    ozet.getCell('B5').value = 'm²';
    ozet.getCell('C5').value = { formula: 'Metraj!E4', result: 120.5 };
    ozet.getCell('A6').value = 'Toplam kapı';
    ozet.getCell('B6').value = 'adet';
    ozet.getCell('C6').value = { formula: 'Metraj!E16', result: 35 };
    ozet.getCell('A8').value = 'Sayfalar';
  }

  const m = add('Metraj');
  if (m) {
    m.getRow(1).values = ['METRAJ'];
    m.getRow(2).values = ['Poz', 'İş Kalemi / Malzeme', 'Proje Kodu', 'Birim', 'Miktar', 'Hesap Yöntemi', 'Kaynak Pafta', 'Güven'];
    m.getCell('A3').value = 'A. GENEL ALANLAR';
    m.getRow(4).values = ['A.1', 'Zemin kat net mahal alanı (toplam)', null, 'm²', null, 'Mahal Listesi toplamı', '01…04-02-100', 'Yüksek'];
    m.getCell('E4').value = { formula: `SUMIF('Mahal Listesi'!$C$3:$C$56,"Zemin Kat",'Mahal Listesi'!$E$3:$E$56)`, result: 120.5 };
    m.getRow(5).values = ['A.5', 'Çatı izdüşüm alanı', null, 'm²', 8392.5, 'Ölçüm', '01…04-02-300', 'Yüksek'];
    m.getCell('A6').value = 'B. ÇATI';
    m.getRow(7).values = ['B.1', 'Uzay kafes', null, 'm²', null, 'Taralı bölgeler', '01…04-02-300, 04-01-100', 'Yüksek'];
    m.getCell('E7').value = { formula: '805.5+1239+803.2', result: 2847.7 };
    m.getRow(8).values = ['B.1.1', 'TPU membran', null, 'm²', null, 'B.1 ile aynı', '01-03-100', 'Orta'];
    m.getCell('E8').value = { formula: 'E7', result: 2847.7, shareType: 'shared', ref: 'E8:E9' } as ExcelJS.CellFormulaValue;
    m.getRow(9).values = ['B.1.2', 'Su yalıtımı', null, 'm²', null, 'B.1 ile aynı', '01-03-100', 'Orta'];
    m.getCell('E9').value = { sharedFormula: 'E8', result: 2847.7 } as ExcelJS.CellSharedFormulaValue;
    m.getRow(10).values = ['B.2', 'Teras çatı', null, 'm²', null, 'A.5 − B.1', 'Genel not 10', 'Orta'];
    m.getCell('E10').value = { formula: 'E5-E7', result: opts.breakResult ? 5000 : 5544.8 };
    m.getRow(11).values = ['C.2', 'Alüminyum panel', 'FM-01', 'm²', null, 'Cephe toplamı', '01/02-04-100…400', 'Orta'];
    m.getCell('E11').value = { formula: 'Cephe!B7', result: 592.9 };
    m.getRow(12).values = ['B.4', 'Yağmur suyu kanalı', null, 'm', null, 'ölçülemedi', '01-03-100', '—'];
    m.getCell('A13').value = 'H. KAPILAR';
    m.getRow(14).values = ['H.1', 'Tek kanatlı kapı ~70 cm', null, 'adet', 3, 'Sayıldı', '01…04-02-100', 'Yüksek'];
    m.getRow(15).values = ['H.2', 'Tek kanatlı kapı ~90 cm', null, 'adet', 32, 'Sayıldı', '01…04-02-100', 'Yüksek'];
    m.getRow(16).values = ['H.8', 'Toplam kapı', null, 'adet', null, 'H.1 … H.2', null, 'Yüksek'];
    m.getCell('E16').value = { formula: 'SUM(E14:E15)', result: 35 };
    m.getCell('A18').value = 'Mavi: çizimden ölçülen değer';
  }

  const mal = add('Malzeme Listesi');
  if (mal) {
    mal.getRow(2).values = ['No', 'Grup', 'Malzeme', 'Proje Kodu', 'Kullanım Yeri', 'Kaynak Pafta', 'Birim', 'Metraj', 'Not'];
    mal.getRow(3).values = [1, 'Çatı', 'Çakıl', null, 'Teras çatı', '00-09-100', 'm²', null, null];
    mal.getCell('H3').value = { formula: 'Metraj!E10', result: 5544.8 };
    mal.getRow(4).values = [2, 'Çatı', 'Yağmur suyu kanalı', null, 'Çatı', '01-03-100', 'm', '—', 'Ölçülemedi'];
    mal.getRow(5).values = [3, 'Çatı', 'Toplam', null, 'Çatı', '01-03-100', 'm²', null, null];
    mal.getCell('H5').value = { formula: 'Metraj!E7+Metraj!E5', result: 11240.2 };
  }

  const mah = add('Mahal Listesi');
  if (mah) {
    mah.getRow(2).values = ['Kod', 'Mahal Adı', 'Kat', 'Zone', 'Alan (m²)', 'Tavan Alt', 'Tavan Üst', 'CH', 'Döşeme', 'Not', 'Kontrol'];
    mah.getRow(3).values = ['GF-01', 'SALON', 'Zemin Kat', 'Zone 3', 100, null, 'C-W03', null, 'Halı kaplama', null, 98.5];
    mah.getRow(4).values = ['GF-02', 'DEPO', 'Zemin Kat', 'Zone 2', 20.5, 'C-P01', null, '3.40', null, 'Kod tekrarı', null];
    mah.getRow(5).values = ['GF-02', 'TEKNİK', 'Asma Kat (Teknik)', 'Zone 2', 50, null, 'C-P01', null, null, null, null];
    mah.getCell('B57').value = 'TOPLAM (zemin + asma kat)';
    mah.getCell('E57').value = { formula: 'SUM(E3:E56)', result: 170.5 };
    mah.getCell('A59').value = 'Mavi sayılar: projedeki mahal etiketinden okunan alanlar.';
  }

  const c = add('Cephe');
  if (c) {
    c.getRow(2).values = ['Görünüş', 'FM-01', 'FM-02/FM-03', 'FM-04', 'FM-05', 'FS-01', 'FP-01', 'Toplam'];
    const rows: [string, number[]][] = [
      ['Güneydoğu (GD)', [365.8, 195.5, 80.4, 0, 0, 0]],
      ['Kuzeydoğu (KD)', [227.1, 50, 41.6, 8.1, 227.3, 33.4]],
      ['Kuzeybatı (KB)', [0, 0, 0, 0, 0, 0]],
      ['Güneybatı (GB)', [0, 0, 0, 0, 0, 0]],
    ];
    rows.forEach(([label, vals], i) => {
      const r = 3 + i;
      c.getRow(r).values = [label, ...vals];
      c.getCell(`H${r}`).value = { formula: `SUM(B${r}:G${r})`, result: vals.reduce((a, b) => a + b, 0) };
    });
    const totals = [592.9, 245.5, 122, 8.1, 227.3, 33.4];
    'BCDEFG'.split('').forEach((col, i) => {
      c.getCell(`${col}7`).value = { formula: `SUM(${col}3:${col}6)`, result: totals[i] };
    });
    c.getCell('A7').value = 'TOPLAM';
    c.getCell('H7').value = { formula: 'SUM(H3:H6)', result: 1229.2 };
    c.getCell('A9').value = 'Malzeme kodları görünüş etiketlerine göredir.';
  }

  const pk = add('Proje Kontrol');
  if (pk) {
    pk.getRow(2).values = ['No', 'Konu', 'Pafta', 'Tespit', 'Öneri'];
    pk.getRow(3).values = [1, 'Mahal kodu tekrarı', '02-02-100', 'GF-02 iki mahalde', 'Tekil kod verin.'];
  }

  const y = add('Yöntem');
  if (y) {
    y.getCell('A1').value = 'YÖNTEM VE VARSAYIMLAR';
    y.getCell('A2').value = '1. Kaynak: 40 PDF pafta.';
    y.getCell('A3').value = '2. Ölçek: 1/100.';
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const FIXTURE_DRAWINGS = [
  ...['01', '02', '03', '04'].flatMap((z) => [`4199-A-DD-${z}-02-100`, `4199-A-DD-${z}-02-300`]),
  '4199-A-DD-04-01-100',
  '4199-A-DD-01-03-100',
  ...['100', '200', '300', '400'].flatMap((n) => [`4199-A-DD-01-04-${n}`, `4199-A-DD-02-04-${n}`]),
  '4199-A-DD-00-09-100',
];
