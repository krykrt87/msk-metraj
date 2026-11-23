// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Item, UserProfile } from '@shared/types';

const item = (id: string, v: Partial<Item>): Item =>
  ({
    id, poz: id, group: id[0], order: 0, name: `Kalem ${id}`, code: null, unit: 'm²', kind: 'measured', value: 10, formula: null, method: '',
    sourceText: '', drawings: [], confidence: 'Orta', status: 'kontrol_edilmedi', lockWarning: null, cancelled: false, importedValue: 10,
    sourceFormula: null, updatedAt: null, updatedBy: null, ...v,
  }) as Item;
const items = [
  item('A.1', { name: 'Zemin kat net alan' }), // özellik yok: malzeme değil
  item('C.10', { name: 'Doğal taş kaplama', status: 'kesinlesti', specs: [{ label: 'Kalınlık', value: '30 mm' }, { label: 'Renk / ocak', value: null }] }),
  item('D.1', { name: 'Alçı tavan', specs: [{ label: 'Levha tipi', value: 'GKB 12,5' }] }),
  item('X.9', { name: 'İptal malzeme', cancelled: true, specs: [{ label: 'Tip', value: null }] }),
];
const live = <T,>(data: T) => ({ data, loading: false, error: null });

vi.mock('../firebase', () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
vi.mock('../data/hooks', () => ({
  useItems: () => live(items),
  useDiscipline: () => live({ groups: [{ key: 'A', title: 'Genel' }, { key: 'C', title: 'Cephe' }, { key: 'D', title: 'Tavanlar' }] }),
}));

const profile = { uid: 'u', email: 'u@test', name: 'Ayşe', role: 'satinalma', active: true, access: { 'msk-4199': { A: { view: true, drawings: false } } } } as UserProfile;
const { MalzemePage } = await import('./MalzemePage');
const renderPage = () =>
  render(
    <MemoryRouter>
      <MalzemePage profile={profile} />
    </MemoryRouter>,
  );

describe('MalzemePage', () => {
  it('yalnız özellik listesi olan, iptal edilmemiş kalemleri listeler ve özetler', () => {
    renderPage();
    expect(screen.getByText('Doğal taş kaplama')).toBeInTheDocument();
    expect(screen.getByText('Alçı tavan')).toBeInTheDocument();
    expect(screen.queryByText('Zemin kat net alan')).toBeNull();
    expect(screen.queryByText('İptal malzeme')).toBeNull();
    expect(screen.getByText('1 eksik / 2')).toBeInTheDocument();
    expect(screen.getByText('Tam (1)')).toBeInTheDocument();
    expect(screen.getByText('Tanımlanacak özellik').nextSibling).toHaveTextContent('1');
  });

  it('süzgeç: özelliği eksik olanlar', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Göster'), { target: { value: 'eksik' } });
    expect(screen.getByText('Doğal taş kaplama')).toBeInTheDocument();
    expect(screen.queryByText('Alçı tavan')).toBeNull();
  });

  it('satıra tıklayınca özellikler ve metraj bağlantısı açılır', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Doğal taş kaplama/ }));
    expect(screen.getByText('30 mm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Metrajda aç/ })).toHaveAttribute('href', '/?kalem=C.10');
    expect(screen.queryByText('Özellikleri düzenle')).toBeNull(); // satın alma düzenleyemez
  });
});
