// Okunan Excel kitabından uygulama verisini kurar. Beklenmeyen her yapı hücre adresiyle hata verir.
import { expandDrawingRefs } from '../../shared/drawings';
import { isConstant, parseFormula, POZ_PATTERN } from '../../shared/formula/parse';
import { applyRecompute, type DisciplineState } from '../../shared/recompute';
import { FACADE_COLUMNS, type Confidence, type FacadeRow, type Finding, type Item, type Material, type Room } from '../../shared/types';
import type { RawBook, RawCell, RawSheet } from './read';
import { translateExcelFormula } from './translate';

export interface SummaryRow {
  label: string;
  unit: string;
  formula: string;
}
export interface ImportData {
  discipline: {
    name: string;
    groups: { key: string; title: string }[];
    summary: SummaryRow[];
    methodText: string[];
    facadeNotes: string[];
  };
  items: Item[];
  rooms: Room[];
  facade: FacadeRow[];
  materials: Material[];
  findings: Finding[];
  warnings: string[];
}

/** Değeri formülsüz sabit yazılmış malzemelerin bağlandığı kalem. */
export const MATERIAL_LINK_OVERRIDES: Record<number, string> = { 25: 'C.9' };

export function sheetOf(raw: RawBook, name: string): RawSheet {
  const s = raw[name];
  if (!s) throw new Error(`Excel'de "${name}" sayfası yok`);
  return s;
}
export function maxRow(s: RawSheet): number {
  return Object.keys(s).reduce((m, a) => Math.max(m, Number(/\d+$/.exec(a)?.[0] ?? 0)), 0);
}
const text = (s: RawSheet, addr: string): string | null => {
  const v = s[addr]?.value;
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
function num(c: RawCell | undefined, where: string): number | null {
  if (!c || c.value === null || c.value === '—') return null;
  if (typeof c.value === 'number') return c.value;
  throw new Error(`${where}: sayı bekleniyordu, "${c.value}" bulundu`);
}
const CONFIDENCE = new Set(['Yüksek', 'Orta', 'Düşük']);

function translateAt(where: string, formula: string, sheet: string, rows: Map<number, string>): string {
  try {
    return translateExcelFormula(formula, { sheet, metrajRowToPoz: rows });
  } catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`);
  }
}

export function buildImport(raw: RawBook, knownDrawings: string[]): ImportData {
  for (const name of ['Özet', 'Metraj', 'Malzeme Listesi', 'Mahal Listesi', 'Cephe', 'Proje Kontrol', 'Yöntem']) sheetOf(raw, name);
  const warnings: string[] = [];

  // --- Metraj
  const m = sheetOf(raw, 'Metraj');
  const last = maxRow(m);
  const rowToPoz = new Map<number, string>();
  for (let r = 3; r <= last; r++) {
    const a = text(m, `A${r}`);
    if (a && POZ_PATTERN.test(a)) rowToPoz.set(r, a);
  }
  const groups: { key: string; title: string }[] = [];
  const items: Item[] = [];
  let group = '';
  for (let r = 3; r <= last; r++) {
    const a = text(m, `A${r}`);
    if (!a) continue;
    const g = /^([A-Z])\.\s+(.+)$/.exec(a);
    if (g) {
      group = g[1];
      groups.push({ key: g[1], title: g[2] });
      continue;
    }
    if (!POZ_PATTERN.test(a)) {
      if (a.startsWith('Mavi')) continue;
      throw new Error(`Metraj!A${r}: tanınmayan satır "${a}"`);
    }
    const e = m[`E${r}`];
    let kind: Item['kind'] = 'measured';
    let formula: string | null = null;
    let sourceFormula: string | null = null;
    const value = num(e, `Metraj!E${r}`);
    if (e?.formula) {
      sourceFormula = e.formula;
      const tr = translateAt(`Metraj!E${r}`, e.formula, 'Metraj', rowToPoz);
      if (!isConstant(parseFormula(tr))) {
        kind = 'derived';
        formula = tr;
      }
    }
    const sourceText = text(m, `G${r}`) ?? '';
    const refs = expandDrawingRefs(sourceText, knownDrawings);
    refs.unresolved.forEach((u) => warnings.push(`${a}: "${u}" pafta olarak çözülemedi`));
    const conf = text(m, `H${r}`);
    items.push({
      id: a,
      poz: a,
      group: group || a[0],
      order: r,
      name: text(m, `B${r}`) ?? '',
      code: text(m, `C${r}`),
      unit: text(m, `D${r}`) ?? '—',
      kind,
      value,
      formula,
      method: text(m, `F${r}`) ?? '',
      sourceText,
      drawings: refs.codes,
      confidence: conf && CONFIDENCE.has(conf) ? (conf as Confidence) : null,
      status: 'kontrol_edilmedi',
      lockWarning: null,
      cancelled: false,
      importedValue: value,
      sourceFormula,
      updatedAt: null,
      updatedBy: null,
    });
  }

  // --- Mahal Listesi
  const mh = sheetOf(raw, 'Mahal Listesi');
  // Mahaller 3. satırdan "TOPLAM" satırına kadardır; altındaki açıklama notları mahal değildir.
  const roomRows: number[] = [];
  for (let r = 3, end = maxRow(mh); r <= end; r++) {
    if ((text(mh, `B${r}`) ?? '').startsWith('TOPLAM')) break;
    if (text(mh, `A${r}`)) roomRows.push(r);
  }
  const codeCount = new Map<string, number>();
  roomRows.forEach((r) => codeCount.set(text(mh, `A${r}`)!, (codeCount.get(text(mh, `A${r}`)!) ?? 0) + 1));
  const seen = new Map<string, number>();
  const rooms: Room[] = roomRows.map((r) => {
    const code = text(mh, `A${r}`)!;
    const n = (seen.get(code) ?? 0) + 1;
    seen.set(code, n);
    const area = num(mh[`E${r}`], `Mahal Listesi!E${r}`);
    if (area === null) throw new Error(`Mahal Listesi!E${r}: alan boş`);
    return {
      id: codeCount.get(code)! > 1 ? `${code}~${n}` : code,
      code,
      name: text(mh, `B${r}`) ?? '',
      floor: text(mh, `C${r}`) ?? '',
      zone: text(mh, `D${r}`) ?? '',
      area,
      ceilingLower: text(mh, `F${r}`),
      ceilingUpper: text(mh, `G${r}`),
      ch: text(mh, `H${r}`),
      flooring: text(mh, `I${r}`),
      note: text(mh, `J${r}`),
      checkArea: num(mh[`K${r}`], `Mahal Listesi!K${r}`),
      order: r,
    };
  });

  // --- Cephe
  const c = sheetOf(raw, 'Cephe');
  const facade: FacadeRow[] = [3, 4, 5, 6].map((r) => {
    const label = text(c, `A${r}`) ?? '';
    const id = /\(([A-ZÇĞİÖŞÜ]{2})\)/.exec(label)?.[1];
    if (!id) throw new Error(`Cephe!A${r}: görünüş kısaltması (GD/KD/KB/GB) bulunamadı`);
    const values = Object.fromEntries(
      FACADE_COLUMNS.map((col, i) => [col, num(c[`${'BCDEFG'[i]}${r}`], `Cephe!${'BCDEFG'[i]}${r}`) ?? 0]),
    ) as FacadeRow['values'];
    return { id, label, values };
  });
  const facadeNotes: string[] = [];
  for (let r = 9, end = maxRow(c); r <= end; r++) {
    const t = text(c, `A${r}`);
    if (t) facadeNotes.push(t);
  }

  // --- Malzeme Listesi
  const ml = sheetOf(raw, 'Malzeme Listesi');
  const materials: Material[] = [];
  for (let r = 3, end = maxRow(ml); r <= end; r++) {
    const no = ml[`A${r}`]?.value;
    if (typeof no !== 'number') continue;
    const h = ml[`H${r}`];
    let formula: string | null = null;
    if (h?.formula) formula = translateAt(`Malzeme Listesi!H${r}`, h.formula, 'Malzeme Listesi', rowToPoz);
    else if (typeof h?.value === 'number') {
      formula = MATERIAL_LINK_OVERRIDES[no] ?? null;
      if (!formula) throw new Error(`Malzeme Listesi!H${r}: #${no} formülsüz sabit değer; bağlantı tablosuna ekleyin`);
    }
    materials.push({
      id: String(no),
      no,
      group: text(ml, `B${r}`) ?? '',
      name: text(ml, `C${r}`) ?? '',
      code: text(ml, `D${r}`),
      usage: text(ml, `E${r}`) ?? '',
      sourceText: text(ml, `F${r}`) ?? '',
      unit: text(ml, `G${r}`) ?? '—',
      formula,
      value: null,
      note: text(ml, `I${r}`),
    });
  }

  // --- Proje Kontrol
  const pk = sheetOf(raw, 'Proje Kontrol');
  const findings: Finding[] = [];
  for (let r = 3, end = maxRow(pk); r <= end; r++) {
    const no = pk[`A${r}`]?.value;
    if (typeof no !== 'number') continue;
    findings.push({
      no,
      topic: text(pk, `B${r}`) ?? '',
      drawingsText: text(pk, `C${r}`) ?? '',
      finding: text(pk, `D${r}`) ?? '',
      suggestion: text(pk, `E${r}`) ?? '',
      status: 'acik',
    });
  }

  // --- Özet ve Yöntem
  const oz = sheetOf(raw, 'Özet');
  const summary: SummaryRow[] = [];
  for (let r = 5, end = maxRow(oz); r <= end; r++) {
    const label = text(oz, `A${r}`);
    const f = oz[`C${r}`]?.formula;
    if (!label || !f) break;
    summary.push({ label, unit: text(oz, `B${r}`) ?? '', formula: translateAt(`Özet!C${r}`, f, 'Özet', rowToPoz) });
  }
  const y = sheetOf(raw, 'Yöntem');
  const methodText: string[] = [];
  for (let r = 2, end = maxRow(y); r <= end; r++) {
    const t = text(y, `A${r}`);
    if (t) methodText.push(t);
  }

  // Malzeme değerleri burada boş; mutabakattan sonra withComputedValues ile doldurulur.
  return {
    discipline: { name: 'Mimari', groups, summary, methodText, facadeNotes },
    items,
    rooms,
    facade,
    materials,
    findings,
    warnings,
  };
}

