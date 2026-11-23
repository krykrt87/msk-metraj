import { useState } from 'react';

/** Uzun metni ilk satırla kısaltır; tıklayınca tamamı açılır. */
export function Collapsible({ text, limit = 90 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (!text) return <>—</>;
  if (text.length <= limit) return <>{text}</>;
  return (
    <button
      type="button"
      className={`collapsible${open ? ' open' : ''}`}
      aria-expanded={open}
      // tıklanabilir satır içinde (cetvel) satırın tıklamasını tetiklemesin
      onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="col-text">{open ? text : `${text.slice(0, limit).trimEnd()}…`}</span>
      <span className="col-toggle">{open ? 'Kısalt' : 'Devamını göster'}</span>
    </button>
  );
}
