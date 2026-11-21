import { describe, expect, it } from 'vitest';
import { bootstrapAdmin } from './bootstrap-admin';
import { initAdmin } from './lib/admin';

describe('bootstrapAdmin', () => {
  it('yönetici kullanıcıyı ve profilini oluşturur; tekrar çalışınca aynı kullanıcıyı günceller', async () => {
    const { auth, db } = initAdmin([]);
    const input = { email: 'yonetici-test@msk.local', name: 'Yönetici Test', password: 'ilk-sifre-123' };
    const uid = await bootstrapAdmin(auth, db, input);
    const again = await bootstrapAdmin(auth, db, { ...input, password: 'yeni-sifre-456' });
    expect(again).toBe(uid);
    const user = await auth.getUser(uid);
    expect(user.email).toBe(input.email);
    const prof = (await db.doc(`users/${uid}`).get()).data();
    expect(prof).toEqual({
      email: input.email,
      name: 'Yönetici Test',
      role: 'admin',
      active: true,
      access: { 'msk-4199': { A: { view: true, drawings: true } } },
    });
  });
});
