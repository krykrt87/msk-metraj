import { Fragment } from 'react';
import { formatTr } from '@shared/number';
import { partName, partRule, partTitle, unitOf } from '@shared/calc';
import type { CalcRow, Item } from '@shared/types';

export { partName };

const n3 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const f3 = (v: number | undefined) => (v === undefined || v === null ? '' : n3.format(v));
type Col = { key: string; head: string; cell: (r: CalcRow) => string };
const COLS: Col[] = [
  { key: 'en', head: 'En / kalınlık (m)', cell: (r) => (r.kind === 'daire parçası' || r.kind === 'yay' ? '' : f3(r.en)) },
  { key: 'boy', head: 'Boy / uzunluk (m)', cell: (r) => f3(r.boy) },
  { key: 'a', head: 'Kenar a (m)', cell: (r) => (r.kind === 'yamuk' ? f3(r.a) : '') },
  { key: 'b', head: 'Kenar b (m)', cell: (r) => (r.kind === 'yamuk' ? f3(r.b) : '') },
  { key: 'r', head: 'r (m)', cell: (r) => f3(r.r) },
  { key: 'angle', head: 'Açı (°)', cell: (r) => f3(r.angle) },
];

/** Excel cetveli gibi: her değer kendi sütununda; parça satırları her satırın altında. */
export function Breakdown({ item }: { item: Item }) {
  const lines = item.breakdown ?? [];
  const parts = lines.flatMap((l) => l.calc ?? []);
  const hasParts = parts.length > 0;
  const cols = COLS.filter((c) => parts.some((r) => c.cell(r) !== ''));
  const nCols = 4 + (hasParts ? 1 + cols.length : 0);

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
                {cols.map((c) => (
                  <th key={c.key} className="num">
                    {c.head}
                  </th>
                ))}
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
                    {cols.map((c) => (
                      <td key={c.key} />
                    ))}
                    <td className="num">{formatTr(l.value, l.unit)}</td>
                    <td>{l.unit}</td>
                    <td className="note">{l.note ?? ''}</td>
                  </tr>
                  {(l.calc ?? []).map((r, k) => (
                    <tr key={k} className={`part${r.sign < 0 ? ' minus' : ''}`}>
                      <td className="part-name">
                        {r.sign < 0 ? '(−) ' : ''}
                        {partTitle(r)}
                      </td>
                      <td className="num">{r.adet}</td>
                      {cols.map((c) => (
                        <td key={c.key} className="num">
                          {c.cell(r)}
                        </td>
                      ))}
                      <td className="num">{formatTr(r.value)}</td>
                      <td>{unitOf(r)}</td>
                      <td className="note">{partRule(r)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="total">
                <td colSpan={nCols - 3}>Toplam</td>
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
