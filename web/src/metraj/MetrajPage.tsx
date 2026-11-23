import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { highlightPoz } from '@shared/model3d';
import { useModel3d } from '../viewer/useModel3d';
import { useNavigate, useSearchParams } from 'react-router';
import type { UserProfile } from '@shared/types';
import { useDiscipline, useFacade, useItems, useRooms } from '../data/hooks';
import { ResizeHandle } from '../common/ResizeHandle';
import { MOBILE_QUERY, useMediaQuery } from '../common/useMediaQuery';
import { ItemDetail } from './ItemDetail';
import { ItemList } from './ItemList';

const Viewer3D = lazy(() => import('../viewer/Viewer3D'));
const KEY = 'metraj.detailWidth';
const MIN = 360;
const readWidth = (): number | null => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= MIN ? v : null;
  } catch {
    return null;
  }
};
const saveWidth = (w: number | null) => {
  try {
    if (w === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(Math.round(w)));
  } catch {
    /* tarayıcı depolaması kapalı: genişlik yalnız bu oturumda kalır */
  }
};
const LIST_KEY = 'metraj.listOpen';
const readListOpen = (): boolean => {
  try {
    return localStorage.getItem(LIST_KEY) !== '0';
  } catch {
    return true;
  }
};
/** Liste (≥340 px) ve pafta alanı (≥200 px) için yer bırakır. */
const maxWidth = () => Math.max(MIN, (typeof window === 'undefined' ? 1600 : window.innerWidth) - 540);

