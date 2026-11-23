import { useEffect, useState } from 'react';

/** Telefon genişliği: metraj sayfası tek sütuna geçer. */
export const MOBILE_QUERY = '(max-width: 760px)';

const match = (q: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => match(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return on;
}
