import { useState, type FormEvent } from 'react';
import { formatTr, parseTrNumber } from '@shared/number';
import type { Item } from '@shared/types';

type Submit = (input: { itemId: string; value: number; reason: string }) => Promise<unknown>;

/** Miktar düzeltme. Hata olursa girilenler korunur. */
export function CorrectionForm({ item, submit, onDone }: { item: Item; submit: Submit; onDone?: () => void }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  let parsed: number | null = null;
  let parseError: string | null = null;
  if (text.trim()) {
    try {
      parsed = parseTrNumber(text);
      if (parsed < 0) parseError = 'Miktar negatif olamaz.';
    } catch (e) {
      parseError = (e as Error).message;
    }
  }
  const ready = parsed !== null && !parseError && reason.trim().length > 0 && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready || parsed === null) return;
    setBusy(true);
    setError(null);
    try {
      await submit({ itemId: item.id, value: parsed, reason: reason.trim() });
      setText('');
      setReason('');
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="action-form" onSubmit={onSubmit}>
      {item.kind === 'derived' && (
        <p className="note warn">Formül bağı kopacak: kalem ölçülen değere döner ve {item.formula} formülü artık uygulanmaz.</p>
      )}
      <label>
        Yeni miktar
        <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder={formatTr(item.value, item.unit)} />
      </label>
      {parseError && <p className="field-error">{parseError}</p>}
      <label>
        Gerekçe
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nereden, nasıl ölçüldü?" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn redline" disabled={!ready}>
        {busy ? 'Kaydediliyor…' : 'Düzeltmeyi kaydet'}
      </button>
    </form>
  );
}