export function MetrajPage({ profile }: { profile: UserProfile }) {
  const [detailW, setDetailW] = useState<number | null>(readWidth);
  const [maxW, setMaxW] = useState(maxWidth);
  useEffect(() => {
    const onResize = () => setMaxW(maxWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const changeW = (w: number | null) => {
    setDetailW(w);
    saveWidth(w);
  };
  const shownW = detailW === null ? null : Math.min(detailW, maxW);
  const [listOpen, setListOpen] = useState(readListOpen);
  const toggleList = () => {
    setListOpen(!listOpen);
    try {
      localStorage.setItem(LIST_KEY, listOpen ? '0' : '1');
    } catch {
      /* depolama kapalı: tercih yalnız bu oturumda */
    }
  };
  const cols = `${listOpen ? 'minmax(340px, 26%)' : '34px'} minmax(200px, 1fr) ${shownW === null ? 'minmax(360px, 28%)' : `${shownW}px`}`;
  const items = useItems();
  const rooms = useRooms();
  const facade = useFacade();
  const disc = useDiscipline();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const selectedId = params.get('kalem');
  const selected = items.data.find((i) => i.id === selectedId) ?? null;
  const values = useMemo(() => Object.fromEntries(items.data.map((i) => [i.id, i.value])), [items.data]);
  const byPoz = useMemo(() => new Map(items.data.map((i) => [i.poz, i])), [items.data]);
  const m3 = useModel3d(!mobile);
  const highlight = useMemo(() => (selected ? highlightPoz(selected.poz, (p) => byPoz.get(p)?.formula) : null), [selected, byPoz]);
  // 3B'de tıklanan elemanın hesap detayı satırı
  // source: model = 3B'de elemana tıklandı; table = hesap detayında satıra tıklandı
  const [focus, setFocus] = useState<{ poz: string; line: string | number | null; ref?: string; source: 'model' | 'table' } | null>(null);
  /** Satır ↔ 3B eleman eşleşmesi (eleman satırı adla ya da sırayla taşır). */
  const lineIndex = (poz: string, ref: string | number | undefined): number => {
    if (ref === undefined) return -1;
    if (typeof ref === 'number') return ref;
    return byPoz.get(poz)?.breakdown?.findIndex((l) => l.label === ref) ?? -1;
  };
  const linked = useMemo(() => {
    const out = new Set<number>();
    if (!selected || !m3.model) return out;
    for (const e of m3.model.elements) {
      const i = lineIndex(selected.poz, e.lines?.[selected.poz]);
      if (i >= 0) out.add(i);
    }
    return out;
  }, [selected, m3.model]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusIds = useMemo(() => {
    if (focus?.source === 'table' && focus.ref) return new Set([focus.ref]);
    if (!focus || focus.source !== 'table' || !m3.model || typeof focus.line !== 'number') return null;
    const ids = new Set<string>();
    for (const e of m3.model.elements) if (lineIndex(focus.poz, e.lines?.[focus.poz]) === focus.line) ids.add(e.id);
    return ids;
  }, [focus, m3.model]); // eslint-disable-line react-hooks/exhaustive-deps
  const clickLine = (i: number) => {
    if (!selected) return;
    setFocus((f) => (f?.source === 'table' && f.poz === selected.poz && f.line === i ? null : { poz: selected.poz, line: i, source: 'table' }));
  };
  /** Cetvel satırı ↔ tek 3B eleman (satır kendi elemanını ref ile taşır). */
  const clickRow = (line: number, ref: string) => {
    if (!selected) return;
    setFocus((f) => (f?.source === 'table' && f.ref === ref ? null : { poz: selected.poz, line, ref, source: 'table' }));
  };
  useEffect(() => {
    if (focus && selected?.poz !== focus.poz) setFocus(null);
  }, [selected?.poz]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickElement = (el: { id: string; items: string[]; lines?: Record<string, string | number> } | null): boolean => {
    if (!el || !el.items.length) {
      setFocus(null);
      return false;
    }
    const cur = selected?.poz;
    const poz = cur && el.items.includes(cur) ? cur : el.items[0];
    setFocus({ poz, line: el.lines?.[poz] ?? null, ref: el.id, source: 'model' });
    const it = byPoz.get(poz);
    if (!it || poz === cur) return false;
    setParams({ kalem: it.id });
    return true;
  };

  if (items.error) return <p className="center-note">Veri okunamadı: {items.error.message}</p>;
  if (mobile) {
    // Telefon: liste ↔ bilgi kartı (3B yok). Liste gizlenir ama kalır: süzgeç ve kaydırma yeri korunur.
    const back = () => {
      if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
      else setParams({}, { replace: true });
    };
    return (
      <div className="metraj mobile">
        <aside className="pane list-pane" hidden={!!selected}>
          {items.loading ? (
            <p className="hint pad">Yükleniyor…</p>
          ) : (
            <ItemList items={items.data} groups={disc.data?.groups ?? []} selectedId={selectedId} onSelect={(id) => setParams({ kalem: id })} />
          )}
        </aside>
        {selected && (
          <aside className="pane detail-pane">
            <button type="button" className="back-btn" onClick={back}>
              <span aria-hidden="true">‹</span> Kalem listesi
            </button>
            <div className="detail-scroll">
              <ItemDetail item={selected} profile={profile} values={values} rooms={rooms.data} facade={facade.data} />
            </div>
          </aside>
        )}
      </div>
    );
  }
  return (
    <div className="metraj" style={{ gridTemplateColumns: cols }}>
      <aside className={`pane list-pane${listOpen ? '' : ' closed'}`} id="kalem-listesi">
        <button type="button" className="list-toggle" aria-expanded={listOpen} aria-controls="kalem-listesi" title={listOpen ? 'Kalem listesini gizle' : 'Kalem listesini göster'} onClick={toggleList}>
          <span aria-hidden="true">{listOpen ? '‹' : '›'}</span>
          <span className={listOpen ? undefined : 'list-toggle-label'}>{listOpen ? 'Gizle' : 'Kalemler'}</span>
        </button>
        {!listOpen ? null : items.loading ? (
          <p className="hint pad">Yükleniyor…</p>
        ) : (
          <ItemList items={items.data} groups={disc.data?.groups ?? []} selectedId={selectedId} onSelect={(id) => setParams({ kalem: id })} />
        )}
      </aside>
      <section className="pane viewer-pane">
        {m3.model ? (
          <Suspense fallback={<p className="viewer-empty">3B görüntüleyici yükleniyor…</p>}>
            <Viewer3D
              model={m3.model}
              highlight={highlight}
              itemName={(p) => byPoz.get(p)?.name}
              onClearSelection={() => setParams({})}
              onSelectPoz={(p, line) => {
                const it = byPoz.get(p);
                if (!it) return;
                setFocus({ poz: p, line: line ?? null, source: 'model' });
                setParams({ kalem: it.id });
              }}
              onPickElement={pickElement}
              focusIds={focusIds}
            />
          </Suspense>
        ) : (
          <div className="viewer-empty">
            <p>{m3.error ?? '3B model yükleniyor…'}</p>
          </div>
        )}
      </section>
      <aside className="pane detail-pane">
        <ResizeHandle
          width={shownW ?? Math.max(MIN, Math.round(window.innerWidth * 0.28))}
          min={MIN}
          max={maxW}
          onChange={changeW}
          onReset={() => changeW(null)}
          label="Bilgi kartı genişliği"
        />
        <div className="detail-scroll">
          {selected ? (
            <ItemDetail item={selected} profile={profile} values={values} rooms={rooms.data} facade={facade.data} focusLine={focus?.poz === selected.poz ? focus.line : null} focusRef={focus?.poz === selected.poz ? focus.ref : undefined} linkedLines={linked} onLineClick={clickLine} onRowClick={clickRow} />
          ) : (
            <p className="hint pad">Kalem seçilmedi.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
