// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@shared/types';

const updateDoc = vi.fn(() => Promise.resolve());
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, path: string) => path, updateDoc }));
vi.mock('../firebase', () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
vi.mock('../data/hooks', () => ({
  BASE: 'base',
  useFindings: () => ({
    data: [
      { id: '1', no: 1, topic: 'Mahal alanı', drawingsText: 'A-100', finding: 'Sınır çizilmemiş', suggestion: 'Düzeltin', status: 'acik' },
      { id: '2', no: 2, topic: 'Cephe', drawingsText: 'A-300', finding: 'Kot çelişkisi', suggestion: 'Sorun', status: 'cozuldu' },
    ],
    loading: false,
    error: null,
  }),
}));

const prof = (role: UserProfile['role']) =>
  ({ uid: 'u', email: 'u@t', name: 'A', role, active: true, access: { 'msk-4199': { A: { view: true, drawings: false } } } }) as UserProfile;
const { KontrolPage } = await import('./KontrolPage');

describe('KontrolPage', () => {
  it('durum süzgeci ve düzenleyicinin durum değiştirmesi', () => {
    render(<KontrolPage profile={prof('kontrolcu')} />);
    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: 'acik' } });
    expect(screen.getByText('Sınır çizilmemiş')).toBeInTheDocument();
    expect(screen.queryByText('Kot çelişkisi')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bulgu 1 durumu'), { target: { value: 'iletildi' } });
    expect(updateDoc).toHaveBeenCalledWith('base/findings/1', { status: 'iletildi' });
  });
  it('satın alma durumu yalnız görür', () => {
    render(<KontrolPage profile={prof('satinalma')} />);
    expect(screen.queryByLabelText('Bulgu 1 durumu')).not.toBeInTheDocument();
    expect(screen.getAllByText('Açık').length).toBeGreaterThan(0);
  });
});
