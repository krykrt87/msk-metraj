// Callable fonksiyonlar: metraj verisine tek yazma yolu. Girdi zod ile doğrulanır, çağıran kullanıcı
// dokümanından yüklenir, iş mantığı saf çekirdek fonksiyonlarda.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { z } from 'zod';
import { REGION } from '../../shared/constants';
import { loadCaller, type Caller } from './context';
import * as items from './items';
import * as s from './schemas';

initializeApp();

function callable<S extends typeof s.scope>(schema: S, fn: (db: Firestore, caller: Caller, input: z.infer<S>) => Promise<unknown>) {
  return onCall({ region: REGION }, async (req) => {
    const parsed = schema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', `Geçersiz istek: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    const db = getFirestore();
    const caller = await loadCaller(db, req.auth?.uid, parsed.data.projectId, parsed.data.discipline);
    return fn(db, caller, parsed.data);
  });
}

export const correctItem = callable(s.correctItemSchema, items.correctItem);
export const setItemFormula = callable(s.setItemFormulaSchema, items.setItemFormula);
