// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Collapsible } from './Collapsible';

const long = 'Her mahalin alanı, mimarın zemin kat planına çizdiği mahal sınır çizgisinden hesaplandı ve mahal etiketiyle eşleştirildi.';

describe('Collapsible', () => {
  it('uzun metin başta kısaltılmış, tıklayınca açılır ve kapanır', async () => {
    render(<Collapsible text={long} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).not.toHaveTextContent('eşleştirildi.');
    expect(btn).toHaveTextContent('Devamını göster');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveTextContent('eşleştirildi.');
    await userEvent.click(btn);
    expect(btn).toHaveTextContent('Devamını göster');
  });
  it('kısa metin düz gösterilir', () => {
    render(<Collapsible text="Ölçüm" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Ölçüm')).toBeInTheDocument();
  });
});
