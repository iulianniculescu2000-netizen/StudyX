import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useAIStore, type CopilotStatusInfo } from '../../store/aiStore';
import CopilotStatusSection from './CopilotStatusSection';

const TWO_ACCOUNTS: CopilotStatusInfo = {
  state: 'connected',
  isAuthenticated: true,
  login: 'cont-gratuit',
  authType: 'gh-cli',
  accounts: [
    { key: 'a-free', login: 'cont-gratuit', source: 'gh', active: true, switchable: true },
    { key: 'a-paid', login: 'cont-platit', source: 'user', active: false, switchable: true },
  ],
  quota: { isUnlimitedEntitlement: false, entitlementRequests: 200, usedRequests: 1, remainingPercentage: 99.5 },
};

function mountCard() {
  return render(<ThemeProvider><CopilotStatusSection /></ThemeProvider>);
}

describe('cardul GitHub Copilot din Setări AI', () => {
  const prevApi = window.electronAPI;

  beforeEach(() => {
    // setup.ts pornește timere false: waitFor/findBy au nevoie de cele reale.
    vi.useRealTimers();
    useAIStore.setState({ provider: 'groq', copilotConnected: true, copilotStatusInfo: TWO_ACCOUNTS });
  });
  afterEach(() => {
    window.electronAPI = prevApi;
  });

  it('arată ambele conturi, îl marchează pe cel folosit și comută în celălalt', async () => {
    const copilotSwitchAccount = vi.fn(async () => ({ ok: true }));
    const copilotStatus = vi.fn(async () => ({ ...TWO_ACCOUNTS, accounts: TWO_ACCOUNTS.accounts }));
    window.electronAPI = { ...(prevApi as NonNullable<typeof prevApi>), copilotSwitchAccount, copilotStatus };

    mountCard();
    const free = screen.getByRole('radio', { name: /cont-gratuit/ });
    const paid = screen.getByRole('radio', { name: /cont-platit/ });
    expect(free.getAttribute('aria-checked')).toBe('true');
    expect(paid.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(paid);
    await waitFor(() => expect(copilotSwitchAccount).toHaveBeenCalledWith('a-paid'));
    await waitFor(() => expect(copilotStatus).toHaveBeenCalled());
  });

  it('cu un singur cont nu arată lista, dar oferă „Alt cont GitHub”', () => {
    useAIStore.setState({ copilotStatusInfo: { ...TWO_ACCOUNTS, accounts: [TWO_ACCOUNTS.accounts![0]] } });
    window.electronAPI = { ...(prevApi as NonNullable<typeof prevApi>), copilotLoginStart: vi.fn(async () => ({ ok: false as const })) };
    mountCard();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: /Alt cont GitHub/ })).toBeTruthy();
  });

  it('„Alt cont GitHub” pornește conectarea cu cod și arată codul, fără să schimbe contul curent', async () => {
    const copilotLoginStart = vi.fn(async () => ({
      ok: true as const,
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 899,
    }));
    window.electronAPI = { ...(prevApi as NonNullable<typeof prevApi>), copilotLoginStart, copilotOnLoginEvent: () => () => {} };

    mountCard();
    fireEvent.click(screen.getByRole('button', { name: /Alt cont GitHub/ }));
    await screen.findByText('ABCD-1234');
    expect(copilotLoginStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Anulează/ })).toBeTruthy();
    expect(screen.getByText(/valabil 15 minute/)).toBeTruthy();
    // Cât timp așteptăm codul, contul folosit rămâne cel de dinainte.
    expect(useAIStore.getState().copilotStatusInfo.login).toBe('cont-gratuit');
  });

  it('o conectare eșuată arată mesajul și nu blochează cardul', async () => {
    window.electronAPI = {
      ...(prevApi as NonNullable<typeof prevApi>),
      copilotLoginStart: vi.fn(async () => ({ ok: false as const, error: 'GitHub nu a oferit conectarea cu cod.' })),
    };
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: /Alt cont GitHub/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('GitHub nu a oferit conectarea cu cod.');
    expect((screen.getByRole('button', { name: /Alt cont GitHub/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
