// Excel'deki formülleri uygulamanın formül diline çevirir. Yalnız metraj dosyasında geçen kalıplar
// desteklenir; başka her şey hata verir (sessizce yanlış çeviri yapılmaz).
import type { FacadeColumn } from '../../shared/types';

export class ExcelTranslateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExcelTranslateError';
  }
}

export interface TranslateContext {
  sheet: string; // formülün bulunduğu sayfa
  metrajRowToPoz: Map<number, string>;
}

const FACADE_BY_COL: Record<string, FacadeColumn> = {
  B: 'FM-01',
  C: 'FM-02/FM-03',
  D: 'FM-04',
  E: 'FM-05',
  F: 'FS-01',
  G: 'FP-01',
};
const ROOM_FIELD_BY_COL: Record<string, string> = { C: 'kat', F: 'tavan_alt', G: 'tavan_ust', I: 'doseme' };
const ROOM_FIRST_ROW = 3;
const ROOM_LAST_ROW = 56;

interface Ref {
  sheet: string;
  col: string;
  row: number;
  col2?: string;
  row2?: number;
}
type Tok =
  | { t: 'ref'; ref: Ref }
  | { t: 'func'; name: string }
  | { t: 'num'; text: string }
  | { t: 'str'; text: string }
  | { t: 'sym'; text: string };

const RE_QREF = /(?:'([^']+)'|([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/y;
const RE_REF = /\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])/y;
const RE_FUNC = /([A-Z][A-Z0-9.]*)\(/y;
const RE_NUM = /\d+(?:\.\d+)?/y;
const RE_STR = /"([^"]*)"/y;

function tokenize(f: string, ctx: TranslateContext): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const at = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(f);
    if (m) i = re.lastIndex;
    return m;
  };
  while (i < f.length) {
    if (/\s/.test(f[i])) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = at(RE_QREF))) {
      toks.push({ t: 'ref', ref: { sheet: m[1] ?? m[2], col: m[3], row: +m[4], col2: m[5], row2: m[6] ? +m[6] : undefined } });
    } else if ((m = at(RE_FUNC))) {
      toks.push({ t: 'func', name: m[1] });
    } else if ((m = at(RE_REF))) {
      toks.push({ t: 'ref', ref: { sheet: ctx.sheet, col: m[1], row: +m[2], col2: m[3], row2: m[4] ? +m[4] : undefined } });
    } else if ((m = at(RE_NUM))) {
      toks.push({ t: 'num', text: m[0] });
    } else if ((m = at(RE_STR))) {
      toks.push({ t: 'str', text: m[1] });
    } else if ('+-*/(),'.includes(f[i])) {
      toks.push({ t: 'sym', text: f[i++] });
    } else {
      throw new ExcelTranslateError(`Desteklenmeyen formül: ${f}`);
    }
  }
  return toks;
}

export function translateExcelFormula(formula: string, ctx: TranslateContext): string {
  const f = formula.replace(/^=/, '').trim();
  const toks = tokenize(f, ctx);
  const unsupported = (why: string) => new ExcelTranslateError(`Desteklenmeyen formül (${why}): ${f}`);
  let k = 0;
  const out: string[] = [];
  let sumOnly = false;

  const poz = (ref: Ref, row: number): string => {
    if (ref.sheet !== 'Metraj') throw unsupported(`${ref.sheet} sayfası başvurusu`);
    if (ref.col !== 'E') throw unsupported(`Metraj!${ref.col}${row} miktar sütunu değil`);
    const p = ctx.metrajRowToPoz.get(row);
    if (!p) throw unsupported(`Metraj!E${row} bir kalem satırı değil`);
    return p;
  };
  const cell = (ref: Ref): string => {
    if (ref.row2 !== undefined) throw unsupported('aralık yalnız SUM/SUMIF içinde');
    if (ref.sheet === 'Cephe') {
      const col = FACADE_BY_COL[ref.col];
      if (ref.row !== 7 || !col) throw unsupported(`Cephe!${ref.col}${ref.row} toplam satırı değil`);
      return `CEPHE("${col}")`;
    }
    return poz(ref, ref.row);
  };
  const expectSym = (s: string) => {
    const t = toks[k++];
    if (!t || t.t !== 'sym' || t.text !== s) throw unsupported(`"${s}" bekleniyordu`);
  };
  const expectRef = (): Ref => {
    const t = toks[k++];
    if (!t || t.t !== 'ref') throw unsupported('hücre başvurusu bekleniyordu');
    return t.ref;
  };

  const sum = (): string => {
    const r = expectRef();
    expectSym(')');
    if (r.row2 === undefined || r.col2 !== r.col) throw unsupported('SUM tek sütun aralığı olmalı');
    const parts: string[] = [];
    for (let row = r.row; row <= r.row2; row++) parts.push(poz(r, row));
    return parts.join(' + ');
  };
  const sumif = (): string => {
    const crit = expectRef();
    expectSym(',');
    const t = toks[k++];
    if (!t || t.t !== 'str') throw unsupported('SUMIF ölçütü metin olmalı');
    expectSym(',');
    const vals = expectRef();
    expectSym(')');
    const field = ROOM_FIELD_BY_COL[crit.col];
    const rowsOk = (r: Ref) => r.row === ROOM_FIRST_ROW && r.row2 === ROOM_LAST_ROW && r.col2 === r.col;
    if (crit.sheet !== 'Mahal Listesi' || vals.sheet !== 'Mahal Listesi') throw unsupported('SUMIF yalnız Mahal Listesi');
    if (!field) throw unsupported(`Mahal Listesi ${crit.col} sütunu ölçüt olamaz`);
    if (vals.col !== 'E') throw unsupported('SUMIF toplam sütunu alan (E) olmalı');
    if (!rowsOk(crit) || !rowsOk(vals)) throw unsupported(`SUMIF aralığı ${ROOM_FIRST_ROW}–${ROOM_LAST_ROW} satırları olmalı`);
    return `MAHAL(${field}; "${t.text}")`;
  };

  while (k < toks.length) {
    const t = toks[k++];
    const prev = out[out.length - 1];
    const unary = prev === undefined || prev === '(' || /^ [-+*/] $/.test(prev);
    if (t.t === 'num') out.push(t.text.replace('.', ','));
    else if (t.t === 'ref') out.push(cell(t.ref));
    else if (t.t === 'func') {
      if (t.name === 'SUM') {
        const body = sum();
        sumOnly = out.length === 0 && k === toks.length;
        out.push(sumOnly ? body : `(${body})`);
      } else if (t.name === 'SUMIF') out.push(sumif());
      else throw unsupported(`${t.name} fonksiyonu`);
    } else if (t.t === 'sym') {
      if (t.text === '(' || t.text === ')') out.push(t.text);
      else if (t.text === ',') throw unsupported('beklenmeyen virgül');
      else if (unary && t.text === '-') out.push('-');
      else out.push(` ${t.text} `);
    } else throw unsupported('metin yalnız SUMIF ölçütünde');
  }
  return out.join('');
}
