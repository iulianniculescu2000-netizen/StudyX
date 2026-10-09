import { describe, expect, it } from 'vitest';
import type { Quiz } from '../../types';
import { curriculumChapters } from '../curriculum';
import { chapterBookHref, chapterCardCount, chapterFlashcardsHref } from './appLinks';

const chapters = curriculumChapters();
const cardinal = chapters[10];

function deck(over: Partial<Quiz>, cards = 3): Quiz {
  return {
    id: Math.random().toString(36),
    title: 'Pachet',
    description: '',
    emoji: '',
    category: '',
    kind: 'flashcard',
    questions: Array.from({ length: cards }, (_, i) => ({ id: `q${i}`, text: `Q${i}`, options: [{ id: 'o', text: 'R', isCorrect: true }] })),
    createdAt: 0,
    color: 'blue',
    ...over,
  } as unknown as Quiz;
}

describe('legăturile capitolelor', () => {
  it('formatul legăturilor e cel documentat', () => {
    expect(chapterFlashcardsHref(cardinal)).toBe('/rezidentiat/flashcarduri?chapter=10');
    expect(chapterBookHref(cardinal)).toBe('/rezidentiat?book=K&chapter=10');
  });

  it('numără cardurile după tag-ul chapter:<index>', () => {
    const quizzes = [
      deck({ tags: ['rezidentiat', 'chapter:10', 'book:K'] }, 4),
      deck({ tags: ['rezidentiat', 'chapter:11', 'book:K'] }, 9),
      deck({ tags: ['rezidentiat', 'chapter:10', 'book:K'], archived: true }, 5),
      deck({ tags: ['chapter:10'], kind: 'quiz' }, 7),
    ];
    expect(chapterCardCount(quizzes, cardinal)).toBe(4);
  });

  it('în lipsa tag-ului folosește categoria pachetului', () => {
    const quizzes = [deck({ category: 'Cardiologie' }, 6), deck({ category: 'Diabet zaharat' }, 2)];
    expect(chapterCardCount(quizzes, cardinal)).toBe(6);
    expect(chapterCardCount([], cardinal)).toBe(0);
  });
});
