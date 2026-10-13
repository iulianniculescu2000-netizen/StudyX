import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TourEngine from './TourEngine';
import { useTutorialStore } from '../store/tutorialStore';
import { useAIStore } from '../store/aiStore';
import { useQuizStore } from '../store/quizStore';

vi.mock('../theme/ThemeContext', () => ({ useTheme: () => ({ accent: '#123456', text: '#fff', text3: '#aaa' }) }));
vi.mock('../hooks/useAdaptiveMotion', () => ({ useAdaptiveMotion: () => ({ t: { modal: {}, modalExit: {}, page: {} } }) }));
vi.mock('../hooks/useViewportProfile', () => ({ useViewportProfile: () => ({ mobile: false, crampedHeight: false }) }));
vi.mock('../hooks/useOverlayFlag', () => ({ useOverlayFlag: () => {} }));
vi.mock('./spotlight', () => ({ useSpotlight: () => null }));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output>
    <button onClick={() => navigate('/quizzes?manual=1')}>Manual navigation</button></>;
}

beforeEach(() => {
  useTutorialStore.setState({ activeTour: null, active: false, currentStep: 0, seen: {}, _hasHydrated: false });
  useQuizStore.setState({ quizzes: [] });
  useAIStore.setState({ apiKey: '', providerKeys: {}, knowledgeSources: [] });
});

describe('tour engine navigation and profile lifecycle', () => {
  it('leaves the page reachable during a do-it-yourself step', () => {
    useTutorialStore.getState().markSeen('p1', 'welcomeFilm');
    useTutorialStore.getState().startTour('onboarding', 2);
    render(<MemoryRouter><LocationProbe /><TourEngine profileId="p1" /></MemoryRouter>);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
    const pageButton = screen.getByText('Manual navigation');
    pageButton.focus();
    expect(fireEvent.keyDown(pageButton, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(pageButton);
  });

  it('closes on Escape even when a text field has focus', () => {
    useTutorialStore.getState().startTour('settings');
    render(<MemoryRouter><input aria-label="Test field" /><TourEngine profileId="p1" /></MemoryRouter>);
    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useTutorialStore.getState().active).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab inside informational steps even if focus escaped to the page', () => {
    useTutorialStore.getState().startTour('settings');
    render(<MemoryRouter><LocationProbe /><TourEngine profileId="p1" /></MemoryRouter>);
    const dialog = screen.getByRole('dialog');
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    screen.getByText('Manual navigation').focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('switches settings queries on each step, including back, without undoing manual navigation', () => {
    useTutorialStore.getState().startTour('settings');
    render(<MemoryRouter initialEntries={['/settings?s=ai']}><LocationProbe /><TourEngine profileId="p1" /></MemoryRouter>);
    expect(screen.getByTestId('location')).toHaveTextContent('/settings?s=aspect');
    act(() => useTutorialStore.getState().nextStep(5));
    act(() => useTutorialStore.getState().nextStep(5));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings?s=date');
    act(() => useTutorialStore.getState().nextStep(5));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings?s=ai');
    act(() => useTutorialStore.getState().prevStep());
    expect(screen.getByTestId('location')).toHaveTextContent('/settings?s=date');
    fireEvent.click(screen.getByText('Manual navigation'));
    expect(screen.getByTestId('location')).toHaveTextContent('/quizzes?manual=1');
    act(() => useTutorialStore.getState().nextStep(5));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings?s=ai');
  });

  it('waits for the welcome film before showing the first-run spotlight', () => {
    useTutorialStore.getState().startTutorial();
    render(<MemoryRouter><TourEngine profileId="p1" /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useTutorialStore.getState().markSeen('p1', 'welcomeFilm'));
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Bun venit în StudyX');
    expect(useTutorialStore.getState().hasSeen('p2', 'welcomeFilm')).toBe(false);
  });

  it('rebuilds the steps for a different profile and marks only that profile seen', () => {
    useTutorialStore.getState().startTour('errors');
    const { rerender } = render(<MemoryRouter><TourEngine profileId="p1" /></MemoryRouter>);
    rerender(<MemoryRouter><TourEngine profileId="p2" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Închide turul' }));
    expect(useTutorialStore.getState().hasSeen('p2', 'errors')).toBe(true);
    expect(useTutorialStore.getState().hasSeen('p1', 'errors')).toBe(false);
  });
});
