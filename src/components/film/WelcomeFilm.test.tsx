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

const PROFILE = 'p-film';

const reset = (seen: Record<string, Record<string, string>> = {}) => {
  useUserStore.setState({ activeProfileId: PROFILE });
  useTutorialStore.setState({ activeTour: null, active: false, currentStep: 0, _hasHydrated: true, seen });
};

describe('filmul de bun venit', () => {
  beforeEach(() => { vi.useFakeTimers(); reset(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

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
});
