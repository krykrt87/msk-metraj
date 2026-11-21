import { formatTr } from '@shared/number';
import { ACTION_LABEL, LOCK_WARNING_LABEL, STATUS_LABEL, type HistoryEntry, type LockWarning, type Status } from '@shared/types';
import { formatDateTime } from '../data/types';

const FIELD_LABEL: Record<string, string> = {
  value: 'Miktar',
  formula: 'Formül',
  kind: 'Tür',
  status: 'Durum',
  lockWarning: 'Kilit uyarısı',
  confidence: 'Güven',
  name: 'Ad',
  code: 'Proje kodu',
  unit: 'Birim',
  method: 'Hesap yöntemi',
  drawings: 'Paftalar',
  cancelled: 'İptal',
  area: 'Alan',
  '': 'Kayıt',
};

const CAUSE_NOUN: Record<string, string> = {
  correct: 'düzeltmesi',
  formula: 'formül değişikliği',
  room: 'mahal değişikliği',
  facade: 'cephe değişikliği',
  material: 'malzeme formülü',
  revision: 'pafta revizyonu',
  create: 'eklenmesi',
  cancel: 'iptali',
  status: 'durum değişikliği',
};

function show(field: string, v: unknown, unit?: string): string {
  if (v === null || v === undefined) return '—';
  if (field === 'value' || field === 'area' || field.startsWith('values.')) return typeof v === 'number' ? formatTr(v, unit) : String(v);
  if (field === 'status') return STATUS_LABEL[v as Status] ?? String(v);
  if (field === 'lockWarning') return LOCK_WARNING_LABEL[v as Exclude<LockWarning, null>] ?? String(v);
  if (field === 'kind') return v === 'derived' ? 'Türetilen' : 'Ölçülen';
  if (field === 'cancelled') return v ? 'Evet' : 'Hayır';
  if (Array.isArray(v)) return v.map((c) => String(c).replace(/^4199-A-DD-/, '')).join(', ') || '—';
  if (typeof v === 'object') return 'yeni kayıt';
  return String(v);
}

export function historyTitle(e: HistoryEntry): string {
  if (e.action === 'cascade' && e.cause) return `Bağlı değişiklik – ${e.cause.id} ${CAUSE_NOUN[e.cause.action] ?? ACTION_LABEL[e.cause.action]}`;
  return ACTION_LABEL[e.action];
}

export function HistoryList({ entries, unit }: { entries: (HistoryEntry & { id: string })[]; unit?: string }) {
  if (entries.length === 0) return <p className="hint">Henüz değişiklik yok.</p>;
  return (
    <ol className="history">
      {entries.map((e) => (
        <li key={e.id} className={e.action === 'cascade' ? 'cascade' : undefined}>
          <div className="h-head">
            <span className="h-title">{historyTitle(e)}</span>
            <span className="h-meta">
              {e.by.name}, {formatDateTime(e.at)}
            </span>
          </div>
          <div className="h-change">
            <span className="h-field">{FIELD_LABEL[e.field] ?? e.field}</span>
            <span>
              {show(e.field, e.before, unit)} → {show(e.field, e.after, unit)}
            </span>
          </div>
          {e.reason && <p className="h-reason">{e.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
