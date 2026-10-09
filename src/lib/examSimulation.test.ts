import { describe, expect, it } from 'vitest';
import { buildExamSimulation, disciplineBreakdown, examDisciplines, examLengthOptions, examMinutesFor } from './examSimulation';
import type { Quiz } from '../types';

const quiz = (id: string, category: string, texts: string[], extra: Partial<Quiz> = {}) =>
  ({
    id, title: id, category, kind: 'quiz',
    questions: texts.map((text, i) => ({ id: `${id}${i}`, text, options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }] })),
    ...extra,
  }) as unknown as Quiz;

describe('examSimulation', () => {
  const quizzes = [
    quiz('c', 'Cardiologie', ['Q uno', 'Q dos', 'Q tres']),
    quiz('n', 'Nefrologie', ['Q quatro', 'Q uno']),
    quiz('r', 'Altele', ['Q recovery'], { tags: ['recovery'] }),
    quiz('f', 'Altele', ['Q flash'], { kind: 'flashcard' }),
  ];

  it('alege fără dubluri și fără seturi generate sau flashcarduri, cu tag de disciplină', () => {
    const sim = buildExamSimulation(quizzes, 50, { random: () => 0.3 })!;
    expect(sim.quiz.questions).toHaveLength(4);
    expect(sim.quiz.penaltyMode).toBe(true);
    expect(sim.quiz.tags).toContain('exam-simulation');
    expect(sim.quiz.questions.every((q) => q.tags?.some((t) => t.startsWith('disc:')))).toBe(true);
    expect(sim.minutes).toBe(examMinutesFor(4));
    expect(sim.quiz.questions.some((q) => q.text === 'Q recovery' || q.text === 'Q flash')).toBe(false);
  });

  it('limitează la count, filtrează pe disciplină și întoarce null când nu e nimic', () => {
    expect(buildExamSimulation(quizzes, 2)!.quiz.questions).toHaveLength(2);
    const nef = buildExamSimulation(quizzes, 50, { discipline: 'Nefrologie' })!;
    expect(nef.quiz.questions.every((q) => q.tags?.includes('disc:Nefrologie'))).toBe(true);
    expect(buildExamSimulation([], 10)).toBeNull();
    expect(examMinutesFor(200)).toBe(240);
    expect(examDisciplines(quizzes).map((d) => d.name)).toEqual(['Cardiologie', 'Nefrologie']);
  });

  it('raportul pe discipline pune cea mai slabă prima', () => {
    const sim = buildExamSimulation(quizzes, 50, { random: () => 0.1 })!;
    const result = disciplineBreakdown(sim.quiz.questions, (q) => !!q.tags?.includes('disc:Cardiologie'));
    expect(result[0]).toMatchObject({ discipline: 'Nefrologie', percent: 0 });
    expect(result.find((r) => r.discipline === 'Cardiologie')?.percent).toBe(100);
  });

  it('examLengthOptions arată doar opțiunile distincte', () => {
    expect(examLengthOptions(500).map((o) => [o.count, o.partial])).toEqual([[50, false], [100, false], [200, false]]);
    expect(examLengthOptions(120).map((o) => [o.count, o.partial])).toEqual([[50, false], [100, false], [120, true]]);
    expect(examLengthOptions(100).map((o) => [o.count, o.partial])).toEqual([[50, false], [100, false]]);
    expect(examLengthOptions(30).map((o) => [o.count, o.partial])).toEqual([[30, true]]);
    expect(examLengthOptions(0)).toEqual([]);
  });
});
