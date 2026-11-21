import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { BrowserRouter, Route, Routes } from 'react-router';
import { can } from '@shared/access';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { auth } from './firebase';
import { Shell } from './layout/Shell';

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
  const out = () => signOut(auth);
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
        <Route path="/" element={<Pending title="Metraj" />} />
        <Route path="/malzeme" element={<Pending title="Malzeme Listesi" />} />
        <Route path="/mahal" element={<Pending title="Mahal Listesi" />} />
        <Route path="/cephe" element={<Pending title="Cephe" />} />
        <Route path="/proje-kontrol" element={<Pending title="Proje Kontrol" />} />
        <Route path="/paftalar" element={<Pending title="Paftalar" />} />
        <Route path="/ozet" element={<Pending title="Özet" />} />
        <Route path="/yontem" element={<Pending title="Yöntem" />} />
        <Route path="/excel" element={<Pending title="Excel çıktısı" />} />
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
