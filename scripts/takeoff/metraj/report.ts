// Metraj sonucunu okunabilir Excel'e yazar: her kalemin nereden ve nasıl hesaplandığı ayrı sayfalarda.
import ExcelJS from 'exceljs';
import type { Takeoff } from './model';

const NUM = '#,##0.00';
const head = (ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) => {
  ws.columns = cols;
  const r = ws.getRow(1);
  r.font = { bold: true };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.border = { bottom: { style: 'medium' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};
const wrap = (ws: ExcelJS.Worksheet, keys: string[]) => keys.forEach((k) => (ws.getColumn(k).alignment = { wrapText: true, vertical: 'top' }));

export async function writeReport(t: Takeoff, file: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MSK metraj';

  const m = wb.addWorksheet('Metraj');
  head(m, [
    { header: 'Poz', key: 'poz', width: 8 },
    { header: 'İş kalemi', key: 'name', width: 44 },
    { header: 'Proje kodu', key: 'code', width: 11 },
    { header: 'Birim', key: 'unit', width: 7 },
    { header: 'Miktar', key: 'value', width: 13 },
    { header: 'Hesap', key: 'formula', width: 22 },
    { header: 'Nereden, nasıl', key: 'method', width: 70 },
    { header: 'Kaynak pafta / çizim nesnesi', key: 'sources', width: 48 },
    { header: 'Güven', key: 'confidence', width: 8 },
    { header: 'Not / varsayım', key: 'notes', width: 50 },
  ]);
  for (const g of t.groups) {
    const items = t.items.filter((i) => i.group === g.key);
    if (!items.length) continue;
    const gr = m.addRow({ poz: `${g.key}.`, name: g.title });
    gr.font = { bold: true };
    gr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F4' } };
    for (const i of items) {
      const r = m.addRow({
        poz: i.poz,
        name: i.name,
        code: i.code ?? '',
        unit: i.unit,
        value: i.value,
        formula: i.formula ?? '',
        method: i.method,
        sources: i.sources.map((s) => `${s.drawing}: ${s.where}`).join('\n'),
        confidence: i.confidence ?? '—',
        notes: (i.notes ?? []).join('\n'),
      });
      r.getCell('value').numFmt = i.unit === 'adet' ? '#,##0' : NUM;
      if (i.value === null) r.getCell('value').value = 'ölçülemedi';
    }
  }
  wrap(m, ['name', 'method', 'sources', 'notes']);

  const d = wb.addWorksheet('Hesap Detayı');
  head(d, [
    { header: 'Poz', key: 'poz', width: 8 },
    { header: 'Kalem', key: 'item', width: 36 },
    { header: 'Satır / parça', key: 'label', width: 44 },
    { header: 'Adet', key: 'adet', width: 6 },
    { header: 'En (m)', key: 'en', width: 10 },
    { header: 'Boy (m)', key: 'boy', width: 10 },
    { header: 'Değer', key: 'value', width: 13 },
    { header: 'Birim', key: 'unit', width: 7 },
    { header: 'Açıklama', key: 'note', width: 70 },
  ]);
  for (const i of t.items) {
    if (!i.lines.length) continue;
    for (const l of i.lines) {
      const r = d.addRow({ poz: i.poz, item: i.name, label: l.label, value: l.value, unit: l.unit, note: l.note ?? '' });
      r.getCell('value').numFmt = l.unit === 'adet' ? '#,##0' : NUM;
      if (l.calc?.length) r.font = { bold: true };
      for (const c of l.calc ?? []) {
        const kind = c.kind === 'dikdörtgen' ? 'dikdörtgen' : c.kind === 'yamuk' ? `yamuk (${c.a} + ${c.b}) / 2` : `daire parçası r=${c.r} m, açı ${c.angle?.toFixed(2)}°`;
        const cr = d.addRow({ poz: '', item: '', label: `    ${c.sign < 0 ? '(−) ' : ''}${kind}`, adet: c.adet, en: c.en ?? null, boy: c.boy ?? null, value: c.value, unit: 'm²', note: c.kind === 'daire parçası' ? 'r²/2 × (θ − sin θ)' : c.kind === 'yamuk' ? 'ortalama en × boy' : 'en × boy' });
        cr.getCell('value').numFmt = NUM;
        cr.getCell('en').numFmt = '0.000';
        cr.getCell('boy').numFmt = '0.000';
        cr.font = { color: { argb: c.sign < 0 ? 'FFB42318' : 'FF5A6270' } };
      }
    }
    const s = d.addRow({ poz: i.poz, item: i.name, label: 'TOPLAM', value: i.value, unit: i.unit });
    s.font = { bold: true };
    s.getCell('value').numFmt = i.unit === 'adet' ? '#,##0' : NUM;
    s.border = { top: { style: 'thin' } };
  }
  wrap(d, ['label', 'note']);

  const r = wb.addWorksheet('Mahal Listesi');
  head(r, [
    { header: 'Kod', key: 'code', width: 9 },
    { header: 'Mahal', key: 'name', width: 26 },
    { header: 'Kat', key: 'floor', width: 16 },
    { header: 'Zone', key: 'zone', width: 8 },
    { header: 'Alan (m²)', key: 'area', width: 11 },
    { header: 'Alan kaynağı', key: 'areaSource', width: 11 },
    { header: 'Etiket alanı', key: 'labelArea', width: 11 },
    { header: 'Kontrol ölçümü', key: 'measuredArea', width: 11 },
    { header: 'Tavan (alt kat planı)', key: 'ceilingLower', width: 18 },
    { header: 'Tavan (üst kat planı)', key: 'ceilingUpper', width: 18 },
    { header: 'CH', key: 'ch', width: 9 },
    { header: 'Döşeme', key: 'flooring', width: 18 },
    { header: 'Not', key: 'note', width: 60 },
  ]);
  for (const x of t.rooms) {
    const row = r.addRow(x);
    for (const k of ['area', 'labelArea', 'measuredArea']) row.getCell(k).numFmt = NUM;
  }
  wrap(r, ['note']);

  const f = wb.addWorksheet('Kontrol Notları');
  head(f, [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Konu', key: 'topic', width: 26 },
    { header: 'Pafta', key: 'drawings', width: 22 },
    { header: 'Tespit', key: 'finding', width: 80 },
    { header: 'Öneri', key: 'suggestion', width: 40 },
  ]);
  t.findings.forEach((x, i) => f.addRow({ no: i + 1, ...x }));
  wrap(f, ['finding', 'suggestion']);

  const y = wb.addWorksheet('Yöntem');
  y.getColumn(1).width = 120;
  y.getColumn(1).alignment = { wrapText: true, vertical: 'top' };
  y.addRow(['YÖNTEM']).font = { bold: true };
  t.method.forEach((p) => y.addRow([p]));

  await wb.xlsx.writeFile(file);
}
