// İlk yöneticiyi oluşturur (davet sistemi bir yönetici gerektirir).
// Kullanım: npx tsx scripts/bootstrap-admin.ts --email <e-posta> --name "<ad soyad>" --password <şifre>
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import { DISCIPLINE, PROJECT_ID } from '../shared/constants';
import type { UserProfile } from '../shared/types';
import { argValue, initAdmin } from './lib/admin';

export async function bootstrapAdmin(auth: Auth, db: Firestore, input: { email: string; name: string; password: string }): Promise<string> {
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(input.email)).uid;
    await auth.updateUser(uid, { password: input.password, displayName: input.name, disabled: false });
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    uid = (await auth.createUser({ email: input.email, password: input.password, displayName: input.name })).uid;
  }
  const profile: Omit<UserProfile, 'uid'> = {
    email: input.email,
    name: input.name,
    role: 'admin',
    active: true,
    access: { [PROJECT_ID]: { [DISCIPLINE]: { view: true, drawings: true } } },
  };
  await db.doc(`users/${uid}`).set(profile);
  return uid;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv;
  const email = argValue(argv, '--email');
  const name = argValue(argv, '--name');
  const password = argValue(argv, '--password');
  if (!email || !name || !password || password.length < 6) {
    console.error('Kullanım: --email <e-posta> --name "<ad soyad>" --password <en az 6 karakter>');
    process.exit(2);
  }
  const { auth, db } = initAdmin(argv);
  bootstrapAdmin(auth, db, { email, name, password })
    .then((uid) => console.log(`Yönetici hazır: ${email} (${uid})`))
    .catch((e) => {
      console.error(`Hata: ${(e as Error).message}`);
      process.exit(1);
    });
}
