import { fireEvent, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useTutorialStore } from '../store/tutorialStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useFlashcardSession } from './flashcard-session/useFlashcardSession';
import { useQuizKeyboard } from './quiz-play/hooks/useQuizKeyboard';
import type { Quiz } from '../types';

const quiz: Quiz = {
  id: 'deck', kind: 'flashcard', title: 'Pachet', description: '', category: '', emoji: '', color: 'blue', createdAt: 0,
  questions: [{ id: 'q', text: 'Întrebare', options: [{ id: 'a', text: 'Răspuns', isCorrect: true }] }],
};
const sessionWrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/flashcards/session/deck?mode=all']}>
    <Routes><Route path="/flashcards/session/:id" element={children} /></Routes>
  </MemoryRouter>
);

describe('session shortcuts while a tutorial is open', () => {
  beforeEach(() => {
    useTutorialStore.setState({ active: false, activeTour: null, currentStep: 0, seen: {} });
    useQuizStore.setState({ quizzes: [quiz], sessions: [], _hasHydrated: true });
    useStatsStore.getState().reset();
  });

  it('does not flip or rate a flashcard under the tour and resumes after closing', () => {
    const { result } = renderHook(useFlashcardSession, { wrapper: sessionWrapper });
    useTutorialStore.getState().startTour('flashcardSession');
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: '1' });
    expect(result.current.flipped).toBe(false);
    expect(result.current.ratings).toEqual([]);
    expect(useStatsStore.getState().questionStats).toEqual({});
    useTutorialStore.getState().resetTutorial();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(result.current.flipped).toBe(true);
    useTutorialStore.getState().startTour('flashcardSession');
    fireEvent.keyDown(document.body, { key: '2' });
    expect(result.current.ratings).toEqual([]);
    useTutorialStore.getState().resetTutorial();
    fireEvent.keyDown(document.body, { key: '2' });
    expect(result.current.ratings).toEqual(['good']);
  });

  it('does not select, confirm, move back or rate a quiz under the tour', () => {
    const handlers = {
      question: quiz.questions[0], revealed: false, examMode: false, currentIdx: 1,
      onSelect: vi.fn(), onConfirm: vi.fn(), onNext: vi.fn(), onHint: vi.fn(), onConfidence: vi.fn(), onPrevious: vi.fn(),
    };
    const { rerender } = renderHook(() => useQuizKeyboard(handlers));
    useTutorialStore.getState().startTour('quizSession');
    for (const key of ['1', 'Enter', 'ArrowLeft', 'h']) fireEvent.keyDown(window, { key });
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onPrevious).not.toHaveBeenCalled();
    expect(handlers.onHint).not.toHaveBeenCalled();
    handlers.revealed = true;
    rerender();
    fireEvent.keyDown(window, { key: '2' });
    expect(handlers.onConfidence).not.toHaveBeenCalled();
    useTutorialStore.getState().resetTutorial();
    fireEvent.keyDown(document.body, { key: '2' });
    expect(handlers.onConfidence).toHaveBeenCalledWith('guess');
  });

  it('leaves Enter and Space to the focused help button before the tour opens', () => {
    const handlers = {
      question: quiz.questions[0], revealed: false, examMode: false, currentIdx: 0,
      onSelect: vi.fn(), onConfirm: vi.fn(), onNext: vi.fn(), onHint: vi.fn(), onConfidence: vi.fn(), onPrevious: vi.fn(),
    };
    renderHook(() => useQuizKeyboard(handlers));
    const help = document.createElement('button');
    help.setAttribute('aria-label', 'Ghid pentru rezolvarea unei grile');
    document.body.append(help);
    try {
      help.focus();
      fireEvent.keyDown(help, { key: 'Enter' });
      fireEvent.keyDown(help, { key: ' ' });
      expect(handlers.onConfirm).not.toHaveBeenCalled();
      expect(handlers.onNext).not.toHaveBeenCalled();
      help.blur();
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(handlers.onConfirm).toHaveBeenCalledOnce();
    } finally {
      help.remove();
    }
  });
});
