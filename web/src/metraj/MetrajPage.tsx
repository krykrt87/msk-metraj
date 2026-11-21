import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { UserProfile } from '@shared/types';
import { useDiscipline, useFacade, useItems, useRooms } from '../data/hooks';
import { ResizeHandle } from '../common/ResizeHandle';
import { ItemDetail } from './ItemDetail';
import { ItemList } from './ItemList';

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
        <div className="viewer-empty">
          {selected ? (
            <p>
              {selected.drawings.length > 0
                ? `Kaynak paftalar: ${selected.drawings.map((d) => d.replace('4199-A-DD-', '')).join(', ')}`
                : 'Bu kalem için pafta tanımlı değil.'}
              <br />
              <span className="hint">Pafta görüntüleyici bir sonraki adımda bu alana geliyor.</span>
            </p>
          ) : (
            <p>Soldan bir kalem seçin.</p>
          )}
        </div>
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
            <ItemDetail item={selected} profile={profile} values={values} rooms={rooms.data} facade={facade.data} />
          ) : (
            <p className="hint pad">Kalem seçilmedi.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
