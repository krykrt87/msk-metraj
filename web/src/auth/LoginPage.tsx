import { useState, type FormEvent } from 'react';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/wrong-password': 'E-posta veya şifre hatalı.',
  'auth/user-not-found': 'E-posta veya şifre hatalı.',
  'auth/invalid-email': 'E-posta adresi geçersiz.',
  'auth/user-disabled': 'Hesabınız devre dışı. Yöneticiye başvurun.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.',
  'auth/network-request-failed': 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.',
};

export function LoginPage({ signIn }: { signIn: (email: string, password: string) => Promise<unknown> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(MESSAGES[code] ?? `Giriş yapılamadı (${code || 'bilinmeyen hata'}).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <TitleBlock />
        <h1>Metraj kontrol</h1>
        <label>
          E-posta
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Şifre
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
        <p className="hint">Hesabı olmayanlar yöneticiden davet ister.</p>
      </form>
    </main>
  );
}

/** Pafta antedi biçiminde proje kutusu. */
export function TitleBlock() {
  return (
    <div className="title-block" aria-label="Proje">
      <div className="tb-cell tb-wide">
        <span className="tb-key">Proje</span>
        <span className="tb-val">Mustafa Sak Kongre Merkezi</span>
      </div>
      <div className="tb-cell">
        <span className="tb-key">No</span>
        <span className="tb-val">4199</span>
      </div>
      <div className="tb-cell">
        <span className="tb-key">Aşama</span>
        <span className="tb-val">DD</span>
      </div>
    </div>
  );
}
