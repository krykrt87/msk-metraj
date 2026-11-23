import { Fragment, useEffect, useRef, type KeyboardEvent } from 'react';
import { formatTr } from '@shared/number';
import { partName, partTitle, unitOf } from '@shared/calc';
import { Collapsible } from '../common/Collapsible';
import type { CalcRow, Item } from '@shared/types';

export { partName };

const n3 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const f3 = (v: number | undefined) => (v === undefined || v === null ? '' : n3.format(v));
const NOTE_LIMIT = 60; // not sütunu dar: uzun notlar kısaltılır, tıklayınca açılır
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
/** focus: 3B'de tıklanan elemanın satırı (satır adı ya da sırası); vurgulanır ve görünür alana kaydırılır. */
export function Breakdown({
  item,
  focus,
  focusRef,
  linked,
  onLineClick,
  onRowClick,
}: {
  item: Item;
  focus?: string | number | null;
  /** Odaktaki 3B elemanın kimliği: kendi elemanını taşıyan (ref) cetvel satırı vurgulanır. */
  focusRef?: string;
  /** 3B modelde karşılığı olan satırların sırası; bunlar tıklanabilir. */
  linked?: Set<number>;
  onLineClick?: (index: number) => void;
  /** Satırı kendi 3B elemanını taşıyan (ref) cetvel satırına tıklanınca. */
  onRowClick?: (line: number, ref: string) => void;
}) {
  const lines = item.breakdown ?? [];
  const focusIdx = focus === null || focus === undefined ? -1 : typeof focus === 'number' ? focus : lines.findIndex((l) => l.label === focus);
  const focusRow = useRef<HTMLTableRowElement>(null);
  const rowFocused = !!focusRef && lines.some((l) => l.calc?.some((r) => r.ref === focusRef));
  useEffect(() => {
    focusRow.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [focusIdx, focusRef, item.id]);
  const parts = lines.flatMap((l) => l.calc ?? []);
  const hasParts = parts.length > 0;
  const cols = COLS.filter((c) => parts.some((r) => c.cell(r) !== ''));

  return (
    <div className="breakdown">
      {lines.length > 0 ? (
        <div className="cetvel-wrap">
          <table className="cetvel">
            <thead>
              <tr>
                <th>Açıklama</th>
                <th>Birim</th>
                {hasParts && <th className="num">Adet</th>}
                {cols.map((c) => (
                  <th key={c.key} className="num">
                    {c.head}
                  </th>
                ))}
                <th className="num">Miktar</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <Fragment key={i}>
                  <tr
                    className={`${l.calc?.length ? 'line has-parts' : 'line'}${i === focusIdx && !rowFocused ? ' focus' : ''}${linked?.has(i) ? ' linked' : ''}`}
                    ref={i === focusIdx && !rowFocused ? focusRow : undefined}
                    aria-current={i === focusIdx && !rowFocused ? 'true' : undefined}
                    {...(linked?.has(i) && onLineClick
                      ? {
                          tabIndex: 0,
                          title: '3B modelde göster',
                          onClick: () => onLineClick(i),
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onLineClick(i);
                            }
                          },
                        }
                      : {})}
                  >
                    <td>
                      {linked?.has(i) && (
                        <span className="m3-mark" aria-hidden="true">
                          ◆{' '}
                        </span>
                      )}
                      {l.label}
                    </td>
                    <td>{l.unit}</td>
                    {hasParts && <td />}
                    {cols.map((c) => (
                      <td key={c.key} />
                    ))}
                    <td className="num">{formatTr(l.value, l.unit)}</td>
                    <td className="note">{l.note && <Collapsible text={l.note} limit={NOTE_LIMIT} />}</td>
                  </tr>
                  {(l.calc ?? []).map((r, k) => {
                    const own = !!r.ref && r.ref === focusRef;
                    const click = r.ref && onRowClick ? () => onRowClick(i, r.ref!) : null;
                    return (
                      <tr
                        key={k}
                        className={`part${r.sign < 0 ? ' minus' : ''}${i === focusIdx && !rowFocused ? ' focus-part' : ''}${own ? ' focus' : ''}${click ? ' linked' : ''}`}
                        ref={own ? focusRow : undefined}
                        aria-current={own ? 'true' : undefined}
                        {...(click
                          ? {
                              tabIndex: 0,
                              title: '3B modelde göster',
                              onClick: click,
                              onKeyDown: (e: KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  click();
                                }
                              },
                            }
                          : {})}
                      >
                        <td className="part-name">
                          {r.sign < 0 ? '(−) ' : ''}
                          {r.ref ? (
                            <span className="m3-mark">
                              ◆ <span className="mono">{r.ref}</span>
                            </span>
                          ) : (
                            partTitle(r)
                          )}
                        </td>
                        <td>{unitOf(r)}</td>
                        <td className="num">{formatTr(r.adet, Number.isInteger(r.adet) ? 'adet' : undefined)}</td>
                        {cols.map((c) => (
                          <td key={c.key} className="num">
                            {c.cell(r)}
                          </td>
                        ))}
                        <td className="num">{formatTr(r.value)}</td>
                        <td className="note">{r.ref && <Collapsible text={partTitle(r)} limit={NOTE_LIMIT} />}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              <tr className="total">
                <td>Toplam</td>
                <td>{item.unit}</td>
                {hasParts && <td colSpan={1 + cols.length} />}
                <td className="num">{formatTr(item.value, item.unit)}</td>
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
