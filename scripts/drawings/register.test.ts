import { describe, expect, it } from 'vitest';
import { parseRegister } from './register';

const head = (t: string) => [null, t, t, t, t, t];
const row = (title: string, code: string, scale = '1/100', paper = 'A1') => [null, null, title, code, scale, paper, null, 'X'];

describe('parseRegister', () => {
  it('seri başlıklarını ve pafta satırlarını okur, zonu koddan çıkarır', () => {
    const rows = [
      [null, 'DRAWING DESCRIPTION', 'DRAWING DESCRIPTION', 'Drawing No ', 'Scale', 'Paper Size'],
      head('01 VAZIYET PLANI'),
      row('VAZIYET PLANI Zone 1', '4199-A-DD-01-01-100', '1/200'),
      [],
      head('02 KAT PLANLARI'),
      row('ÇATI PLANI  Zone 3', '4199-A-DD-03-02-300'),
      head('09 SİSTEM DETAYLARI'),
      [null, null, { richText: [{ text: 'CEPHE SISTEM ' }, { text: 'DETAYI 1' }] }, '4199-A-DD-00-09-100', '1/20', 'A1+'],
    ];
    expect(parseRegister(rows)).toEqual([
      { code: '4199-A-DD-01-01-100', title: 'VAZIYET PLANI Zone 1', series: '01', seriesTitle: 'VAZIYET PLANI', zone: '01', scale: '1/200', paper: 'A1' },
      { code: '4199-A-DD-03-02-300', title: 'ÇATI PLANI Zone 3', series: '02', seriesTitle: 'KAT PLANLARI', zone: '03', scale: '1/100', paper: 'A1' },
      { code: '4199-A-DD-00-09-100', title: 'CEPHE SISTEM DETAYI 1', series: '09', seriesTitle: 'SİSTEM DETAYLARI', zone: '00', scale: '1/20', paper: 'A1+' },
    ]);
  });
  it('kodun serisi başlıkla uyuşmazsa ya da kod tekrarlanırsa hata verir', () => {
    expect(() => parseRegister([head('01 VAZIYET PLANI'), row('x', '4199-A-DD-01-02-100')])).toThrow(/seri başlığı \(02\)/);
    expect(() => parseRegister([head('01 VAZIYET PLANI'), row('x', '4199-A-DD-01-01-100'), row('y', '4199-A-DD-01-01-100')])).toThrow(/iki kez/);
  });
});
