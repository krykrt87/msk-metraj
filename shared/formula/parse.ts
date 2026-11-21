// Formül dili (Türk Excel'i gibi): ondalık virgül, argüman ayırıcı noktalı virgül.
//   A.5 - B.1 · B.1 * 2 · 805,5 + 1239 · MAHAL(kat; "Zemin Kat") · CEPHE("FM-01")
import { FACADE_COLUMNS, type FacadeColumn, type RoomField } from '../types';

export class FormulaError extends Error {
  constructor(
    message: string,
    public position = -1,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

export type Expr =
  | { op: 'num'; value: number }
  | { op: 'ref'; item: string }
  | { op: 'mahal'; field: RoomField; equals: string }
  | { op: 'cephe'; column: FacadeColumn }
  | { op: 'neg'; arg: Expr }
  | { op: 'add' | 'sub' | 'mul' | 'div'; left: Expr; right: Expr };

export const ROOM_FIELDS: RoomField[] = ['kat', 'tavan_alt', 'tavan_ust', 'doseme'];
/** Kalem pozu: B.1, B.1.3, C.1a, F.7a */
export const POZ_PATTERN = /^[A-Z]\.\d+[a-z]?(?:\.\d+[a-z]?)*$/;

type Tok =
  | { t: 'num'; v: number; pos: number; text: string }
  | { t: 'ref'; v: string; pos: number; text: string }
  | { t: 'ident'; v: string; pos: number; text: string }
  | { t: 'str'; v: string; pos: number; text: string }
  | { t: 'sym'; v: string; pos: number; text: string }
  | { t: 'end'; pos: number; text: string };

const RE_NUM = /\d+(?:,\d+)?/y;
const RE_REF = /[A-Z]\.\d+[a-z]?(?:\.\d+[a-z]?)*/y;
const RE_IDENT = /[A-Za-z_çğıöşüÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*/y;
const SYMBOLS = '+-*/();';

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const at = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(src);
    return m ? m[0] : null;
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = at(RE_NUM);
    if (num) {
      if (src[i + num.length] === '.' && /\d/.test(src[i + num.length + 1] ?? '')) {
        throw new FormulaError('Ondalık için virgül kullanın; formülde binlik ayırıcı yazmayın.', i);
      }
      toks.push({ t: 'num', v: Number(num.replace(',', '.')), pos: i, text: num });
      i += num.length;
      continue;
    }
    const ref = at(RE_REF);
    if (ref && !/[A-Za-z_]/.test(src[i + ref.length] ?? '')) {
      toks.push({ t: 'ref', v: ref, pos: i, text: ref });
      i += ref.length;
      continue;
    }
    const ident = at(RE_IDENT);
    if (ident) {
      toks.push({ t: 'ident', v: ident, pos: i, text: ident });
      i += ident.length;
      continue;
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new FormulaError('Kapanmamış tırnak', i);
      toks.push({ t: 'str', v: src.slice(i + 1, end), pos: i, text: src.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    if (SYMBOLS.includes(c)) {
      toks.push({ t: 'sym', v: c, pos: i, text: c });
      i++;
      continue;
    }
    throw new FormulaError(`Beklenmeyen karakter: ${c}`, i);
  }
  toks.push({ t: 'end', pos: src.length, text: '' });
  return toks;
}

export function parseFormula(text: string): Expr {
  if (text.trim() === '') throw new FormulaError('Formül boş', 0);
  const toks = lex(text);
  let k = 0;
  const peek = () => toks[k];
  const next = () => toks[k++];
  const fail = (tok: Tok): never => {
    if (tok.t === 'end') throw new FormulaError('Formül eksik: ifade bekleniyor', tok.pos);
    throw new FormulaError(`Beklenmeyen "${tok.text}"`, tok.pos);
  };
  const expectSym = (s: string) => {
    const tok = next();
    if (tok.t !== 'sym' || tok.v !== s) {
      if (tok.t === 'end') throw new FormulaError(`"${s}" bekleniyor`, tok.pos);
      throw new FormulaError(`"${s}" bekleniyor, "${tok.text}" bulundu`, tok.pos);
    }
  };
  const expectStr = (): Extract<Tok, { t: 'str' }> => {
    const tok = next();
    if (tok.t !== 'str') {
      if (tok.t === 'end') throw new FormulaError('Tırnak içinde değer bekleniyor', tok.pos);
      throw new FormulaError(`Tırnak içinde değer bekleniyor, "${tok.text}" bulundu`, tok.pos);
    }
    return tok;
  };

  function expr(): Expr {
    let left = term();
    for (let tok = peek(); tok.t === 'sym' && (tok.v === '+' || tok.v === '-'); tok = peek()) {
      next();
      left = { op: tok.v === '+' ? 'add' : 'sub', left, right: term() };
    }
    return left;
  }
  function term(): Expr {
    let left = factor();
    for (let tok = peek(); tok.t === 'sym' && (tok.v === '*' || tok.v === '/'); tok = peek()) {
      next();
      left = { op: tok.v === '*' ? 'mul' : 'div', left, right: factor() };
    }
    return left;
  }
  function factor(): Expr {
    const tok = next();
    switch (tok.t) {
      case 'num':
        return { op: 'num', value: tok.v };
      case 'ref':
        return { op: 'ref', item: tok.v };
      case 'ident':
        return call(tok);
      case 'sym':
        if (tok.v === '-') return { op: 'neg', arg: factor() };
        if (tok.v === '(') {
          const e = expr();
          expectSym(')');
          return e;
        }
        return fail(tok);
      default:
        return fail(tok);
    }
  }
  function call(tok: Extract<Tok, { t: 'ident' }>): Expr {
    const name = tok.v.toUpperCase();
    if (name !== 'MAHAL' && name !== 'CEPHE') {
      throw new FormulaError(`Bilinmeyen fonksiyon: ${tok.v} (MAHAL, CEPHE kullanılabilir)`, tok.pos);
    }
    expectSym('(');
    if (name === 'MAHAL') {
      const f = next();
      const field = f.t === 'ident' ? (f.v.toLowerCase() as RoomField) : null;
      if (!field || !ROOM_FIELDS.includes(field)) {
        throw new FormulaError(`Geçersiz mahal alanı: ${f.text} (${ROOM_FIELDS.join(', ')})`, f.pos);
      }
      expectSym(';');
      const v = expectStr();
      expectSym(')');
      return { op: 'mahal', field, equals: v.v };
    }
    const col = expectStr();
    if (!FACADE_COLUMNS.includes(col.v as FacadeColumn)) {
      throw new FormulaError(`Geçersiz cephe sütunu: ${col.v} (${FACADE_COLUMNS.join(', ')})`, col.pos);
    }
    expectSym(')');
    return { op: 'cephe', column: col.v as FacadeColumn };
  }

  const e = expr();
  if (peek().t !== 'end') fail(peek());
  return e;
}

export function formulaDeps(e: Expr): { items: string[]; rooms: boolean; facade: boolean } {
  const items = new Set<string>();
  let rooms = false;
  let facade = false;
  const walk = (x: Expr): void => {
    switch (x.op) {
      case 'ref':
        items.add(x.item);
        return;
      case 'mahal':
        rooms = true;
        return;
      case 'cephe':
        facade = true;
        return;
      case 'neg':
        return walk(x.arg);
      case 'num':
        return;
      default:
        walk(x.left);
        walk(x.right);
    }
  };
  walk(e);
  return { items: [...items], rooms, facade };
}

export function isConstant(e: Expr): boolean {
  const d = formulaDeps(e);
  return d.items.length === 0 && !d.rooms && !d.facade;
}
