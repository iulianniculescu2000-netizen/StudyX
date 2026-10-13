import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import QuizDetail from './QuizDetail';
import { useQuizStore } from '../store/quizStore';

describe('QuizDetail hydration', () => {
  afterEach(() => {
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
  });

  it('can move from the loading state to a quiz without changing hook order', () => {
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: false });
    render(
      <MemoryRouter initialEntries={['/quiz/hydrated']}>
        <Routes><Route path="/quiz/:id" element={<QuizDetail />} /></Routes>
      </MemoryRouter>,
    );

    act(() => {
      useQuizStore.setState({ _hasHydrated: true, quizzes: [{
        id: 'hydrated', kind: 'quiz', title: 'Grilă de test', description: '',
        emoji: '📚', category: 'Medicină', color: 'blue', createdAt: 0,
        questions: [{ id: 'q1', text: 'Care este răspunsul?', options: [
          { id: 'a', text: 'Da', isCorrect: true }, { id: 'b', text: 'Nu', isCorrect: false },
        ] }],
      }] });
    });

    expect(screen.getAllByText('Grilă de test').length).toBeGreaterThan(0);
  });

  it('renders virtualized questions and filters via search', async () => {
    useQuizStore.setState({ _hasHydrated: true, quizzes: [{
      id: 'quiz-search', kind: 'quiz', title: 'Grilă Căutare', description: '',
      emoji: '📚', category: 'Medicină', color: 'blue', createdAt: 0,
      questions: [
        { id: 'q1', text: 'Diagnostic pentru pneumonie bacteriană', options: [{ id: 'a', text: 'Rx', isCorrect: true }] },
        { id: 'q2', text: 'Tratament pentru apendicită acută', options: [{ id: 'a', text: 'Chirurgical', isCorrect: true }] },
        { id: 'q3', text: 'Semne clinice de insuficiență cardiacă', options: [{ id: 'a', text: 'Edeme', isCorrect: true }] },
        { id: 'q4', text: 'Etiologie sinuzită', options: [{ id: 'a', text: 'Virală', isCorrect: true }] },
        { id: 'q5', text: 'Complicații diabet zaharat', options: [{ id: 'a', text: 'Retinopatie', isCorrect: true }] },
        { id: 'q6', text: 'Factori de risc hipertensiune', options: [{ id: 'a', text: 'Sare', isCorrect: true }] },
      ],
    }] });

    const { fireEvent } = await import('@testing-library/react');
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/quiz/quiz-search']}>
          <Routes><Route path="/quiz/:id" element={<QuizDetail />} /></Routes>
        </MemoryRouter>,
      );
    });

    expect(screen.getByText('Diagnostic pentru pneumonie bacteriană')).toBeInTheDocument();
    expect(screen.getByText('Tratament pentru apendicită acută')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Caută în întrebări...');
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'pneumonie' } });
    });

    expect(screen.getByText('Diagnostic pentru pneumonie bacteriană')).toBeInTheDocument();
    expect(screen.queryByText('Tratament pentru apendicită acută')).toBeNull();

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'termen_negasit' } });
    });
    expect(screen.getByText('Nicio întrebare nu corespunde căutării.')).toBeInTheDocument();
  });
});
