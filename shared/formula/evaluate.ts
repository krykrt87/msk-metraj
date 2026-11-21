import type { FacadeRow, Room, RoomField } from '../types';
import { FormulaError, type Expr } from './parse';

export interface EvalContext {
  /** undefined = böyle bir kalem yok; null = ölçülemedi. */
  item(id: string): number | null | undefined;
  rooms: Pick<Room, 'area' | 'floor' | 'ceilingLower' | 'ceilingUpper' | 'flooring'>[];
  facade: Pick<FacadeRow, 'values'>[];
}

const ROOM_KEY: Record<RoomField, 'floor' | 'ceilingLower' | 'ceilingUpper' | 'flooring'> = {
  kat: 'floor',
  tavan_alt: 'ceilingLower',
  tavan_ust: 'ceilingUpper',
  doseme: 'flooring',
};

/** Excel SUMIF gibi büyük/küçük harf duyarsız tam eşitlik. */
const same = (a: string, b: string) => a.toLocaleUpperCase('tr') === b.toLocaleUpperCase('tr');

/** Herhangi bir işlenen boşsa (ölçülemedi) sonuç da boştur. */
export function evaluate(e: Expr, ctx: EvalContext): number | null {
  switch (e.op) {
    case 'num':
      return e.value;
    case 'ref': {
      const v = ctx.item(e.item);
      if (v === undefined) throw new FormulaError(`Bilinmeyen kalem: ${e.item}`);
      return v;
    }
    case 'mahal': {
      const key = ROOM_KEY[e.field];
      return ctx.rooms.reduce((sum, r) => {
        const v = r[key];
        return typeof v === 'string' && same(v, e.equals) ? sum + r.area : sum;
      }, 0);
    }
    case 'cephe':
      return ctx.facade.reduce((sum, row) => sum + (row.values[e.column] ?? 0), 0);
    case 'neg': {
      const v = evaluate(e.arg, ctx);
      return v === null ? null : -v;
    }
    default: {
      const l = evaluate(e.left, ctx);
      const r = evaluate(e.right, ctx);
      if (l === null || r === null) return null;
      if (e.op === 'add') return l + r;
      if (e.op === 'sub') return l - r;
      if (e.op === 'mul') return l * r;
      if (r === 0) throw new FormulaError('Sıfıra bölme');
      return l / r;
    }
  }
}
