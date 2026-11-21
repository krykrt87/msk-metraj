import { Fragment } from 'react';
import { formatTr } from '@shared/number';
import type { CalcRow, Item } from '@shared/types';

const n3 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const f3 = (v: number | undefined) => (v === undefined || v === null ? '' : n3.format(v));

export function partName(r: CalcRow): string {
  if (r.kind === 'dikdörtgen') return 'Dikdörtgen';
  if (r.kind === 'yamuk') return r.a === 0 || r.b === 0 ? 'Üçgen' : 'Yamuk';
  return 'Daire parçası';
}
const partRule = (r: CalcRow) =>
  r.kind === 'dikdörtgen' ? 'en × boy' : r.kind === 'yamuk' ? (r.a === 0 || r.b === 0 ? 'taban × yükseklik / 2' : '(a + b) / 2 × boy') : 'r²/2 × (θ − sin θ)';

/** Excel cetveli gibi: her değer kendi sütununda; parça satırları her satırın altında. */
export function Breakdown({ item }: { item: Item }) {
  const lines = item.breakdown ?? [];
  const parts = lines.flatMap((l) => l.calc ?? []);
  const hasParts = parts.length > 0;
  const hasTrap = parts.some((r) => r.kind === 'yamuk');
  const hasArc = parts.some((r) => r.kind === 'daire parçası');
  const cols = 4 + (hasParts ? 3 : 0) + (hasTrap ? 2 : 0) + (hasArc ? 2 : 0);

  return (
    <div className="breakdown">
      {item.sources && item.sources.length > 0 && (
        <div className="bd-sources">
          <h3>Kaynak</h3>
          <ul>
            {item.sources.map((s, i) => (
              <li key={i}>
                <span className="mono">{s.drawing}</span> · {s.where}
              </li>
            ))}
          </ul>
        </div>
      )}
      {lines.length > 0 ? (
        <div className="cetvel-wrap">
          <table className="cetvel">
            <thead>
              <tr>
                <th>Açıklama</th>
                {hasParts && <th className="num">Adet</th>}
                {hasParts && <th className="num">En (m)</th>}
                {hasParts && <th className="num">Boy (m)</th>}
                {hasTrap && <th className="num">Kenar a (m)</th>}
                {hasTrap && <th className="num">Kenar b (m)</th>}
                {hasArc && <th className="num">r (m)</th>}
                {hasArc && <th className="num">Açı (°)</th>}
                <th className="num">Miktar</th>
                <th>Birim</th>
                <th>Hesap / not</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <Fragment key={i}>
                  <tr className={l.calc?.length ? 'line has-parts' : 'line'}>
                    <td>{l.label}</td>
                    {hasParts && <td />}
                    {hasParts && <td />}
                    {hasParts && <td />}
                    {hasTrap && <td />}
                    {hasTrap && <td />}
                    {hasArc && <td />}
                    {hasArc && <td />}
                    <td className="num">{formatTr(l.value, l.unit)}</td>
                    <td>{l.unit}</td>
                    <td className="note">{l.note ?? ''}</td>
                  </tr>
                  {(l.calc ?? []).map((r, k) => (
                    <tr key={k} className={`part${r.sign < 0 ? ' minus' : ''}`}>
                      <td className="part-name">
                        {r.sign < 0 ? '(−) ' : ''}
                        {partName(r)}
                      </td>
                      <td className="num">{r.adet}</td>
                      <td className="num">{r.kind === 'daire parçası' ? '' : f3(r.en)}</td>
                      <td className="num">{f3(r.boy)}</td>
                      {hasTrap && <td className="num">{r.kind === 'yamuk' ? f3(r.a) : ''}</td>}
                      {hasTrap && <td className="num">{r.kind === 'yamuk' ? f3(r.b) : ''}</td>}
                      {hasArc && <td className="num">{f3(r.r)}</td>}
                      {hasArc && <td className="num">{f3(r.angle)}</td>}
                      <td className="num">{formatTr(r.value)}</td>
                      <td>m²</td>
                      <td className="note">{partRule(r)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="total">
                <td colSpan={cols - 3}>Toplam</td>
                <td className="num">{formatTr(item.value, item.unit)}</td>
                <td>{item.unit}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">{item.formula ? `Bu kalem formülle hesaplanır: ${item.formula}` : 'Satır dökümü yok.'}</p>
      )}
      {item.notes && item.notes.length > 0 && (
        <div className="bd-notes">
          <h3>Notlar</h3>
          <ul>
            {item.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
