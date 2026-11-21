// Emülatör testleri için küçük, Excel'le tutarlı veri.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { FacadeRow, Item, Material, Room, Status, UserProfile } from '../../../shared/types';

export const P = 'msk-4199';
export const D = 'A';
export const BASE = `projects/${P}/disciplines/${D}`;

export function testDb(): Firestore {
  const app = getApps().find((a) => a.name === 'functions-test') ?? initializeApp({ projectId: 'demo-msk' }, 'functions-test');
  return getFirestore(app);
}

export function makeItem(id: string, v: { value?: number | null; formula?: string; status?: Status; drawings?: string[] }): Item {
  return {
    id, poz: id, group: id[0], order: 0, name: id, code: null, unit: 'm²',
    kind: v.formula ? 'derived' : 'measured', value: v.value ?? null, formula: v.formula ?? null,
    method: '', sourceText: '', drawings: v.drawings ?? [], confidence: 'Orta',
    status: v.status ?? 'kontrol_edilmedi', lockWarning: null, cancelled: false,
    importedValue: v.value ?? null, sourceFormula: null, updatedAt: null, updatedBy: null,
  };
}

const user = (role: UserProfile['role'], active = true): Omit<UserProfile, 'uid'> => ({
  email: `${role}@test`, name: `Test ${role}`, role, active,
  access: { [P]: { [D]: { view: true, drawings: role !== 'satinalma' } } },
});

export async function seedBasic(db: Firestore, extra: Item[] = []): Promise<void> {
  await db.recursiveDelete(db.collection('projects'));
  await db.recursiveDelete(db.collection('users'));
  const b = db.batch();
  b.set(db.doc('users/admin'), user('admin'));
  b.set(db.doc('users/kontrol'), user('kontrolcu'));
  b.set(db.doc('users/satin'), user('satinalma'));
  b.set(db.doc('users/pasif'), user('kontrolcu', false));
  b.set(db.doc(`projects/${P}`), { name: 'MSK' });
  b.set(db.doc(BASE), { name: 'Mimari' });
  const items = [
    makeItem('A.1', { formula: 'MAHAL(kat; "Zemin Kat")', value: 120.5 }),
    makeItem('A.5', { value: 8392.5 }),
    makeItem('B.1', { value: 2847.7, status: 'kontrol_edildi', drawings: ['4199-A-DD-01-02-300'] }),
    makeItem('B.2', { formula: 'A.5 - B.1', value: 5544.8, status: 'kontrol_edildi' }),
    makeItem('B.2.1', { formula: 'B.2', value: 5544.8 }),
    makeItem('F.2', { formula: 'A.1 - F.1', value: 20.5 }),
    makeItem('F.1', { formula: 'MAHAL(doseme; "Halı kaplama")', value: 100 }),
    makeItem('C.2', { formula: 'CEPHE("FM-01")', value: 365.8 }),
    ...extra,
  ];
  for (const it of items) b.set(db.doc(`${BASE}/items/${it.id}`), it);
  const rooms: Room[] = [
    { id: 'GF-01', code: 'GF-01', name: 'SALON', floor: 'Zemin Kat', zone: 'Zone 3', area: 100, ceilingLower: null, ceilingUpper: 'C-W03', ch: null, flooring: 'Halı kaplama', note: null, checkArea: null, order: 3 },
    { id: 'GF-02', code: 'GF-02', name: 'DEPO', floor: 'Zemin Kat', zone: 'Zone 2', area: 20.5, ceilingLower: 'C-P01', ceilingUpper: null, ch: '3.40', flooring: null, note: null, checkArea: null, order: 4 },
  ];
  for (const r of rooms) b.set(db.doc(`${BASE}/rooms/${r.id}`), r);
  const facade: FacadeRow = { id: 'GD', label: 'Güneydoğu (GD)', values: { 'FM-01': 365.8, 'FM-02/FM-03': 195.5, 'FM-04': 80.4, 'FM-05': 0, 'FS-01': 0, 'FP-01': 0 } };
  b.set(db.doc(`${BASE}/facade/GD`), facade);
  const mat: Material = { id: '1', no: 1, group: 'Çatı', name: 'Çakıl', code: null, usage: 'Teras', sourceText: '', unit: 'm²', formula: 'B.2', value: 5544.8, note: null };
  b.set(db.doc(`${BASE}/materials/1`), mat);
  await b.commit();
}

export async function itemOf(db: Firestore, id: string): Promise<Item> {
  return (await db.doc(`${BASE}/items/${id}`).get()).data() as Item;
}
export async function historyOf(db: Firestore) {
  return (await db.collection(`${BASE}/history`).get()).docs.map((d) => d.data());
}
