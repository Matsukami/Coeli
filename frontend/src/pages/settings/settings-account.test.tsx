import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({ authState: { value: null as unknown } }));

vi.mock('@/providers/user-provider', () => ({
    useUser: () => ({ authInfo: authState.value, patchUser: vi.fn(), refreshAuthInfo: vi.fn() }),
}));

import SettingsAccount from './settings-account';

const localUser = { created_at: '2026-01-15T00:00:00Z', mail: 'local@example.com', name: 'Local User', type: 'local' };
const githubUser = { mail: 'gh@example.com', name: 'GH User', provider: 'github', type: 'oauth' };

beforeEach(() => {
    authState.value = null;
});

describe('SettingsAccount gating', () => {
    it('renders nothing without a user', () => {
        const { container } = render(<SettingsAccount />);
        expect(container).toBeEmptyDOMElement();
    });

    it('exposes name, email and password for a local account', () => {
        authState.value = { user: localUser };
        render(<SettingsAccount />);

        expect(screen.getByText('Local account')).toBeInTheDocument();
        expect(screen.getByText('Password')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(3);
    });

    it.each([
        ['😀 Team', '😀'],
        ['中文 用户', '中'],
        ['한국 사용자', '한'],
        ['𠀋 Lin', '𠀋'],
    ])('uses the first whole code point of %s as the avatar initial', (name, expected) => {
        authState.value = { user: { mail: 'e@x.com', name, type: 'local' } };
        render(<SettingsAccount />);

        expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('hides password and email editing for an OAuth account but keeps the name editable', () => {
        authState.value = { user: githubUser };
        render(<SettingsAccount />);

        expect(screen.getByText('GitHub')).toBeInTheDocument();
        expect(screen.getByText('Linked from your GitHub.')).toBeInTheDocument();
        expect(screen.queryByText('Password')).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(1);
    });

    it('labels an unknown provider by its raw name, then a generic fallback', () => {
        authState.value = { user: { mail: 'x@e.com', name: 'X', provider: 'gitlab', type: 'oauth' } };
        const { unmount } = render(<SettingsAccount />);
        expect(screen.getByText('gitlab')).toBeInTheDocument();
        unmount();

        authState.value = { user: { mail: 'y@e.com', name: 'Y', type: 'oauth' } };
        render(<SettingsAccount />);
        expect(screen.getByText('OAuth account')).toBeInTheDocument();
    });

    it('opens the name form on Change for an OAuth user', async () => {
        const user = userEvent.setup();
        authState.value = { user: githubUser };
        render(<SettingsAccount />);

        await user.click(screen.getByRole('button', { name: 'Change' }));

        expect(screen.getByRole('button', { name: 'Update Name' })).toBeInTheDocument();
    });
});
