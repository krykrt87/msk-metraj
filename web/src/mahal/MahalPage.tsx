import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatTr } from '@shared/number';
import { useItems, useRooms } from '../data/hooks';
import { roomItems, type RoomItem } from './roomItems';

/** Salt okunur: kalem formülleri mahal alanına bağlı değil, burada düzeltme hiçbir miktarı değiştirmezdi. */
export function MahalPage() {
  const rooms = useRooms();
  const items = useItems();
  const [text, setText] = useState('');
  const [floor, setFloor] = useState('');

  const dupCodes = useMemo(() => new Set(rooms.data.map((r) => r.code).filter((c, i, a) => a.indexOf(c) !== i)), [rooms.data]);
  const floors = useMemo(() => [...new Set(rooms.data.map((r) => r.floor))], [rooms.data]);
  const shown = useMemo(() => {
    const q = text.trim().toLocaleLowerCase('tr');
    return rooms.data.filter(
      (r) =>
        (!floor || r.floor === floor) &&
        (!q || [r.code, r.name, r.ceilingLower, r.ceilingUpper, r.flooring, r.note].some((v) => v?.toLocaleLowerCase('tr').includes(q))),
    );
  }, [rooms.data, text, floor]);
  const total = shown.reduce((s, r) => s + r.area, 0);

  if (rooms.error) return <p className="center-note">Veri okunamadı: {rooms.error.message}</p>;
  if (rooms.loading) return <p className="center-note">Yükleniyor…</p>;
  return (
    <section className="malzeme">
      <header className="malzeme-head">
        <h1>Mahal Listesi</h1>
        <dl className="malzeme-stats">
          <div>
            <dt>Mahal</dt>
            <dd>{shown.length}</dd>
          </div>
          <div>
            <dt>Toplam alan</dt>
            <dd>{formatTr(total, 'm²')} m²</dd>
          </div>
        </dl>
      </header>
      <div className="malzeme-filters">
        <input type="search" placeholder="Kod, mahal, tavan veya döşeme ara" aria-label="Ara" value={text} onChange={(e) => setText(e.target.value)} />
        <select aria-label="Kat" value={floor} onChange={(e) => setFloor(e.target.value)}>
          <option value="">Tüm katlar</option>
          {floors.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="count">
          {shown.length} / {rooms.data.length}
        </span>
      </div>
      <table className="data malzeme-table">
        <thead>
          <tr>
            <th>Kod</th>
            <th>Mahal</th>
            <th>Kat</th>
            <th className="num">Alan (m²)</th>
            <th>Tavan alt</th>
            <th>Tavan üst</th>
            <th>CH</th>
            <th>Döşeme</th>
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td className="mono">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.floor}</td>
                <td className="num">{formatTr(r.area, 'm²')}</td>
                <td>{r.ceilingLower ?? '—'}</td>
                <td>{r.ceilingUpper ?? '—'}</td>
                <td>{r.ch ?? '—'}</td>
                <td>{r.flooring ?? '—'}</td>
                <td>{r.note ?? ''}</td>
              </tr>
              <RoomItemsRow list={roomItems(items.data, dupCodes.has(r.code) ? `${r.code} ${r.name}` : r.code)} />
            </Fragment>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="hint pad">Süzgece uyan mahal yok.</p>}
    </section>
  );
}

function RoomItemsRow({ list }: { list: RoomItem[] }) {
  return (
    <tr className="mrow-detail">
      <td colSpan={9}>
        {list.length === 0 ? (
          <span className="hint">Bu mahale bağlı metraj satırı yok.</span>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Poz</th>
                <th>Malzeme</th>
                <th>Kod</th>
                <th className="num">Miktar</th>
                <th>Birim</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.poz + m.unit}>
                  <td className="mono">
                    <Link to={`/?kalem=${encodeURIComponent(m.id)}`}>{m.poz}</Link>
                  </td>
                  <td>{m.name}</td>
                  <td className="mono">{m.code ?? '—'}</td>
                  <td className="num">{formatTr(m.total, m.unit)}</td>
                  <td>{m.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}
