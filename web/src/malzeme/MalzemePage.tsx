import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { can } from '@shared/access';
import { formatTr } from '@shared/number';
import type { Item, UserProfile } from '@shared/types';
import { api } from '../data/api';
import { useDiscipline, useItems } from '../data/hooks';
import { filterItems, isUnmeasurable } from '../metraj/filter';
import { Specs } from '../metraj/Specs';
import { StatusIcon } from '../metraj/StatusIcon';

type Show = 'hepsi' | 'eksik' | 'tam' | 'kesin_degil';

/** Malzeme = özellik listesi tanımlı metraj kalemi (alan/uzunluk gibi yardımcı ölçüler hariç). */
export const isMaterial = (i: Item) => !i.cancelled && (i.specs?.length ?? 0) > 0;
const missingOf = (i: Item) => (i.specs ?? []).filter((s) => !s.value).length;

export function MalzemePage({ profile }: { profile: UserProfile }) {
  const items = useItems();
  const disc = useDiscipline();
  const [text, setText] = useState('');
  const [group, setGroup] = useState('');
  const [show, setShow] = useState<Show>('hepsi');
  const [open, setOpen] = useState<string | null>(null);

  const materials = useMemo(() => items.data.filter(isMaterial), [items.data]);
  const shown = useMemo(
    () =>
      filterItems(materials, { text, group: group || undefined }).filter((i) =>
        show === 'eksik' ? missingOf(i) > 0 : show === 'tam' ? missingOf(i) === 0 : show === 'kesin_degil' ? i.status !== 'kesinlesti' : true,
      ),
    [materials, text, group, show],
  );
  const finalized = materials.filter((i) => i.status === 'kesinlesti').length;
  const complete = materials.filter((i) => missingOf(i) === 0).length;
  const missingTotal = materials.reduce((n, i) => n + missingOf(i), 0);
  const groups = (disc.data?.groups ?? []).filter((g) => materials.some((i) => i.group === g.key));

  if (items.error) return <p className="center-note">Veri okunamadı: {items.error.message}</p>;
  if (items.loading) return <p className="center-note">Yükleniyor…</p>;
  return (
    <section className="malzeme">
      <header className="malzeme-head">
        <h1>Malzeme Listesi</h1>
        <dl className="malzeme-stats">
          <div>
            <dt>Malzeme</dt>
            <dd>{materials.length}</dd>
          </div>
          <div>
            <dt>Metrajı kesin</dt>
            <dd>
              {finalized} / {materials.length}
            </dd>
          </div>
          <div>
            <dt>Özellikleri tam</dt>
            <dd>
              {complete} / {materials.length}
            </dd>
          </div>
          <div className={missingTotal ? 'warn' : undefined}>
            <dt>Tanımlanacak özellik</dt>
            <dd>{missingTotal}</dd>
          </div>
        </dl>
      </header>
      <div className="malzeme-filters">
        <input type="search" placeholder="Poz, malzeme veya kod ara" aria-label="Ara" value={text} onChange={(e) => setText(e.target.value)} />
        <select aria-label="Grup" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Tüm gruplar</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.key}. {g.title}
            </option>
          ))}
        </select>
        <select aria-label="Göster" value={show} onChange={(e) => setShow(e.target.value as Show)}>
          <option value="hepsi">Tüm malzemeler</option>
          <option value="eksik">Özelliği eksik olanlar</option>
          <option value="tam">Özellikleri tam olanlar</option>
          <option value="kesin_degil">Metrajı kesinleşmemiş</option>
        </select>
        <span className="count">
          {shown.length} / {materials.length}
        </span>
      </div>
      <table className="data malzeme-table">
        <thead>
          <tr>
            <th>Poz</th>
            <th>Malzeme</th>
            <th className="col-code">Proje kodu</th>
            <th className="num">Miktar</th>
            <th>Metraj</th>
            <th>Özellikler</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((i) => {
            const missing = missingOf(i);
            const total = i.specs?.length ?? 0;
            const isOpen = open === i.id;
            return (
              <Fragment key={i.id}>
                <tr className={`mrow${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : i.id)}>
                  <td className="mono">{i.poz}</td>
                  <td>
                    {/* tıklama satıra kabarır; düğme klavye ve ekran okuyucu için */}
                    <button type="button" className="mrow-btn" aria-expanded={isOpen}>
                      <span className="caret" aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      {i.name}
                    </button>
                  </td>
                  <td className="col-code">{i.code ?? '—'}</td>
                  <td className="num">{isUnmeasurable(i) ? <span className="qty-none-sm">ölçülemedi</span> : `${formatTr(i.value, i.unit)} ${i.unit}`}</td>
                  <td>
                    <StatusIcon item={i} />
                  </td>
                  <td>
                    {missing ? (
                      <span className="spec-badge warn" title={`${total} özellikten ${missing} tanesi tanımlanmalı`}>
                        {missing} eksik / {total}
                      </span>
                    ) : (
                      <span className="spec-badge ok" title="Tüm özellikler tanımlı">
                        Tam ({total})
                      </span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="mrow-detail">
                    <td colSpan={6}>
                      <Specs key={i.id} item={i} editable={can(profile, 'edit') && i.status !== 'kesinlesti'} submit={api.updateItemInfo} />
                      <Link className="mrow-link" to={`/?kalem=${encodeURIComponent(i.id)}`}>
                        Metrajda aç →
                      </Link>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {shown.length === 0 && <p className="hint pad">Süzgece uyan malzeme yok.</p>}
    </section>
  );
}
