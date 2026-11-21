import { beforeEach, describe, expect, it } from 'vitest';
import { loadCaller } from './context';
import {
  acknowledgeItem, cancelItem, correctItem, createItem, finalizeItem, setItemStatus, unlockItem, updateItemInfo,
} from './items';
import { setMaterialFormula, updateFacadeCell, updateRoom } from './sources';
import { BASE, D, historyOf, itemOf, P, seedBasic, testDb } from './test/seed';

const db = testDb();
const base = { projectId: P, discipline: D };
const as = (uid: string) => loadCaller(db, uid, P, D);
const LOCKED = { code: 'failed-precondition', message: 'Kalem kesinleşmiş; önce kilidi açın.' };

beforeEach(async () => {
  await seedBasic(db);
});

describe('setItemStatus', () => {
  it('kontrolcü kalemi kontrol edildi işaretler', async () => {
    await setItemStatus(db, await as('kontrol'), { ...base, itemId: 'B.2.1', status: 'kontrol_edildi' });
    expect((await itemOf(db, 'B.2.1')).status).toBe('kontrol_edildi');
    expect(await historyOf(db)).toContainEqual(expect.objectContaining({ action: 'status', field: 'status', before: 'kontrol_edilmedi', after: 'kontrol_edildi' }));
  });
  it('sorunlu için not zorunlu', async () => {
    const k = await as('kontrol');
    await expect(setItemStatus(db, k, { ...base, itemId: 'B.2.1', status: 'sorunlu' })).rejects.toMatchObject({
      code: 'invalid-argument', message: 'Sorunlu işaretlemek için not yazın.',
    });
    await setItemStatus(db, k, { ...base, itemId: 'B.2.1', status: 'sorunlu', note: 'Paftada iki farklı değer' });
    expect(await historyOf(db)).toContainEqual(expect.objectContaining({ after: 'sorunlu', reason: 'Paftada iki farklı değer' }));
  });
  it('satın alma durum değiştiremez', async () => {
    await expect(setItemStatus(db, await as('satin'), { ...base, itemId: 'B.2.1', status: 'kontrol_edildi' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('kesinleştirme ve kilit', () => {
  it('yalnız yönetici, yalnız kontrol edilmiş kalemi kesinleştirir', async () => {
    await expect(finalizeItem(db, await as('kontrol'), { ...base, itemId: 'B.1' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(finalizeItem(db, await as('admin'), { ...base, itemId: 'B.2.1' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await finalizeItem(db, await as('admin'), { ...base, itemId: 'B.1' });
    expect((await itemOf(db, 'B.1')).status).toBe('kesinlesti');
  });
  it('kesinleşmiş kalemde durum, bilgi ve iptal reddedilir', async () => {
    await finalizeItem(db, await as('admin'), { ...base, itemId: 'B.1' });
    const k = await as('kontrol');
    await expect(setItemStatus(db, k, { ...base, itemId: 'B.1', status: 'sorunlu', note: 'x' })).rejects.toMatchObject(LOCKED);
    await expect(updateItemInfo(db, k, { ...base, itemId: 'B.1', name: 'Yeni ad' })).rejects.toMatchObject(LOCKED);
    await expect(cancelItem(db, k, { ...base, itemId: 'B.1', reason: 'x' })).rejects.toMatchObject(LOCKED);
  });
  it('kesinleşmiş türetilen kalemin üst kalemi değişince değeri güncellenir ve uyarı alır; yönetici onaylar', async () => {
    const admin = await as('admin');
    await finalizeItem(db, admin, { ...base, itemId: 'B.2' });
    await correctItem(db, await as('kontrol'), { ...base, itemId: 'B.1', value: 3000, reason: 'yeniden ölçüm' });
    expect(await itemOf(db, 'B.2')).toMatchObject({ status: 'kesinlesti', lockWarning: 'ust_kalem' });
    expect((await itemOf(db, 'B.2')).value).toBeCloseTo(5392.5, 9);
    await acknowledgeItem(db, admin, { ...base, itemId: 'B.2', note: 'Fark kabul edildi' });
    expect(await itemOf(db, 'B.2')).toMatchObject({ status: 'kesinlesti', lockWarning: null });
    await expect(acknowledgeItem(db, admin, { ...base, itemId: 'B.2' })).rejects.toMatchObject({ message: 'Onaylanacak uyarı yok.' });
  });
  it('kilit gerekçeyle açılır ve kalem yeniden kontrole düşer', async () => {
    const admin = await as('admin');
    await finalizeItem(db, admin, { ...base, itemId: 'B.1' });
    await expect(unlockItem(db, admin, { ...base, itemId: 'B.1', reason: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await unlockItem(db, admin, { ...base, itemId: 'B.1', reason: 'Revize pafta geldi' });
    expect(await itemOf(db, 'B.1')).toMatchObject({ status: 'yeniden_kontrol', lockWarning: null });
  });
});

describe('kalem ekleme, iptal, bilgi', () => {
  it('yeni ölçülen ve türetilen kalem eklenir', async () => {
    const k = await as('kontrol');
    await createItem(db, k, { ...base, poz: 'B.9', name: 'Statik tonaj', unit: 'ton', kind: 'measured', value: 12, reason: 'Statik projeden' });
    const b9 = await itemOf(db, 'B.9');
    expect(b9).toMatchObject({ group: 'B', value: 12, status: 'kontrol_edilmedi', cancelled: false });
    await createItem(db, k, { ...base, poz: 'B.10', name: 'İki kat levha', unit: 'm²', kind: 'derived', formula: 'B.1 * 2', reason: 'levha' });
    expect((await itemOf(db, 'B.10')).value).toBeCloseTo(5695.4, 9);
    expect(await historyOf(db)).toContainEqual(expect.objectContaining({ action: 'create', target: { type: 'item', id: 'B.9' } }));
  });
  it('aynı poz ve geçersiz poz reddedilir', async () => {
    const k = await as('kontrol');
    await expect(createItem(db, k, { ...base, poz: 'B.1', name: 'x', unit: 'm²', kind: 'measured', value: 1, reason: 'x' })).rejects.toMatchObject({
      code: 'already-exists', message: 'Bu poz zaten var: B.1',
    });
    await expect(createItem(db, k, { ...base, poz: 'b1', name: 'x', unit: 'm²', kind: 'measured', value: 1, reason: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('bağımlısı olan kalem iptal edilemez; bağımsız kalem iptal edilir', async () => {
    const k = await as('kontrol');
    await expect(cancelItem(db, k, { ...base, itemId: 'B.2', reason: 'x' })).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Bu kaleme bağlı kalemler var: B.2.1, #1',
    });
    await cancelItem(db, k, { ...base, itemId: 'B.2.1', reason: 'mükerrer' });
    expect((await itemOf(db, 'B.2.1')).cancelled).toBe(true);
  });
  it('bilgi değişikliği kaydedilir', async () => {
    await updateItemInfo(db, await as('kontrol'), { ...base, itemId: 'B.1', name: 'Uzay kafes – izdüşüm', drawings: ['4199-A-DD-02-02-300'] });
    expect(await itemOf(db, 'B.1')).toMatchObject({ name: 'Uzay kafes – izdüşüm', drawings: ['4199-A-DD-02-02-300'] });
    expect(await historyOf(db)).toContainEqual(expect.objectContaining({ action: 'info', field: 'name' }));
  });
});

describe('mahal, cephe, malzeme', () => {
  it('mahal alanı değişince MAHAL zinciri güncellenir', async () => {
    await updateRoom(db, await as('kontrol'), { ...base, roomId: 'GF-02', area: 50, reason: 'Etiket hatalı' });
    expect((await itemOf(db, 'A.1')).value).toBe(150);
    expect((await itemOf(db, 'F.2')).value).toBe(50);
    const h = await historyOf(db);
    expect(h).toContainEqual(expect.objectContaining({ target: { type: 'room', id: 'GF-02' }, action: 'room', field: 'area', before: 20.5, after: 50 }));
    expect(h).toContainEqual(expect.objectContaining({ target: { type: 'item', id: 'A.1' }, action: 'cascade', cause: { type: 'room', id: 'GF-02', action: 'room' } }));
  });
  it('mahal yoksa ve gerekçe yoksa reddedilir', async () => {
    const k = await as('kontrol');
    await expect(updateRoom(db, k, { ...base, roomId: 'XX', area: 1, reason: 'x' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(updateRoom(db, k, { ...base, roomId: 'GF-02', area: 1, reason: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('cephe hücresi değişince CEPHE kalemi güncellenir', async () => {
    await updateFacadeCell(db, await as('kontrol'), { ...base, rowId: 'GD', column: 'FM-01', value: 400, reason: 'yeniden ölçüm' });
    expect((await itemOf(db, 'C.2')).value).toBe(400);
    expect(await historyOf(db)).toContainEqual(expect.objectContaining({ target: { type: 'facade', id: 'GD' }, field: 'values.FM-01', before: 365.8, after: 400 }));
  });
  it('malzeme formülü değişir', async () => {
    const k = await as('kontrol');
    await setMaterialFormula(db, k, { ...base, materialId: '1', formula: 'B.2 * 2', reason: '2 kat' });
    expect((await db.doc(`${BASE}/materials/1`).get()).data()!.value).toBeCloseTo(11089.6, 9);
    await expect(setMaterialFormula(db, k, { ...base, materialId: '1', formula: 'B.2 *', reason: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await setMaterialFormula(db, k, { ...base, materialId: '1', formula: null, reason: 'bağlantı yok' });
    expect((await db.doc(`${BASE}/materials/1`).get()).data()!.value).toBeNull();
  });
});
