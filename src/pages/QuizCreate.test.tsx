import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizCreate from './QuizCreate';
import { getSaveBlockedReason } from './quiz-create/helpers';
import { useQuizStore } from '../store/quizStore';

// Exit animations need rAF, which the fake timers leave unreliable: render presence children directly.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

describe('getSaveBlockedReason', () => {
  it('explains what is missing', () => {
    expect(getSaveBlockedReason(false, true)).toContain('titlul');
    expect(getSaveBlockedReason(true, false)).toContain('răspuns corect');
    expect(getSaveBlockedReason(true, true)).toBeNull();
  });
});

describe('QuizCreate info step', () => {
  beforeEach(() => {
    useQuizStore.setState({
      quizzes: [{ id: 'imp', title: 'Importat', description: '', emoji: '', color: 'blue', category: 'Altele', kind: 'quiz', createdAt: 0,
        questions: [{ id: 'q', text: 'Q', options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] }] }],
      sessions: [], _hasHydrated: true,
    });
  });

  it('lets a quiz without description continue to the questions', () => {
    render(<MemoryRouter initialEntries={['/create?edit=imp']}><Routes><Route path="/create" element={<QuizCreate />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByText('Continuă și adaugă întrebări'));
    expect(screen.getByText('Salvează modificările')).toBeTruthy();
  });

  it('shows why Continue is inert when the title is empty', () => {
    render(<MemoryRouter initialEntries={['/create']}><Routes><Route path="/create" element={<QuizCreate />} /></Routes></MemoryRouter>);
    expect(screen.getByText('Completează titlul pentru a continua.')).toBeTruthy();
  });
});
