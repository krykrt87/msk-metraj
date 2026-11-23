// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Drawing, Item, UserProfile } from '@shared/types';

const d = (code: string, title: string, series: string, seriesTitle: string): Drawing => ({ code, title, series, seriesTitle, zone: code.slice(10, 12), scale: '1/100', paper: 'A1', currentRevId: 'r0' });
const drawings = [d('4199-A-DD-01-02-300', 'ÇATI PLANI Zone 1', '02', 'KAT PLANLARI'), d('4199-A-DD-01-01-100', 'VAZIYET PLANI Zone 1', '01', 'VAZIYET PLANI')];
const items = [{ id: 'B.1', drawings: ['4199-A-DD-01-02-300'], cancelled: false }, { id: 'A.1', drawings: [], cancelled: false }] as unknown as Item[];
const live = <T,>(data: T) => ({ data, loading: false, error: null });
const useDrawings = vi.fn((on: boolean) => live(on ? drawings : []));

vi.mock('../firebase', () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
vi.mock('../data/hooks', () => ({
  useDrawings: (on: boolean) => useDrawings(on),
  useItems: () => live(items),
  useRevisions: () => live([{ id: 'r0', label: 'DD 02.11.2026', storagePath: 'p/r0.pdf', pageWidth: 2381, pageHeight: 1684, pageCount: 1 }]),
}));
vi.mock('./loadPdf', () => ({ loadDrawingPdf: vi.fn(async () => new ArrayBuffer(8)) }));
vi.mock('./PdfView', () => ({ default: ({ data }: { data: ArrayBuffer }) => <p>PDF {data.byteLength} B</p> }));

const prof = (drawingsOk: boolean) =>
  ({ uid: 'u', email: 'u@t', name: 'A', role: 'kontrolcu', active: true, access: { 'msk-4199': { A: { view: true, drawings: drawingsOk } } } }) as UserProfile;
const { DrawingsPage } = await import('./DrawingsPage');
const renderPage = (ok: boolean, url = '/paftalar') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <DrawingsPage profile={prof(ok)} />
    </MemoryRouter>,
  );

describe('DrawingsPage', () => {
  it('pafta yetkisi olmayana uyarı gösterir ve paftaları sorgulamaz', () => {
    renderPage(false);
    expect(screen.getByText('Pafta görme yetkiniz yok.')).toBeInTheDocument();
    expect(useDrawings).toHaveBeenLastCalledWith(false);
  });

  it('seriye göre listeler; seçilen paftayı ve onu kullanan kalemleri gösterir', async () => {
    renderPage(true);
    const heads = screen.getAllByText(/^(01 VAZIYET PLANI|02 KAT PLANLARI)$/).map((e) => e.textContent);
    expect(heads).toEqual(['01 VAZIYET PLANI', '02 KAT PLANLARI']);
    fireEvent.click(screen.getByRole('button', { name: /01-02-300/ }));
    expect(await screen.findByText('PDF 8 B')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'B.1' })).toHaveAttribute('href', '/?kalem=B.1');
    expect(screen.queryByRole('link', { name: 'A.1' })).toBeNull();
    expect(screen.getByText(/DD 02\.11\.2026/)).toBeInTheDocument();
  });

  it('adres çubuğundaki paftayı doğrudan açar', async () => {
    renderPage(true, '/paftalar?pafta=4199-A-DD-01-01-100');
    expect(await screen.findByText('PDF 8 B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /01-01-100/ })).toHaveAttribute('aria-current', 'true');
  });
});
