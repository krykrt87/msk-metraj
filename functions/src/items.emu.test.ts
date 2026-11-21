import { beforeEach, describe, expect, it } from 'vitest';
import { loadCaller } from './context';
import { correctItem, setItemFormula } from './items';
import { BASE, D, historyOf, itemOf, P, seedBasic, testDb } from './test/seed';

const db = testDb();
const caller = (uid: string) => loadCaller(db, uid, P, D);
const base = { projectId: P, discipline: D };

beforeEach(async () => {
  await seedBasic(db);
});

describe('loadCaller', () => {
  it('girişsiz, profilsiz ve pasif kullanıcıyı reddeder', async () => {
    await expect(loadCaller(db, undefined, P, D)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(caller('yok')).rejects.toMatchObject({ code: 'permission-denied', message: 'Bu işlem için yetkiniz yok.' });
    await expect(caller('pasif')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(caller('kontrol')).resolves.toMatchObject({ uid: 'kontrol', role: 'kontrolcu', name: 'Test kontrolcu' });
  });
});

describe('correctItem', () => {
  it('B.1 düzeltmesi bağlı kalemleri ve malzemeyi günceller, geçmişe yazar', async () => {
    const r = await correctItem(db, await caller('kontrol'), { ...base, itemId: 'B.1', value: 3000, reason: 'Paftadan yeniden ölçüldü' });
    expect((await itemOf(db, 'B.1')).value).toBe(3000);
    expect((await itemOf(db, 'B.1')).status).toBe('duzeltildi');
    expect((await itemOf(db, 'B.1')).updatedBy).toEqual({ uid: 'kontrol', name: 'Test kontrolcu' });
    expect((await itemOf(db, 'B.2')).value).toBeCloseTo(5392.5, 9);
    expect((await itemOf(db, 'B.2')).status).toBe('yeniden_kontrol');
    expect((await itemOf(db, 'B.2.1')).value).toBeCloseTo(5392.5, 9);
    expect((await db.doc(`${BASE}/materials/1`).get()).data()!.value).toBeCloseTo(5392.5, 9);

    const h = await historyOf(db);
    expect(h.every((e) => e.batchId === r.batchId)).toBe(true);
    expect(h).toContainEqual(expect.objectContaining({
      target: { type: 'item', id: 'B.1' }, action: 'correct', field: 'value', before: 2847.7, after: 3000,
      reason: 'Paftadan yeniden ölçüldü', cause: null, by: { uid: 'kontrol', name: 'Test kontrolcu' },
    }));
    expect(h).toContainEqual(expect.objectContaining({ target: { type: 'item', id: 'B.1' }, action: 'correct', field: 'status', after: 'duzeltildi' }));
    expect(h).toContainEqual(expect.objectContaining({
      target: { type: 'item', id: 'B.2' }, action: 'cascade', field: 'status', before: 'kontrol_edildi', after: 'yeniden_kontrol',
      cause: { type: 'item', id: 'B.1', action: 'correct' }, reason: null,
    }));
    expect(h).toContainEqual(expect.objectContaining({ target: { type: 'material', id: '1' }, action: 'cascade', field: 'value' }));
    expect(h.some((e) => e.target.id === 'A.5')).toBe(false);
  });
  it('satın alma rolü düzeltemez', async () => {
    await expect(correctItem(db, await caller('satin'), { ...base, itemId: 'B.1', value: 1, reason: 'x' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('gerekçe zorunlu', async () => {
    await expect(correctItem(db, await caller('kontrol'), { ...base, itemId: 'B.1', value: 1, reason: '  ' })).rejects.toMatchObject({
      code: 'invalid-argument', message: 'Gerekçe zorunludur.',
    });
  });
  it('negatif miktar reddedilir', async () => {
    await expect(correctItem(db, await caller('kontrol'), { ...base, itemId: 'B.1', value: -1, reason: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('kesinleşmiş kalem düzeltilemez', async () => {
    await db.doc(`${BASE}/items/B.1`).update({ status: 'kesinlesti' });
    await expect(correctItem(db, await caller('admin'), { ...base, itemId: 'B.1', value: 1, reason: 'x' })).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Kalem kesinleşmiş; önce kilidi açın.',
    });
  });
  it('türetilen kaleme sabit değer verilince formül bağı kopar ve geçmişte görünür', async () => {
    await correctItem(db, await caller('kontrol'), { ...base, itemId: 'B.2', value: 5000, reason: 'Statik projeden' });
    const b2 = await itemOf(db, 'B.2');
    expect(b2).toMatchObject({ kind: 'measured', formula: null, value: 5000 });
    expect(await historyOf(db)).toContainEqual(expect.objectContaining({ target: { type: 'item', id: 'B.2' }, field: 'formula', before: 'A.5 - B.1', after: null }));
    expect((await itemOf(db, 'B.2.1')).value).toBe(5000);
  });
  it('eşzamanlı düzeltmelerden sonra bağlı kalem tutarlı kalır', async () => {
    const k = await caller('kontrol');
    const a = await caller('admin');
    await Promise.all([
      correctItem(db, k, { ...base, itemId: 'B.1', value: 3000, reason: 'r1' }),
      correctItem(db, a, { ...base, itemId: 'A.5', value: 9000, reason: 'r2' }),
    ]);
    expect((await itemOf(db, 'B.2')).value).toBe(6000);
    expect((await itemOf(db, 'B.2.1')).value).toBe(6000);
  });
});

describe('setItemFormula', () => {
  it('formül değişir, değer hesaplanır', async () => {
    await setItemFormula(db, await caller('kontrol'), { ...base, itemId: 'B.2.1', formula: 'B.2 * 2', reason: '2 kat' });
    expect(await itemOf(db, 'B.2.1')).toMatchObject({ kind: 'derived', formula: 'B.2 * 2', status: 'duzeltildi' });
    expect((await itemOf(db, 'B.2.1')).value).toBeCloseTo(11089.6, 9);
  });
  it('ölçülen kaleme formül verilince türetilen olur', async () => {
    await setItemFormula(db, await caller('kontrol'), { ...base, itemId: 'A.5', formula: '8000 + 392,5', reason: 'iki parça' });
    expect(await itemOf(db, 'A.5')).toMatchObject({ kind: 'derived', value: 8392.5 });
  });
  it('döngü reddedilir ve hiçbir şey değişmez', async () => {
    const before = (await historyOf(db)).length;
    await expect(setItemFormula(db, await caller('kontrol'), { ...base, itemId: 'A.5', formula: 'B.2', reason: 'x' })).rejects.toMatchObject({
      code: 'failed-precondition', message: expect.stringMatching(/Döngüsel bağımlılık/),
    });
    expect((await itemOf(db, 'A.5')).formula).toBeNull();
    expect((await historyOf(db)).length).toBe(before);
  });
  it('bilinmeyen kalem ve sözdizimi hatası reddedilir', async () => {
    const c = await caller('kontrol');
    await expect(setItemFormula(db, c, { ...base, itemId: 'B.2.1', formula: 'X.9 * 2', reason: 'x' })).rejects.toMatchObject({
      code: 'failed-precondition', message: 'Bilinmeyen kalem: X.9',
    });
    await expect(setItemFormula(db, c, { ...base, itemId: 'B.2.1', formula: 'B.2 +', reason: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
