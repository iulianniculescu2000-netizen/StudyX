import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HashRouter } from 'react-router-dom';
import Welcome from '../pages/Welcome';
import Dashboard from '../pages/Dashboard';
import { useAIStore } from '../store/aiStore';
import { useDiagnosticsStore } from '../store/diagnosticsStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useTutorialStore } from '../store/tutorialStore';
import { useUserStore } from '../store/userStore';
import { ThemeProvider } from '../theme/ThemeContext';

function renderWithProviders(node: ReactNode) {
  return render(
    <HashRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </HashRouter>,
  );
}

describe('UI integration', () => {
  beforeEach(() => {
    localStorage.clear();
    useUserStore.getState().reset();
    useAIStore.getState().reset();
    useQuizStore.getState().reset();
    useStatsStore.getState().reset();
    useDiagnosticsStore.getState().clearDiagnostics();
    useTutorialStore.getState().resetTutorial();
  });

  it('renders onboarding content for a new user', () => {
    renderWithProviders(<Welcome />);

    expect(screen.getByText(/StudyX/i)).toBeInTheDocument();
    expect(screen.getByText(/Bun venit la/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Alexandru/i)).toBeInTheDocument();
  });

  it('renders dashboard content for an active profile with quizzes', () => {
    const profileId = useUserStore.getState().addProfile('Test User');
    useUserStore.getState().switchProfile(profileId);
    useQuizStore.getState()._hydrate({
      quizzes: [
        {
          id: 'quiz-1',
          title: 'Anatomie cardio',
          description: 'Test rapid',
          emoji: '🫀',
          category: 'Cardio',
          color: 'blue',
          questions: [
            {
              id: 'q1',
              text: 'Care este camera care pompeaza sangele in aorta?',
              options: [
                { id: 'a', text: 'Atriu drept', isCorrect: false },
                { id: 'b', text: 'Ventricul stang', isCorrect: true },
              ],
              explanation: 'Ventriculul stang pompeaza sangele oxigenat in aorta.',
            },
          ],
          createdAt: Date.now(),
          shuffleQuestions: false,
          shuffleAnswers: false,
          penaltyMode: false,
        },
      ],
      sessions: [],
    });

    renderWithProviders(<Dashboard />);

    expect(screen.getByText('Panou')).toBeInTheDocument();
    expect(screen.getByText(/Grile recente/i)).toBeInTheDocument();
    expect(screen.getByText(/Anatomie cardio/i)).toBeInTheDocument();
  });
});
