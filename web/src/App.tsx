import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { BrowserRouter, Route, Routes } from 'react-router';
import { can } from '@shared/access';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { auth } from './firebase';
import { LOCAL } from './local';
import { Shell } from './layout/Shell';
import { DrawingsPage } from './drawings/DrawingsPage';
import { ExcelPage } from './excel/ExcelPage';
import { KontrolPage } from './kontrol/KontrolPage';
import { MahalPage } from './mahal/MahalPage';
import { MalzemePage } from './malzeme/MalzemePage';
import { MetrajPage } from './metraj/MetrajPage';

function Pending({ title }: { title: string }) {
  return (
    <section className="placeholder">
      <h2>{title}</h2>
      <p>Bu sayfa hazırlanıyor.</p>
    </section>
  );
}

function Gate() {
  const { user, profile, loading } = useAuth();
  const out = () => (LOCAL ? undefined : signOut(auth));
  if (loading) return <p className="center-note">Yükleniyor…</p>;
  if (!user) return <LoginPage signIn={(e, p) => signInWithEmailAndPassword(auth, e, p)} />;
  if (!profile || !can(profile, 'view')) {
    return (
      <main className="center-note">
        <p>Hesabınız etkin değil. Yöneticiye başvurun.</p>
        <button type="button" className="btn" onClick={out}>
          Çıkış
        </button>
      </main>
    );
  }
  return (
    <Shell profile={profile} onSignOut={out}>
      <Routes>
        <Route path="/" element={<MetrajPage profile={profile} />} />
        <Route path="/malzeme" element={<MalzemePage profile={profile} />} />
        <Route path="/mahal" element={<MahalPage />} />
        <Route path="/proje-kontrol" element={<KontrolPage profile={profile} />} />
        <Route path="/paftalar" element={<DrawingsPage profile={profile} />} />
        <Route path="/excel" element={<ExcelPage />} />
        <Route path="/kullanicilar" element={<Pending title="Kullanıcılar" />} />
        <Route path="*" element={<Pending title="Sayfa bulunamadı" />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
