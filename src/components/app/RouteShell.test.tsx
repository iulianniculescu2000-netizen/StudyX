import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import { AppErrorBoundary, RouteView } from './RouteShell';

function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/b')}>go-b</button>
      <button onClick={() => navigate(-1)}>back</button>
      <button onClick={() => navigate('?q=a', { replace: true })}>query</button>
    </>
  );
}

function app(initial: string[] = ['/a']) {
  return (
    <MemoryRouter initialEntries={initial}>
      <ThemeProvider>
        <Nav />
        <Routes>
          <Route path="/a" element={<RouteView><div data-testid="page-a">A</div></RouteView>} />
          <Route path="/b" element={<RouteView><div data-testid="page-b">B</div></RouteView>} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>
  );
}

const host = () => document.querySelector('.route-scroll-host') as HTMLElement;

describe('RouteView — memorarea scroll-ului', () => {
  it('restaurează scrollTop la Înapoi (POP) și pornește de sus la o navigare nouă', async () => {
    render(app());
    host().scrollTop = 340;
    fireEvent.scroll(host());

    fireEvent.click(screen.getByText('go-b'));
    expect(screen.getByTestId('page-b')).toBeTruthy();
    expect(host().scrollTop).toBe(0);

    fireEvent.click(screen.getByText('back'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    expect(screen.getByTestId('page-a')).toBeTruthy();
    expect(host().scrollTop).toBe(340);
  });

  it('nu resetează scroll-ul la o schimbare de ?query pe aceeași pagină', () => {
    render(app());
    host().scrollTop = 200;
    fireEvent.scroll(host());
    fireEvent.click(screen.getByText('query'));
    expect(host().scrollTop).toBe(200);
  });

  it('restaurează și pe gazda interioară .overflow-y-auto', async () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <ThemeProvider>
          <Nav />
          <Routes>
            <Route path="/a" element={<RouteView><div className="overflow-y-auto" data-testid="inner">A</div></RouteView>} />
            <Route path="/b" element={<RouteView><div>B</div></RouteView>} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );
    const inner = screen.getByTestId('inner');
    inner.scrollTop = 120;
    fireEvent.scroll(inner);
    fireEvent.click(screen.getByText('go-b'));
    fireEvent.click(screen.getByText('back'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    expect(screen.getByTestId('inner').scrollTop).toBe(120);
  });
});

describe('RouteView — schelet cu întârziere', () => {
  it('nu arată scheletul imediat, ci după 150 ms', async () => {
    const Slow = lazy(() => new Promise<{ default: () => null }>(() => undefined));
    render(
      <MemoryRouter>
        <ThemeProvider>
          <RouteView><Slow /></RouteView>
        </ThemeProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('page-skeleton')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(160); });
    expect(screen.getByTestId('page-skeleton')).toBeTruthy();
  });
});

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <div>ok</div>;
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  function Harness() {
    const [key, setKey] = useState('/x');
    return (
      <ThemeProvider>
        <button onClick={() => setKey('/y')}>schimbă</button>
        <AppErrorBoundary resetKey={key}>
          <Suspense fallback={null}>
            <Boom explode={key === '/x'} />
          </Suspense>
        </AppErrorBoundary>
      </ThemeProvider>
    );
  }

  it('arată ecranul tematic în română, fără stack la vedere, și se resetează la schimbarea cheii', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Harness />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Ceva nu a mers bine')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reîncarcă pagina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiază detaliile' })).toBeTruthy();
    expect(screen.getByText(/boom/).closest('details')?.hasAttribute('open')).toBe(false);

    fireEvent.click(screen.getByText('schimbă'));
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('copiază detaliile în clipboard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiază detaliile' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain('boom');
    expect(screen.getByRole('button', { name: 'Detalii copiate' })).toBeTruthy();
  });
});
