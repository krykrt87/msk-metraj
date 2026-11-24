import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { can } from '@shared/access';
import { formatTr } from '@shared/number';
import type { FacadeRow, Item, Room, UserProfile } from '@shared/types';
import { api } from '../data/api';
import { useHistory } from '../data/hooks';
import { formatDateTime } from '../data/types';
import { buildWorkbook, downloadWorkbook, stamp } from '../excel/workbook';
import { Breakdown } from './Breakdown';
import { CorrectionForm } from './CorrectionForm';
import { isUnmeasurable } from './filter';
import { FormulaForm } from './FormulaForm';
import { HistoryList } from './HistoryList';
import { Specs } from './Specs';
import { StatusActions } from './StatusActions';
import { StatusIcon } from './StatusIcon';

type Tab = 'hesap' | 'ozellik' | 'gecmis' | 'duzelt' | 'formul';

/** Yalnız bu kalemin hesap detayını Excel olarak indirir. */
function DetailDownload({ item }: { item: Item }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const wb = await buildWorkbook({ items: [item], rooms: [], findings: [] }, ['detay']);
      await downloadWorkbook(wb, `MSK_${item.poz}_Hesap_Detayi_${stamp()}.xlsx`);
    } catch (e) {
      setError((e as Error).message || 'Excel üretilemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="tab-tools">
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
      <button type="button" className="info-btn" disabled={busy} title="Hesap detayını Excel indir" onClick={download}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M10 3v9M6 8.5l4 4 4-4M4 15.5h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">{busy ? 'Hazırlanıyor…' : 'Hesap detayını Excel indir'}</span>
      </button>
    </span>
  );
}

const CONF_BARS = { Yüksek: 3, Orta: 2, Düşük: 1 } as const;
/** Ölçüm güveni: üç çubuktan dolu olanlar (Yüksek 3, Orta 2, Düşük 1). */
function ConfidenceIcon({ level }: { level: Item['confidence'] }) {
  const n = level ? CONF_BARS[level] : 0;
  const text = `Güven: ${level ?? 'belirtilmemiş'}`;
  return (
    <span className={`conf conf-${n}`} title={text} role="img" aria-label={text}>
      <svg viewBox="0 0 14 12" width="16" height="14" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={i * 5} y={8 - i * 4} width="3.5" height={4 + i * 4} rx="0.5" className={i < n ? 'on' : 'off'} />
        ))}
      </svg>
    </span>
  );
}

