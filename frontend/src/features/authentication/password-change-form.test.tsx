import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { put } = vi.hoisted(() => ({ put: vi.fn() }));

// Keep the real error-mapping helper (`resolveApiErrorMessage`) — only the network call is stubbed.
vi.mock('@/lib/axios', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/axios')>();

    return { ...actual, api: { ...actual.api, put } };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PasswordChangeForm } from './password-change-form';

const apiError = (code: string, msg: string) => ({ response: { data: { code, msg, status: 'error' } } });

beforeEach(() => {
    put.mockReset().mockResolvedValue({ status: 'success' });
});

describe('PasswordChangeForm', () => {
    it('toggles password visibility via the InputPassword control', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeForm />);

        const current = screen.getByPlaceholderText('Enter your current password') as HTMLInputElement;
        expect(current.type).toBe('password');

        await user.click(screen.getAllByRole('button', { name: 'Show password' })[0]);

        expect(current.type).toBe('text');
    });

    it('submits the snake_case payload — proves RHF ref/onChange survive the InputPassword hop', async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        render(<PasswordChangeForm onSuccess={onSuccess} />);

        await user.type(screen.getByPlaceholderText('Enter your current password'), 'Oldpass0!');
        await user.type(screen.getByPlaceholderText('Enter your new password'), 'Abcdef1!gh');
        await user.type(screen.getByPlaceholderText('Confirm your new password'), 'Abcdef1!gh');
        await user.click(screen.getByRole('button', { name: 'Update Password' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
        expect(put).toHaveBeenCalledWith('/user/password', {
            confirm_password: 'Abcdef1!gh',
            current_password: 'Oldpass0!',
            password: 'Abcdef1!gh',
        });
    });

    it('maps a backend error code to friendly copy instead of the raw msg', async () => {
        const user = userEvent.setup();
        put.mockRejectedValueOnce(
            apiError('Users.ChangePasswordCurrentUser.InvalidCurrentPassword', 'invalid current password'),
        );
        render(<PasswordChangeForm />);

        await user.type(screen.getByPlaceholderText('Enter your current password'), 'Oldpass0!');
        await user.type(screen.getByPlaceholderText('Enter your new password'), 'Abcdef1!gh');
        await user.type(screen.getByPlaceholderText('Confirm your new password'), 'Abcdef1!gh');
        await user.click(screen.getByRole('button', { name: 'Update Password' }));

        expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
        expect(screen.queryByText('invalid current password')).not.toBeInTheDocument();
    });
});
