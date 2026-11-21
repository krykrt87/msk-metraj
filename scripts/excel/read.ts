import ExcelJS from 'exceljs';

/** Hücre: görünen değer (formülde Excel'in son hesapladığı sonuç) ve varsa formül. */
export interface RawCell {
  value: string | number | null;
  formula?: string;
}
export type RawSheet = Record<string, RawCell>;
export type RawBook = Record<string, RawSheet>;

function plain(v: unknown, where: string): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('');
    if ('error' in o) throw new Error(`${where}: Excel hata değeri ${String(o.error)}`);
    if ('text' in o) return String(o.text);
  }
  throw new Error(`${where}: tanınmayan hücre değeri`);
}

export async function readWorkbook(source: string | Buffer): Promise<RawBook> {
  const wb = new ExcelJS.Workbook();
  if (typeof source === 'string') await wb.xlsx.readFile(source);
  else await wb.xlsx.load(source as unknown as ArrayBuffer);
  const book: RawBook = {};
  wb.eachSheet((ws) => {
    const sheet: RawSheet = {};
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const where = `${ws.name}!${cell.address}`;
        if (cell.type === ExcelJS.ValueType.Formula) {
          const formula = cell.formula;
          if (!formula) throw new Error(`${where}: formül okunamadı (paylaşımlı formül çözülemedi)`);
          sheet[cell.address] = { value: plain(cell.result, where), formula };
        } else {
          const value = plain(cell.value, where);
          if (value !== null && value !== '') sheet[cell.address] = { value };
        }
      });
    });
    book[ws.name] = sheet;
  });
  return book;
}
