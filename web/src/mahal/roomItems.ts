import type { Item } from '@shared/types';

export interface RoomItem {
  id: string;
  poz: string;
  name: string;
  code: string | null;
  unit: string;
  total: number;
}

/**
 * Mahalde kullanılan kalemler: döküm satırı etiketinde mahal anahtarı geçenlerin (kalem + birim) toplamı.
 * Anahtar mahal kodudur; kod birden çok mahalde ortaksa (paftada GF-36 üç mahalde) "kod ad" verilir.
 * A grubu (mahal alanları) malzeme değil, atlanır.
 * shortcut: eksi satırlar (ör. "− GF-01 üstü" baffle düşümü) atlanır, çünkü düşüm etikette geçen mahale değil komşu brüt alana aittir;
 * mahal başına net gerekirse döküm satırına mahal kodu alanı eklenmeli.
 */
export function roomItems(items: Item[], roomKey: string): RoomItem[] {
  const re = new RegExp(`(^|[^\\w-])${roomKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  const out = new Map<string, RoomItem>();
  for (const it of items) {
    if (it.cancelled || it.group === 'A') continue;
    for (const b of it.breakdown ?? []) {
      if (b.value == null || b.value <= 0 || !re.test(b.label)) continue;
      const key = `${it.poz}|${b.unit}`;
      const r = out.get(key) ?? out.set(key, { id: it.id, poz: it.poz, name: it.name, code: it.code, unit: b.unit, total: 0 }).get(key)!;
      r.total += b.value;
    }
  }
  return [...out.values()];
}
