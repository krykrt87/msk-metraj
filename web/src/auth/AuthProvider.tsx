import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserProfile } from '@shared/types';
import { auth, db } from '../firebase';
import { LOCAL, LOCAL_PROFILE } from '../local';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}
const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true });

  useEffect(() => {
    if (LOCAL) {
      // giriş yok: sabit yerel kullanıcı (kayıt işlemleri api'de engellenir)
      setState({ user: { uid: LOCAL_PROFILE.uid, email: LOCAL_PROFILE.email } as User, profile: LOCAL_PROFILE, loading: false });
      return;
    }
    let stopProfile: (() => void) | null = null;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.();
      stopProfile = null;
      if (!user) {
        setState({ user: null, profile: null, loading: false });
        return;
      }
      setState({ user, profile: null, loading: true });
      // Profil anlık izlenir: yönetici rol veya erişimi değiştirince arayüz hemen güncellenir.
      stopProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => setState({ user, profile: snap.exists() ? ({ uid: user.uid, ...snap.data() } as UserProfile) : null, loading: false }),
        () => setState({ user, profile: null, loading: false }),
      );
    });
    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
