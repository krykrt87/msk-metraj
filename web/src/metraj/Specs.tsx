import { useState, type FormEvent } from 'react';
import type { Item, Spec } from '@shared/types';

type Submit = (input: { itemId: string; specs: Spec[]; reason?: string }) => Promise<unknown>;

/** Malzeme özellikleri: siparişte belirtilmesi gereken teknik özellikler. Boş değer = projede yok, tanımlanmalı. */
export function Specs({ item, editable, submit }: { item: Item; editable: boolean; submit: Submit }) {
  const specs = item.specs ?? [];
  const [draft, setDraft] = useState<Spec[] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (draft) {
    const set = (i: number, patch: Partial<Spec>) => setDraft(draft.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    const ready = !busy && draft.every((r) => r.label.trim());
    async function onSubmit(e: FormEvent) {
      e.preventDefault();
      if (!ready || !draft) return;
      setBusy(true);
      setError(null);
      try {
        const clean = draft.map((r) => ({ label: r.label.trim(), value: r.value?.trim() || null, ...(r.source?.trim() ? { source: r.source.trim() } : {}) }));
        await submit({ itemId: item.id, specs: clean, reason: reason.trim() || undefined });
        setDraft(null);
        setReason('');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }
    return (
      <form className="action-form" onSubmit={onSubmit}>
        <table className="data specs">
          <thead>
            <tr>
              <th>Özellik</th>
              <th>Değer</th>
              <th>Kaynak</th>
              <th aria-label="Sil" />
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => (
              <tr key={i}>
                <td>
                  <input aria-label="Özellik" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
                </td>
                <td>
                  <input aria-label={`${r.label || 'Özellik'} değeri`} value={r.value ?? ''} placeholder="Tanımlanmalı" onChange={(e) => set(i, { value: e.target.value })} />
                </td>
                <td>
                  <input aria-label={`${r.label || 'Özellik'} kaynağı`} value={r.source ?? ''} onChange={(e) => set(i, { source: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="btn ghost" title="Satırı sil" onClick={() => setDraft(draft.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={() => setDraft([...draft, { label: '', value: null }])}>
            Özellik ekle
          </button>
        </div>
        <label>
          Gerekçe (isteğe bağlı)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ör. üretici föyü, mimar onayı" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={!ready}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setDraft(null)} disabled={busy}>
            Vazgeç
          </button>
        </div>
      </form>
    );
  }

  const missing = specs.filter((s) => !s.value).length;
  return (
    <div className="specs-view">
      {specs.length === 0 ? (
        <p className="hint">Bu kalem için malzeme özelliği tanımlı değil.</p>
      ) : (
        <>
          {missing > 0 && (
            <p className="note warn">
              {specs.length} özellikten {missing} tanesi projede yok; siparişten önce tanımlanmalı.
            </p>
          )}
          <table className="data specs">
            <thead>
              <tr>
                <th>Özellik</th>
                <th>Değer</th>
                <th>Kaynak</th>
              </tr>
            </thead>
            <tbody>
              {specs.map((s, i) => (
                <tr key={i}>
                  <td>{s.label}</td>
                  <td>{s.value ?? <span className="spec-missing">Tanımlanmalı</span>}</td>
                  <td className="spec-source">{s.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {editable && (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setDraft(specs.map((s) => ({ ...s })))}>
            Özellikleri düzenle
          </button>
        </div>
      )}
    </div>
  );
}
