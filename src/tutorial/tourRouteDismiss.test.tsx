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

function RouteControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      <button onClick={() => navigate('/quizzes')}>Go quizzes</button>
      <button onClick={() => navigate('/flashcards?filter=due')}>Stay flashcards query</button>
      <button onClick={() => navigate('/create')}>Go create</button>
    </>
  );
}

beforeEach(() => {
  useTutorialStore.setState({ activeTour: null, active: false, currentStep: 0, seen: {}, _hasHydrated: false });
  useQuizStore.setState({ quizzes: [] });
  useAIStore.setState({ apiKey: '', providerKeys: {}, knowledgeSources: [] });
});

describe('tour engine route-change dismissal', () => {
  it('closes a single-page tour (flashcards) when navigating away from its route', () => {
    useTutorialStore.getState().startTour('flashcards');
    render(
      <MemoryRouter initialEntries={['/flashcards']}>
        <RouteControls />
        <TourEngine profileId="p1" />
      </MemoryRouter>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/flashcards');

    // Staying on the same pathname with a different query keeps the tour open.
    fireEvent.click(screen.getByText('Stay flashcards query'));
    expect(screen.getByTestId('location')).toHaveTextContent('/flashcards?filter=due');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Navigating to a different page dismisses the local tour cleanly.
    fireEvent.click(screen.getByText('Go quizzes'));
    expect(screen.getByTestId('location')).toHaveTextContent('/quizzes');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTutorialStore.getState().activeTour).toBeNull();
    expect(useTutorialStore.getState().active).toBe(false);
    expect(useTutorialStore.getState().hasSeen('p1', 'flashcards')).toBe(true);
  });

  it('waits for initial step navigation before arming route-change dismissal', () => {
    useTutorialStore.getState().startTour('flashcards');
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <RouteControls />
        <TourEngine profileId="p1" />
      </MemoryRouter>
    );

    // Must navigate to /flashcards first and remain open rather than closing from /settings.
    expect(screen.getByTestId('location')).toHaveTextContent('/flashcards');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useTutorialStore.getState().activeTour).toBe('flashcards');

    // Once on /flashcards, leaving the page dismisses the tour.
    fireEvent.click(screen.getByText('Go quizzes'));
    expect(screen.getByTestId('location')).toHaveTextContent('/quizzes');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTutorialStore.getState().activeTour).toBeNull();
  });

  it('closes a manual single-page tour (notes) when navigating away from its page', () => {
    useTutorialStore.getState().startTour('notes');
    render(
      <MemoryRouter initialEntries={['/notes']}>
        <RouteControls />
        <TourEngine profileId="p1" />
      </MemoryRouter>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Go quizzes'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTutorialStore.getState().activeTour).toBeNull();
  });

  it('does not prematurely close the multi-page onboarding tour on route changes', () => {
    useTutorialStore.getState().markSeen('p1', 'welcomeFilm');
    useTutorialStore.getState().startTour('onboarding');
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteControls />
        <TourEngine profileId="p1" />
      </MemoryRouter>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Navigating away (e.g. to /create during onboarding) must keep the multi-page tour active.
    fireEvent.click(screen.getByText('Go create'));
    expect(screen.getByTestId('location')).toHaveTextContent('/create');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useTutorialStore.getState().activeTour).toBe('onboarding');

    // Advancing to the flashcards step of onboarding navigates to /flashcards and stays open.
    act(() => useTutorialStore.setState({ currentStep: 5 }));
    expect(screen.getByTestId('location')).toHaveTextContent('/flashcards');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useTutorialStore.getState().activeTour).toBe('onboarding');
  });
});
