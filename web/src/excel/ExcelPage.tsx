import { useState } from 'react';
import { useFindings, useItems, useRooms } from '../data/hooks';
import { buildWorkbook, downloadWorkbook, SHEETS, stamp, type SheetKey } from './workbook';

export function ExcelPage() {
  const items = useItems();
  const rooms = useRooms();
  const findings = useFindings();
  const [picked, setPicked] = useState<SheetKey[]>(SHEETS.map((s) => s.key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = items.error ?? rooms.error ?? findings.error;
  const loading = items.loading || rooms.loading || findings.loading;

  const toggle = (k: SheetKey) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const wb = await buildWorkbook({ items: items.data, rooms: rooms.data, findings: findings.data }, picked);
      await downloadWorkbook(wb, `MSK_Metraj_${stamp()}.xlsx`);
    } catch (e) {
      setError((e as Error).message || 'Excel üretilemedi.');
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <p className="center-note">Veri okunamadı: {failed.message}</p>;
  return (
    <section className="malzeme">
      <h1>Excel çıktısı</h1>
      <p>Güncel veriden tek dosya üretilir. Excel yalnız çıktıdır; düzeltmeler uygulamada yapılır.</p>
      <fieldset>
        <legend>İndirilecek sayfalar</legend>
        {SHEETS.map((s) => (
          <label key={s.key} style={{ display: 'block' }}>
            <input type="checkbox" checked={picked.includes(s.key)} onChange={() => toggle(s.key)} /> <strong>{s.label}</strong>: {s.hint}
          </label>
        ))}
      </fieldset>
      <p>
        <button type="button" className="btn" disabled={loading || busy || picked.length === 0} onClick={download}>
          {busy ? 'Hazırlanıyor…' : loading ? 'Yükleniyor…' : 'Excel indir'}
        </button>
        {picked.length === 0 && <span className="hint"> En az bir sayfa seçin.</span>}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
