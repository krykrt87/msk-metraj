// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@shared/types';
import { Shell } from './Shell';

const prof = (role: UserProfile['role']): UserProfile => ({
  uid: 'u', email: 'u@test', name: 'Ayşe Demir', role, active: true, access: { 'msk-4199': { A: { view: true, drawings: role !== 'satinalma' } } },
});

const renderShell = (role: UserProfile['role']) =>
  render(
    <MemoryRouter>
      <Shell profile={prof(role)} onSignOut={() => {}}>
        <p>içerik</p>
      </Shell>
    </MemoryRouter>,
  );

describe('Shell', () => {
  it('menü sayfaları ve kullanıcı bilgisi', () => {
    renderShell('kontrolcu');
    for (const label of ['Metraj', 'Malzeme Listesi', 'Mahal Listesi', 'Proje Kontrol', 'Paftalar', 'Excel çıktısı']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('Ayşe Demir')).toBeInTheDocument();
    expect(screen.getByText('Kontrolcü')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Çıkış' })).toBeInTheDocument();
  });
  it('Kullanıcılar yalnız yöneticiye görünür', () => {
    renderShell('satinalma');
    expect(screen.queryByRole('link', { name: 'Kullanıcılar' })).not.toBeInTheDocument();
    renderShell('admin');
    expect(screen.getByRole('link', { name: 'Kullanıcılar' })).toBeInTheDocument();
  });
  it('pafta yetkisi olmayan Paftalar bağlantısını görmez', () => {
    renderShell('satinalma');
    expect(screen.queryByRole('link', { name: 'Paftalar' })).not.toBeInTheDocument();
  });
});
