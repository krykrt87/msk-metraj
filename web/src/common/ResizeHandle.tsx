import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Sağdaki panelin sol kenarına konan sürükleme tutamağı: sola çekince panel genişler.
 * Klavye: ← / → 24 px, Home / End en geniş / en dar. Çift tıklama varsayılana döner.
 */
export function ResizeHandle({
  width,
  onChange,
  min,
  max,
  label,
  onReset,
}: {
  width: number;
  onChange: (w: number) => void;
  min: number;
  max: number;
  label: string;
  onReset?: () => void;
}) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.classList.add('resizing');
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onChange(clamp(drag.current.w + (drag.current.x - e.clientX), min, max));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.classList.remove('resizing');
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === 'ArrowLeft' ? width + 24 : e.key === 'ArrowRight' ? width - 24 : e.key === 'Home' ? max : e.key === 'End' ? min : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clamp(next, min, max));
  };
  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Genişletmek için sürükleyin (çift tıklama: varsayılan)"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={onReset}
    />
  );
}
