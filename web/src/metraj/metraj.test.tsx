// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryEntry, Item, Status } from '@shared/types';

vi.mock('../firebase', () => ({ db: {}, functions: {}, auth: {}, storage: {} }));
const { filterItems } = await import('./filter');
const { HistoryList } = await import('./HistoryList');
const { CorrectionForm } = await import('./CorrectionForm');
const { FormulaForm } = await import('./FormulaForm');

function item(id: string, v: Partial<Item> & { status?: Status } = {}): Item {
  return {
    id, poz: id, group: id[0], order: 0, name: `Kalem ${id}`, code: null, unit: 'm²', kind: 'measured', value: 10,
    formula: null, method: '', sourceText: '', drawings: [], confidence: 'Orta', status: 'kontrol_edilmedi',
    lockWarning: null, cancelled: false, importedValue: 10, sourceFormula: null, updatedAt: null, updatedBy: null, ...v,
  };
}

describe('filterItems', () => {
  const items = [
    item('A.1', { name: 'Zemin kat net alan', confidence: 'Yüksek', drawings: ['4199-A-DD-01-02-100'] }),
    item('B.1', { name: 'Uzay kafes', status: 'kontrol_edildi', code: 'FG-01' }),
    item('B.4', { name: 'Yağmur kanalı', value: null }),
    item('C.1', { name: 'Cam cephe', kind: 'derived', formula: 'C.1a * C.1b', value: null }),
    item('F.2', { name: 'İptal', cancelled: true }),
  ];
  const ids = (xs: Item[]) => xs.map((x) => x.id);
  it('varsayılan olarak iptal edilenleri gizler', () => {
    expect(ids(filterItems(items, {}))).toEqual(['A.1', 'B.1', 'B.4', 'C.1']);
    expect(ids(filterItems(items, { showCancelled: true }))).toHaveLength(5);
  });
  it('metin poz, ad ve kodda Türkçe harf duyarsız arar', () => {
    expect(ids(filterItems(items, { text: 'ZEMİN' }))).toEqual(['A.1']);
    expect(ids(filterItems(items, { text: 'fg-01' }))).toEqual(['B.1']);
    expect(ids(filterItems(items, { text: 'b.4' }))).toEqual(['B.4']);
  });
  it('grup, güven, durum, pafta ve ölçülemedi süzgeçleri', () => {
    expect(ids(filterItems(items, { group: 'B' }))).toEqual(['B.1', 'B.4']);
    expect(ids(filterItems(items, { confidence: 'Yüksek' }))).toEqual(['A.1']);
    expect(ids(filterItems(items, { status: 'kontrol_edildi' }))).toEqual(['B.1']);
    expect(ids(filterItems(items, { drawing: '4199-A-DD-01-02-100' }))).toEqual(['A.1']);
    expect(ids(filterItems(items, { unmeasurable: true }))).toEqual(['B.4']);
  });
});

describe('HistoryList', () => {
  it('bağlı değişikliği nedeniyle yazar', () => {
    const e: HistoryEntry & { id: string } = {
      id: 'h1', at: null, by: { uid: 'u', name: 'Ayşe' }, batchId: 'b', target: { type: 'item', id: 'B.2' },
      action: 'cascade', field: 'value', before: 5544.8, after: 5392.5, reason: null, cause: { type: 'item', id: 'B.1', action: 'correct' },
    };
    render(<HistoryList entries={[e]} unit="m²" />);
    expect(screen.getByText('Bağlı değişiklik – B.1 düzeltmesi')).toBeInTheDocument();
    expect(screen.getByText('5.544,80 → 5.392,50')).toBeInTheDocument();
  });
});

describe('CorrectionForm', () => {
  it('gerekçesiz gönderilemez', async () => {
    render(<CorrectionForm item={item('B.1')} submit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Yeni miktar'), '3000');
    expect(screen.getByRole('button', { name: 'Düzeltmeyi kaydet' })).toBeDisabled();
  });
  it('noktalı ondalıkta uyarır', async () => {
    render(<CorrectionForm item={item('B.1')} submit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Yeni miktar'), '2847.7');
    expect(screen.getByText(/Ondalık için virgül kullanın/)).toBeInTheDocument();
  });
  it('türetilen kalemde bağın kopacağını söyler', () => {
    render(<CorrectionForm item={item('B.2', { kind: 'derived', formula: 'A.5 - B.1' })} submit={vi.fn()} />);
    expect(screen.getByText(/Formül bağı kopacak/)).toBeInTheDocument();
  });
  it('sunucu hatasında girilenleri korur ve hatayı gösterir', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.'));
    render(<CorrectionForm item={item('B.1')} submit={submit} />);
    await userEvent.type(screen.getByLabelText('Yeni miktar'), '3.000,5');
    await userEvent.type(screen.getByLabelText('Gerekçe'), 'Paftadan ölçüldü');
    await userEvent.click(screen.getByRole('button', { name: 'Düzeltmeyi kaydet' }));
    expect(submit).toHaveBeenCalledWith({ itemId: 'B.1', value: 3000.5, reason: 'Paftadan ölçüldü' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
    expect(screen.getByLabelText('Yeni miktar')).toHaveValue('3.000,5');
    expect(screen.getByLabelText('Gerekçe')).toHaveValue('Paftadan ölçüldü');
  });
});

describe('FormulaForm', () => {
  const values = { 'A.5': 8392.5, 'B.1': 2847.7 } as Record<string, number | null>;
  it('canlı hata ve önizleme', async () => {
    render(<FormulaForm item={item('B.2', { kind: 'derived', formula: 'A.5 - B.1' })} values={values} rooms={[]} facade={[]} submit={vi.fn()} />);
    const input = screen.getByLabelText('Formül');
    expect(screen.getByText('Önizleme: 5.544,80 m²')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'B.1 +');
    expect(screen.getByText(/Formül eksik/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Gerekçe'), 'x');
    expect(screen.getByRole('button', { name: 'Formülü kaydet' })).toBeDisabled();
  });
});
