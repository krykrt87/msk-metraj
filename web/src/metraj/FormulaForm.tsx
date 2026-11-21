import { useState, type FormEvent } from 'react';
import { evaluate } from '@shared/formula/evaluate';
import { parseFormula } from '@shared/formula/parse';
import { formatTr } from '@shared/number';
import type { FacadeRow, Item, Room } from '@shared/types';

type Submit = (input: { itemId: string; formula: string; reason: string }) => Promise<unknown>;

export function FormulaForm({
  item,
  values,
  rooms,
  facade,
  submit,
  onDone,
}: {
  item: Item;
  values: Record<string, number | null>;
  rooms: Room[];
  facade: FacadeRow[];
  submit: Submit;
  onDone?: () => void;
}) {
  const [formula, setFormula] = useState(item.formula ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  let preview: number | null = null;
  let formulaError: string | null = null;
  try {
    preview = evaluate(parseFormula(formula), { item: (id) => (id in values ? values[id] : undefined), rooms, facade });
  } catch (e) {
    formulaError = (e as Error).message;
  }
  const ready = !formulaError && reason.trim().length > 0 && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await submit({ itemId: item.id, formula: formula.trim(), reason: reason.trim() });
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
      <label>
        Formül
        <input value={formula} onChange={(e) => setFormula(e.target.value)} spellCheck={false} placeholder="ör. B.1 * 2" />
      </label>
      {formulaError ? <p className="field-error">{formulaError}</p> : <p className="hint">Önizleme: {formatTr(preview, item.unit)} {item.unit}</p>}
      <p className="hint">Kalemler poz ile (B.1), ondalık virgülle (2,5). Mahal toplamı: MAHAL(kat; "Zemin Kat"). Cephe: CEPHE("FM-01").</p>
      <label>
        Gerekçe
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn redline" disabled={!ready}>
        {busy ? 'Kaydediliyor…' : 'Formülü kaydet'}
      </button>
    </form>
  );
}
