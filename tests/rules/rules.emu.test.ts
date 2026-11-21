import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const D = 'projects/msk-4199/disciplines/A';
const PDF = `${D}/drawings/4199-A-DD-01-02-300/r0.pdf`;
const MODEL = `${D}/model/model3d.json`;
let env: RulesTestEnvironment;

const profile = (role: string, drawings: boolean, active = true) => ({
  email: `${role}@test`,
  name: role,
  role,
  active,
  access: { 'msk-4199': { A: { view: true, drawings } } },
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-msk',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin'), profile('admin', true));
    await setDoc(doc(db, 'users/kontrol'), profile('kontrolcu', true));
    await setDoc(doc(db, 'users/satin'), profile('satinalma', false));
    await setDoc(doc(db, 'users/pasif'), profile('kontrolcu', true, false));
    await setDoc(doc(db, 'projects/msk-4199'), { name: 'MSK' });
    await setDoc(doc(db, D), { name: 'Mimari' });
    await setDoc(doc(db, `${D}/items/B.1`), { value: 2847.7 });
    await setDoc(doc(db, `${D}/drawings/4199-A-DD-01-02-300`), { title: 'ÇATI PLANI Zone 1' });
    await setDoc(doc(db, `${D}/findings/1`), { no: 1, topic: 't', drawingsText: '', finding: 'f', suggestion: 's', status: 'acik' });
    await uploadBytes(ref(ctx.storage(), PDF), new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' });
    await uploadBytes(ref(ctx.storage(), MODEL), new TextEncoder().encode('{}'), { contentType: 'application/json' });
  });
});

const as = (uid: string) => env.authenticatedContext(uid);

describe('Firestore kuralları', () => {
  it('satın alma kalemi okur, pafta dokümanını okuyamaz', async () => {
    const db = as('satin').firestore();
    await assertSucceeds(getDoc(doc(db, `${D}/items/B.1`)));
    await assertFails(getDoc(doc(db, `${D}/drawings/4199-A-DD-01-02-300`)));
  });
  it('profili olmayan giriş yapmış kullanıcı hiçbir şey okuyamaz', async () => {
    const db = as('yabanci').firestore();
    await assertFails(getDoc(doc(db, `${D}/items/B.1`)));
    await assertFails(getDoc(doc(db, 'projects/msk-4199')));
  });
  it('pasif kullanıcı okuyamaz', async () => {
    await assertFails(getDoc(doc(as('pasif').firestore(), `${D}/items/B.1`)));
  });
  it('kalemlere doğrudan yazma yöneticiye bile kapalı', async () => {
    await assertFails(setDoc(doc(as('admin').firestore(), `${D}/items/B.1`), { value: 1 }));
    await assertFails(setDoc(doc(as('admin').firestore(), `${D}/history/x`), { a: 1 }));
  });
  it('kullanıcı yalnız kendi profilini okur; yönetici hepsini', async () => {
    await assertSucceeds(getDoc(doc(as('kontrol').firestore(), 'users/kontrol')));
    await assertFails(getDoc(doc(as('kontrol').firestore(), 'users/admin')));
    await assertSucceeds(getDoc(doc(as('admin').firestore(), 'users/kontrol')));
  });
  it('yorum: kendi adına yazılır, başkası adına yazılamaz', async () => {
    const db = as('satin').firestore();
    const good = { target: { type: 'item', id: 'B.1' }, text: 'Kontrol edin', by: { uid: 'satin', name: 'satinalma' }, at: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, `${D}/comments/c1`), good));
    await assertFails(setDoc(doc(db, `${D}/comments/c2`), { ...good, by: { uid: 'admin', name: 'admin' } }));
    await assertFails(setDoc(doc(db, `${D}/comments/c3`), { ...good, at: Timestamp.fromDate(new Date(2020, 0, 1)) }));
    await assertFails(setDoc(doc(db, `${D}/comments/c4`), { ...good, text: '' }));
  });
  it('bulgu durumunu kontrolcü değiştirir, satın alma değiştiremez, geçersiz durum reddedilir', async () => {
    await assertSucceeds(updateDoc(doc(as('kontrol').firestore(), `${D}/findings/1`), { status: 'iletildi' }));
    await assertFails(updateDoc(doc(as('satin').firestore(), `${D}/findings/1`), { status: 'cozuldu' }));
    await assertFails(updateDoc(doc(as('kontrol').firestore(), `${D}/findings/1`), { status: 'bitti' }));
    await assertFails(updateDoc(doc(as('kontrol').firestore(), `${D}/findings/1`), { no: 9 }));
  });
  it('yeni bulgu: kimlik numarayla aynı olmalı', async () => {
    const f = { no: 14, topic: 'Yeni', drawingsText: '01-02-100', finding: 'x', suggestion: 'y', status: 'acik' };
    await assertSucceeds(setDoc(doc(as('kontrol').firestore(), `${D}/findings/14`), f));
    await assertFails(setDoc(doc(as('kontrol').firestore(), `${D}/findings/15`), f));
  });
});

describe('Storage kuralları', () => {
  it('pafta yetkisi olan okur, satın alma okuyamaz', async () => {
    await assertSucceeds(getBytes(ref(as('kontrol').storage(), PDF)));
    await assertFails(getBytes(ref(as('satin').storage(), PDF)));
    await assertFails(getBytes(ref(as('yabanci').storage(), PDF)));
  });
  it('erişim kaldırılınca aynı oturumda okuma hemen reddedilir', async () => {
    const st = as('kontrol').storage();
    await assertSucceeds(getBytes(ref(st, PDF)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'users/kontrol'), { 'access.msk-4199.A.drawings': false });
    });
    await assertFails(getBytes(ref(st, PDF)));
  });
  it('yalnız yönetici PDF yükler', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const path = `${D}/drawings/4199-A-DD-01-02-300/r1.pdf`;
    await assertSucceeds(uploadBytes(ref(as('admin').storage(), path), bytes, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(as('kontrol').storage(), path), bytes, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(as('admin').storage(), path), bytes, { contentType: 'image/png' }));
  });
  it('3B modeli görüntüleme yetkisi olan okur (pafta yetkisi gerekmez); kimse yazamaz', async () => {
    await assertSucceeds(getBytes(ref(as('satin').storage(), MODEL)));
    await assertFails(getBytes(ref(as('pasif').storage(), MODEL)));
    await assertFails(getBytes(ref(as('yabanci').storage(), MODEL)));
    await assertFails(uploadBytes(ref(as('admin').storage(), MODEL), new TextEncoder().encode('{}'), { contentType: 'application/json' }));
  });
});