export function ItemDetail({
  item,
  profile,
  values,
  rooms,
  facade,
  focusLine,
  focusRef,
  linkedLines,
  onLineClick,
  onRowClick,
}: {
  item: Item;
  profile: UserProfile;
  values: Record<string, number | null>;
  rooms: Room[];
  facade: FacadeRow[];
  /** 3B'de tıklanan elemanın hesap detayı satırı (ad ya da sıra). */
  focusLine?: string | number | null;
  /** Odaktaki 3B eleman (ör. CEP-142); kendi cetvel satırı vurgulanır. */
  focusRef?: string;
  /** 3B modelde karşılığı olan satırlar (tıklanınca modelde gösterilir). */
  linkedLines?: Set<number>;
  onLineClick?: (index: number) => void;
  onRowClick?: (line: number, ref: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('hesap');
  const [info, setInfo] = useState(false);
  useEffect(() => {
    if (focusLine !== null && focusLine !== undefined) setTab('hesap');
  }, [focusLine]);
  const history = useHistory({ type: 'item', id: item.id });
  const editable = can(profile, 'edit') && item.status !== 'kesinlesti' && !item.cancelled;
  const differsFromExcel = item.importedValue !== null && item.value !== null && Math.abs(item.importedValue - item.value) > 1e-9;
  const tabs: [Tab, string][] = [['hesap', 'Hesap detayı'], ['ozellik', 'Malzeme özellikleri'], ['gecmis', 'Geçmiş']];
  if (editable) tabs.push(['duzelt', 'Miktarı düzelt'], ['formul', 'Formül']);
  const active = tabs.some(([t]) => t === tab) ? tab : 'hesap';

  return (
    <article className="detail">
      <header className="detail-head">
        <div className="detail-title">
          <div className="detail-poz">{item.poz}</div>
          <h2>{item.name}</h2>
        </div>
        <div className="detail-qty">
          {isUnmeasurable(item) ? (
            <span className="qty-none">Ölçülemedi</span>
          ) : (
            <span>
              <span className="qty-num">{formatTr(item.value, item.unit)}</span> <span className="qty-unit">{item.unit}</span>
            </span>
          )}
          <span className="qty-icons">
            <StatusIcon item={item} />
            <ConfidenceIcon level={item.confidence} />
          </span>
        </div>
        <button type="button" className={`info-btn${info ? ' on' : ''}`} aria-expanded={info} aria-controls="item-info" title="Tür, hesap yöntemi ve kaynaklar" onClick={() => setInfo((v) => !v)}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 9v5M10 6.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Kalem bilgisi</span>
        </button>
      </header>
      {info && (
        <section id="item-info" className="item-info" aria-label="Kalem bilgisi">
          <dl className="facts">
            <dt>Tür</dt>
            <dd>{item.kind === 'derived' ? 'Türetilen' : 'Ölçülen'}</dd>
            <dt>Hesap yöntemi</dt>
            <dd>{item.method}</dd>
            <dt>Kaynak pafta</dt>
            <dd>
              {item.drawings.length > 0 ? (
                <div className="chips">
                  {item.drawings.map((d) =>
                    can(profile, 'drawings') ? (
                      <Link key={d} className="chip" to={`/paftalar?pafta=${encodeURIComponent(d)}`} title="Paftayı aç">
                        {d.replace('4199-A-DD-', '')}
                      </Link>
                    ) : (
                      <span key={d} className="chip">
                        {d.replace('4199-A-DD-', '')}
                      </span>
                    ),
                  )}
                </div>
              ) : (
                '—'
              )}
            </dd>
            <dt>Son değişiklik</dt>
            <dd>
              {item.updatedBy?.name ?? '—'}, {formatDateTime(item.updatedAt)}
            </dd>
            <dt>Kaynak</dt>
            <dd>
              {item.sources?.length ? (
                <ul className="info-sources">
                  {item.sources.map((s, i) => (
                    <li key={i}>
                      <span className="mono">{s.drawing}</span> · {s.where}
                    </li>
                  ))}
                </ul>
              ) : (
                item.sourceText || '—'
              )}
            </dd>
          </dl>
        </section>
      )}
      {item.cancelled && <p className="note warn">Bu kalem iptal edildi; geçmişiyle saklanıyor.</p>}
      <dl className="facts">
        {item.formula && (
          <>
            <dt>Formül</dt>
            <dd className="mono">{item.formula}</dd>
          </>
        )}
        <dt>Proje kodu</dt>
        <dd className="code-row">
          <span>{item.code ?? '—'}</span>
          <StatusActions item={item} profile={profile} api={api} />
        </dd>
        {differsFromExcel && (
          <>
            <dt>İlk ölçüm (DWG)</dt>
            <dd>
              {formatTr(item.importedValue, item.unit)} {item.unit}
            </dd>
          </>
        )}
      </dl>
      <div className="tabs">
        <div role="tablist" className="tablist">
          {tabs.map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={active === t} className={active === t ? 'active' : undefined} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
        {!!item.breakdown?.length && <DetailDownload item={item} />}
      </div>
      <div className="tab-body">
        {active === 'hesap' && <Breakdown item={item} focus={focusLine} focusRef={focusRef} linked={linkedLines} onLineClick={onLineClick} onRowClick={onRowClick} />}
        {active === 'ozellik' && <Specs key={item.id} item={item} editable={editable} submit={api.updateItemInfo} />}
        {active === 'gecmis' && <HistoryList entries={history.data} unit={item.unit} />}
        {active === 'duzelt' && <CorrectionForm key={item.id} item={item} submit={api.correctItem} onDone={() => setTab('gecmis')} />}
        {active === 'formul' && (
          <FormulaForm key={item.id} item={item} values={values} rooms={rooms} facade={facade} submit={api.setItemFormula} onDone={() => setTab('gecmis')} />
        )}
      </div>
    </article>
  );
}
