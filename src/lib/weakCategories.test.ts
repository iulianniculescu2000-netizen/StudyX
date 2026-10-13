import { describe, expect, it } from 'vitest';
import { weakCategoriesFrom, weakTopicsFrom } from './weakCategories';
import type { Quiz, QuizSession } from '../types';

const quiz = (id: string, category: string) => ({ id, title: id, category, questions: [] }) as unknown as Quiz;
const session = (quizId: string) => ({ id: `s-${quizId}-${Math.random()}`, quizId }) as unknown as QuizSession;

describe('weakCategoriesFrom', () => {
  const accuracy = new Map([['a', 30], ['b', 50], ['c', 90], ['d', 70]]);

  it('ordonează de la cea mai slabă și ignoră categoriile fără nicio sesiune', () => {
    const rows = weakCategoriesFrom([quiz('a', 'Cardiologie'), quiz('c', 'Nefrologie'), quiz('d', 'Fără sesiuni')], [session('a'), session('c')], accuracy);
    expect(rows).toEqual([{ name: 'Cardiologie', accuracy: 30, quizCount: 1 }, { name: 'Nefrologie', accuracy: 90, quizCount: 1 }]);
  });

  it('face media pe toate seturile categoriei, indiferent de ordine', () => {
    const quizzes = [quiz('a', 'Cardiologie'), quiz('b', 'Cardiologie'), quiz('c', 'Cardiologie')];
    const sessions = [session('a'), session('b'), session('c'), session('c')];
    const forward = weakCategoriesFrom(quizzes, sessions, accuracy);
    const backward = weakCategoriesFrom([...quizzes].reverse(), sessions, accuracy);
    expect(forward[0]).toEqual({ name: 'Cardiologie', accuracy: 57, quizCount: 4 });
    expect(backward).toEqual(forward);
  });

  it('pune seturile fără categorie la „Altele” și respectă limita', () => {
    const rows = weakCategoriesFrom([quiz('a', ''), quiz('b', 'X'), quiz('c', 'Y')], [session('a'), session('b'), session('c')], accuracy, 2);
    expect(rows.map((row) => row.name)).toEqual(['Altele', 'X']);
  });
});

describe('weakTopicsFrom', () => {
  const topic = (name: string, answered: number, wrong: number) => ({ topic: name, mastery: 0, answered, wrong, lastSeen: 0, daysSince: 0 });
  const fallback = [{ name: 'Altele', accuracy: 50, quizCount: 2 }];

  it('ia subiectele cu greșeli și destule răspunsuri, de la cel mai slab', () => {
    const rows = weakTopicsFrom([topic('cardiologie', 14, 7), topic('anemie feriprivă', 5, 4), topic('nefrologie', 2, 2), topic('pneumologie', 10, 0)], fallback);
    expect(rows).toEqual([
      { name: 'anemie feriprivă', accuracy: 20, quizCount: 5 },
      { name: 'cardiologie', accuracy: 50, quizCount: 14 },
    ]);
  });

  it('revine la categorii când nu există subiecte cu destule răspunsuri', () => {
    expect(weakTopicsFrom([topic('nefrologie', 2, 2)], fallback)).toEqual(fallback);
  });
});
