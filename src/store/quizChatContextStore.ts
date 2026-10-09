import { create } from 'zustand';
import type { Quiz, Question } from '../types';

/**
 * Tracks "the question the user is currently looking at in QuizPlay" so the
 * general AI chat can be smart about it without the user re-explaining —
 * e.g. "cred că e corect și varianta C" only makes sense if the chat knows
 * exactly which quiz/question that refers to.
 *
 * Keyed by stable `Question.id`/`Option.id`, NOT array position — QuizPlay may
 * shuffle both question order and option order for the session, so a raw
 * index would point at the wrong thing once shuffled.
 */
interface QuizChatContext {
  quizId: string;
  quizTitle: string;
  questionId: string;
  questionText: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  multipleCorrect: boolean;
}

interface QuizChatContextState {
  context: QuizChatContext | null;
  setContext: (quiz: Pick<Quiz, 'id' | 'title'>, question: Question) => void;
  clearContext: () => void;
}

export const useQuizChatContextStore = create<QuizChatContextState>((set) => ({
  context: null,
  setContext: (quiz, question) => {
    set({
      context: {
        quizId: quiz.id,
        quizTitle: quiz.title,
        questionId: question.id,
        questionText: question.text,
        options: question.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
        multipleCorrect: !!question.multipleCorrect,
      },
    });
  },
  clearContext: () => set({ context: null }),
}));