export function importToState(d: ImportData): DisciplineState {
  return {
    items: Object.fromEntries(d.items.map((i) => [i.id, i])),
    rooms: Object.fromEntries(d.rooms.map((r) => [r.id, r])),
    facade: Object.fromEntries(d.facade.map((f) => [f.id, f])),
    materials: Object.fromEntries(d.materials.map((x) => [x.id, x])),
  };
}

/** Türetilen kalem ve malzeme değerlerini uygulamanın hesabıyla doldurur. */
export function withComputedValues(d: ImportData): ImportData {
  const s = applyRecompute(importToState(d), new Set());
  return { ...d, items: d.items.map((i) => s.items[i.id]), materials: d.materials.map((x) => s.materials[x.id]) };
}

/** Drawing Register kitabındaki pafta kodları (sayfa sırasıyla). */
export function knownDrawingCodes(register: RawBook, sheetName = 'DD_KESİN PROJE'): string[] {
  const s = sheetOf(register, sheetName);
  const codes: { code: string; row: number }[] = [];
  for (const [addr, cell] of Object.entries(s)) {
    const v = typeof cell.value === 'string' ? cell.value.trim() : '';
    if (/^\d{4}-A-DD-\d{2}-\d{2}-\d{3}$/.test(v)) codes.push({ code: v, row: Number(/\d+$/.exec(addr)![0]) });
  }
  return codes.sort((a, b) => a.row - b.row).map((c) => c.code);
}
