import { describe, expect, it } from 'vitest';
import { basePlan, chaptersOfBook, curriculumChapters } from '../../lib/curriculum';
import { emptyState, withStatus } from '../../lib/organizare/engine';
import type { Quiz, QuestionStat } from '../../types';
import { chapterCounts, chapterProgress, matchIndexedChapters, quizChapterIndex } from './chapterMatch';

const quiz = (over: Partial<Quiz> & { n?: number }): Quiz => ({
  id: over.id ?? 'q1',
  title: 'Set',
  description: '',
  emoji: '',
  category: over.category ?? '',
  kind: over.kind,
  tags: over.tags,
  archived: over.archived,
  color: 'blue',
  createdAt: 0,
  questions: Array.from({ length: over.n ?? 3 }, (_, i) => ({ id: `c${i}`, text: `t${i}`, options: [] })),
});

describe('matchIndexedChapters', () => {
  const kumar = chaptersOfBook('K');

  it('leagă titlurile indexate de capitolele din plan, cu cele mai multe fragmente câștigătoare', () => {
    const target = kumar[0];
    const matched = matchIndexedChapters('K', [
      { heading: target.title, label: target.title, chunkCount: 4 },
      { heading: `${target.number}. ${target.title}`, label: target.title, chunkCount: 9 },
      { heading: 'Titlu care nu există în plan', label: 'x', chunkCount: 20 },
    ]);
    expect(matched.get(target.index)?.chunkCount).toBe(9);
    expect(matched.size).toBe(1);
  });

  it('nu leagă un titlu al altei cărți și lasă capitolele nepotrivite fără text', () => {
    const lawrence = chaptersOfBook('L')[0];
    const matched = matchIndexedChapters('K', [{ heading: lawrence.title, label: lawrence.title, chunkCount: 5 }]);
    expect(matched.has(lawrence.index)).toBe(false);
    expect(matchIndexedChapters('K', [])).toEqual(new Map());
  });
});

describe('quizChapterIndex', () => {
  const chapter = curriculumChapters()[10];

  it('citește eticheta chapter:<index>', () => {
    expect(quizChapterIndex(quiz({ tags: ['rezidentiat', 'chapter:7', 'book:K'], kind: 'flashcard' }))).toBe(7);
  });

  it('pachetele generate din capitol se leagă prin titlul din etichete', () => {
    expect(quizChapterIndex(quiz({ kind: 'flashcard', tags: ['ai-studio', 'chapter-pack', 'flashcard', 'Kumar.pdf', chapter.title] }))).toBe(chapter.index);
  });

  it('rezervă pe category doar pentru flashcarduri', () => {
    expect(quizChapterIndex(quiz({ kind: 'flashcard', category: chapter.title }))).toBe(chapter.index);
    expect(quizChapterIndex(quiz({ kind: 'quiz', category: chapter.title }))).toBeNull();
    expect(quizChapterIndex(quiz({ kind: 'flashcard', category: 'Ceva fără legătură' }))).toBeNull();
  });
});

describe('chapterCounts', () => {
  it('numără cardurile, scadențele și grilele pe capitol, fără seturile arhivate', () => {
    const now = 1_000_000;
    const cards = quiz({ id: 'f1', kind: 'flashcard', tags: ['chapter:3'], n: 4 });
    const stats: Record<string, QuestionStat> = {
      'f1:c0': { questionId: 'c0', quizId: 'f1', timesCorrect: 1, timesWrong: 0, lastSeen: 1, nextReview: now - 5, interval: 1 },
      'f1:c1': { questionId: 'c1', quizId: 'f1', timesCorrect: 1, timesWrong: 0, lastSeen: 1, nextReview: now + 5, interval: 1 },
      'f1:c2': { questionId: 'c2', quizId: 'f1', timesCorrect: 0, timesWrong: 0, lastSeen: 0, nextReview: 0, interval: 0 },
    };
    const counts = chapterCounts([
      cards,
      quiz({ id: 'g1', kind: 'quiz', tags: ['chapter:3'], n: 5 }),
      quiz({ id: 'f2', kind: 'flashcard', tags: ['chapter:3'], n: 9, archived: true }),
      quiz({ id: 'x', kind: 'flashcard', tags: ['altceva'] }),
    ], stats, now);
    expect(counts.get(3)).toEqual({ cards: 4, due: 1, grile: 5 });
    expect(counts.size).toBe(1);
  });
});

describe('chapterProgress', () => {
  it('numără topicurile terminate și în lucru din trecerea activă', () => {
    const plan = basePlan();
    const chapter = curriculumChapters().find((c) => c.topicIndexes.length > 1) ?? curriculumChapters()[0];
    const [first, second] = chapter.topicIndexes;
    let state = emptyState(plan);
    state = withStatus(state, 1, first, 2, '2026-10-06');
    state = withStatus(state, 1, second, 1, '2026-10-06');
    const progress = chapterProgress(chapter, state, 1);
    expect(progress.done).toBe(1);
    expect(progress.inProgress).toBe(1);
    expect(progress.total).toBe(chapter.topicIndexes.length);
    expect(progress.percent).toBe(Math.round((1 / chapter.topicIndexes.length) * 100));
    expect(chapterProgress(chapter, state, 2).done).toBe(0);
  });
});
