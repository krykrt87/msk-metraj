import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { FormulaError, formulaDeps, parseFormula, POZ_PATTERN } from '../../shared/formula/parse';
import type { Confidence, Spec } from '../../shared/types';
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

export async function setItemStatus(
  db: Firestore,
  caller: Caller,
  input: Scope & { itemId: string; status: 'kontrol_edildi' | 'sorunlu' | 'yeniden_kontrol' | 'kontrol_edilmedi'; note?: string },
): Result {
  requireRole(caller, [...EDITORS]);
  const note = input.note?.trim() || null;
  if (input.status === 'sorunlu' && !note) throw new HttpsError('invalid-argument', 'Sorunlu işaretlemek için not yazın.');
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'status', target: { type: 'item', id: input.itemId }, reason: note }, (s) => {
    const it = itemIn(s, input.itemId);
    assertEditable(it);
    it.status = input.status;
  });
}

export async function finalizeItem(db: Firestore, caller: Caller, input: Scope & { itemId: string }): Result {
  requireRole(caller, ['admin']);
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'finalize', target: { type: 'item', id: input.itemId }, reason: null }, (s) => {
    const it = itemIn(s, input.itemId);
    assertEditable(it);
    if (it.status !== 'kontrol_edildi' && it.status !== 'duzeltildi') {
      throw new HttpsError('failed-precondition', 'Yalnız kontrol edilmiş veya düzeltilmiş kalem kesinleştirilir.');
    }
    if (it.value === null) throw new HttpsError('failed-precondition', 'Miktarı boş kalem kesinleştirilemez.');
    it.status = 'kesinlesti';
    it.lockWarning = null;
  });
}

export async function unlockItem(db: Firestore, caller: Caller, input: Scope & { itemId: string; reason: string }): Result {
  requireRole(caller, ['admin']);
  const reason = requireReason(input.reason);
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'unlock', target: { type: 'item', id: input.itemId }, reason }, (s) => {
    const it = itemIn(s, input.itemId);
    if (it.status !== 'kesinlesti') throw new HttpsError('failed-precondition', 'Kalem kesinleşmiş değil.');
    it.status = 'yeniden_kontrol';
    it.lockWarning = null;
  });
}

export async function acknowledgeItem(db: Firestore, caller: Caller, input: Scope & { itemId: string; note?: string }): Result {
  requireRole(caller, ['admin']);
  return commitChange(
    db, caller, input.projectId, input.discipline,
    { action: 'acknowledge', target: { type: 'item', id: input.itemId }, reason: input.note?.trim() || null },
    (s) => {
      const it = itemIn(s, input.itemId);
      if (!it.lockWarning) throw new HttpsError('failed-precondition', 'Onaylanacak uyarı yok.');
      it.lockWarning = null;
    },
  );
}

export async function createItem(
  db: Firestore,
  caller: Caller,
  input: Scope & {
    poz: string; name: string; unit: string; code?: string | null; kind: 'measured' | 'derived';
    value?: number | null; formula?: string; method?: string; drawings?: string[]; reason: string;
  },
): Result {
  requireRole(caller, [...EDITORS]);
  const reason = requireReason(input.reason);
  const poz = input.poz.trim();
  if (!POZ_PATTERN.test(poz)) throw new HttpsError('invalid-argument', `Geçersiz poz: ${poz} (ör. B.9, C.1a, B.1.8)`);
  if (!input.name.trim()) throw new HttpsError('invalid-argument', 'Kalem adı boş olamaz.');
  let formula: string | null = null;
  let value: number | null = null;
  if (input.kind === 'derived') {
    formula = (input.formula ?? '').trim();
    try {
      parseFormula(formula);
    } catch (e) {
      if (e instanceof FormulaError) throw new HttpsError('invalid-argument', e.message, { position: e.position });
      throw e;
    }
  } else {
    value = input.value ?? null;
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new HttpsError('invalid-argument', 'Miktar sıfır veya pozitif bir sayı olmalı.');
  }
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'create', target: { type: 'item', id: poz }, reason }, (s) => {
    if (s.items[poz]) throw new HttpsError('already-exists', `Bu poz zaten var: ${poz}`);
    const group = poz[0];
    const orders = Object.values(s.items).map((i) => ({ g: i.group, o: i.order }));
    const inGroup = orders.filter((x) => x.g === group).map((x) => x.o);
    const order = inGroup.length ? Math.max(...inGroup) + 0.001 : Math.max(0, ...orders.map((x) => x.o)) + 1;
    s.items[poz] = {
      id: poz, poz, group, order, name: input.name.trim(), code: input.code?.trim() || null, unit: input.unit.trim() || '—',
      kind: input.kind, value, formula, method: input.method?.trim() ?? '', sourceText: '', drawings: input.drawings ?? [],
      confidence: null, status: 'kontrol_edilmedi', lockWarning: null, cancelled: false, importedValue: null,
      sourceFormula: null, updatedAt: null, updatedBy: null,
    };
  });
}

