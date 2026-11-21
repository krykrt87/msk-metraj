import { describe, expect, it } from 'vitest';
import { DISCIPLINE, FIREBASE_PROJECT_ID, PROJECT_ID, REGION } from './constants';

describe('sabitler', () => {
  it('proje ve disiplin kimlikleri tasarımla aynı', () => {
    expect(PROJECT_ID).toBe('msk-4199');
    expect(DISCIPLINE).toBe('A');
  });
  it('yalnız emülatör projesi ve Avrupa bölgesi', () => {
    expect(FIREBASE_PROJECT_ID).toBe('demo-msk');
    expect(REGION).toBe('europe-west1');
  });
});
