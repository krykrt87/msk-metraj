// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Item } from '@shared/types';
import { Breakdown } from './Breakdown';

const item = {
  id: 'A.1', poz: 'A.1', name: 'Zemin kat net mahal alanı', unit: 'm²', value: 1342.76, formula: null, sources: [], notes: [],
  breakdown: [
    { label: 'GF-03 SALON 01', value: 1198.08, unit: 'm²', calc: [{ kind: 'dikdörtgen', label: '', adet: 1, en: 38.4, boy: 31.2, sign: 1, value: 1198.08 }] },
    { label: 'GF-07 KÜÇÜK SALON 01', value: 144.68, unit: 'm²', calc: [
      { kind: 'yamuk', label: '', adet: 1, en: 13.728, boy: 8.446, a: 13.601, b: 13.854, sign: 1, value: 115.95 },
      { kind: 'daire parçası', label: '', adet: 1, r: 35.35, angle: 13.85, sign: -1, value: -1.47 },
    ] },
  ],
} as unknown as Item;

describe('Breakdown (cetvel)', () => {
  it('her değer ayrı sütunda', () => {
    render(<Breakdown item={item} />);
    for (const h of ['Açıklama', 'Adet', 'En (m)', 'Boy (m)', 'Kenar a (m)', 'Kenar b (m)', 'r (m)', 'Açı (°)', 'Miktar', 'Birim']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    const rect = screen.getByText('Dikdörtgen').closest('tr')!;
    const cells = within(rect).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toContain('38,40');
    expect(cells).toContain('31,20');
    expect(cells).toContain('1.198,08');
    const trap = screen.getByText('Yamuk').closest('tr')!;
    expect(within(trap).getAllByRole('cell').map((c) => c.textContent)).toEqual(expect.arrayContaining(['13,601', '13,854', '8,446']));
    expect(screen.getByText('(−) Daire parçası')).toBeInTheDocument();
  });
});
