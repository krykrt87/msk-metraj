// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Item, UserProfile } from '@shared/types';

const item = {
  id: 'C.10', poz: 'C.10', group: 'C', order: 0, name: 'Doğal taş kaplama', code: null, unit: 'm²', kind: 'measured', value: 120,
  formula: null, method: '', sourceText: '', drawings: [], confidence: 'Orta', status: 'kontrol_edilmedi', lockWarning: null,
  cancelled: false, importedValue: 120, sourceFormula: null, updatedAt: null, updatedBy: null,
  specs: [{ label: 'Kalınlık', value: '30 mm', source: '00-09-100' }],
} as unknown as Item;
const live = <T,>(data: T) => ({ data, loading: false, error: null });
const model3d = vi.fn();

vi.mock('../firebase', () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
vi.mock('../data/hooks', () => ({
  useItems: () => live([item]),
  useRooms: () => live([]),
  useFacade: () => live([]),
  useHistory: () => live([]),
  useDiscipline: () => live({ groups: [{ key: 'C', title: 'Kaplamalar' }] }),
}));
vi.mock('../viewer/useModel3d', () => ({ useModel3d: (on: boolean) => (model3d(on), { model: null, error: null }) }));

beforeAll(() => {
  // telefon genişliği
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

const profile = { uid: 'u', email: 'u@test', name: 'Ayşe', role: 'satinalma', active: true, access: { 'msk-4199': { A: { view: true, drawings: false } } } } as UserProfile;

describe('MetrajPage (telefon)', () => {
  it('liste görünür; kaleme dokununca malzeme özellikleri açılır, geri dönülür; 3B indirilmez', async () => {
    const { MetrajPage } = await import('./MetrajPage');
    render(
      <MemoryRouter>
        <MetrajPage profile={profile} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Doğal taş kaplama/ }));
    expect(screen.getByRole('heading', { name: 'Doğal taş kaplama' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Malzeme özellikleri' }));
    expect(screen.getByText('30 mm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kalem listesi/ }));
    expect(screen.queryByRole('heading', { name: 'Doğal taş kaplama' })).toBeNull();
    expect(screen.getByRole('button', { name: /Doğal taş kaplama/ })).toBeVisible();
    expect(model3d).toHaveBeenCalledWith(false);
  });
});
