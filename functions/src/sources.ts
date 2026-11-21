// Kalem dışı kaynaklar: mahal, cephe ve malzeme formülü. Değişiklik bağlı kalemlere yayılır.
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { FormulaError, parseFormula } from '../../shared/formula/parse';
import type { FacadeColumn } from '../../shared/types';
import { commitChange } from './commit';
import { requireReason, requireRole, type Caller } from './context';
import type { Result, Scope } from './items';

const EDITORS: ('admin' | 'kontrolcu')[] = ['admin', 'kontrolcu'];
const nonNegative = (v: number) => {
  if (!Number.isFinite(v) || v < 0) throw new HttpsError('invalid-argument', 'Değer sıfır veya pozitif bir sayı olmalı.');
};
const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

export async function updateRoom(
  db: Firestore,
  caller: Caller,
  input: Scope & {
    roomId: string; area?: number; floor?: string; ceilingLower?: string | null; ceilingUpper?: string | null;
    ch?: string | null; flooring?: string | null; note?: string | null; reason: string;
  },
): Result {
  requireRole(caller, EDITORS);
  const reason = requireReason(input.reason);
  if (input.area !== undefined) nonNegative(input.area);
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'room', target: { type: 'room', id: input.roomId }, reason }, (s) => {
    const r = s.rooms[input.roomId];
    if (!r) throw new HttpsError('not-found', `Mahal bulunamadı: ${input.roomId}`);
    if (input.area !== undefined) r.area = input.area;
    if (input.floor !== undefined) r.floor = input.floor.trim();
    for (const k of ['ceilingLower', 'ceilingUpper', 'ch', 'flooring', 'note'] as const) {
      const v = text(input[k]);
      if (v !== undefined) r[k] = v;
    }
  });
}

export async function updateFacadeCell(
  db: Firestore,
  caller: Caller,
  input: Scope & { rowId: string; column: FacadeColumn; value: number; reason: string },
): Result {
  requireRole(caller, EDITORS);
  const reason = requireReason(input.reason);
  nonNegative(input.value);
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'facade', target: { type: 'facade', id: input.rowId }, reason }, (s) => {
    const row = s.facade[input.rowId];
    if (!row) throw new HttpsError('not-found', `Cephe satırı bulunamadı: ${input.rowId}`);
    row.values[input.column] = input.value;
  });
}

export async function setMaterialFormula(
  db: Firestore,
  caller: Caller,
  input: Scope & { materialId: string; formula: string | null; reason: string },
): Result {
  requireRole(caller, EDITORS);
  const reason = requireReason(input.reason);
  const formula = input.formula?.trim() || null;
  if (formula) {
    try {
      parseFormula(formula);
    } catch (e) {
      if (e instanceof FormulaError) throw new HttpsError('invalid-argument', e.message, { position: e.position });
      throw e;
    }
  }
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'material', target: { type: 'material', id: input.materialId }, reason }, (s) => {
    const m = s.materials[input.materialId];
    if (!m) throw new HttpsError('not-found', `Malzeme bulunamadı: #${input.materialId}`);
    m.formula = formula;
  });
}
