import { LOCK_WARNING_LABEL, STATUS_LABEL, type Item } from '@shared/types';

const GLYPH: Record<Item['status'], string> = {
  kontrol_edilmedi: '○',
  kontrol_edildi: '✓',
  duzeltildi: '✎',
  sorunlu: '!',
  yeniden_kontrol: '↻',
  kesinlesti: '■',
};

export function statusText(i: Pick<Item, 'status' | 'lockWarning'>): string {
  return i.lockWarning ? LOCK_WARNING_LABEL[i.lockWarning] : STATUS_LABEL[i.status];
}

export function StatusIcon({ item, withLabel = false }: { item: Pick<Item, 'status' | 'lockWarning'>; withLabel?: boolean }) {
  const text = statusText(item);
  return (
    <span className={`status st-${item.status}${item.lockWarning ? ' st-warn' : ''}`} title={text}>
      <span className="glyph" aria-hidden="true">
        {GLYPH[item.status]}
        {item.lockWarning ? '!' : ''}
      </span>
      {withLabel ? <span className="st-label">{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  );
}
