import { describe, expect, it } from 'vitest';
import { initAdmin, prodProjectId } from './admin';

describe('canlı ortam ayarı', () => {
  it('.firebaserc "prod" takma adını okur', () => {
    expect(prodProjectId('{"projects":{"default":"demo-msk","prod":"msk-metraj"}}')).toBe('msk-metraj');
  });
  it('"prod" yoksa açık hata verir', () => {
    expect(() => prodProjectId('{"projects":{"default":"demo-msk"}}')).toThrow(/"prod" projesi tanımlı değil/);
  });
  it('--prod hizmet hesabı anahtarı olmadan çalışmaz', () => {
    const saved = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
      expect(() => initAdmin(['--prod'])).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = saved;
    }
  });
});
