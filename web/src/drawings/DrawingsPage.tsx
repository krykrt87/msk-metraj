import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { can } from '@shared/access';
import type { Drawing, UserProfile } from '@shared/types';
import { MOBILE_QUERY, useMediaQuery } from '../common/useMediaQuery';
import { useDrawings, useItems, useRevisions } from '../data/hooks';
import { LOCAL } from '../local';
import { loadDrawingPdf } from './loadPdf';

const PdfView = lazy(() => import('./PdfView'));
export const shortCode = (code: string) => code.replace('4199-A-DD-', '');
const up = (s: string) => s.toLocaleUpperCase('tr');

export function DrawingsPage({ profile }: { profile: UserProfile }) {
  const allowed = can(profile, 'drawings');
  const drawings = useDrawings(allowed);
  const items = useItems();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [text, setText] = useState('');
  const code = params.get('pafta');
  const selected = drawings.data.find((d) => d.code === code) ?? null;

  const groups = useMemo(() => {
    const q = up(text.trim());
    const shown = drawings.data.filter((d) => !q || [d.code, d.title].some((s) => up(s).includes(q)));
    const out = new Map<string, Drawing[]>();
    for (const d of [...shown].sort((a, b) => a.series.localeCompare(b.series) || a.code.localeCompare(b.code))) {
      const k = `${d.series} ${d.seriesTitle}`;
      out.set(k, [...(out.get(k) ?? []), d]);
    }
    return [...out];
  }, [drawings.data, text]);

  if (!allowed) return <p className="center-note">Pafta görme yetkiniz yok.</p>;
  if (drawings.error) return <p className="center-note">Paftalar okunamadı: {drawings.error.message}</p>;

  const back = () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
    else setParams({}, { replace: true });
  };
  const list = (
    <aside className="pane dlist" hidden={mobile && !!selected}>
      <div className="filters">
        <input type="search" placeholder="Pafta kodu veya adı ara" aria-label="Pafta ara" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="tree">
        {drawings.loading ? (
          <p className="hint pad">Yükleniyor…</p>
        ) : drawings.data.length === 0 ? (
          <p className="hint pad">{LOCAL ? 'Yerel modda pafta yok; paftalar canlıda ve emülatörde görünür.' : 'Henüz pafta yüklenmemiş.'}</p>
        ) : (
          groups.map(([title, ds]) => (
            <div key={title} className="group">
              <div className="group-head static">
                <span className="group-title">{title}</span>
                <span className="group-count">{ds.length}</span>
              </div>
              {ds.map((d) => (
                <button
                  type="button"
                  key={d.code}
                  className={`drow${d.code === code ? ' selected' : ''}`}
                  aria-current={d.code === code ? 'true' : undefined}
                  onClick={() => setParams({ pafta: d.code })}
                >
                  <span className="mono">{shortCode(d.code)}</span>
                  <span className="name">{d.title}</span>
                  <span className="dmeta">
                    {d.scale} · {d.paper}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );

  return (
    <div className={`drawings${mobile ? ' mobile' : ''}`}>
      {list}
      {(!mobile || selected) && (
        <section className="pane dview">
          {mobile && (
            <button type="button" className="back-btn" onClick={back}>
              <span aria-hidden="true">‹</span> Pafta listesi
            </button>
          )}
          {selected ? <DrawingView key={selected.code} drawing={selected} itemIds={items.data.filter((i) => !i.cancelled && i.drawings.includes(selected.code)).map((i) => i.id)} /> : <p className="viewer-empty">Listeden bir pafta seçin.</p>}
        </section>
      )}
    </div>
  );
}

function DrawingView({ drawing, itemIds }: { drawing: Drawing; itemIds: string[] }) {
  const revs = useRevisions(drawing.code);
  const rev = revs.data.find((r) => r.id === drawing.currentRevId) ?? revs.data[0] ?? null;
  const [pdf, setPdf] = useState<{ data: ArrayBuffer | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!rev) return;
    let live = true;
    setPdf({ data: null, error: null });
    loadDrawingPdf(rev.storagePath).then(
      (data) => live && setPdf({ data, error: null }),
      (e: Error) => live && setPdf({ data: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [rev?.storagePath]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <header className="dhead">
        <div className="dtitle">
          <span className="mono">{shortCode(drawing.code)}</span> {drawing.title}
          <span className="dmeta">
            {' '}
            · {drawing.scale} · {drawing.paper}
            {rev ? ` · ${rev.label}` : ''}
          </span>
        </div>
        {itemIds.length > 0 && (
          <div className="ditems">
            <span className="dmeta">Kalemler:</span>
            {itemIds.slice(0, 14).map((id) => (
              <Link key={id} className="chip" to={`/?kalem=${encodeURIComponent(id)}`}>
                {id}
              </Link>
            ))}
            {itemIds.length > 14 && <span className="dmeta">+{itemIds.length - 14}</span>}
          </div>
        )}
      </header>
      <div className="dcanvas">
        {pdf.error ? (
          <p className="viewer-empty">Pafta indirilemedi: {pdf.error}</p>
        ) : !rev && !revs.loading ? (
          <p className="viewer-empty">Bu paftanın yüklenmiş revizyonu yok.</p>
        ) : !pdf.data ? (
          <p className="viewer-empty">Pafta indiriliyor…</p>
        ) : (
          <Suspense fallback={<p className="viewer-empty">Görüntüleyici yükleniyor…</p>}>
            <PdfView data={pdf.data} />
          </Suspense>
        )}
      </div>
    </>
  );
}
