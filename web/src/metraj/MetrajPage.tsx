import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { UserProfile } from '@shared/types';
import { useDiscipline, useFacade, useItems, useRooms } from '../data/hooks';
import { ItemDetail } from './ItemDetail';
import { ItemList } from './ItemList';

export function MetrajPage({ profile }: { profile: UserProfile }) {
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
    <div className="metraj">
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
        {selected ? (
          <ItemDetail item={selected} profile={profile} values={values} rooms={rooms.data} facade={facade.data} />
        ) : (
          <p className="hint pad">Kalem seçilmedi.</p>
        )}
      </aside>
    </div>
  );
}