export async function cancelItem(db: Firestore, caller: Caller, input: Scope & { itemId: string; reason: string }): Result {
  requireRole(caller, [...EDITORS]);
  const reason = requireReason(input.reason);
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'cancel', target: { type: 'item', id: input.itemId }, reason }, (s) => {
    const it = itemIn(s, input.itemId);
    assertEditable(it);
    const refs = (f: string | null) => (f ? formulaDeps(parseFormula(f)).items.includes(input.itemId) : false);
    const dependents = [
      ...Object.values(s.items).filter((x) => !x.cancelled && x.kind === 'derived' && refs(x.formula)).map((x) => x.id),
      ...Object.values(s.materials).filter((m) => refs(m.formula)).map((m) => `#${m.no}`),
    ];
    if (dependents.length) throw new HttpsError('failed-precondition', `Bu kaleme bağlı kalemler var: ${dependents.join(', ')}`);
    it.cancelled = true;
  });
}

/** İptali geri alır; türetilen kalemin formülü yeniden hesaplanır (formülü iptal edilmiş bir kaleme bağlıysa reddedilir). */
export async function restoreItem(db: Firestore, caller: Caller, input: Scope & { itemId: string; reason: string }): Result {
  requireRole(caller, [...EDITORS]);
  const reason = requireReason(input.reason);
  return commitChange(db, caller, input.projectId, input.discipline, { action: 'restore', target: { type: 'item', id: input.itemId }, reason }, (s) => {
    const it = itemIn(s, input.itemId);
    if (!it.cancelled) throw new HttpsError('failed-precondition', 'Kalem iptal edilmemiş.');
    it.cancelled = false;
  });
}

export async function updateItemInfo(
  db: Firestore,
  caller: Caller,
  input: Scope & { itemId: string; name?: string; code?: string | null; unit?: string; method?: string; confidence?: Confidence; drawings?: string[]; specs?: Spec[]; reason?: string },
): Result {
  requireRole(caller, [...EDITORS]);
  return commitChange(
    db, caller, input.projectId, input.discipline,
    { action: 'info', target: { type: 'item', id: input.itemId }, reason: input.reason?.trim() || null },
    (s) => {
      const it = itemIn(s, input.itemId);
      assertEditable(it);
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new HttpsError('invalid-argument', 'Kalem adı boş olamaz.');
        it.name = input.name.trim();
      }
      if (input.code !== undefined) it.code = input.code?.trim() || null;
      if (input.unit !== undefined) it.unit = input.unit.trim() || '—';
      if (input.method !== undefined) it.method = input.method.trim();
      if (input.confidence !== undefined) it.confidence = input.confidence;
      if (input.drawings !== undefined) it.drawings = input.drawings;
      if (input.specs !== undefined) {
        const specs = input.specs.map((x) => ({ label: x.label, value: x.value || null, ...(x.source ? { source: x.source } : {}) }));
        if (JSON.stringify(specs) !== JSON.stringify(it.specs ?? [])) {
          it.specs = specs;
          it.specsManual = true;
        }
      }
    },
  );
}
