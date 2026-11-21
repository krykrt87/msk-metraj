// Tek değişiklik yolu: transaction içinde tüm durumu oku → değiştir → yeniden hesapla →
// yalnız farkları yaz → her farkı geçmişe kaydet. İzsiz değişiklik ve eski değerde kalan bağlı kalem olmaz.
import { FieldValue, type DocumentData, type Firestore, type QuerySnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import { FormulaError } from '../../shared/formula/parse';
import { applyRecompute, diffState, type DisciplineState, type FieldDiff } from '../../shared/recompute';
import type { HistoryAction, HistoryEntry, TargetType } from '../../shared/types';
import type { Caller } from './context';

export interface ChangeMeta {
  action: HistoryAction;
  target: { type: TargetType; id: string };
  reason: string | null;
  /** Doğrudan değişen diğer dokümanlar (varsayılan yalnız target). Bunların farkları 'cascade' sayılmaz. */
  direct?: { type: TargetType; id: string }[];
}

const COLL: Record<TargetType, keyof DisciplineState | null> = {
  item: 'items',
  room: 'rooms',
  facade: 'facade',
  material: 'materials',
  drawing: null,
};

const toMap = <T>(q: QuerySnapshot<DocumentData>) => Object.fromEntries(q.docs.map((d) => [d.id, d.data() as T]));

export async function commitChange(
  db: Firestore,
  caller: Caller,
  p: string,
  d: string,
  meta: ChangeMeta,
  mutate: (draft: DisciplineState) => void,
): Promise<{ batchId: string; changed: number }> {
  const base = db.doc(`projects/${p}/disciplines/${d}`);
  const actor = { uid: caller.uid, name: caller.name };
  const direct = meta.direct ?? [meta.target];
  const isDirect = (x: { type: TargetType; id: string }) => direct.some((t) => t.type === x.type && t.id === x.id);

  return db.runTransaction(async (tx) => {
    const [items, rooms, facade, materials] = await Promise.all(
      (['items', 'rooms', 'facade', 'materials'] as const).map((c) => tx.get(base.collection(c))),
    );
    const before: DisciplineState = { items: toMap(items), rooms: toMap(rooms), facade: toMap(facade), materials: toMap(materials) };
    const draft = structuredClone(before);
    mutate(draft);

    let after: DisciplineState;
    try {
      after = applyRecompute(draft, new Set(direct.filter((t) => t.type === 'item').map((t) => t.id)));
    } catch (e) {
      if (e instanceof FormulaError) throw new HttpsError('failed-precondition', e.message);
      throw e;
    }
    const diffs = diffState(before, after);
    if (diffs.length === 0) throw new HttpsError('failed-precondition', 'Değişiklik yok.');

    const batchId = randomUUID();
    const now = FieldValue.serverTimestamp();
    const byDoc = new Map<string, FieldDiff[]>();
    for (const x of diffs) {
      const key = `${x.type}/${x.id}`;
      byDoc.set(key, [...(byDoc.get(key) ?? []), x]);
    }
    for (const list of byDoc.values()) {
      const { type, id } = list[0];
      const coll = COLL[type]!;
      const ref = base.collection(coll).doc(id);
      const doc = (after[coll] as unknown as Record<string, Record<string, unknown>>)[id];
      if (list.some((x) => x.field === '')) {
        tx.set(ref, { ...doc, updatedAt: now, updatedBy: actor });
      } else {
        // İç içe farklarda (values.FM-01) üst alanın tamamı yazılır.
        const update: Record<string, unknown> = { updatedAt: now, updatedBy: actor };
        for (const x of list) {
          const top = x.field.split('.')[0];
          update[top] = doc[top] ?? null;
        }
        tx.update(ref, update);
      }
    }
    for (const x of diffs) {
      const own = isDirect(x);
      const entry: HistoryEntry = {
        at: now,
        by: actor,
        batchId,
        target: { type: x.type, id: x.id },
        action: own ? meta.action : 'cascade',
        field: x.field,
        before: x.before ?? null,
        after: x.after ?? null,
        reason: own ? meta.reason : null,
        cause: own ? null : { type: meta.target.type, id: meta.target.id, action: meta.action },
      };
      tx.set(base.collection('history').doc(), entry);
    }
    return { batchId, changed: byDoc.size };
  });
}
