// Betikler varsayılan olarak emülatöre bağlanır. --prod: .firebaserc "prod" projesine, hizmet hesabı anahtarıyla
// (GOOGLE_APPLICATION_CREDENTIALS ortam değişkeni; anahtar dosyası depoya girmez).
import { readFileSync } from 'node:fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { FIREBASE_PROJECT_ID } from '../../shared/constants';

export const STORAGE_BUCKET = `${FIREBASE_PROJECT_ID}.appspot.com`;

/** .firebaserc içindeki "prod" takma adı. */
export function prodProjectId(rc = readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8')): string {
  const id = (JSON.parse(rc) as { projects?: Record<string, string> }).projects?.prod;
  if (!id) throw new Error('.firebaserc içinde "prod" projesi tanımlı değil');
  return id;
}

export function initAdmin(argv: string[] = process.argv) {
  if (argv.includes('--prod')) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Canlı ortam: GOOGLE_APPLICATION_CREDENTIALS hizmet hesabı anahtarını göstermeli');
    for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete process.env[k];
    const projectId = prodProjectId();
    const storageBucket = argValue(argv, '--bucket') ?? `${projectId}.firebasestorage.app`;
    console.log(`CANLI ortam: ${projectId} (${storageBucket})`);
    const app = getApps()[0] ?? initializeApp({ projectId, storageBucket });
    return { db: getFirestore(app), auth: getAuth(app), bucket: getStorage(app).bucket() };
  }
  process.env.GCLOUD_PROJECT ??= FIREBASE_PROJECT_ID; // GCE meta veri aramasını önler
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
  const app = getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT_ID, storageBucket: STORAGE_BUCKET });
  return { db: getFirestore(app), auth: getAuth(app), bucket: getStorage(app).bucket() };
}

export function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
