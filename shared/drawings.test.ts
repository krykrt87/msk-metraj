import { describe, expect, it } from 'vitest';
import { expandDrawingRefs } from './drawings';

// Drawing Register (DD_KESİN PROJE) – 40 pafta
const KNOWN = [
  ...['01', '02', '03', '04'].map((z) => `4199-A-DD-${z}-01-100`),
  ...['100', '200', '300'].flatMap((n) => ['01', '02', '03', '04'].map((z) => `4199-A-DD-${z}-02-${n}`)),
  ...['100', '200'].flatMap((n) => ['01', '02'].map((z) => `4199-A-DD-${z}-03-${n}`)),
  ...['100', '200', '300', '400'].flatMap((n) => ['01', '02'].map((z) => `4199-A-DD-${z}-04-${n}`)),
  ...['100', '200'].flatMap((n) => ['01', '02', '03', '04'].map((z) => `4199-A-DD-${z}-05-${n}`)),
  '4199-A-DD-00-09-100',
  '4199-A-DD-01-09-101',
  '4199-A-DD-02-09-101',
  '4199-A-DD-00-09-102',
];
const short = (codes: string[]) => codes.map((c) => c.replace('4199-A-DD-', ''));

describe('expandDrawingRefs', () => {
  it('pafta listesi 40 pafta', () => {
    expect(KNOWN).toHaveLength(40);
  });
  it('zone aralığı', () => {
    expect(short(expandDrawingRefs('01…04-02-100', KNOWN).codes)).toEqual(['01-02-100', '02-02-100', '03-02-100', '04-02-100']);
  });
  it('aralık + tekil pafta', () => {
    const r = expandDrawingRefs('01…04-02-300, 04-01-100', KNOWN);
    expect(r.codes).toHaveLength(5);
    expect(short(r.codes)).toContain('04-01-100');
  });
  it('zone listesi × numara aralığı', () => {
    expect(expandDrawingRefs('01/02-04-100…400', KNOWN).codes).toHaveLength(8);
  });
  it('numara listesi', () => {
    expect(short(expandDrawingRefs('02-03-100/200', KNOWN).codes)).toEqual(['02-03-100', '02-03-200']);
  });
  it('zonsuz yazım tüm zonları kapsar', () => {
    expect(expandDrawingRefs('05-100, 05-200', KNOWN).codes).toHaveLength(8);
  });
  it('xxx serideki tüm numaralar', () => {
    expect(expandDrawingRefs('01/02-04-xxx', KNOWN).codes).toHaveLength(8);
  });
  it('Görünüşler tüm 04 serisi', () => {
    expect(expandDrawingRefs('Görünüşler, 00-09-100', KNOWN).codes).toHaveLength(9);
  });
  it('pafta olmayan metin çözülemedi olarak döner', () => {
    expect(expandDrawingRefs('Genel not 10', KNOWN)).toEqual({ codes: [], unresolved: ['Genel not 10'] });
    expect(expandDrawingRefs('07-02-100', KNOWN)).toEqual({ codes: [], unresolved: ['07-02-100'] });
  });
  it('boş metin', () => {
    expect(expandDrawingRefs('', KNOWN)).toEqual({ codes: [], unresolved: [] });
  });
});
