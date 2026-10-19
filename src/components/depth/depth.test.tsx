import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Check, CreditCard } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useThemeStore } from '../../store/themeStore';
import { useTutorialStore } from '../../store/tutorialStore';
import TourEngine from '../../tutorial/TourEngine';
import HelpTip from '../ui/HelpTip';
import GlassIconStack from './GlassIconStack';
import TourHeroScene from './TourHeroScene';
import { pointerTilt, sway } from './useTilt';
import { expectNoA11yViolations } from '../../test/a11y';

const motion = vi.hoisted(() => ({ calm: true }));
vi.mock('../../hooks/useAdaptiveMotion', async () => {
  const { resolve } = await import('../../theme/motion');
  return { useAdaptiveMotion: () => ({ calmMotion: motion.calm, reducedMotion: motion.calm, performanceLite: false, t: resolve(motion.calm) }) };
});
vi.mock('../../hooks/useViewportProfile', () => ({ useViewportProfile: () => ({ mobile: false, crampedHeight: false }) }));
vi.mock('../../hooks/useOverlayFlag', () => ({ useOverlayFlag: () => {} }));
vi.mock('../../tutorial/spotlight', () => ({ useSpotlight: () => null }));

const wrap = (node: React.ReactNode) => render(<MemoryRouter><ThemeProvider>{node}</ThemeProvider></MemoryRouter>);

describe('adâncime comună (tururi, „?”, micro-demo-uri)', () => {
  beforeEach(() => {
    motion.calm = true;
    vi.useFakeTimers();
    useThemeStore.setState({ mode: 'light' });
    useTutorialStore.setState({ activeTour: null, active: false, currentStep: 0, seen: {}, _hasHydrated: true });
  });
  // Bucla de cadre din framer-motion ține un cadru pe ceasul fals; o lăsăm să se termine înainte de ceasul real.
  afterEach(() => { cleanup(); vi.advanceTimersByTime(500); vi.useRealTimers(); });

  it('înclinarea rămâne în limitele cerute, iar legănarea dispare cu mișcare redusă', () => {
    expect(pointerTilt(9, -9, 3, 2.5)).toEqual({ x: 3, y: 2.5 });
    expect(pointerTilt(-9, 9, 3, 2.5)).toEqual({ x: -3, y: -2.5 });
    expect(sway(9999, true)).toEqual({ x: 0, y: 0 });
    expect(Math.abs(sway(9999, false, 0.5).x)).toBeLessThanOrEqual(1.1);
  });

  it('plăcile de sticlă sunt decor, ascunse cititoarelor de ecran', () => {
    const { container } = wrap(<GlassIconStack icon={<CreditCard size={16} />} color="#0071E3" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('scena de început/final e inertă și, cu mișcare redusă, stă pe cadrul final', () => {
    wrap(<TourHeroScene center={<Check size={22} />} orbit={[<CreditCard key="a" size={13} />]} kind="gather" color="#0071E3" />);
    const scene = screen.getByTestId('tour-hero-scene');
    expect(scene.hasAttribute('inert')).toBe(true);
    expect(scene.getAttribute('aria-hidden')).toBe('true');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId('tour-hero-scene')).toBe(scene);
  });

  it('primul pas fără țintă al unui tur are scena 3D; un pas cu țintă nu o are', () => {
    useTutorialStore.getState().startTour('flashcards');
    wrap(<TourEngine profileId="p-depth" />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('tour-hero-scene')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Hai să începem/ }));
    const next = screen.getByRole('dialog');
    expect(within(next).queryByTestId('tour-hero-scene')).toBeNull();
  });

  it.each(['light', 'dark'] as const)('cardul de tur și panoul „?” trec axe în tema %s', async (mode) => {
    useThemeStore.setState({ mode });
    useTutorialStore.getState().startTour('flashcards');
    const { unmount } = wrap(<TourEngine profileId="p-depth" />);
    await expectNoA11yViolations(screen.getByRole('dialog'));
    unmount();
    useTutorialStore.setState({ activeTour: null, active: false });
    wrap(<HelpTip id="fc-new-folder" />);
    fireEvent.click(screen.getByRole('button', { name: /Ajutor:/ }));
    await expectNoA11yViolations(screen.getByRole('dialog'));
    expect(screen.getByRole('button', { name: 'Ghid pas cu pas' })).toBeTruthy();
  });
});
