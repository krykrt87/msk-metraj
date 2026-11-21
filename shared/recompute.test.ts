import { describe, expect, it } from 'vitest';
import { applyRecompute, CycleError, diffState, evaluateAll, type DisciplineState } from './recompute';
import { FormulaError } from './formula/parse';
import type { FacadeRow, Item, Material, Room, Status } from './types';

function item(id: string, v: { value?: number | null; formula?: string; status?: Status; cancelled?: boolean }): Item {
  return {
    id,
    poz: id,
    group: id[0],
    order: 0,
    name: id,
    code: null,
    unit: 'm²',
    kind: v.formula ? 'derived' : 'measured',
    value: v.value ?? null,
    formula: v.formula ?? null,
    method: '',
    sourceText: '',
    drawings: [],
    confidence: 'Orta',
    status: v.status ?? 'kontrol_edilmedi',
    lockWarning: null,
    cancelled: v.cancelled ?? false,
    importedValue: null,
    sourceFormula: null,
    updatedAt: null,
    updatedBy: null,
  };
}
function room(id: string, area: number, floor: string, flooring: string | null): Room {
  return { id, code: id, name: id, floor, zone: 'Zone 1', area, ceilingLower: null, ceilingUpper: null, ch: null, flooring, note: null, checkArea: null, order: 0 };
}
const material = (id: string, formula: string | null, value: number | null): Material => ({
  id, no: Number(id), group: 'Çatı', name: id, code: null, usage: '', sourceText: '', unit: 'm²', formula, value, note: null,
});
const facade: FacadeRow = { id: 'GD', label: 'Güneydoğu', values: { 'FM-01': 365.8, 'FM-02/FM-03': 195.5, 'FM-04': 80.4, 'FM-05': 0, 'FS-01': 0, 'FP-01': 0 } };

/** Excel'deki değerlerle tutarlı küçük bir durum. */
function state(): DisciplineState {
  const items = [
    item('A.1', { formula: 'MAHAL(kat; "Zemin Kat")', value: 300 }),
    item('A.5', { value: 8392.5 }),
    item('B.1', { value: 2847.7, status: 'kontrol_edildi' }),
    item('B.1.1', { formula: 'B.1', value: 2847.7, status: 'kontrol_edildi' }),
    item('B.1.2', { formula: 'B.1', value: 2847.7 }),
    item('B.2', { formula: 'A.5 - B.1', value: 5544.8, status: 'kesinlesti' }),
    item('B.2.1', { formula: 'B.2', value: 5544.8, status: 'duzeltildi' }),
    item('C.2', { formula: 'CEPHE("FM-01")', value: 365.8 }),
    item('F.1', { formula: 'MAHAL(doseme; "Halı kaplama")', value: 200 }),
    item('F.2', { formula: 'A.1 - F.1', value: 100 }),
    item('F.3', { formula: 'A.1', value: 300 }),
    item('X.1', { value: null }),
  ];
  return {
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    rooms: {
      r1: room('r1', 200, 'Zemin Kat', 'Halı kaplama'),
      r2: room('r2', 100, 'Zemin Kat', null),
      r3: room('r3', 50, 'Asma Kat (Teknik)', null),
    },
    facade: { GD: facade },
    materials: { '1': material('1', 'B.2', 5544.8), '2': material('2', null, null) },
  };
}

describe('evaluateAll', () => {
  it('tüm türetilen kalemleri ve malzemeleri hesaplar', () => {
    const r = evaluateAll(state());
    expect(r.items['A.1']).toBe(300);
    expect(r.items['B.2']).toBeCloseTo(5544.8, 9);
    expect(r.items['F.2']).toBe(100);
    expect(r.items['C.2']).toBeCloseTo(365.8, 9);
    expect(r.items['X.1']).toBeNull();
    expect(r.materials['1']).toBeCloseTo(5544.8, 9);
    expect(r.materials['2']).toBeNull();
  });
  it('döngüyü yoluyla raporlar', () => {
    const s = state();
    s.items['B.1'] = { ...s.items['B.1'], kind: 'derived', formula: 'B.2' };
    expect(() => evaluateAll(s)).toThrow(CycleError);
    expect(() => evaluateAll(s)).toThrow(/Döngüsel bağımlılık: .*B\.1.*→.*B\.2/);
  });
  it('iptal edilmiş kaleme başvuran aktif formülü reddeder', () => {
    const s = state();
    s.items['A.1'] = { ...s.items['A.1'], cancelled: true };
    expect(() => evaluateAll(s)).toThrow(new FormulaError('İptal edilmiş kalem: A.1'));
  });
});

