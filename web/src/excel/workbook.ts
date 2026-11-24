// Satın alma çıktısı (tasarım §6.7): kullanıcının seçtiği sayfalar. Tarayıcıda üretilir.
import type ExcelJS from 'exceljs';
import { partRule, partTitle, unitOf } from '@shared/calc';
import { FINDING_STATUS_LABEL, STATUS_LABEL, type Finding, type Item, type Room } from '@shared/types';
import { toDate } from '../data/types';
import { isMaterial } from '../malzeme/MalzemePage';

const NUM = '#,##0.00';
const numFmt = (unit: string) => (unit === 'adet' ? '#,##0' : NUM);
type Col = { header: string; key: string; width: number; num?: boolean };
type Data = { items: Item[]; rooms: Room[]; findings: Finding[] };

function sheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(({ header, key, width }) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true };
  ws.addRows(rows);
  for (const c of cols) {
    const col = ws.getColumn(c.key);
    if (c.num) col.numFmt = NUM;
    else col.alignment = { wrapText: true, vertical: 'top' };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

const live = (d: Data) => d.items.filter((i) => !i.cancelled);
const base = (i: Item) => ({
  poz: i.poz,
  name: i.name,
  code: i.code ?? '',
  unit: i.unit,
  value: i.value, // null = ölçülemedi, boş hücre
  status: STATUS_LABEL[i.status],
  updated: toDate(i.updatedAt) ?? '',
});
const HEAD: Col[] = [
  { header: 'Poz', key: 'poz', width: 8 },
  { header: 'İş kalemi', key: 'name', width: 44 },
  { header: 'Proje kodu', key: 'code', width: 11 },
  { header: 'Birim', key: 'unit', width: 7 },
  { header: 'Miktar', key: 'value', width: 13, num: true },
  { header: 'Kontrol durumu', key: 'status', width: 18 },
];
const UPDATED: Col = { header: 'Son değişiklik', key: 'updated', width: 16 };

/** Kalemin satır satır dökümü ve cetvel parçaları (scripts/takeoff/metraj/report.ts ile aynı düzen). */
function detail(wb: ExcelJS.Workbook, d: Data) {
  const ws = sheet(
    wb,
    'Hesap Detayı',
    [
      { header: 'Poz', key: 'poz', width: 8 },
      { header: 'Kalem', key: 'item', width: 36 },
      { header: 'Satır / parça', key: 'label', width: 44 },
      { header: 'Adet', key: 'adet', width: 6, num: true },
      { header: 'En / kalınlık (m)', key: 'en', width: 10, num: true },
      { header: 'Boy / uzunluk (m)', key: 'boy', width: 10, num: true },
      { header: 'Kenar a (m)', key: 'ka', width: 10, num: true },
      { header: 'Kenar b (m)', key: 'kb', width: 10, num: true },
      { header: 'r (m)', key: 'r', width: 9, num: true },
      { header: 'Açı (°)', key: 'aci', width: 8, num: true },
      { header: 'Değer', key: 'value', width: 13, num: true },
      { header: 'Birim', key: 'unit', width: 7 },
      { header: 'Açıklama', key: 'note', width: 70 },
    ],
    [],
  );
  for (const c of ['en', 'boy', 'ka', 'kb', 'r']) ws.getColumn(c).numFmt = '0.000';
  ws.getColumn('adet').numFmt = '#,##0';
  for (const i of live(d)) {
    if (!i.breakdown?.length) continue;
    for (const l of i.breakdown) {
      const r = ws.addRow({ poz: i.poz, item: i.name, label: l.label, value: l.value, unit: l.unit, note: l.note ?? '' });
      r.getCell('value').numFmt = numFmt(l.unit);
      if (l.calc?.length) r.font = { bold: true };
      for (const c of l.calc ?? []) {
        const arc = c.kind === 'daire parçası' || c.kind === 'yay';
        const cr = ws.addRow({
          label: `    ${c.sign < 0 ? '(−) ' : ''}${partTitle(c)}`,
          adet: c.adet,
          en: arc ? null : (c.en ?? null),
          boy: c.boy ?? null,
          ka: c.kind === 'yamuk' ? c.a : null,
          kb: c.kind === 'yamuk' ? c.b : null,
          r: c.r ?? null,
          aci: c.angle !== undefined ? Math.round(c.angle * 100) / 100 : null,
          value: c.value,
          unit: unitOf(c),
          note: partRule(c),
        });
        cr.font = { color: { argb: c.sign < 0 ? 'FFB42318' : 'FF5A6270' } };
      }
    }
    const s = ws.addRow({ poz: i.poz, item: i.name, label: 'TOPLAM', value: i.value, unit: i.unit });
    s.font = { bold: true };
    s.getCell('value').numFmt = numFmt(i.unit);
    s.border = { top: { style: 'thin' } };
  }
}

export const SHEETS = [
  {
    key: 'metraj',
    label: 'Metraj',
    hint: 'tüm kalemler, miktar, kontrol durumu, hesap yöntemi, kaynak pafta, son değişiklik',
    write: (wb: ExcelJS.Workbook, d: Data) =>
      sheet(wb, 'Metraj', [...HEAD, { header: 'Hesap yöntemi', key: 'method', width: 60 }, { header: 'Kaynak pafta / çizim nesnesi', key: 'sources', width: 48 }, { header: 'Not / varsayım', key: 'notes', width: 50 }, UPDATED],
        live(d).map((i) => ({
          ...base(i),
          method: i.method,
          sources: i.sources?.length ? i.sources.map((s) => `${s.drawing}: ${s.where}`).join('\n') : i.drawings.join(', '),
          notes: (i.notes ?? []).join('\n'),
        }))),
  },
  { key: 'detay', label: 'Hesap Detayı', hint: 'her kalemin satır satır dökümü: parça, adet, en, boy, değer', write: detail },
  {
    key: 'malzeme',
    label: 'Malzeme Listesi',
    hint: 'özellikleriyle (eksikler “TANIMLANMALI”)',
    write: (wb: ExcelJS.Workbook, d: Data) =>
      sheet(wb, 'Malzeme Listesi', [...HEAD, { header: 'Özellikler', key: 'specs', width: 60 }, UPDATED],
        live(d).filter(isMaterial).map((i) => ({ ...base(i), specs: (i.specs ?? []).map((s) => `${s.label}: ${s.value ?? 'TANIMLANMALI'}`).join('\n') }))),
  },
  {
    key: 'mahal',
    label: 'Mahal Listesi',
    hint: 'alan, tavan, CH, döşeme',
    write: (wb: ExcelJS.Workbook, d: Data) =>
      sheet(wb, 'Mahal Listesi', [
        { header: 'Kod', key: 'code', width: 9 },
        { header: 'Mahal', key: 'name', width: 30 },
        { header: 'Kat', key: 'floor', width: 14 },
        { header: 'Alan (m²)', key: 'area', width: 11, num: true },
        { header: 'Tavan alt', key: 'ceilingLower', width: 11 },
        { header: 'Tavan üst', key: 'ceilingUpper', width: 11 },
        { header: 'CH', key: 'ch', width: 7 },
        { header: 'Döşeme', key: 'flooring', width: 20 },
        { header: 'Not', key: 'note', width: 40 },
      ], d.rooms.map((r) => ({ ...r }))),
  },
  {
    key: 'kontrol',
    label: 'Proje Kontrol',
    hint: 'bulgular ve durumları',
    write: (wb: ExcelJS.Workbook, d: Data) =>
      sheet(wb, 'Proje Kontrol', [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Konu', key: 'topic', width: 16 },
        { header: 'Pafta', key: 'drawingsText', width: 22 },
        { header: 'Bulgu', key: 'finding', width: 60 },
        { header: 'Öneri', key: 'suggestion', width: 40 },
        { header: 'Durum', key: 'status', width: 16 },
      ], d.findings.map((f) => ({ ...f, status: FINDING_STATUS_LABEL[f.status] }))),
  },
] as const;
export type SheetKey = (typeof SHEETS)[number]['key'];

export async function buildWorkbook(d: Data, keys: readonly SheetKey[]): Promise<ExcelJS.Workbook> {
  const { default: Excel } = await import('exceljs');
  const wb = new Excel.Workbook();
  wb.creator = 'MSK metraj';
  for (const s of SHEETS) if (keys.includes(s.key)) s.write(wb, d);
  return wb;
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, file: string) {
  const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Dosya adı için yerel tarih-saat: 2026-11-24_09-37 */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}
