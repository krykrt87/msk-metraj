import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { highlightPoz } from '@shared/model3d';
import { useModel3d } from '../viewer/useModel3d';
import { useSearchParams } from 'react-router';
import type { UserProfile } from '@shared/types';
import { useDiscipline, useFacade, useItems, useRooms } from '../data/hooks';
import { ResizeHandle } from '../common/ResizeHandle';
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
  const items = useItems();
  const rooms = useRooms();
  const facade = useFacade();
  const disc = useDiscipline();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('kalem');
  const selected = items.data.find((i) => i.id === selectedId) ?? null;
  const values = useMemo(() => Object.fromEntries(items.data.map((i) => [i.id, i.value])), [items.data]);
  const byPoz = useMemo(() => new Map(items.data.map((i) => [i.poz, i])), [items.data]);
  const highlight = useMemo(() => (selected ? highlightPoz(selected.poz, (p) => byPoz.get(p)?.formula) : null), [selected, byPoz]);
  const m3 = useModel3d();
  // 3B'de tıklanan elemanın hesap detayı satırı
  const [focus, setFocus] = useState<{ poz: string; line: string | number | null } | null>(null);
  useEffect(() => {
    if (focus && selected?.poz !== focus.poz) setFocus(null);
  }, [selected?.poz]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickElement = (el: { items: string[]; lines?: Record<string, string | number> } | null): boolean => {
    if (!el || !el.items.length) {
      setFocus(null);
      return false;
    }
    const cur = selected?.poz;
    const poz = cur && el.items.includes(cur) ? cur : el.items[0];
    setFocus({ poz, line: el.lines?.[poz] ?? null });
    const it = byPoz.get(poz);
    if (!it || poz === cur) return false;
    setParams({ kalem: it.id });
    return true;
  };

  if (items.error) return <p className="center-note">Veri okunamadı: {items.error.message}</p>;
  return (
    <div className="metraj" style={shownW === null ? undefined : { gridTemplateColumns: `minmax(340px, 26%) minmax(200px, 1fr) ${shownW}px` }}>
      <aside className="pane list-pane">
        {items.loading ? (
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
                setFocus({ poz: p, line: line ?? null });
                setParams({ kalem: it.id });
              }}
              onPickElement={pickElement}
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
            <ItemDetail item={selected} profile={profile} values={values} rooms={rooms.data} facade={facade.data} focusLine={focus?.poz === selected.poz ? focus.line : null} />
          ) : (
            <p className="hint pad">Kalem seçilmedi.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
