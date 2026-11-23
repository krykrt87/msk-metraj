import { useState, type FormEvent } from 'react';
import { can } from '@shared/access';
import type { Item, UserProfile } from '@shared/types';
import type { Api } from '../data/api';

type Pending = { label: string; required: boolean; confirm: string; run: (text: string) => Promise<unknown> };

export function StatusActions({ item, profile, api }: { item: Item; profile: UserProfile; api: Api }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const edit = can(profile, 'edit');
  const admin = can(profile, 'admin');
  const locked = item.status === 'kesinlesti';
  const id = item.id;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPending(null);
      setText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const ask = (p: Pending) => {
    setPending(p);
    setText('');
    setError(null);
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending && (!pending.required || text.trim())) run(() => pending.run(text.trim()));
  }

  if (!edit) return null;
  const buttons: { label: string; onClick: () => void; cls?: string }[] = [];
  if (item.cancelled)
    buttons.push({
      label: 'İptali geri al',
      onClick: () => ask({ label: 'Kalem yeniden geçerli olacak. Gerekçe', required: true, confirm: 'İptali geri al', run: (t) => api.restoreItem({ itemId: id, reason: t }) }),
    });
  else if (!locked) {
    if (item.status !== 'kontrol_edildi') buttons.push({ label: 'Kontrol edildi', onClick: () => run(() => api.setItemStatus({ itemId: id, status: 'kontrol_edildi' })) });
    if (item.status !== 'sorunlu')
      buttons.push({
        label: 'Sorunlu',
        onClick: () => ask({ label: 'Sorun nedir?', required: true, confirm: 'Sorunlu olarak işaretle', run: (t) => api.setItemStatus({ itemId: id, status: 'sorunlu', note: t }) }),
      });
    if (admin && (item.status === 'kontrol_edildi' || item.status === 'duzeltildi') && item.value !== null)
      buttons.push({ label: 'Kesinleştir', cls: 'primary', onClick: () => run(() => api.finalizeItem({ itemId: id })) });
    buttons.push({
      label: 'İptal et',
      cls: 'ghost',
      onClick: () => ask({ label: 'İptal gerekçesi', required: true, confirm: 'Kalemi iptal et', run: (t) => api.cancelItem({ itemId: id, reason: t }) }),
    });
  } else if (admin) {
    if (item.lockWarning)
      buttons.push({
        label: 'Uyarıyı onayla',
        cls: 'primary',
        onClick: () => ask({ label: 'Not (isteğe bağlı)', required: false, confirm: 'Onayla', run: (t) => api.acknowledgeItem({ itemId: id, note: t || undefined }) }),
      });
    buttons.push({
      label: 'Kilidi aç',
      onClick: () => ask({ label: 'Kilidi açma gerekçesi', required: true, confirm: 'Kilidi aç', run: (t) => api.unlockItem({ itemId: id, reason: t }) }),
    });
  }

  return (
    <div className="status-actions">
      <div className="btn-row equal">
        {buttons.map((b) => (
          <button key={b.label} type="button" className={`btn ${b.cls ?? ''}`} disabled={busy} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </div>
      {pending && (
        <form className="action-form" onSubmit={submit}>
          <label>
            {pending.label}
            <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={busy || (pending.required && !text.trim())}>
              {pending.confirm}
            </button>
            <button type="button" className="btn ghost" onClick={() => setPending(null)}>
              Vazgeç
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
