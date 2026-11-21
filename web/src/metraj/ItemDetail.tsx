import { useEffect, useState } from 'react';
import { can } from '@shared/access';
import { formatTr } from '@shared/number';
import type { FacadeRow, Item, Room, UserProfile } from '@shared/types';
import { api } from '../data/api';
import { useHistory } from '../data/hooks';
import { formatDateTime } from '../data/types';
import { Collapsible } from '../common/Collapsible';
import { Breakdown } from './Breakdown';
import { CorrectionForm } from './CorrectionForm';
import { isUnmeasurable } from './filter';
import { FormulaForm } from './FormulaForm';
import { HistoryList } from './HistoryList';
import { StatusActions } from './StatusActions';
import { StatusIcon } from './StatusIcon';

type Tab = 'hesap' | 'gecmis' | 'duzelt' | 'formul';

export function ItemDetail({
  item,
  profile,
  values,
  rooms,
  facade,
  focusLine,
  linkedLines,
  onLineClick,
}: {
  item: Item;
  profile: UserProfile;
  values: Record<string, number | null>;
  rooms: Room[];
  facade: FacadeRow[];
  /** 3B'de tıklanan elemanın hesap detayı satırı (ad ya da sıra). */
  focusLine?: string | number | null;
  /** 3B modelde karşılığı olan satırlar (tıklanınca modelde gösterilir). */
  linkedLines?: Set<number>;
  onLineClick?: (index: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('hesap');
  useEffect(() => {
    if (focusLine !== null && focusLine !== undefined) setTab('hesap');
  }, [focusLine]);
  const history = useHistory({ type: 'item', id: item.id });
  const editable = can(profile, 'edit') && item.status !== 'kesinlesti' && !item.cancelled;
  const differsFromExcel = item.importedValue !== null && item.value !== null && Math.abs(item.importedValue - item.value) > 1e-9;
  const tabs: [Tab, string][] = [['hesap', 'Hesap detayı'], ['gecmis', 'Geçmiş']];
  if (editable) tabs.push(['duzelt', 'Miktarı düzelt'], ['formul', 'Formül']);
  const active = tabs.some(([t]) => t === tab) ? tab : 'hesap';

  return (
    <article className="detail">
      <header className="detail-head">
        <div className="detail-poz">{item.poz}</div>
        <h2>{item.name}</h2>
      </header>
      <div className="detail-qty">
        {isUnmeasurable(item) ? (
          <span className="qty-none">Ölçülemedi</span>
        ) : (
          <>
            <span className="qty-num">{formatTr(item.value, item.unit)}</span> <span className="qty-unit">{item.unit}</span>
          </>
        )}
        <StatusIcon item={item} withLabel />
      </div>
      {item.cancelled && <p className="note warn">Bu kalem iptal edildi; geçmişiyle saklanıyor.</p>}
      <dl className="facts">
        <dt>Tür</dt>
        <dd>{item.kind === 'derived' ? 'Türetilen' : 'Ölçülen'}</dd>
        {item.formula && (
          <>
            <dt>Formül</dt>
            <dd className="mono">{item.formula}</dd>
          </>
        )}
        {item.code && (
          <>
            <dt>Proje kodu</dt>
            <dd>{item.code}</dd>
          </>
        )}
        <dt>Hesap yöntemi</dt>
        <dd><Collapsible key={`m-${item.id}`} text={item.method} /></dd>
        <dt>Kaynak pafta</dt>
        <dd>
          <Collapsible key={`s-${item.id}`} text={item.sourceText} />
          {item.drawings.length > 0 && <div className="chips">{item.drawings.map((d) => <span key={d} className="chip">{d.replace('4199-A-DD-', '')}</span>)}</div>}
        </dd>
        <dt>Güven</dt>
        <dd>{item.confidence ?? '—'}</dd>
        {differsFromExcel && (
          <>
            <dt>İlk ölçüm (DWG)</dt>
            <dd>
              {formatTr(item.importedValue, item.unit)} {item.unit}
            </dd>
          </>
        )}
        <dt>Son değişiklik</dt>
        <dd>
          {item.updatedBy?.name ?? '—'}, {formatDateTime(item.updatedAt)}
        </dd>
      </dl>
      <StatusActions item={item} profile={profile} api={api} />
      <div className="tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={active === t} className={active === t ? 'active' : undefined} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {active === 'hesap' && <Breakdown item={item} focus={focusLine} linked={linkedLines} onLineClick={onLineClick} />}
        {active === 'gecmis' && <HistoryList entries={history.data} unit={item.unit} />}
        {active === 'duzelt' && <CorrectionForm key={item.id} item={item} submit={api.correctItem} onDone={() => setTab('gecmis')} />}
        {active === 'formul' && (
          <FormulaForm key={item.id} item={item} values={values} rooms={rooms} facade={facade} submit={api.setItemFormula} onDone={() => setTab('gecmis')} />
        )}
      </div>
    </article>
  );
}
