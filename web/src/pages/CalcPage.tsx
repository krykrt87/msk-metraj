import { useMemo, useState } from 'react';
import { formatTr } from '@shared/number';
import type { Item } from '@shared/types';
import { Collapsible } from '../common/Collapsible';
import { useDiscipline, useItems } from '../data/hooks';
import { Breakdown } from '../metraj/Breakdown';

const up = (s: string) => s.toLocaleUpperCase('tr');

/** Bütün kalemlerin hesap detayı tek sayfada (Excel'deki "Hesap Detayı" sayfasının karşılığı). */
export function CalcPage() {
  const items = useItems();
  const disc = useDiscipline();
  const [group, setGroup] = useState('');
  const [text, setText] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const q = text.trim() ? up(text.trim()) : null;
    return items.data.filter((i) => !i.cancelled && (!group || i.group === group) && (!q || up(`${i.poz} ${i.name} ${i.code ?? ''}`).includes(q)));
  }, [items.data, group, text]);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const groups = disc.data?.groups ?? [];

  if (items.loading) return <p className="center-note">Yükleniyor…</p>;
  return (
    <section className="calc-page">
      <header className="calc-head">
        <h2>Hesap detayı</h2>
        <div className="calc-tools">
          <input type="search" placeholder="Poz, ad veya kod ara" value={text} onChange={(e) => setText(e.target.value)} aria-label="Ara" />
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Grup">
            <option value="">Tüm gruplar</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key}. {g.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => setOpen(new Set(shown.map((i) => i.id)))}>
            Tümünü aç
          </button>
          <button type="button" className="btn ghost" onClick={() => setOpen(new Set())}>
            Tümünü kapat
          </button>
        </div>
      </header>
      {groups.map((g) => {
        const rows = shown.filter((i) => i.group === g.key);
        if (!rows.length) return null;
        return (
          <div key={g.key} className="calc-group">
            <h3 className="calc-group-title">
              {g.key}. {g.title}
            </h3>
            {rows.map((i: Item) => (
              <article key={i.id} className={`calc-item${open.has(i.id) ? ' open' : ''}`}>
                <button type="button" className="calc-item-head" aria-expanded={open.has(i.id)} onClick={() => toggle(i.id)}>
                  <span className="caret" aria-hidden="true">
                    {open.has(i.id) ? '▾' : '▸'}
                  </span>
                  <span className="poz">{i.poz}</span>
                  <span className="name">{i.name}</span>
                  <span className="qty">{i.value === null ? 'ölçülemedi' : `${formatTr(i.value, i.unit)} ${i.unit}`}</span>
                </button>
                {open.has(i.id) && (
                  <div className="calc-item-body">
                    <p className="calc-method">
                      <strong>Yöntem: </strong>
                      <Collapsible text={i.method} limit={140} />
                    </p>
                    <Breakdown item={i} />
                  </div>
                )}
              </article>
            ))}
          </div>
        );
      })}
      {shown.length === 0 && <p className="hint pad">Aramaya uyan kalem yok.</p>}
    </section>
  );
}
