import { describe, expect, it } from 'vitest';
import type { Item } from '@shared/types';
import { roomItems } from './roomItems';

const item = (poz: string, breakdown: Item['breakdown'], extra: Partial<Item> = {}) => ({ poz, name: poz, code: null, cancelled: false, breakdown, ...extra }) as Item;

describe('roomItems', () => {
  it('mahal kodunu tam eşler, kalem+birim başına toplar, eksi ve iptal satırları atlar', () => {
    const items = [
      item('D.1', [
        { label: 'GF-1 HOL (alt tavan planı)', value: 10, unit: 'm²' },
        { label: 'GF-12 SALON GİRİŞ', value: 99, unit: 'm²' },
        { label: 'Brüt: GF-1 HOL', value: 5, unit: 'm²' },
        { label: '− GF-1 HOL üstü', value: -3, unit: 'm²' },
      ]),
      item('H.4', [
        { label: 'GF-5 SALON ↔ GF-1 HOL', value: 1, unit: 'adet' },
        { label: 'GF-1 HOL – dış kapı', value: 1, unit: 'adet' },
      ]),
      item('X.1', [{ label: 'GF-1', value: 7, unit: 'm²' }], { cancelled: true }),
      item('A.1', [{ label: 'GF-1 HOL', value: 7, unit: 'm²' }], { group: 'A' }),
      item('D.2', [{ label: 'GF-1 WC', value: 4, unit: 'm²' }]),
    ];
    expect(roomItems(items, 'GF-1').map((r) => [r.poz, r.unit, r.total])).toEqual([
      ['D.1', 'm²', 15],
      ['H.4', 'adet', 2],
      ['D.2', 'm²', 4],
    ]);
    expect(roomItems(items, 'GF-1 HOL').map((r) => r.poz)).toEqual(['D.1', 'H.4']);
  });
});