describe('applyRecompute', () => {
  it('B.1 düzeltilince bağlı tüm kalemler ve malzemeler güncellenir', () => {
    const s = state();
    s.items['B.1'] = { ...s.items['B.1'], value: 3000 };
    const out = applyRecompute(s, new Set(['B.1']));
    expect(out.items['B.1.1'].value).toBe(3000);
    expect(out.items['B.1.2'].value).toBe(3000);
    expect(out.items['B.2'].value).toBeCloseTo(5392.5, 9);
    expect(out.items['B.2.1'].value).toBeCloseTo(5392.5, 9);
    expect(out.materials['1'].value).toBeCloseTo(5392.5, 9);
  });
  it('bağlı kalemin durumu değere göre değişir; kesinleşmiş kalem kilitli kalır ama güncellenir', () => {
    const s = state();
    s.items['B.1'] = { ...s.items['B.1'], value: 3000 };
    const out = applyRecompute(s, new Set(['B.1']));
    expect(out.items['B.1'].status).toBe('kontrol_edildi'); // doğrudan düzenlenen kaleme dokunulmaz
    expect(out.items['B.1.1'].status).toBe('yeniden_kontrol');
    expect(out.items['B.1.2'].status).toBe('kontrol_edilmedi');
    expect(out.items['B.2'].status).toBe('kesinlesti');
    expect(out.items['B.2'].lockWarning).toBe('ust_kalem');
    expect(out.items['B.2.1'].status).toBe('yeniden_kontrol');
  });
  it('mahal alanı değişince MAHAL kullanan zincir güncellenir', () => {
    const s = state();
    s.rooms.r2 = { ...s.rooms.r2, area: 150 };
    const out = applyRecompute(s, new Set());
    expect(out.items['A.1'].value).toBe(350);
    expect(out.items['F.2'].value).toBe(150);
    expect(out.items['F.3'].value).toBe(350);
    expect(out.items['F.1'].value).toBe(200);
  });
  it('ölçülemedi değerine dönen kaynak bağlıları boşaltır', () => {
    const s = state();
    s.items['B.1'] = { ...s.items['B.1'], value: null };
    const out = applyRecompute(s, new Set(['B.1']));
    expect(out.items['B.2'].value).toBeNull();
    expect(out.items['B.1.1'].status).toBe('yeniden_kontrol');
  });
  it('girdiyi değiştirmez', () => {
    const s = state();
    s.items['B.1'] = { ...s.items['B.1'], value: 3000 };
    applyRecompute(s, new Set(['B.1']));
    expect(s.items['B.2'].value).toBe(5544.8);
  });
});

describe('diffState', () => {
  it('yalnız değişen alanları döndürür', () => {
    const before = state();
    const draft = state();
    draft.items['B.1'] = { ...draft.items['B.1'], value: 3000 };
    const after = applyRecompute(draft, new Set(['B.1']));
    const d = diffState(before, after);
    expect(d).toContainEqual({ type: 'item', id: 'B.1', field: 'value', before: 2847.7, after: 3000 });
    expect(d).toContainEqual({ type: 'item', id: 'B.2', field: 'lockWarning', before: null, after: 'ust_kalem' });
    expect(d).toContainEqual({ type: 'material', id: '1', field: 'value', before: 5544.8, after: expect.closeTo(5392.5, 9) });
    expect(d.some((x) => x.id === 'A.5')).toBe(false);
    expect(d.some((x) => x.id === 'B.1.2' && x.field === 'status')).toBe(false);
  });
  it('kayan nokta gürültüsü değişiklik sayılmaz', () => {
    const s = state();
    expect(diffState(s, applyRecompute(s, new Set()))).toEqual([]);
  });
  it('iç içe nesnede alan yolunu verir ve updatedAt farkını yok sayar', () => {
    const before = state();
    const after = state();
    after.facade.GD = { ...after.facade.GD, values: { ...after.facade.GD.values, 'FM-01': 400 } };
    after.items['A.5'] = { ...after.items['A.5'], updatedAt: 'şimdi' };
    expect(diffState(before, after)).toEqual([{ type: 'facade', id: 'GD', field: 'values.FM-01', before: 365.8, after: 400 }]);
  });
  it('yeni dokümanı tek kayıt olarak verir', () => {
    const before = state();
    const after = state();
    after.items['B.9'] = item('B.9', { value: 1 });
    expect(diffState(before, after)).toEqual([{ type: 'item', id: 'B.9', field: '', before: null, after: after.items['B.9'] }]);
  });
});
