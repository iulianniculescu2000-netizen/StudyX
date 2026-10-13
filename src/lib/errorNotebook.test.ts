import { describe, expect, it } from 'vitest';
import { buildErrorEntries, buildErrorPracticeQuiz, filterErrorEntries, groupErrors } from './errorNotebook';
import type { QuestionStat, Quiz } from '../types';

const quiz = (id: string, category: string, qids: string[], extra: Partial<Quiz> = {}) =>
  ({
    id, title: `Test ${id}`, category, questions: qids.map((q) => ({ id: q, text: `Întrebare ${q} ședință`, options: [{ id: 'o', text: 'x', isCorrect: true }] })),
    ...extra,
  }) as unknown as Quiz;
const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 1, timesWrong: 2, lastSeen: 10, nextReview: 0, interval: 1, ...extra,
});

describe('errorNotebook', () => {
  const quizzes = [
    quiz('a', 'Cardiologie', ['1', '2']),
    quiz('b', 'Nefrologie', ['3']),
    quiz('gen', 'Altele', ['1'], { tags: ['recovery'] }),
    quiz('old', 'Cardiologie', ['9'], { archived: true }),
  ];
  const stats = {
    'a:1': stat('a', '1', { timesWrong: 5 }),
    'a:2': stat('a', '2', { consecutiveCorrect: 3 }),
    'b:3': stat('b', '3'),
    'gen:1': stat('gen', '1'),
    'old:9': stat('old', '9'),
  };

  it('ia doar greșelile active, fără sesiuni generate, arhivate sau închise', () => {
    const entries = buildErrorEntries(quizzes, stats);
    expect(entries.map((e) => e.key).sort()).toEqual(['a:1', 'b:3']);
    expect(buildErrorEntries(quizzes, stats, { includeMastered: true }).map((e) => e.key)).toContain('a:2');
  });

  it('ignoră istoricul retras și grupează pe categorie, cele mai greșite întâi', () => {
    const withRetired = { ...stats, 'b:3': stat('b', '3', { retired: true }) };
    const groups = groupErrors(buildErrorEntries(quizzes, withRetired));
    expect(groups.map((g) => g.category)).toEqual(['Cardiologie']);
    const all = groupErrors(buildErrorEntries(quizzes, stats));
    expect(all[0]).toMatchObject({ category: 'Cardiologie', wrong: 5 });
  });

  it('caută fără diacritice', () => {
    const entries = buildErrorEntries(quizzes, stats);
    expect(filterErrorEntries(entries, 'intrebare 3 sedinta')).toHaveLength(1);
  });

  it('găsește greșeli folosind căutare cu mai multe cuvinte sau cuvinte parțiale', () => {
    const entries = buildErrorEntries(quizzes, stats);

    // Multi-cuvânt: textul întrebării + categoria quiz-ului
    const multiField = filterErrorEntries(entries, 'sedinta Nefrologie');
    expect(multiField).toHaveLength(1);
    expect(multiField[0].key).toBe('b:3');

    // Cuvinte parțiale (prefixe)
    const partial = filterErrorEntries(entries, 'intreb Cardio');
    expect(partial).toHaveLength(1);
    expect(partial[0].key).toBe('a:1');

    // Căutare după număr
    expect(filterErrorEntries(entries, '3')).toHaveLength(1);
    expect(filterErrorEntries(entries, '999')).toHaveLength(0);

    // Șir gol sau doar spații returnează toate intrările
    expect(filterErrorEntries(entries, '')).toHaveLength(2);
    expect(filterErrorEntries(entries, '   ')).toHaveLength(2);
  });

  it('construiește o sesiune cu id-uri noi și tag mistake-bank', () => {
    const entries = buildErrorEntries(quizzes, stats);
    const practice = buildErrorPracticeQuiz(entries)!;
    expect(practice.tags).toContain('mistake-bank');
    expect(practice.questions).toHaveLength(2);
    expect(practice.questions[0].id).not.toBe('1');
    expect(buildErrorPracticeQuiz([])).toBeNull();
  });
});
