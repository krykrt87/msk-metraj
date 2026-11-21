import type { Confidence, Item, Status } from '@shared/types';

export interface ItemFilter {
  text?: string;
  group?: string;
  confidence?: Exclude<Confidence, null>;
  status?: Status | 'uyarili';
  drawing?: string;
  unmeasurable?: boolean;
  showCancelled?: boolean;
}

const up = (s: string) => s.toLocaleUpperCase('tr');

export const isUnmeasurable = (i: Item) => i.kind === 'measured' && i.value === null && !i.cancelled;

export function filterItems(items: Item[], f: ItemFilter): Item[] {
  const q = f.text?.trim() ? up(f.text.trim()) : null;
  return items.filter((i) => {
    if (i.cancelled && !f.showCancelled) return false;
    if (q && ![i.poz, i.name, i.code ?? ''].some((s) => up(s).includes(q))) return false;
    if (f.group && i.group !== f.group) return false;
    if (f.confidence && i.confidence !== f.confidence) return false;
    if (f.status === 'uyarili' ? !i.lockWarning : f.status && i.status !== f.status) return false;
    if (f.drawing && !i.drawings.includes(f.drawing)) return false;
    if (f.unmeasurable && !isUnmeasurable(i)) return false;
    return true;
  });
}
