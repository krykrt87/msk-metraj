// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('hatalı şifrede Türkçe mesaj gösterir', async () => {
    const signIn = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }));
    render(<LoginPage signIn={signIn} />);
    await userEvent.type(screen.getByLabelText('E-posta'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Şifre'), 'yanlis');
    await userEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'yanlis');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya şifre hatalı.');
  });
  it('kayıt bağlantısı yoktur', () => {
    render(<LoginPage signIn={vi.fn()} />);
    expect(screen.queryByText(/kayıt ol/i)).not.toBeInTheDocument();
  });
});
