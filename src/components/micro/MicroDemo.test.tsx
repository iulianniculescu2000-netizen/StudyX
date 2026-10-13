import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import FocusCardDemo from './FocusCardDemo';
import { expectNoA11yViolations } from '../../test/a11y';

const motion = vi.hoisted(() => ({ calm: false }));
vi.mock('../../hooks/useAdaptiveMotion', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useAdaptiveMotion')>('../../hooks/useAdaptiveMotion');
  return { ...actual, useAdaptiveMotion: () => ({ ...actual.useAdaptiveMotion(), calmMotion: motion.calm }) };
});

const wrap = () => render(<ThemeProvider><FocusCardDemo /></ThemeProvider>);

describe('FocusCardDemo', () => {
  beforeEach(() => {
    motion.calm = false;
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('parcurge cele trei etape, cu legenda fiecăreia', () => {
    wrap();
    expect(screen.getByText('Subiectele care merită atenție azi, din răspunsurile tale.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText('Exersează pornește o sesiune din întrebările tale.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText('La final vezi cât s-a mișcat stăpânirea subiectului.')).toBeTruthy();
  });

  it('pornește din nou după ce se termină, iar pauza o oprește', () => {
    wrap();
    act(() => { vi.advanceTimersByTime(11_500); });
    expect(screen.getByText('La final vezi cât s-a mișcat stăpânirea subiectului.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Subiectele care merită atenție azi, din răspunsurile tale.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Oprește demonstrația' }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('Subiectele care merită atenție azi, din răspunsurile tale.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pornește demonstrația' })).toBeTruthy();
  });

  it('cu mișcare redusă arată cadrul final, fix, fără comenzi', () => {
    motion.calm = true;
    wrap();
    expect(screen.getByText('La final vezi cât s-a mișcat stăpânirea subiectului.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText('La final vezi cât s-a mișcat stăpânirea subiectului.')).toBeTruthy();
  });

  it('conținutul animat e inert, iar povestea completă e în text', () => {
    const { container } = wrap();
    const stage = container.querySelector('[inert]');
    expect(stage).toBeTruthy();
    expect(stage?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.sr-only')?.textContent).toContain('de la 21% la 50%');
  });

  it('nu are probleme de accesibilitate (axe)', async () => {
    const { container } = wrap();
    await expectNoA11yViolations(container);
  }, 30_000);
});
