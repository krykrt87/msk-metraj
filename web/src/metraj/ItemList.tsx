import { useMemo, useState } from 'react';
import { formatTr } from '@shared/number';
import { STATUS_LABEL, type Item, type Status } from '@shared/types';
import { filterItems, isUnmeasurable, type ItemFilter } from './filter';
import { StatusIcon } from './StatusIcon';

export function ItemList({
  items,
  groups,
  selectedId,
  onSelect,
}: {
  items: Item[];
  groups: { key: string; title: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [f, setF] = useState<ItemFilter>({});
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const shown = useMemo(() => filterItems(items, f), [items, f]);
  const drawings = useMemo(() => [...new Set(items.flatMap((i) => i.drawings))].sort(), [items]);
  const set = (patch: Partial<ItemFilter>) => setF((x) => ({ ...x, ...patch }));
  const toggle = (k: string) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="item-list">
      <div className="filters">
        <input type="search" placeholder="Poz, ad veya kod ara" value={f.text ?? ''} onChange={(e) => set({ text: e.target.value })} aria-label="Ara" />
        <div className="filter-row">
          <select aria-label="Grup" value={f.group ?? ''} onChange={(e) => set({ group: e.target.value || undefined })}>
            <option value="">Tüm gruplar</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key}. {g.title}
              </option>
            ))}
          </select>
          <select aria-label="Durum" value={f.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as Status | 'uyarili' | undefined })}>
            <option value="">Tüm durumlar</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="uyarili">Kesinleşti – uyarılı</option>
          </select>
        </div>
        <div className="filter-row">
          <select aria-label="Güven" value={f.confidence ?? ''} onChange={(e) => set({ confidence: (e.target.value || undefined) as ItemFilter['confidence'] })}>
            <option value="">Tüm güven seviyeleri</option>
            <option value="Yüksek">Güven: Yüksek</option>
            <option value="Orta">Güven: Orta</option>
            <option value="Düşük">Güven: Düşük</option>
          </select>
          <select aria-label="Pafta" value={f.drawing ?? ''} onChange={(e) => set({ drawing: e.target.value || undefined })}>
            <option value="">Tüm paftalar</option>
            {drawings.map((d) => (
              <option key={d} value={d}>
                {d.replace('4199-A-DD-', '')}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-row checks">
          <label className="check">
            <input type="checkbox" checked={!!f.unmeasurable} onChange={(e) => set({ unmeasurable: e.target.checked })} /> Ölçülemeyenler
          </label>
          <label className="check">
            <input type="checkbox" checked={!!f.showCancelled} onChange={(e) => set({ showCancelled: e.target.checked })} /> İptalleri göster
          </label>
          <span className="count">
            {shown.length} / {items.filter((i) => !i.cancelled).length}
          </span>
        </div>
      </div>
      <div className="tree">
        {groups.map((g) => {
          const rows = shown.filter((i) => i.group === g.key);
          if (rows.length === 0) return null;
          const open = !closed.has(g.key);
          return (
            <div key={g.key} className="group">
              <button type="button" className="group-head" aria-expanded={open} onClick={() => toggle(g.key)}>
                <span className="caret" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                <span className="group-title">
                  {g.key}. {g.title}
                </span>
                <span className="group-count">{rows.length}</span>
              </button>
              {open &&
                rows.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    className={`row${i.id === selectedId ? ' selected' : ''}${i.cancelled ? ' cancelled' : ''}`}
                    onClick={() => onSelect(i.id)}
                    aria-current={i.id === selectedId ? 'true' : undefined}
                  >
                    <StatusIcon item={i} />
                    <span className="poz">{i.poz}</span>
                    <span className="name">{i.name}</span>
                    <span className={`qty${isUnmeasurable(i) ? ' none' : ''}`}>
                      {isUnmeasurable(i) ? 'ölçülemedi' : `${formatTr(i.value, i.unit)} ${i.unit}`}
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
        {shown.length === 0 && <p className="hint pad">Süzgece uyan kalem yok.</p>}
      </div>
    </div>
  );
}
