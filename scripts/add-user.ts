// Console'dan (Authentication) eklenmiş kullanıcıya uygulama profili yazar; şifreye dokunmaz.
// shortcut: Kullanıcılar sayfası yapılınca bu betik gereksizleşir.
// Kullanım: npx tsx scripts/add-user.ts --prod --email <e-posta> --name "<ad soyad>" --role kontrolcu|satinalma|admin [--no-drawings]
import { pathToFileURL } from 'node:url';
import { DISCIPLINE, PROJECT_ID } from '../shared/constants';
import type { Role, UserProfile } from '../shared/types';
import { argValue, initAdmin } from './lib/admin';

const ROLES: Role[] = ['admin', 'kontrolcu', 'satinalma'];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv;
  const email = argValue(argv, '--email');
  const name = argValue(argv, '--name');
  const role = argValue(argv, '--role') as Role | undefined;
  if (!email || !name || !role || !ROLES.includes(role)) {
    console.error('Kullanım: --email <e-posta> --name "<ad soyad>" --role kontrolcu|satinalma|admin [--no-drawings] [--prod]');
    process.exit(2);
  }
  const { auth, db } = initAdmin(argv);
  (async () => {
    const uid = (await auth.getUserByEmail(email)).uid;
    const profile: Omit<UserProfile, 'uid'> = {
      email,
      name,
      role,
      active: true,
      access: { [PROJECT_ID]: { [DISCIPLINE]: { view: true, drawings: !argv.includes('--no-drawings') } } },
    };
    await db.doc(`users/${uid}`).set(profile);
    console.log(`Profil yazıldı: ${email} (${uid}) — ${role}`);
  })().catch((e) => {
    console.error(`Hata: ${(e as Error).message}`);
    process.exit(1);
  });
}
