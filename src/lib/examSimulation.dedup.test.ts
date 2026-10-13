import { describe, expect, it } from 'vitest';
import { examDisciplines } from './examSimulation';
import type { Question, Quiz } from '../types';

const q = (id: string, text: string, hidden = false): Question => ({ id, text, hidden, options: [{ id: `${id}a`, text: 'r', isCorrect: true }, { id: `${id}b`, text: 's', isCorrect: false }] });
const quiz = (id: string, questions: Question[]): Quiz => ({
  id, title: id, description: '', emoji: '', category: 'Cardiologie', color: 'blue', createdAt: 0, questions,
});

describe('examDisciplines', () => {
  it('does not count hidden questions', () => {
    const rows = examDisciplines([quiz('a', [q('1', 'Prima întrebare lungă despre inimă'), q('2', 'A doua întrebare despre plămâni', true)])]);
    expect(rows).toEqual([{ name: 'Cardiologie', count: 1 }]);
  });
});
