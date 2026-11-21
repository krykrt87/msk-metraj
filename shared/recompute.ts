// Disiplinin tüm durumunu yeniden hesaplar. Veri küçük (≈90 kalem, 54 mahal, 59 malzeme),
// bu yüzden her değişiklikte her şey baştan hesaplanır: bağlı kalemin eski değerde kalması imkânsızdır.
import { evaluate, type EvalContext } from './formula/evaluate';
import { FormulaError, formulaDeps, parseFormula, type Expr } from './formula/parse';
import type { FacadeRow, Item, Material, Room, TargetType } from './types';

export interface DisciplineState {
  items: Record<string, Item>;
  rooms: Record<string, Room>;
  facade: Record<string, FacadeRow>;
  materials: Record<string, Material>;
}

export class CycleError extends FormulaError {
  constructor(public path: string[]) {
    super(`Döngüsel bağımlılık: ${path.join(' → ')}`);
    this.name = 'CycleError';
  }
}

const EPS = 1e-9;
export function valueChanged(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a !== b;
  return Math.abs(a - b) > EPS;
}

function parseOf(id: string, formula: string): Expr {
  try {
    return parseFormula(formula);
  } catch (e) {
    if (e instanceof FormulaError) throw new FormulaError(`${id} formülü: ${e.message}`, e.position);
    throw e;
  }
}

export function evaluateAll(s: DisciplineState): {
  items: Record<string, number | null>;
  materials: Record<string, number | null>;
} {
  const exprs = new Map<string, Expr>();
  const deps = new Map<string, string[]>();
  for (const it of Object.values(s.items)) {
    if (it.cancelled || it.kind !== 'derived' || it.formula === null) continue;
    const e = parseOf(it.id, it.formula);
    exprs.set(it.id, e);
    deps.set(it.id, formulaDeps(e).items);
  }
  const checkRef = (ref: string) => {
    const target = s.items[ref];
    if (!target) throw new FormulaError(`Bilinmeyen kalem: ${ref}`);
    if (target.cancelled) throw new FormulaError(`İptal edilmiş kalem: ${ref}`);
  };

  const values: Record<string, number | null> = {};
  for (const it of Object.values(s.items)) values[it.id] = it.value;

  const rooms = Object.values(s.rooms);
  const facade = Object.values(s.facade);
  const ctx: EvalContext = { item: (id) => (id in values ? values[id] : undefined), rooms, facade };

  // Derinlik öncelikli topolojik hesap; ziyaret yığını döngü yolunu verir.
  const done = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string) => {
    if (done.has(id)) return;
    const at = stack.indexOf(id);
    if (at >= 0) throw new CycleError([...stack.slice(at), id]);
    stack.push(id);
    for (const ref of deps.get(id) ?? []) {
      checkRef(ref);
      visit(ref);
    }
    stack.pop();
    const e = exprs.get(id);
    if (e) values[id] = evaluate(e, ctx);
    done.add(id);
  };
  for (const id of exprs.keys()) visit(id);

  const materials: Record<string, number | null> = {};
  for (const m of Object.values(s.materials)) {
    if (m.formula === null) {
      materials[m.id] = null;
      continue;
    }
    const e = parseOf(`Malzeme #${m.no}`, m.formula);
    formulaDeps(e).items.forEach(checkRef);
    materials[m.id] = evaluate(e, ctx);
  }
  return { items: values, materials };
}

/**
 * Yeni değerleri uygular. Değeri değişen ve doğrudan düzenlenmemiş kalemlerde:
 * kontrol_edildi/duzeltildi → yeniden_kontrol; kesinlesti → kilit kalır, lockWarning='ust_kalem'.
 * Değer her durumda güncellenir. Girdiyi değiştirmez.
 */
export function applyRecompute(s: DisciplineState, directIds: Set<string>): DisciplineState {
  const r = evaluateAll(s);
  const items: Record<string, Item> = {};
  for (const it of Object.values(s.items)) {
    const nv = r.items[it.id];
    if (it.cancelled || !valueChanged(it.value, nv)) {
      items[it.id] = it;
      continue;
    }
    const next: Item = { ...it, value: nv };
    if (!directIds.has(it.id)) {
      if (it.status === 'kontrol_edildi' || it.status === 'duzeltildi') next.status = 'yeniden_kontrol';
      else if (it.status === 'kesinlesti') next.lockWarning = 'ust_kalem';
    }
    items[it.id] = next;
  }
  const materials: Record<string, Material> = {};
  for (const m of Object.values(s.materials)) {
    const nv = r.materials[m.id];
    materials[m.id] = valueChanged(m.value, nv) ? { ...m, value: nv } : m;
  }
  return { items, rooms: s.rooms, facade: s.facade, materials };
}

export interface FieldDiff {
  type: TargetType;
  id: string;
  field: string;
  before: unknown;
  after: unknown;
}

const IGNORED = new Set(['updatedAt', 'updatedBy']);
const COLLECTIONS: [keyof DisciplineState, TargetType][] = [
  ['items', 'item'],
  ['rooms', 'room'],
  ['facade', 'facade'],
  ['materials', 'material'],
];
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function diffFields(type: TargetType, id: string, a: Record<string, unknown>, b: Record<string, unknown>, prefix: string, out: FieldDiff[]) {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!prefix && IGNORED.has(key)) continue;
    const x = a[key] ?? null;
    const y = b[key] ?? null;
    const field = prefix + key;
    if (isPlainObject(x) && isPlainObject(y)) {
      diffFields(type, id, x, y, field + '.', out);
    } else if (typeof x === 'number' && typeof y === 'number') {
      if (valueChanged(x, y)) out.push({ type, id, field, before: x, after: y });
    } else if (JSON.stringify(x) !== JSON.stringify(y)) {
      out.push({ type, id, field, before: x, after: y });
    }
  }
}

/** İki durum arasındaki alan farkları; yeni doküman tek kayıt (field ''). */
export function diffState(before: DisciplineState, after: DisciplineState): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const [key, type] of COLLECTIONS) {
    const a = before[key] as Record<string, object>;
    const b = after[key] as Record<string, object>;
    for (const id of Object.keys(b)) {
      if (!(id in a)) {
        out.push({ type, id, field: '', before: null, after: b[id] });
        continue;
      }
      if (a[id] !== b[id]) diffFields(type, id, a[id] as Record<string, unknown>, b[id] as Record<string, unknown>, '', out);
    }
  }
  return out;
}
