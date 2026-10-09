import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import { useTutorialStore } from '../store/tutorialStore';
import { useUserStore } from '../store/userStore';
import WhatsNewTour, { WHATS_NEW_OPEN_EVENT } from './WhatsNewTour';

vi.mock('../hooks/useAdaptiveMotion', async () => {
  const { resolve } = await import('../theme/motion');
  return { useAdaptiveMotion: () => ({ calmMotion: true, reducedMotion: true, performanceLite: false, t: resolve(true) }) };
});

const PROFILE = 'p-resume';

const mount = () => render(
  <MemoryRouter>
    <ThemeProvider>
      <WhatsNewTour />
    </ThemeProvider>
  </MemoryRouter>,
);

const openSlides = async () => {
  await act(async () => { window.dispatchEvent(new Event(WHATS_NEW_OPEN_EVENT)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(900); });
};

describe('"Arată-mi" in the what\'s-new slides', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUserStore.setState({ activeProfileId: PROFILE });
    useTutorialStore.setState({
      activeTour: null, active: false, currentStep: 0, _hasHydrated: true,
      seen: { [PROFILE]: { onboarding: '2.3.0' } },
    });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('starts the page tour, brings the slides back one slide further, and keeps to seven slides', async () => {
    mount();
    await openSlides();
    // Slide 2 (study) is the first with an "Arată-mi" button.
    fireEvent.click(screen.getByRole('button', { name: /Slide următor/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(screen.getByRole('button', { name: /Arată-mi Flashcardurile/i }));

    // The slides step aside without being marked as seen…
    await act(async () => { await vi.advanceTimersByTimeAsync(450); });
    expect(useTutorialStore.getState().activeTour).toBe('flashcards');
    expect(useTutorialStore.getState().seen[PROFILE]?.whatsNew).toBeUndefined();
    expect(screen.queryByText(/Arată-mi Flashcardurile/i)).toBeNull();

    // …and return, one slide further (the next slide), as soon as the page tour is done.
    await act(async () => { useTutorialStore.getState().finishTour(PROFILE); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByRole('button', { name: /Arată-mi Biblioteca AI/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Arată-mi Flashcardurile/i })).toBeNull();

    // Seven slides at most, and every "Arată-mi" belongs to a registered tour.
    const dots = screen.getAllByRole('button', { name: /^Slide \d+$/ });
    expect(dots.length).toBeLessThanOrEqual(7);
    const seen: string[] = [];
    for (let i = 0; i < dots.length; i += 1) {
      fireEvent.click(screen.getAllByRole('button', { name: /^Slide \d+$/ })[i]);
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      const cta = screen.queryByRole('button', { name: /^Arată-mi / });
      if (cta) seen.push(cta.textContent ?? '');
    }
    expect(seen.length).toBeGreaterThanOrEqual(4);
    const { TOURS } = await import('../tutorial/registry');
    for (const tour of ['flashcards', 'vault', 'residency', 'simulation', 'settings'] as const) expect(TOURS[tour]).toBeTruthy();
  });
});
