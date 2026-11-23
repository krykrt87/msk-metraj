import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { FIREBASE_PROJECT_ID, REGION } from '@shared/constants';

// Yerel çalışma: "demo-" projesi yalnız emülatörlere bağlanır. Canlı yapılandırma ayrı planda.
const app = initializeApp({
  apiKey: 'demo-key',
  projectId: FIREBASE_PROJECT_ID,
  authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${FIREBASE_PROJECT_ID}.appspot.com`,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, REGION);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  // Yerelde giriş ekranını atlar: web/.env.development.local içindeki hesapla (git'e girmez) otomatik oturum.
  const { VITE_DEV_EMAIL: email, VITE_DEV_PASSWORD: password } = import.meta.env;
  if (import.meta.env.DEV && email && password) {
    auth.authStateReady().then(() => { if (!auth.currentUser) return signInWithEmailAndPassword(auth, email, password); }).catch((e) => console.warn('Otomatik giriş başarısız:', e));
  }
}
