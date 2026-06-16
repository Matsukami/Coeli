import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import SettingsLayout from './settings-layout';

function renderAt(entry: { pathname: string; state?: unknown }) {
    return render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route
                    element={<SettingsLayout />}
                    path="/settings"
                >
                    <Route
                        element={<div>account</div>}
                        path="account"
                    />
                    <Route
                        element={<div>providers</div>}
                        path="providers"
                    />
                </Route>
            </Routes>
        </MemoryRouter>,
    );
}

const backToApp = () => screen.getByRole('link', { name: /Back to App/ });

describe('SettingsLayout "Back to App"', () => {
    it('returns to the page the user came from', () => {
        renderAt({ pathname: '/settings/account', state: { from: '/dashboard' } });

        expect(backToApp()).toHaveAttribute('href', '/dashboard');
    });

    it('falls back to /flows when there is no origin', () => {
        renderAt({ pathname: '/settings/account' });

        expect(backToApp()).toHaveAttribute('href', '/flows');
    });

    it('keeps the origin after switching settings sub-tabs (which drop location.state)', async () => {
        const user = userEvent.setup();
        renderAt({ pathname: '/settings/account', state: { from: '/dashboard' } });

        await user.click(screen.getByRole('link', { name: 'Providers' }));

        expect(backToApp()).toHaveAttribute('href', '/dashboard');
    });
});
