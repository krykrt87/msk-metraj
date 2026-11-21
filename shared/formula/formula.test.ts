import { describe, expect, it } from 'vitest';
import { FormulaError, formulaDeps, isConstant, parseFormula } from './parse';
import { evaluate, type EvalContext } from './evaluate';

const items: Record<string, number | null> = { 'A.5': 8392.5, 'B.1': 2847.7, 'B.4': null, 'C.1a': 226.2, 'C.1b': 5.5 };
const ctx: EvalContext = {
  item: (id) => items[id],
  rooms: [
    { floor: 'Zemin Kat', area: 100, ceilingLower: 'C-G01', ceilingUpper: null, flooring: 'Halı kaplama' },
    { floor: 'Asma Kat (Teknik)', area: 50, ceilingLower: null, ceilingUpper: 'C-P01', flooring: null },
    { floor: 'Zemin Kat', area: 20.5, ceilingLower: 'C-G03', ceilingUpper: null, flooring: null },
  ],
  facade: [
    { values: { 'FM-01': 365.8, 'FM-02/FM-03': 195.5, 'FM-04': 80.4, 'FM-05': 0, 'FS-01': 0, 'FP-01': 0 } },
    { values: { 'FM-01': 227.1, 'FM-02/FM-03': 50, 'FM-04': 41.6, 'FM-05': 8.1, 'FS-01': 227.3, 'FP-01': 33.4 } },
  ],
};
const run = (text: string) => evaluate(parseFormula(text), ctx);

describe('formül hesabı', () => {
  it('kalem başvurularıyla aritmetik', () => {
    expect(run('A.5 - B.1')).toBeCloseTo(5544.8, 9);
    expect(run('B.1 * 2')).toBeCloseTo(5695.4, 9);
    expect(run('(A.5 - B.1) * 2')).toBeCloseTo(11089.6, 9);
    expect(run('-B.1 + 3000')).toBeCloseTo(152.3, 9);
    expect(run('C.1a * C.1b')).toBeCloseTo(1244.1, 9);
  });
  it('virgül ondalıklı sabitler ve sabit ifade tespiti', () => {
    expect(run('805,5 + 1239 + 803,2')).toBeCloseTo(2847.7, 9);
    expect(isConstant(parseFormula('805,5 + 1239 + 803,2'))).toBe(true);
    expect(isConstant(parseFormula('B.1 * 2'))).toBe(false);
  });
  it('MAHAL alan toplamı, büyük/küçük harf duyarsız', () => {
    expect(run('MAHAL(kat; "Zemin Kat")')).toBeCloseTo(120.5, 9);
    expect(run('MAHAL(kat; "zemin kat")')).toBeCloseTo(120.5, 9);
    expect(run('mahal(tavan_alt; "C-G01")')).toBe(100);
    expect(run('MAHAL(tavan_ust; "C-P01")')).toBe(50);
    expect(run('MAHAL(doseme; "Halı kaplama")')).toBe(100);
  });
  it('CEPHE sütun toplamı', () => {
    expect(run('CEPHE("FM-02/FM-03")')).toBeCloseTo(245.5, 9);
    expect(run('CEPHE("FM-01") + CEPHE("FM-04")')).toBeCloseTo(714.9, 9);
  });
  it('ölçülemeyen kaleme başvuru boş sonuç verir', () => {
    expect(run('B.4 * 2')).toBeNull();
  });
});

describe('bağımlılıklar', () => {
  it('kalem başvurularını ve kaynak türlerini listeler', () => {
    expect(formulaDeps(parseFormula('C.1a * C.1b'))).toEqual({ items: ['C.1a', 'C.1b'], rooms: false, facade: false });
    expect(formulaDeps(parseFormula('MAHAL(kat; "Zemin Kat") - B.1.3'))).toEqual({ items: ['B.1.3'], rooms: true, facade: false });
    expect(formulaDeps(parseFormula('CEPHE("FM-01") + F.7a + F.7a'))).toEqual({ items: ['F.7a'], rooms: false, facade: true });
  });
});

describe('formül hataları', () => {
  it('bilinmeyen kalem', () => {
    expect(() => run('X.9 + 1')).toThrow(new FormulaError('Bilinmeyen kalem: X.9'));
  });
  it('noktalı ondalık', () => {
    expect(() => parseFormula('2.5 * B.1')).toThrow(/Ondalık için virgül/);
  });
  it('eksik ifade konumu gösterir', () => {
    try {
      parseFormula('B.1 +');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FormulaError);
      expect((e as FormulaError).position).toBe(5);
    }
  });
  it('geçersiz MAHAL alanı geçerli alanları listeler', () => {
    expect(() => parseFormula('MAHAL(renk; "x")')).toThrow(/kat, tavan_alt, tavan_ust, doseme/);
  });
  it('geçersiz CEPHE sütunu ve bilinmeyen fonksiyon', () => {
    expect(() => parseFormula('CEPHE("FM-09")')).toThrow(/Geçersiz cephe sütunu/);
    expect(() => parseFormula('TOPLA(B.1)')).toThrow(/Bilinmeyen fonksiyon/);
  });
  it('sıfıra bölme', () => {
    expect(() => run('B.1 / 0')).toThrow(new FormulaError('Sıfıra bölme'));
  });
  it('boş formül ve kapanmamış parantez', () => {
    expect(() => parseFormula('  ')).toThrow(/Formül boş/);
    expect(() => parseFormula('(B.1 + 2')).toThrow(FormulaError);
  });
});
