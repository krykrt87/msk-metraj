import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { FormulaError, parseFormula } from '../../shared/formula/parse';
import type { Confidence } from '../../shared/types';
import { commitChange } from './commit';
import { assertEditable, itemIn, requireReason, requireRole, type Caller } from './context';

export interface Scope {
  projectId: string;
  discipline: string;
}
export type Result = Promise<{ batchId: string; changed: number }>;

const EDITORS = ['admin', 'kontrolcu'] as const;

export async function correctItem(db: Firestore, caller: Caller, input: Scope & { itemId: string; value: number; confidence?: Confidence; reason: string }): Result {
  requireRole(caller, [...EDITORS]);
  const reason = requireReason(input.reason);
  if (!Number.isFinite(input.value) || input.value < 0) throw new HttpsError('invalid-argument', 'Miktar sıfır veya pozitif bir sayı olmalı.');
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'correct', target: { type: 'item', id: input.itemId }, reason }, (s) => {
    const it = itemIn(s, input.itemId);
    assertEditable(it);
    it.value = input.value;
    it.kind = 'measured';
    it.formula = null;
    it.status = 'duzeltildi';
    if (input.confidence !== undefined) it.confidence = input.confidence;
  });
}

export async function setItemFormula(db: Firestore, caller: Caller, input: Scope & { itemId: string; formula: string; reason: string }): Result {
  requireRole(caller, [...EDITORS]);
  const reason = requireReason(input.reason);
  const formula = input.formula.trim();
  try {
    parseFormula(formula);
  } catch (e) {
    if (e instanceof FormulaError) throw new HttpsError('invalid-argument', e.message, { position: e.position });
    throw e;
  }
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'formula', target: { type: 'item', id: input.itemId }, reason }, (s) => {
    const it = itemIn(s, input.itemId);
    assertEditable(it);
    it.kind = 'derived';
    it.formula = formula;
    it.status = 'duzeltildi';
  });
}
