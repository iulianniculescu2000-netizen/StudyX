import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import ChatRequestDemo from './ChatRequestDemo';
import ErrorsDemo from './ErrorsDemo';
import FocusCardDemo from './FocusCardDemo';
import SourceDemo from './SourceDemo';
import { stageOpacity } from './stageOpacity';
import { expectNoA11yViolations } from '../../test/a11y';

const motion = vi.hoisted(() => ({ calm: false }));
vi.mock('../../hooks/useAdaptiveMotion', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useAdaptiveMotion')>('../../hooks/useAdaptiveMotion');
  return { ...actual, useAdaptiveMotion: () => ({ ...actual.useAdaptiveMotion(), calmMotion: motion.calm }) };
});

const wrap = (Demo: ComponentType) => render(<ThemeProvider><Demo /></ThemeProvider>);

interface Case { name: string; Demo: ComponentType; durationMs: number; captions: [string, string, string]; closing: string }
const CASES: Case[] = [
  {
    name: 'Pentru tine', Demo: FocusCardDemo, durationMs: 11_000, closing: 'de la 21% la 50%',
    captions: ['Subiectele care merită atenție azi, din răspunsurile tale.', 'Exersează pornește o sesiune din întrebările tale.', 'La final vezi cât s-a mișcat stăpânirea subiectului.'],
  },
  {
    name: 'Caiet de erori', Demo: ErrorsDemo, durationMs: 12_000, closing: 'greșeala se închide',
    captions: ['Greșelile tale, grupate pe disciplină.', 'Le repeți într-un test scurt, când apeși tu.', 'După trei răspunsuri corecte la rând, greșeala se închide.'],
  },
  {
    name: 'Cerere în chat', Demo: ChatRequestDemo, durationMs: 12_000, closing: 'Rezolvă acum',
    captions: ['Ceri în română, cu cuvintele tale.', 'Cartea de opțiuni te lasă să alegi subiectul, nivelul, numărul și folderul.', 'Generarea pornește doar după confirmarea ta.'],
  },
  {
    name: 'Vezi în carte', Demo: SourceDemo, durationMs: 11_000, closing: 'îți spune asta',
    captions: ['După verificare citești explicația.', 'Vezi în carte caută fragmentul abia când apeși.', 'Se deschide fragmentul din cartea ta.'],
  },
];

describe('micro-demo-uri', () => {
  beforeEach(() => {
    motion.calm = false;
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  describe.each(CASES)('$name', ({ Demo, durationMs, captions, closing }) => {
    it('parcurge cele trei etape, cu legenda fiecăreia', () => {
      wrap(Demo);
      expect(screen.getByText(captions[0])).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4300); });
      expect(screen.getByText(captions[1])).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4300); });
      expect(screen.getByText(captions[2])).toBeTruthy();
    });

    it('pornește din nou după ce se termină, iar pauza o oprește', () => {
      wrap(Demo);
      act(() => { vi.advanceTimersByTime(durationMs + 500); });
      expect(screen.getByText(captions[2])).toBeTruthy();
      act(() => { vi.advanceTimersByTime(2500); });
      expect(screen.getByText(captions[0])).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Oprește demonstrația' }));
      act(() => { vi.advanceTimersByTime(6000); });
      expect(screen.getByText(captions[0])).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Pornește demonstrația' })).toBeTruthy();
    });

    it('cu mișcare redusă arată cadrul final, fix, fără comenzi', () => {
      motion.calm = true;
      wrap(Demo);
      expect(screen.getByText(captions[2])).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(screen.getByText(captions[2])).toBeTruthy();
    });

    it('conținutul animat e inert, iar povestea completă e în text', () => {
      const { container } = wrap(Demo);
      const stage = container.querySelector('[inert]');
      expect(stage?.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('.sr-only')?.textContent).toContain(closing);
    });

    it('nu are probleme de accesibilitate (axe)', async () => {
      const { container } = wrap(Demo);
      await expectNoA11yViolations(container);
    }, 30_000);
  });
});

describe('stageOpacity', () => {
  it('intră și iese treptat, iar ultima etapă rămâne', () => {
    expect(stageOpacity(0, 1000, 2000, 5000)).toBe(0);
    expect(stageOpacity(1140, 1000, 2000, 5000)).toBeCloseTo(0.5, 1);
    expect(stageOpacity(1500, 1000, 2000, 5000)).toBe(1);
    expect(stageOpacity(2000, 1000, 2000, 5000)).toBe(0);
    expect(stageOpacity(4900, 4000, 5000, 5000)).toBe(1);
  });
});
