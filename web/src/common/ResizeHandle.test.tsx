// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ResizeHandle } from './ResizeHandle';

function Host() {
  const [w, setW] = useState(400);
  return (
    <>
      <ResizeHandle width={w} onChange={setW} min={360} max={900} label="Bilgi kartı genişliği" />
      <output data-testid="w">{w}</output>
    </>
  );
}

describe('ResizeHandle', () => {
  it('sol kenardan sola çekince genişler', () => {
    render(<Host />);
    const h = screen.getByRole('separator', { name: 'Bilgi kartı genişliği' });
    fireEvent.pointerDown(h, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 850, pointerId: 1 });
    fireEvent.pointerUp(h, { clientX: 850, pointerId: 1 });
    expect(screen.getByTestId('w').textContent).toBe('550');
  });
  it('sınırları aşmaz', () => {
    render(<Host />);
    const h = screen.getByRole('separator');
    fireEvent.pointerDown(h, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(h, { clientX: 2000, pointerId: 1 });
    expect(screen.getByTestId('w').textContent).toBe('360');
  });
  it('klavye okları ile değişir', () => {
    render(<Host />);
    const h = screen.getByRole('separator');
    fireEvent.keyDown(h, { key: 'ArrowLeft' });
    expect(screen.getByTestId('w').textContent).toBe('424');
    expect(h.getAttribute('aria-valuenow')).toBe('424');
  });
});
