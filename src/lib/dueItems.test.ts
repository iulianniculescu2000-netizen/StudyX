import { describe, expect, it } from 'vitest';
import type { Question, QuestionStat, Quiz } from '../types';
import { buildDueItems } from './dueItems';

const question = (id: string): Question => ({ id, text: id, options: [{ id: 'a', text: 'a', isCorrect: true }, { id: 'b', text: 'b', isCorrect: false }] });
const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: `Set ${id}`, description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});
const stat = (quizId: string, questionId: string, nextReview: number): QuestionStat => ({
  quizId, questionId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview, interval: 1,
});

describe('buildDueItems', () => {
  const NOW = 1_000_000;

  it('keeps only due questions that still exist in a real quiz', () => {
    const quizzes = [quiz('a', [question('a1'), question('a2')]), quiz('cards', [question('c1')], { kind: 'flashcard' })];
    const stats = {
      'a:a1': stat('a', 'a1', 10),
      'a:a2': stat('a', 'a2', NOW + 1),
      'a:gone': stat('a', 'gone', 10),
      'cards:c1': stat('cards', 'c1', 10),
      'deleted:x': stat('deleted', 'x', 10),
      'a:never': stat('a', 'a1', 0),
    };
    const items = buildDueItems(stats, quizzes, NOW);
    expect(items.map((i) => [i.quizId, i.question.id, i.quizTitle])).toEqual([['a', 'a1', 'Set a']]);
  });

  it('nu numără de două ori aceeași întrebare scadentă din setul real și din sesiunea combinată (mix-…)', () => {
    const shared = question('a1');
    const quizzes = [
      quiz('a', [shared, question('a2')]),
      quiz('mix-folder', [shared, question('a2')], { tags: ['folder-session:folder'] }),
    ];
    const stats = {
      'mix-folder:a1': stat('mix-folder', 'a1', 10),
      'a:a1': stat('a', 'a1', 10),
      'mix-folder:a2': stat('mix-folder', 'a2', 10),
    };
    const items = buildDueItems(stats, quizzes, NOW);
    expect(items.map((i) => [i.quizId, i.question.id]).sort()).toEqual([['a', 'a1'], ['mix-folder', 'a2']]);
  });
});
