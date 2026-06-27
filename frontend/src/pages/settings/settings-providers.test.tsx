import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const enabled = {
    anthropic: true,
    bedrock: true,
    custom: false,
    deepseek: true,
    gemini: true,
    glm: true,
    kimi: true,
    minimax: false,
    ollama: true,
    openai: true,
    qwen: true,
};

vi.mock('@apollo/client/react', () => ({
    useMutation: () => [vi.fn(), {}],
    useQuery: () => ({ data: { settingsProviders: { enabled } } }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router-dom')>()),
    useNavigate: () => vi.fn(),
}));

import { SettingsProvidersHeader } from './settings-providers';

describe('SettingsProvidersHeader create menu', () => {
    it('offers only provider types whose API key is configured', async () => {
        const user = userEvent.setup();
        render(<SettingsProvidersHeader />);

        await user.click(screen.getByRole('button', { name: /create provider/i }));

        expect(screen.queryByRole('menuitem', { name: /MiniMax/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: /Custom/ })).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Anthropic/ })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /OpenAI/ })).toBeInTheDocument();
    });
});
