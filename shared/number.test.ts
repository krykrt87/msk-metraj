import { describe, expect, it } from 'vitest';
import { formatTr, NumberParseError, parseTrNumber } from './number';
import { LOCK_WARNING_LABEL, ROLE_LABEL, STATUS_LABEL } from './types';

describe('formatTr', () => {
  it('Türkçe binlik ve 2 ondalık', () => {
    expect(formatTr(2847.7, 'm²')).toBe('2.847,70');
    expect(formatTr(6432.96, 'm²')).toBe('6.432,96');
    expect(formatTr(5.5, 'm')).toBe('5,50');
  });
  it('adet birimi ondalıksız', () => {
    expect(formatTr(78, 'adet')).toBe('78');
  });
  it('boş değer tire', () => {
    expect(formatTr(null)).toBe('—');
  });
});

describe('parseTrNumber', () => {
  it('Türkçe yazımları okur', () => {
    expect(parseTrNumber('1.234,56')).toBe(1234.56);
    expect(parseTrNumber('1234,5')).toBe(1234.5);
    expect(parseTrNumber('1.234')).toBe(1234);
    expect(parseTrNumber('12')).toBe(12);
    expect(parseTrNumber(' 2.847,70 ')).toBe(2847.7);
  });
  it('noktalı ondalığı belirsiz sayıp reddeder', () => {
    expect(() => parseTrNumber('2847.7')).toThrow(NumberParseError);
    expect(() => parseTrNumber('2847.7')).toThrow(/Ondalık için virgül kullanın/);
  });
  it('geçersiz girdileri reddeder', () => {
    for (const bad of ['1,2,3', 'abc', '', '   ', '1.23.4,5']) {
      expect(() => parseTrNumber(bad), bad).toThrow(NumberParseError);
    }
  });
});

describe('etiketler', () => {
  it('durum, rol ve uyarı metinleri tasarımla aynı', () => {
    expect(STATUS_LABEL).toEqual({
      kontrol_edilmedi: 'Kontrol edilmedi',
      kontrol_edildi: 'Kontrol edildi',
      duzeltildi: 'Düzeltildi',
      sorunlu: 'Sorunlu',
      yeniden_kontrol: 'Yeniden kontrol gerekli',
      kesinlesti: 'Kesinleşti',
    });
    expect(ROLE_LABEL).toEqual({ admin: 'Yönetici', kontrolcu: 'Kontrolcü', satinalma: 'Satın alma' });
    expect(LOCK_WARNING_LABEL).toEqual({
      ust_kalem: 'Kesinleşti – üst kalem değişti',
      pafta_revizyonu: 'Kesinleşti – pafta revize edildi',
    });
  });
});
