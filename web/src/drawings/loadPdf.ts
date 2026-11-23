import { getBytes, ref } from 'firebase/storage';
import { storage } from '../firebase';

const MAX = 6;
const cache = new Map<string, Promise<ArrayBuffer>>();

/** Pafta PDF'i: kurallardan geçen getBytes (token'lı adres yok); son 6 pafta bellekte. */
export function loadDrawingPdf(storagePath: string): Promise<ArrayBuffer> {
  const hit = cache.get(storagePath);
  if (hit) {
    cache.delete(storagePath);
    cache.set(storagePath, hit); // en yeni sona
    return hit;
  }
  const p = getBytes(ref(storage, storagePath));
  p.catch(() => cache.delete(storagePath));
  cache.set(storagePath, p);
  while (cache.size > MAX) cache.delete(cache.keys().next().value!);
  return p;
}
