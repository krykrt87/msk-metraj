import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Item, Role, UserProfile } from '../../shared/types';
import type { DisciplineState } from '../../shared/recompute';

export interface Caller {
  uid: string;
  name: string;
  role: Role;
  drawings: boolean;
}

export const DENIED = 'Bu işlem için yetkiniz yok.';

export async function loadCaller(db: Firestore, uid: string | undefined, p: string, d: string): Promise<Caller> {
  if (!uid) throw new HttpsError('unauthenticated', 'Giriş yapmanız gerekiyor.');
  const prof = (await db.doc(`users/${uid}`).get()).data() as Omit<UserProfile, 'uid'> | undefined;
  const acc = prof?.access?.[p]?.[d];
  if (!prof || prof.active !== true || !acc?.view) throw new HttpsError('permission-denied', DENIED);
  return { uid, name: prof.name, role: prof.role, drawings: acc.drawings === true };
}

export function requireRole(c: Caller, roles: Role[]): void {
  if (!roles.includes(c.role)) throw new HttpsError('permission-denied', DENIED);
}

export function requireReason(reason: string | null | undefined): string {
  const r = reason?.trim();
  if (!r) throw new HttpsError('invalid-argument', 'Gerekçe zorunludur.');
  return r;
}

export function itemIn(s: DisciplineState, id: string): Item {
  const it = s.items[id];
  if (!it) throw new HttpsError('not-found', `Kalem bulunamadı: ${id}`);
  return it;
}

/** Kesinleşmiş veya iptal edilmiş kalemde miktar/formül/bilgi değişmez. */
export function assertEditable(it: Item): void {
  if (it.cancelled) throw new HttpsError('failed-precondition', 'Kalem iptal edilmiş.');
  if (it.status === 'kesinlesti') throw new HttpsError('failed-precondition', 'Kalem kesinleşmiş; önce kilidi açın.');
}
