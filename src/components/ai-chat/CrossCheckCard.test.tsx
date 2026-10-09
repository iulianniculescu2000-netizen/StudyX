import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CrossCheckCard from './CrossCheckCard';
import { useAIStore } from '../../store/aiStore';
import { ThemeProvider } from '../../theme/ThemeContext';
import type { CrossCheckOutcome } from '../../lib/ai/crossCheck';

const ok: CrossCheckOutcome = {
  ok: true,
  verifier: { provider: 'google', model: 'gemini-3.8-flash' },
  tokens: 412,
  estimated: false,
  result: {
    verdict: 'atentie',
    summary: 'O afirmație e nesigură.',
    claims: [
      { claim: 'Doza X', status: 'confirmat', reason: 'corect' },
      { claim: 'Mecanism Y', status: 'discutabil', reason: 'în sursă nu apare', inSource: false },
    ],
  },
};

function renderCard(run: () => Promise<CrossCheckOutcome>) {
  return render(
    <ThemeProvider><MemoryRouter><CrossCheckCard question="q" answer="a" producer={{ provider: 'groq', model: 'm' }} run={run} /></MemoryRouter></ThemeProvider>,
  );
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(50); });

describe('CrossCheckCard', () => {
  beforeEach(() => {
    useAIStore.setState({ provider: 'groq', apiKey: `gsk_${'x'.repeat(40)}`, providerKeys: { groq: `gsk_${'x'.repeat(40)}` } });
  });

  it('shows the hint (and no button) with a single provider', () => {
    const run = vi.fn();
    renderCard(run);
    expect(screen.getByText('Adaugă încă o cheie ca să verifici')).toBeInTheDocument();
    expect(screen.queryByText('Verifică cu alt model')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('never runs by itself; click shows loading then the verdict with expandable claims', async () => {
    useAIStore.setState({ providerKeys: { groq: `gsk_${'x'.repeat(40)}`, google: 'g'.repeat(30) } });
    let resolve!: (o: CrossCheckOutcome) => void;
    const run = vi.fn(() => new Promise<CrossCheckOutcome>((r) => { resolve = r; }));
    renderCard(run);
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Verifică cu alt model'));
    expect(screen.getByRole('status')).toHaveTextContent('Verific cu alt model');
    resolve(ok);
    await flush();
    expect(screen.getByTestId('crosscheck-verdict')).toHaveTextContent('Atenție');
    expect(screen.getByText(/gemini-3.8-flash · 412 tokeni/)).toBeInTheDocument();
    expect(screen.queryByText('Mecanism Y')).toBeNull();
    fireEvent.click(screen.getByText(/2 afirmații/));
    expect(screen.getByText('Mecanism Y')).toBeInTheDocument();
  });

  it('shows an error and allows retry', async () => {
    useAIStore.setState({ providerKeys: { groq: `gsk_${'x'.repeat(40)}`, google: 'g'.repeat(30) } });
    const run = vi.fn<() => Promise<CrossCheckOutcome>>().mockResolvedValueOnce({ ok: false, error: 'Limită atinsă' }).mockResolvedValueOnce(ok);
    renderCard(run);
    fireEvent.click(screen.getByText('Verifică cu alt model'));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Limită atinsă');
    fireEvent.click(screen.getByText('Reîncearcă verificarea'));
    await flush();
    expect(screen.getByTestId('crosscheck-verdict')).toBeInTheDocument();
  });

  it('cancel aborts the request and returns to idle', async () => {
    useAIStore.setState({ providerKeys: { groq: `gsk_${'x'.repeat(40)}`, google: 'g'.repeat(30) } });
    let signal: AbortSignal | undefined;
    const run = vi.fn((input: { abortSignal?: AbortSignal }) => new Promise<CrossCheckOutcome>(() => { signal = input.abortSignal; }));
    renderCard(run as never);
    fireEvent.click(screen.getByText('Verifică cu alt model'));
    fireEvent.click(screen.getByText('Anulează'));
    expect(signal?.aborted).toBe(true);
  });
});
