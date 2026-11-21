// Betikler yalnız emülatöre bağlanır. Canlı ortam ayrı planda açılacak.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { FIREBASE_PROJECT_ID } from '../../shared/constants';

export const STORAGE_BUCKET = `${FIREBASE_PROJECT_ID}.appspot.com`;

export function initAdmin(argv: string[] = process.argv) {
  if (argv.includes('--prod')) throw new Error('Canlı ortam bu aşamada desteklenmiyor');
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
