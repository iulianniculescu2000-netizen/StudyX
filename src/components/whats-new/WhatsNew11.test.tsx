import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useThemeStore } from '../../store/themeStore';
import { useTutorialStore } from '../../store/tutorialStore';
import { useUserStore } from '../../store/userStore';
import { RELEASE_DISPLAY_NAME } from '../../tutorial/tourMeta';
import { TOURS } from '../../tutorial/registry';
import { useSceneTime } from '../film/useTimeline';
import WhatsNewTour, { WHATS_NEW_OPEN_EVENT } from '../WhatsNewTour';
import WhatsNewStage from './WhatsNewStage';
import { RELEASE_11_SLIDES, whatsNewEditionFor } from './release11';
import { pointerTilt, sway } from '../depth/useTilt';
import { expectNoA11yViolations } from '../../test/a11y';

const motion = vi.hoisted(() => ({ calm: true }));
vi.mock('../../hooks/useAdaptiveMotion', async () => {
  const { resolve } = await import('../../theme/motion');
  return { useAdaptiveMotion: () => ({ calmMotion: motion.calm, reducedMotion: motion.calm, performanceLite: false, t: resolve(motion.calm) }) };
});

const PROFILE = 'p-whats-new-11';

const mountSlides = () => render(
  <MemoryRouter>
    <ThemeProvider>
      <WhatsNewTour />
    </ThemeProvider>
  </MemoryRouter>,
);

const open = async (edition?: '1.1') => {
  await act(async () => { window.dispatchEvent(new CustomEvent(WHATS_NEW_OPEN_EVENT, edition ? { detail: { edition } } : undefined)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
};

const goTo = async (slide: number) => {
  fireEvent.click(screen.getByRole('button', { name: `Slide ${slide + 1}` }));
  for (let step = 0; step < 10; step += 1) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
};

describe('„Ce e nou” 1.1', () => {
  beforeEach(() => {
    motion.calm = true;
    vi.useFakeTimers();
    useThemeStore.setState({ mode: 'light' });
    useUserStore.setState({ activeProfileId: PROFILE });
    useTutorialStore.setState({
      activeTour: null, active: false, currentStep: 0, _hasHydrated: true,
      seen: { [PROFILE]: { onboarding: '1.0.0', whatsNew: '1.0.0' } },
    });
  });
  // Bucla de cadre din framer-motion ține un cadru programat pe ceasul fals; îl lăsăm să se termine înainte de ceasul real,
  // altfel testul următor rămâne cu animațiile oprite.
  afterEach(() => { cleanup(); vi.advanceTimersByTime(500); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('ediția vine din numele lansării, deci 1.1 rămâne ascunsă cât lansarea e 1.0', () => {
    expect(whatsNewEditionFor('1.0')).toBe('1.0');
    expect(whatsNewEditionFor('1.1')).toBe('1.1');
    expect(whatsNewEditionFor('1.0.0')).toBe('1.0');
  });

  it('deschiderea obișnuită arată ediția lansării curente', async () => {
    mountSlides();
    await open();
    const dialog = screen.getByRole('dialog', { name: `StudyX ${whatsNewEditionFor(RELEASE_DISPLAY_NAME)}` });
    if (whatsNewEditionFor(RELEASE_DISPLAY_NAME) === '1.0') expect(within(dialog).queryByText(/Kumar, Lawrence și Sinopsis/)).toBeNull();
  });

  it('previzualizarea 1.1: opt slide-uri, fiecare cu scenă inertă, cadrul final și povestea în text', async () => {
    mountSlides();
    await open('1.1');
    const dots = screen.getAllByRole('button', { name: /^Slide \d+$/ });
    expect(dots).toHaveLength(RELEASE_11_SLIDES.length);
    expect(RELEASE_11_SLIDES.length).toBeLessThanOrEqual(8);
    expect(within(screen.getByRole('dialog')).getByText('Ce e nou')).toBeTruthy();

    for (const [i, slide] of RELEASE_11_SLIDES.entries()) {
      if (i > 0) await goTo(i);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: slide.title })).toBeTruthy();
      const figure = within(dialog).getByRole('figure', { name: slide.scene.label });
      const stage = figure.querySelector('[inert]');
      expect(stage?.getAttribute('aria-hidden')).toBe('true');
      expect(figure.querySelector('.sr-only')?.textContent).toBe(slide.scene.transcript);
      // Mișcare redusă: ultima legendă, fără comenzi de redare.
      expect(within(figure).getByText(slide.scene.captions[slide.scene.captions.length - 1])).toBeTruthy();
      expect(within(figure).queryByRole('button')).toBeNull();
      if (slide.cta?.tour) expect(TOURS[slide.cta.tour as keyof typeof TOURS]).toBeTruthy();
    }
    // Cadrul final al cărților de bază: pregătirea e gata.
    await goTo(1);
    expect(screen.getByText('Gata · 3 cărți pregătite, protejate')).toBeTruthy();
  }, 20000);

  it.each(['light', 'dark'] as const)('nu are probleme de accesibilitate (axe) în tema %s', async (mode) => {
    useThemeStore.setState({ mode });
    mountSlides();
    await open('1.1');
    for (const slide of [0, 2, 6]) {
      await goTo(slide);
      await expectNoA11yViolations(screen.getByRole('dialog'));
    }
  }, 20000);
});

describe('scena 3D', () => {
  beforeEach(() => {
    motion.calm = false;
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function Clock() {
    const { elapsedMs } = useSceneTime();
    return <span data-testid="clock">{Math.round(elapsedMs / 1000)}</span>;
  }
  const scene = { Scene: Clock, durationMs: 4000, marks: [0, 2000], captions: ['Prima etapă.', 'A doua etapă.'], label: 'Scenă de test', transcript: 'Povestea scenei.' };

  it('se desenează din ceasul filmului: avansează, se reia după final și se oprește la pauză', () => {
    render(<ThemeProvider><WhatsNewStage scene={scene} /></ThemeProvider>);
    expect(screen.getByText('Prima etapă.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('A doua etapă.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Prima etapă.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Oprește animația' }));
    const frozen = screen.getByTestId('clock').textContent;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId('clock').textContent).toBe(frozen);
    expect(screen.getByRole('button', { name: 'Pornește animația' })).toBeTruthy();
  });

  it('cu mișcare redusă arată cadrul final, fix, fără legănare', () => {
    motion.calm = true;
    render(<ThemeProvider><WhatsNewStage scene={scene} /></ThemeProvider>);
    expect(screen.getByTestId('clock').textContent).toBe('4');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId('clock').textContent).toBe('4');
    expect(sway(12_345, true)).toEqual({ x: 0, y: 0 });
  });

  it('înclinarea după mouse rămâne discretă', () => {
    expect(pointerTilt(0.5, 0.5)).toEqual({ x: 0, y: -0 });
    expect(pointerTilt(5, -5)).toEqual({ x: 6, y: 4.5 });
    expect(pointerTilt(-5, 5)).toEqual({ x: -6, y: -4.5 });
  });
});
