import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { can } from '@shared/access';
import { ROLE_LABEL, type UserProfile } from '@shared/types';
import { TitleBlock } from '../auth/LoginPage';

interface NavItem {
  to: string;
  label: string;
  show?: (p: UserProfile) => boolean;
}
const NAV: NavItem[] = [
  { to: '/', label: 'Metraj' },
  { to: '/hesap', label: 'Hesap Detayı' },
  { to: '/malzeme', label: 'Malzeme Listesi' },
  { to: '/mahal', label: 'Mahal Listesi' },
  { to: '/cephe', label: 'Cephe' },
  { to: '/proje-kontrol', label: 'Proje Kontrol' },
  { to: '/paftalar', label: 'Paftalar', show: (p) => can(p, 'drawings') },
  { to: '/ozet', label: 'Özet' },
  { to: '/yontem', label: 'Yöntem' },
  { to: '/excel', label: 'Excel çıktısı' },
  { to: '/kullanicilar', label: 'Kullanıcılar', show: (p) => can(p, 'admin') },
];

export function Shell({ profile, onSignOut, children }: { profile: UserProfile; onSignOut: () => void; children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <TitleBlock />
        <nav className="mainnav" aria-label="Sayfalar">
          {NAV.filter((n) => !n.show || n.show(profile)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <span className="user-name">{profile.name}</span>
          <span className="user-role">{ROLE_LABEL[profile.role]}</span>
          <button type="button" className="btn ghost" onClick={onSignOut}>
            Çıkış
          </button>
        </div>
      </header>
      <div className="page">{children}</div>
    </div>
  );
}
