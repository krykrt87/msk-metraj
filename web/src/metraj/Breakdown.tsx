import { Fragment, useState } from 'react';
import { formatTr } from '@shared/number';
import type { CalcRow, Item } from '@shared/types';

const f3 = (v: number | undefined) =>
  v === undefined ? '' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);

/** Cetvel: her parça için adet × en × boy = miktar (yamukta (a + b) / 2, daire parçasında r ve açı). */
function CalcTable({ rows }: { rows: CalcRow[] }) {
  return (
    <table className="calc-table">
      <thead>
        <tr>
          <th>Parça</th>
          <th className="num">Adet</th>
          <th className="num">En (m)</th>
          <th className="num">Boy (m)</th>
          <th className="num">Miktar</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.sign < 0 ? 'minus' : undefined}>
            <td>
              {r.sign < 0 ? '(−) ' : ''}
              {r.kind === 'dikdörtgen' ? 'Dikdörtgen' : r.kind === 'yamuk' ? `Yamuk (${f3(r.a)} + ${f3(r.b)}) / 2` : `Daire parçası r = ${f3(r.r)} m, açı ${f3(r.angle)}°`}
            </td>
            <td className="num">{r.adet}</td>
            <td className="num">{f3(r.en)}</td>
            <td className="num">{f3(r.boy)}</td>
            <td className="num">{formatTr(r.value)}</td>
          </tr>
        ))}
        <tr className="total">
          <td colSpan={4}>Toplam</td>
          <td className="num">{formatTr(rows.reduce((s, r) => s + r.value, 0))}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Miktarın nereden ve nasıl hesaplandığı: kaynaklar, satır satır döküm (açılır cetvel), notlar. */
export function Breakdown({ item }: { item: Item }) {
  const lines = item.breakdown ?? [];
  const [open, setOpen] = useState<Set<number>>(() => new Set(lines.length === 1 && lines[0].calc ? [0] : []));
  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
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
              <Fragment key={i}>
                <tr className={l.calc ? 'expandable' : undefined} onClick={l.calc ? () => toggle(i) : undefined}>
                  <td>
                    {l.calc && (
                      <span className="caret" aria-hidden="true">
                        {open.has(i) ? '▾ ' : '▸ '}
                      </span>
                    )}
                    {l.label}
                  </td>
                  <td className="num">
                    {formatTr(l.value, l.unit)} {l.unit}
                  </td>
                  <td className="bd-note">{l.note ?? ''}</td>
                </tr>
                {l.calc && open.has(i) && (
                  <tr className="calc-row">
                    <td colSpan={3}>
                      <CalcTable rows={l.calc} />
                    </td>
                  </tr>
                )}
              </Fragment>
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
      {lines.some((l) => l.calc) && <p className="hint">Satırın yanındaki ▸ işaretine tıklayınca adet × en × boy dökümü açılır.</p>}
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
