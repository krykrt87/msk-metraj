import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import type { Finding, Item, Room } from '@shared/types';

vi.mock('../firebase', () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
const { buildWorkbook, SHEETS } = await import('./workbook');

const item = (poz: string, v: Partial<Item>) =>
  ({ id: poz, poz, name: poz, code: null, unit: 'm²', value: 10, method: 'ölçüm', drawings: ['A-100'], status: 'kesinlesti', cancelled: false, updatedAt: null, ...v }) as Item;
const data = {
  items: [
    item('A.1', {
      breakdown: [{ label: 'Zemin', value: 10, unit: 'm²', calc: [{ kind: 'dikdörtgen', label: 'en × boy', adet: 1, en: 2, boy: 5, sign: 1, value: 10 }] }],
    }),
    item('C.1', { specs: [{ label: 'Renk', value: null }] }),
    item('X.1', { cancelled: true, specs: [] }),
  ],
  rooms: [{ id: 'GF-01', code: 'GF-01', name: 'RÜZGARLIK', floor: 'Zemin Kat', area: 41.04 } as Room],
  findings: [{ no: 1, topic: 'Mahal alanı', drawingsText: 'A-100', finding: 'x', suggestion: 'y', status: 'iletildi' } as Finding],
};
const roundTrip = async (wb: ExcelJS.Workbook) => {
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  return back;
};

describe('buildWorkbook', () => {
  it('tüm sayfalar; iptal kalem yok, hesap detayı, özellikler ve bulgu durumu yazılı', async () => {
    const back = await roundTrip(await buildWorkbook(data, SHEETS.map((s) => s.key)));
    expect(back.worksheets.map((w) => w.name)).toEqual(['Metraj', 'Hesap Detayı', 'Malzeme Listesi', 'Mahal Listesi', 'Proje Kontrol']);
    const metraj = back.getWorksheet('Metraj')!;
    expect(metraj.rowCount).toBe(3); // başlık + 2 (iptal hariç)
    expect(metraj.getCell('E2').value).toBe(10);
    expect(metraj.getCell('F2').value).toBe('Kesinleşti');
    const det = back.getWorksheet('Hesap Detayı')!;
    expect(det.getCell('C2').value).toBe('Zemin');
    expect(det.getCell('E3').value).toBe(2); // parça satırı: en
    expect(det.getCell('C4').value).toBe('TOPLAM');
    expect(det.rowCount).toBe(4); // dökümü olmayan C.1 yazılmaz
    expect(back.getWorksheet('Malzeme Listesi')!.getCell('G2').value).toBe('Renk: TANIMLANMALI');
    expect(back.getWorksheet('Mahal Listesi')!.getCell('D2').value).toBe(41.04);
    expect(back.getWorksheet('Proje Kontrol')!.getCell('F2').value).toBe('Mimara iletildi');
  });
  it('yalnız seçilen sayfalar yazılır', async () => {
    const back = await roundTrip(await buildWorkbook(data, ['kontrol', 'detay']));
    expect(back.worksheets.map((w) => w.name)).toEqual(['Hesap Detayı', 'Proje Kontrol']);
  });
});

describe('stamp', () => {
  it('yerel tarih-saat, sıfır dolgulu', async () => {
    const { stamp } = await import('./workbook');
    expect(stamp(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05_07-03');
  });
});
