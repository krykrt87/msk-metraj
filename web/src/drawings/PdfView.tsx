import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from 'pdfjs-dist';

type Pdfjs = typeof import('pdfjs-dist');
let lib: Promise<Pdfjs> | null = null;
/** pdfjs yalnız pafta açılınca indirilir (ana pakete girmez). */
function loadPdfjs(): Promise<Pdfjs> {
  return (lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = w.default;
    return m;
  }));
}

/** Taban katman: tüm sayfa bir kez ~4 MP. Yakınlaşınca yalnız görünen bölge tam çözünürlükte (ayrıntı katmanı). */
const BASE_PX = 4e6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function PdfView({ data }: { data: ArrayBuffer }) {
  const box = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const baseK = useRef(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(0); // CSS px / pt; 0 = henüz sığdırılmadı
  const [tick, setTick] = useState(0); // kaydırma → ayrıntı katmanını yeniden çiz
  const scaleRef = useRef(0);
  scaleRef.current = scale;
  const anchor = useRef<{ x: number; y: number; from: number; offX: number; offY: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());

  const vp1 = page?.getViewport({ scale: 1 });
  const pw = vp1?.width ?? 1;
  const ph = vp1?.height ?? 1;
  const fit = size.w && size.h ? Math.min(size.w / pw, size.h / ph) * 0.98 : 0;
  const minS = fit * 0.5;
  const maxS = Math.max(fit * 2, 8);
  const cssW = pw * scale;
  const cssH = ph * scale;
  const offOf = (s: number) => ({ x: Math.max(0, (size.w - pw * s) / 2), y: Math.max(0, (size.h - ph * s) / 2) });
  const off = offOf(scale);

  // belge
  useEffect(() => {
    let live = true;
    let task: PDFDocumentLoadingTask | null = null;
    setPage(null);
    setErr(null);
    setScale(0);
    loadPdfjs()
      .then((m) => {
        task = m.getDocument({ data: new Uint8Array(data.slice(0)) }); // kopya: pdfjs tamponu işçiye devreder
        return task.promise;
      })
      .then((doc) => doc.getPage(1))
      .then(
        (p) => live && setPage(p),
        (e: Error) => live && setErr(e.message),
      );
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [data]);

  // kutu boyutu
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ilk açılışta sığdır
  useEffect(() => {
    if (page && fit && !scale) setScale(fit);
  }, [page, fit, scale]);

  // taban katman
  useEffect(() => {
    const c = baseRef.current;
    if (!page || !c) return;
    const k = Math.min(2, Math.sqrt(BASE_PX / (pw * ph)));
    baseK.current = k;
    const vp = page.getViewport({ scale: k });
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    const task = page.render({ canvas: c, viewport: vp });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // yakınlaştırmada imlecin altındaki nokta yerinde kalsın
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = box.current;
    if (!a || !el) return;
    anchor.current = null;
    const r = scale / a.from;
    el.scrollLeft = (el.scrollLeft + a.x - a.offX) * r - a.x + off.x;
    el.scrollTop = (el.scrollTop + a.y - a.offY) * r - a.y + off.y;
  }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // ayrıntı katmanı: görünen bölge, ekran çözünürlüğünde
  useEffect(() => {
    const c = detailRef.current;
    const el = box.current;
    if (!page || !scale || !c || !el) return;
    if (c.dataset.scale !== String(scale)) c.style.display = 'none'; // eski ölçekteki ayrıntı yanlış yerde kalmasın
    const dpr = window.devicePixelRatio || 1;
    if (scale * dpr <= baseK.current * 1.15) return; // taban yeterince keskin
    const vw = Math.min(size.w, cssW);
    const vh = Math.min(size.h, cssH);
    const x0 = clamp(el.scrollLeft - off.x, 0, cssW - vw);
    const y0 = clamp(el.scrollTop - off.y, 0, cssH - vh);
    let task: RenderTask | null = null;
    let live = true;
    const t = setTimeout(() => {
      const tmp = document.createElement('canvas');
      tmp.width = Math.ceil(vw * dpr);
      tmp.height = Math.ceil(vh * dpr);
      task = page.render({ canvas: tmp, viewport: page.getViewport({ scale: scale * dpr, offsetX: -x0 * dpr, offsetY: -y0 * dpr }) });
      task.promise.then(
        () => {
          if (!live) return;
          c.width = tmp.width;
          c.height = tmp.height;
          c.getContext('2d')!.drawImage(tmp, 0, 0);
          Object.assign(c.style, { display: 'block', left: `${x0}px`, top: `${y0}px`, width: `${vw}px`, height: `${vh}px` });
          c.dataset.scale = String(scale);
        },
        () => {},
      );
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
      task?.cancel();
    };
  }, [page, scale, size, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (factor: number, x: number, y: number) => {
    const from = scaleRef.current;
    if (!from) return;
    const to = clamp(from * factor, minS, maxS);
    if (to === from) return;
    const o = offOf(from);
    anchor.current = { x, y, from, offX: o.x, offY: o.y };
    scaleRef.current = to;
    setScale(to);
  };
  const zoomCenter = (factor: number) => zoomAt(factor, size.w / 2, size.h / 2);

  // tekerlek: yakınlaştır (sayfa kaymasın diye pasif olmayan dinleyici)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      zoomAt(Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // sürükle: kaydır; iki parmak: yakınlaştır
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const el = e.currentTarget;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.current.size === 1) {
      el.scrollLeft -= cur.x - prev.x;
      el.scrollTop -= cur.y - prev.y;
    } else if (pts.current.size === 2) {
      const other = [...pts.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      const r = el.getBoundingClientRect();
      if (d0 > 0) zoomAt(d1 / d0, (cur.x + other.x) / 2 - r.left, (cur.y + other.y) / 2 - r.top);
    }
    pts.current.set(e.pointerId, cur);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
  };

  return (
    <div className="pdfview">
      <div className="pdf-tools" role="toolbar" aria-label="Yakınlaştırma">
        <button type="button" className="btn" onClick={() => zoomCenter(1 / 1.5)} aria-label="Uzaklaştır" disabled={!page}>
          −
        </button>
        <span className="pdf-zoom">{fit && scale ? `%${Math.round((scale / fit) * 100)}` : '—'}</span>
        <button type="button" className="btn" onClick={() => zoomCenter(1.5)} aria-label="Yakınlaştır" disabled={!page}>
          +
        </button>
        <button type="button" className="btn" onClick={() => fit && setScale(fit)} disabled={!page}>
          Sığdır
        </button>
      </div>
      <div
        ref={box}
        className="pdf-box"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          zoomAt(2, e.clientX - r.left, e.clientY - r.top);
        }}
        onScroll={() => setTick((t) => t + 1)}
      >
        {err ? <p className="viewer-empty">Pafta açılamadı: {err}</p> : !page && <p className="viewer-empty">Pafta hazırlanıyor…</p>}
        <div className="pdf-content" style={{ width: Math.max(cssW, size.w), height: Math.max(cssH, size.h) }}>
          <div className="pdf-stage" style={{ left: off.x, top: off.y, width: cssW, height: cssH }}>
            <canvas ref={baseRef} className="pdf-base" />
            <canvas ref={detailRef} className="pdf-detail" />
          </div>
        </div>
      </div>
    </div>
  );
}
