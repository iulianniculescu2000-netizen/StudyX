import { describe, expect, it } from 'vitest';
import { buildDueQueue } from './flashcardDueQueue';
import { buildDeckSummaries } from '../pages/flashcard-hub/deckSummaries';
import type { Question, QuestionStat, Quiz } from '../types';

const NOW = 1_000_000_000;
const q = (id: string, hidden = false): Question => ({ id, text: id, hidden, options: [{ id: `${id}a`, text: 'r', isCorrect: true }] });
const deck: Quiz = {
  id: 'd', title: 'D', description: '', emoji: '', category: '', kind: 'flashcard', color: 'blue', createdAt: 0,
  questions: [q('a'), q('b', true), q('c')],
};
const due = (id: string): QuestionStat => ({ quizId: 'd', questionId: id, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview: NOW - 1, interval: 1 });

describe('hidden duplicates in flashcard decks', () => {
  const stats = { 'd:a': due('a'), 'd:b': due('b'), 'd:c': due('c') };

  it('the due queue skips hidden cards and counts only playable ones', () => {
    const queue = buildDueQueue({ quizzes: [deck], stats, now: NOW });
    expect(queue.items.map((item) => item.question.id)).toEqual(['a', 'c']);
    expect(queue.totalDue).toBe(2);
  });

  it('deck summaries use the playable total and due count', () => {
    const [row] = buildDeckSummaries([deck], stats, NOW);
    expect(row.total).toBe(2);
    expect(row.due).toBe(2);
  });
});
