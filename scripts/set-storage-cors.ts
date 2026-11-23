// Canlı Storage alanına CORS ayarı (storage-cors.json) yazar: tarayıcı getBytes ile model/pafta indirebilsin.
// Bir kerelik; alan değişirse tekrar çalıştırılır. Emülatör CORS istemez.
// Kullanım: $env:GOOGLE_APPLICATION_CREDENTIALS = "<anahtar>"; npx tsx scripts/set-storage-cors.ts --prod
import { readFileSync } from 'node:fs';
import { initAdmin } from './lib/admin';

if (!process.argv.includes('--prod')) {
  console.error('Yalnız canlı ortam için: --prod');
  process.exit(2);
}
const { bucket } = initAdmin(process.argv);
const cors = JSON.parse(readFileSync(new URL('../storage-cors.json', import.meta.url), 'utf8'));
await bucket.setCorsConfiguration(cors);
const [meta] = await bucket.getMetadata();
console.log(`CORS yazıldı (${bucket.name}):`, JSON.stringify(meta.cors));
