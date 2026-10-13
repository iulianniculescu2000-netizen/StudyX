import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import TourEngine from '../../tutorial/TourEngine';
import { useTutorialStore } from '../../store/tutorialStore';
import { useUserStore } from '../../store/userStore';
import WelcomeFilm from './WelcomeFilm';
import { WELCOME_FILM_OPEN_EVENT } from './filmEvents';
import { FILM_SCENES } from './scenes';

vi.mock('../../hooks/useAdaptiveMotion', async () => {
  const { resolve } = await import('../../theme/motion');
  return { useAdaptiveMotion: () => ({ calmMotion: true, reducedMotion: true, performanceLite: false, t: resolve(true) }) };
});

// Keep default-story tests independent of author-owned recordings in public/.
vi.mock('./narration', async (importOriginal) => ({
  ...await importOriginal<typeof import('./narration')>(), BUNDLED_NARRATION: [],
}));

const PROFILE = 'p-film';

const reset = (seen: Record<string, Record<string, string>> = {}) => {
  useUserStore.setState({ activeProfileId: PROFILE });
  useTutorialStore.setState({ activeTour: null, active: false, currentStep: 0, _hasHydrated: true, seen });
};

describe('filmul de bun venit', () => {
  beforeEach(() => {
    vi.useFakeTimers(); reset();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('are șapte scene, fiecare cu titlu, text și durată', () => {
    expect(FILM_SCENES).toHaveLength(7);
    expect(new Set(FILM_SCENES.map((scene) => scene.id)).size).toBe(7);
    for (const scene of FILM_SCENES) {
      expect(scene.title.length, scene.id).toBeGreaterThan(5);
      expect(scene.text.length, scene.id).toBeGreaterThan(20);
      expect(scene.durationMs, scene.id).toBeGreaterThanOrEqual(4000);
    }
  });

  it('nu apare singur când nu rulează turul de bun venit', () => {
    render(<WelcomeFilm />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('se redeschide din Setări, se poate parcurge și se închide fără să pornească turul', async () => {
    render(<WelcomeFilm />);
    await act(async () => { window.dispatchEvent(new Event(WELCOME_FILM_OPEN_EVENT)); });
    expect(screen.getByRole('dialog', { name: FILM_SCENES[0].title })).toBeTruthy();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Pauză film');

    fireEvent.click(screen.getByRole('button', { name: /Scena următoare/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole('dialog', { name: FILM_SCENES[1].title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Scena 7/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole('button', { name: /^Gata/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Gata/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(useTutorialStore.getState().activeTour).toBeNull();
    expect(useTutorialStore.getState().seen[PROFILE]?.welcomeFilm).toBeTruthy();
  });

  it('la prima pornire se deschide înaintea turului de bun venit și „Sari peste” îl marchează văzut', async () => {
    render(<WelcomeFilm />);
    await act(async () => { useTutorialStore.getState().startTour('onboarding'); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sari peste/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sari peste/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(useTutorialStore.getState().seen[PROFILE]?.welcomeFilm).toBeTruthy();
    // Turul rămâne pornit: filmul doar îi face loc.
    expect(useTutorialStore.getState().activeTour).toBe('onboarding');
  });

  it('nu se mai deschide la un profil care l-a văzut deja', async () => {
    reset({ [PROFILE]: { welcomeFilm: '1.0.0' } });
    render(<WelcomeFilm />);
    await act(async () => { useTutorialStore.getState().startTour('onboarding'); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('turul de bun venit așteaptă filmul: apare abia după ce filmul e văzut', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <TourEngine profileId={PROFILE} />
          <WelcomeFilm />
        </ThemeProvider>
      </MemoryRouter>,
    );
    await act(async () => { useTutorialStore.getState().startTour('onboarding'); });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Sari peste/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sari peste/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole('dialog', { name: /Bun venit/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sari peste/i })).toBeNull();
  });

  it('Esc face loc turului fără să îl închidă și el', async () => {
    render(<MemoryRouter><ThemeProvider><TourEngine profileId={PROFILE} /><WelcomeFilm /></ThemeProvider></MemoryRouter>);
    await act(async () => { useTutorialStore.getState().startTour('onboarding'); });
    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(useTutorialStore.getState().activeTour).toBe('onboarding');
    expect(screen.getByRole('dialog', { name: /Bun venit/i })).toBeTruthy();
  });

  it('folosește textul și durata măsurată, pornește fără audio și păstrează pauza la schimbarea scenei', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [{ id: 'intro', text: 'Narațiune locală de test', durationMs: 7080 }] } as Response);
    render(<WelcomeFilm />);
    await act(async () => { window.dispatchEvent(new Event(WELCOME_FILM_OPEN_EVENT)); });
    expect(screen.getByText('Narațiune locală de test')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pornește narațiunea' }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('audio')?.hasAttribute('src')).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    fireEvent.click(screen.getByRole('button', { name: 'Pauză film' }));
    const before = screen.getByRole('progressbar').getAttribute('aria-valuenow');
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(before);
    fireEvent.keyDown(window, { key: '2' });
    await act(async () => {});
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).toBe('quiz');
    expect(screen.getByRole('dialog').getAttribute('data-film-playing')).toBe('false');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7230');
    fireEvent.click(screen.getByRole('button', { name: 'Reia de la început' }));
    await act(async () => {});
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).toBe('intro');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('R reia filmul chiar dacă focusul e pe butonul de pauză, fără să deturneze Ctrl+R', async () => {
    render(<WelcomeFilm />);
    await act(async () => { window.dispatchEvent(new Event(WELCOME_FILM_OPEN_EVENT)); });
    fireEvent.click(screen.getByRole('button', { name: /Scena 3/i }));
    await act(async () => {});
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).not.toBe('intro');
    const pause = screen.getByRole('button', { name: /film$/ });
    pause.focus();
    expect(document.activeElement).toBe(pause);
    fireEvent.keyDown(pause, { key: 'r', ctrlKey: true });
    await act(async () => {});
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).not.toBe('intro');
    fireEvent.keyDown(pause, { key: 'r' });
    await act(async () => {});
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).toBe('intro');
  });

  it('ține ultima scenă până la confirmare, apoi reia fără a marca profilul văzut', async () => {
    render(<WelcomeFilm />);
    await act(async () => { window.dispatchEvent(new Event(WELCOME_FILM_OPEN_EVENT)); });
    fireEvent.click(screen.getByRole('button', { name: /Scena 7/i }));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).toBe('finish');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60000');
    expect(screen.getByRole('dialog').getAttribute('data-film-playing')).toBe('false');
    expect(useTutorialStore.getState().seen[PROFILE]?.welcomeFilm).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reia filmul' }));
    await act(async () => {});
    expect(screen.getByRole('dialog').getAttribute('data-film-scene')).toBe('intro');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});
