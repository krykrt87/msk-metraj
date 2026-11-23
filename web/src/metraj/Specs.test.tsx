// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '@shared/types';
import { Specs } from './Specs';

const item = {
  id: 'C.10',
  specs: [
    { label: 'Kalınlık', value: '30 mm', source: '00-09-100' },
    { label: 'Renk / ocak', value: null },
  ],
} as unknown as Item;

describe('Specs (malzeme özellikleri)', () => {
  it('değer, kaynak ve tanımlanmamış alan gösterilir', () => {
    render(<Specs item={item} editable={false} submit={vi.fn()} />);
    expect(screen.getByText('30 mm')).toBeInTheDocument();
    expect(screen.getByText('00-09-100')).toBeInTheDocument();
    expect(screen.getByText('Tanımlanmalı')).toBeInTheDocument();
    expect(screen.getByText(/2 özellikten 1 tanesi projede yok/)).toBeInTheDocument();
    expect(screen.queryByText('Özellikleri düzenle')).toBeNull();
  });

  it('düzenleme boş değeri null olarak kaydeder', async () => {
    const submit = vi.fn().mockResolvedValue({});
    render(<Specs item={item} editable submit={submit} />);
    fireEvent.click(screen.getByText('Özellikleri düzenle'));
    fireEvent.change(screen.getByLabelText('Renk / ocak değeri'), { target: { value: ' Bej, Denizli ' } });
    fireEvent.change(screen.getByLabelText('Kalınlık değeri'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Kaydet'));
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toEqual({
      itemId: 'C.10',
      specs: [
        { label: 'Kalınlık', value: null, source: '00-09-100' },
        { label: 'Renk / ocak', value: 'Bej, Denizli' },
      ],
      reason: undefined,
    });
  });
});
