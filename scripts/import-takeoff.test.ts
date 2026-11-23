import { describe, expect, it } from 'vitest';
import type { Item } from '../shared/types';
import { keepManualSpecs } from './import-takeoff';

const item = (id: string, specs: Item['specs']) => ({ id, specs }) as Item;

describe('keepManualSpecs', () => {
  it('elle girilen özellikler yeni kaleme geçer, diğerleri aktarımdan gelir', () => {
    const items = [item('C.10', [{ label: 'Kalınlık', value: '30 mm' }]), item('D.1', [{ label: 'Renk', value: 'RAL 9010' }])];
    const kept = keepManualSpecs(items, [{ ...item('C.10', [{ label: 'Renk / ocak', value: 'Bej' }]), specsManual: true }]);
    expect(kept).toEqual(['C.10']);
    expect(items[0]).toMatchObject({ specs: [{ label: 'Renk / ocak', value: 'Bej' }], specsManual: true });
    expect(items[1].specs).toEqual([{ label: 'Renk', value: 'RAL 9010' }]);
  });

  it('kalemi kalkan elle girilmiş özellik varsa durur', () => {
    expect(() => keepManualSpecs([item('C.10', [])], [{ ...item('X.1', []), specsManual: true }])).toThrow(/X\.1/);
  });
});
