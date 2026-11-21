import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ functions: {} }));
const { apiErrorMessage } = await import('./api');

describe('apiErrorMessage', () => {
  it('sunucu mesajındaki HTTP durum ekini atar', () => {
    expect(apiErrorMessage({ code: 'functions/invalid-argument', message: 'Gerekçe zorunludur. [400]' })).toBe('Gerekçe zorunludur.');
  });
  it('bağlantı hatasında yol gösterir', () => {
    expect(apiErrorMessage({ code: 'functions/unavailable', message: 'x' })).toBe('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    expect(apiErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
  });
});
