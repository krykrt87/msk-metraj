import { describe, expect, it, vi } from 'vitest';

const sent = vi.fn((_: unknown) => Promise.resolve({ data: {} }));
vi.mock('../firebase', () => ({ functions: {} }));
vi.mock('../local', () => ({ LOCAL: false, LOCAL_READONLY: '' }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => sent }));
const { api, apiErrorMessage } = await import('./api');

describe('call', () => {
  it('boş bırakılan isteğe bağlı alanı göndermez (Firebase onu null yapar, şema reddeder)', async () => {
    await api.updateItemInfo({ itemId: 'B.2.1', specs: [{ label: 'Tip', value: null }], reason: undefined });
    expect(sent.mock.calls[0][0]).not.toHaveProperty('reason');
    expect(sent.mock.calls[0][0]).toMatchObject({ itemId: 'B.2.1', specs: [{ label: 'Tip', value: null }] });
  });
});

describe('apiErrorMessage', () => {
  it('sunucu mesajındaki HTTP durum ekini atar', () => {
    expect(apiErrorMessage({ code: 'functions/invalid-argument', message: 'Gerekçe zorunludur. [400]' })).toBe('Gerekçe zorunludur.');
  });
  it('bağlantı hatasında yol gösterir', () => {
    expect(apiErrorMessage({ code: 'functions/unavailable', message: 'x' })).toBe('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    expect(apiErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
  });
});
