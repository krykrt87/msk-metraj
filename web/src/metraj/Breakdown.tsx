import { formatTr } from '@shared/number';
import type { Item } from '@shared/types';

/** Miktarın nereden ve nasıl hesaplandığı: kaynaklar, satır satır döküm, notlar. */
export function Breakdown({ item }: { item: Item }) {
  const lines = item.breakdown ?? [];
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
        <table className="data bd-table">
          <thead>
            <tr>
              <th>Satır</th>
              <th className="num">Değer</th>
              <th>Açıklama</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="num">
                  {formatTr(l.value, l.unit)} {l.unit}
                </td>
                <td className="bd-note">{l.note ?? ''}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Toplam</td>
              <td className="num">
                {formatTr(item.value, item.unit)} {item.unit}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
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
