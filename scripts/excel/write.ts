import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { DISCIPLINE, PROJECT_ID } from '../../shared/constants';
import type { HistoryEntry } from '../../shared/types';
import type { ImportData } from './build';

const WIPED = ['items', 'rooms', 'facade', 'materials', 'findings', 'history', 'comments'];
const IMPORTER = { uid: 'import', name: 'Excel aktarımı' };

/** Aktarılan veriyi emülatöre yazar; --reset yoksa var olan veriyi ezmez. */
export async function writeImport(db: Firestore, data: ImportData, opts: { reset: boolean; source: string }): Promise<void> {
  const project = db.doc(`projects/${PROJECT_ID}`);
  const disc = project.collection('disciplines').doc(DISCIPLINE);
  const existing = await disc.collection('items').limit(1).get();
  if (!existing.empty) {
    if (!opts.reset) throw new Error('Veri zaten var; yeniden aktarmak için --reset kullanın.');
    for (const name of WIPED) await db.recursiveDelete(disc.collection(name));
  }

  const ops: ((b: WriteBatch) => void)[] = [];
  const now = FieldValue.serverTimestamp();
  ops.push((b) => b.set(project, { name: 'Mustafa Sak Kongre Merkezi', code: '4199' }));
  ops.push((b) => b.set(disc, data.discipline));
  for (const it of data.items) ops.push((b) => b.set(disc.collection('items').doc(it.id), { ...it, updatedAt: now, updatedBy: IMPORTER }));
  for (const r of data.rooms) ops.push((b) => b.set(disc.collection('rooms').doc(r.id), r));
  for (const f of data.facade) ops.push((b) => b.set(disc.collection('facade').doc(f.id), f));
  for (const m of data.materials) ops.push((b) => b.set(disc.collection('materials').doc(m.id), m));
  for (const f of data.findings) ops.push((b) => b.set(disc.collection('findings').doc(String(f.no)), f));
  const batchId = randomUUID();
  for (const it of data.items) {
    const h: HistoryEntry = {
      at: now,
      by: IMPORTER,
      batchId,
      target: { type: 'item', id: it.id },
      action: 'import',
      field: 'value',
      before: null,
      after: it.value,
      reason: `Excel aktarımı: ${opts.source}`,
      cause: null,
    };
    ops.push((b) => b.set(disc.collection('history').doc(), h));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}
