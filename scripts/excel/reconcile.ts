// Uygulamanın hesapladığı her sayıyı Excel'in son hesapladığı değerle karşılaştırır.
import { parseFormula } from '../../shared/formula/parse';
import { evaluate } from '../../shared/formula/evaluate';
import { evaluateAll } from '../../shared/recompute';
import { FACADE_COLUMNS } from '../../shared/types';
import { importToState, maxRow, sheetOf, type ImportData } from './build';
import type { RawBook, RawCell } from './read';

export interface ReconRow {
  sheet: string;
  cell: string;
  label: string;
  excel: number | null;
  app: number | null;
  ok: boolean;
}

const TOL = 1e-6;
const excelNum = (c: RawCell | undefined): number | null => (typeof c?.value === 'number' ? c.value : null);
const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= TOL);

export function reconcile(data: ImportData, raw: RawBook): { rows: ReconRow[]; mismatches: number } {
  const state = importToState(data);
  const values = evaluateAll(state);
  const rows: ReconRow[] = [];
  const add = (sheet: string, cell: string, label: string, excel: number | null, app: number | null) =>
    rows.push({ sheet, cell, label, excel, app, ok: same(excel, app) });

  const m = sheetOf(raw, 'Metraj');
  for (const it of data.items) add('Metraj', `E${it.order}`, it.id, excelNum(m[`E${it.order}`]), values.items[it.id]);

  const ml = sheetOf(raw, 'Malzeme Listesi');
  for (let r = 3, end = maxRow(ml); r <= end; r++) {
    const no = ml[`A${r}`]?.value;
    if (typeof no !== 'number') continue;
    add('Malzeme Listesi', `H${r}`, `#${no}`, excelNum(ml[`H${r}`]), values.materials[String(no)] ?? null);
  }

  const ctx = {
    item: (id: string) => (id in values.items ? values.items[id] : undefined),
    rooms: data.rooms,
    facade: data.facade,
  };
  const oz = sheetOf(raw, 'Özet');
  data.discipline.summary.forEach((s, i) => {
    add('Özet', `C${5 + i}`, s.label, excelNum(oz[`C${5 + i}`]), evaluate(parseFormula(s.formula), ctx));
  });

  const c = sheetOf(raw, 'Cephe');
  FACADE_COLUMNS.forEach((col, i) => {
    const total = data.facade.reduce((sum, f) => sum + f.values[col], 0);
    add('Cephe', `${'BCDEFG'[i]}7`, `${col} toplamı`, excelNum(c[`${'BCDEFG'[i]}7`]), total);
  });
  data.facade.forEach((f, i) => {
    const rowTotal = FACADE_COLUMNS.reduce((sum, col) => sum + f.values[col], 0);
    add('Cephe', `H${3 + i}`, `${f.id} toplamı`, excelNum(c[`H${3 + i}`]), rowTotal);
  });
  const grand = data.facade.reduce((s, f) => s + FACADE_COLUMNS.reduce((a, col) => a + f.values[col], 0), 0);
  add('Cephe', 'H7', 'Cephe genel toplamı', excelNum(c.H7), grand);

  const mh = sheetOf(raw, 'Mahal Listesi');
  const totalRow = Object.keys(mh).find((a) => a.startsWith('B') && String(mh[a].value).startsWith('TOPLAM'));
  if (totalRow) {
    const r = totalRow.slice(1);
    add('Mahal Listesi', `E${r}`, 'Mahal alanları toplamı', excelNum(mh[`E${r}`]), data.rooms.reduce((s, x) => s + x.area, 0));
  }

  return { rows, mismatches: rows.filter((r) => !r.ok).length };
}

export function renderReport(r: { rows: ReconRow[]; mismatches: number }, warnings: string[], source: string): string {
  const f = (v: number | null) => (v === null ? '—' : String(v));
  const lines = [
    `# Mutabakat raporu`,
    ``,
    `Kaynak: ${source}`,
    `Karşılaştırılan değer: ${r.rows.length} · Uyuşmazlık: **${r.mismatches}**`,
    ``,
  ];
  if (r.mismatches > 0) {
    lines.push('## Uyuşmazlıklar', '', '| Sayfa | Hücre | Kalem | Excel | Uygulama |', '|---|---|---|---|---|');
    for (const x of r.rows.filter((x) => !x.ok)) lines.push(`| ${x.sheet} | ${x.cell} | ${x.label} | ${f(x.excel)} | ${f(x.app)} |`);
    lines.push('');
  }
  if (warnings.length) lines.push('## Uyarılar (çözülemeyen pafta başvuruları)', '', ...warnings.map((w) => `- ${w}`), '');
  lines.push('## Tüm değerler', '', '| Sayfa | Hücre | Kalem | Excel | Uygulama | Sonuç |', '|---|---|---|---|---|---|');
  for (const x of r.rows) lines.push(`| ${x.sheet} | ${x.cell} | ${x.label} | ${f(x.excel)} | ${f(x.app)} | ${x.ok ? '✓' : '✗'} |`);
  return lines.join('\n') + '\n';
}
