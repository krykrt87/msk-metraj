import { describe, expect, it } from 'vitest';
import { ExcelTranslateError, translateExcelFormula } from './translate';

const metrajRowToPoz = new Map<number, string>([
  [4, 'A.1'], [7, 'A.4'], [8, 'A.5'], [11, 'B.1'], [29, 'C.1a'], [30, 'C.1b'], [46, 'D.1'], [55, 'E.2'],
  [82, 'H.1'], [83, 'H.2'], [84, 'H.3'], [85, 'H.4'], [86, 'H.5'], [87, 'H.6'], [88, 'H.7'],
]);
const metraj = { sheet: 'Metraj', metrajRowToPoz };
const other = { sheet: 'Malzeme Listesi', metrajRowToPoz };

describe('translateExcelFormula', () => {
  it('aynı sayfa hücre başvurusu', () => {
    expect(translateExcelFormula('E11', metraj)).toBe('B.1');
    expect(translateExcelFormula('=E11', metraj)).toBe('B.1');
  });
  it('aritmetik', () => {
    expect(translateExcelFormula('E8-E11', metraj)).toBe('A.5 - B.1');
    expect(translateExcelFormula('E29*E30', metraj)).toBe('C.1a * C.1b');
    expect(translateExcelFormula('(E8-E11)*2', metraj)).toBe('(A.5 - B.1) * 2');
  });
  it('sabitler virgül ondalıklı', () => {
    expect(translateExcelFormula('805.5+1239+803.2', metraj)).toBe('805,5 + 1239 + 803,2');
  });
  it('SUM aralığı açık toplam olur', () => {
    expect(translateExcelFormula('SUM(E82:E88)', metraj)).toBe('H.1 + H.2 + H.3 + H.4 + H.5 + H.6 + H.7');
    expect(translateExcelFormula('SUM(E82:E83)*2', metraj)).toBe('(H.1 + H.2) * 2');
  });
  it('SUMIF mahal sütunları', () => {
    const f = (col: string, v: string) => `SUMIF('Mahal Listesi'!$${col}$3:$${col}$56,"${v}",'Mahal Listesi'!$E$3:$E$56)`;
    expect(translateExcelFormula(f('C', 'Zemin Kat'), metraj)).toBe('MAHAL(kat; "Zemin Kat")');
    expect(translateExcelFormula(f('F', 'C-G01'), metraj)).toBe('MAHAL(tavan_alt; "C-G01")');
    expect(translateExcelFormula(f('G', 'C-P01'), metraj)).toBe('MAHAL(tavan_ust; "C-P01")');
    expect(translateExcelFormula(f('I', 'Halı kaplama'), metraj)).toBe('MAHAL(doseme; "Halı kaplama")');
  });
  it('cephe toplam satırı', () => {
    expect(translateExcelFormula('Cephe!B7', metraj)).toBe('CEPHE("FM-01")');
    expect(translateExcelFormula('Cephe!C7', metraj)).toBe('CEPHE("FM-02/FM-03")');
    expect(translateExcelFormula('Cephe!G7', metraj)).toBe('CEPHE("FP-01")');
  });
  it('başka sayfadan Metraj başvurusu', () => {
    expect(translateExcelFormula('Metraj!E46+Metraj!E55', other)).toBe('D.1 + E.2');
  });
  it('desteklenmeyenler hata verir', () => {
    expect(() => translateExcelFormula('VLOOKUP(E11,A1:B2,2)', metraj)).toThrow(ExcelTranslateError);
    expect(() => translateExcelFormula('E96', metraj)).toThrow(/E96/);
    expect(() => translateExcelFormula('Cephe!B5', metraj)).toThrow(ExcelTranslateError);
    expect(() => translateExcelFormula('E11', other)).toThrow(ExcelTranslateError);
    expect(() => translateExcelFormula(`SUMIF('Mahal Listesi'!$C$3:$C$56,"x",'Mahal Listesi'!$K$3:$K$56)`, metraj)).toThrow(ExcelTranslateError);
    expect(() => translateExcelFormula(`SUMIF('Mahal Listesi'!$B$3:$B$56,"x",'Mahal Listesi'!$E$3:$E$56)`, metraj)).toThrow(ExcelTranslateError);
  });
});
