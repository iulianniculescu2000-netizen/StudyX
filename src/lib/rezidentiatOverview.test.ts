import { describe, it, expect } from 'vitest';
import { buildRezidentiatOverview, bookDisciplineHint, disciplineKey } from './rezidentiatOverview';
import type { Folder, Quiz, QuestionStat, QuizSession } from '../types';

const folder = (id: string, name: string, parentId: string | null = null): Folder =>
  ({ id, name, emoji: '', color: 'blue', createdAt: 0, parentId }) as Folder;
const quiz = (id: string, title: string, folderId: string, n: number, extra: Partial<Quiz> = {}): Quiz =>
  ({
    id,
    title,
    description: '',
    emoji: '',
    category: '',
    folderId,
    createdAt: 0,
    color: 'blue',
    tags: ['rezidentiat'],
    questions: Array.from({ length: n }, (_, i) => ({ id: `${id}-q${i}`, text: 'q', options: [], explanation: '' })),
    ...extra,
  }) as unknown as Quiz;
const stat = (correct: number, wrong: number): QuestionStat => ({ timesCorrect: correct, timesWrong: wrong }) as QuestionStat;

const folders = [
  folder('root', 'Rezidențiat'),
  folder('d1', 'Chirurgie', 'root'),
  folder('d2', 'Medicină internă', 'root'),
  folder('s1', 'Esofagul', 'd1'),
  folder('s2', 'Cardiologie', 'd2'),
  folder('empty', 'Goală', 'd2'),
];

describe('buildRezidentiatOverview', () => {
  it('returns nothing without a Rezidențiat root', () => {
    const o = buildRezidentiatOverview([folder('x', 'Altceva')], [], {}, []);
    expect(o.disciplines).toEqual([]);
    expect(o.resume).toBeNull();
  });

  it('groups quizzes by discipline and specialty and drops empty specialties', () => {
    const quizzes = [quiz('a', 'Esofagul — Test 10', 's1', 4), quiz('b', 'Esofagul — Test 2', 's1', 6), quiz('c', 'Cardio — Test 1', 's2', 10)];
    const o = buildRezidentiatOverview(folders, quizzes, {}, []);
    expect(o.disciplines.map((d) => d.folder.name)).toEqual(['Chirurgie', 'Medicină internă']);
    expect(o.totalQuestions).toBe(20);
    expect(o.totalSpecialties).toBe(2);
    expect(o.disciplines[0].specialties[0].quizzes.map((q) => q.id)).toEqual(['b', 'a']);
    expect(o.disciplines[1].specialties.map((s) => s.folder.name)).toEqual(['Cardiologie']);
  });

  it('measures progress as questions attempted at least once', () => {
    const quizzes = [quiz('a', 'Esofagul — Test 1', 's1', 4)];
    const stats = { 'a:a-q0': stat(1, 0), 'a:a-q1': stat(0, 2), 'a:a-q2': stat(0, 0) };
    const o = buildRezidentiatOverview(folders, quizzes, stats, []);
    expect(o.disciplines[0].specialties[0].answered).toBe(2);
    expect(o.disciplines[0].progress).toBe(50);
  });

  it('ignores archived quizzes, flashcard decks, combined sessions and quizzes filed outside Rezidențiat', () => {
    const quizzes = [
      quiz('a', 'A', 's1', 3, { archived: true }),
      quiz('b', 'B', 's1', 3, { kind: 'flashcard' }),
      quiz('c', 'C', 'elsewhere', 3, { tags: ['altceva'] }),
      quiz('d', 'D', 's1', 3, { tags: ['folder-session:s1', 'rezidentiat'] }),
    ];
    expect(buildRezidentiatOverview([...folders, folder('elsewhere', 'Altceva')], quizzes, {}, []).disciplines).toEqual([]);
  });

  it('counts a test filed in a specialty even without the Rezidențiat tag (e.g. made with "Grilă nouă")', () => {
    const o = buildRezidentiatOverview(folders, [quiz('n', 'Test propriu', 's1', 4, { tags: [] })], {}, []);
    expect(o.disciplines[0].specialties[0].quizzes.map((q) => q.id)).toEqual(['n']);
  });

  it('rolls quizzes in deeper folders up into their specialty', () => {
    const deep = [...folders, folder('sub', 'Subfolder', 's1')];
    const o = buildRezidentiatOverview(deep, [quiz('x', 'X', 'sub', 2, { tags: [] })], {}, []);
    expect(o.disciplines[0].specialties[0].folder.id).toBe('s1');
    expect(o.disciplines[0].specialties[0].loose).toBe(false);
  });

  it('keeps quizzes filed in the root, and bank quizzes whose folder was deleted, under "Alte grile"', () => {
    const inRoot = quiz('r', 'În rădăcină', 'root', 3, { tags: [] });
    const orphan = quiz('o', 'Fără folder', null as unknown as string, 2, { tags: ['rezidentiat', 'rezidentiat-bank:x'] });
    const o = buildRezidentiatOverview(folders, [inRoot, orphan], {}, []);
    const loose = o.disciplines.find((d) => d.folder.name === 'Alte grile');
    expect(loose?.specialties[0].quizzes.map((q) => q.id).sort()).toEqual(['o', 'r']);
  });

  it('keeps an AI-generated Rezidențiat quiz reachable after its folder is deleted', () => {
    // Chat "delete folder" detaches the quizzes (folderId → null); the AI ones carry only the plain tag.
    const detached = quiz('g', 'Mielom — AI', null as unknown as string, 5, { tags: ['rezidentiat'] });
    const danglingFolder = quiz('h', 'Alt AI', 'deleted-folder', 3, { tags: ['rezidentiat'] });
    const movedOnPurpose = quiz('m', 'Mutată de utilizator', 'some-other-folder', 4, { tags: ['rezidentiat'] });
    const o = buildRezidentiatOverview([...folders, folder('some-other-folder', 'Altceva')], [detached, danglingFolder, movedOnPurpose], {}, []);
    const loose = o.disciplines.find((d) => d.folder.name === 'Alte grile');
    expect(loose?.specialties[0].quizzes.map((q) => q.id).sort()).toEqual(['g', 'h']);
  });

  it('counts answers given in the combined session toward the specialty progress', () => {
    const quizzes = [quiz('a', 'Esofagul — Test 1', 's1', 4)];
    const stats = { 'mix-s1:a-q0': stat(1, 0), 'mix-s1:a-q1': stat(0, 1), 'a:a-q1': stat(1, 0) };
    const o = buildRezidentiatOverview(folders, quizzes, stats, []);
    expect(o.disciplines[0].specialties[0].answered).toBe(2);
  });

  it('resumes from the most recent session on a bank quiz', () => {
    const quizzes = [quiz('a', 'A', 's1', 3), quiz('c', 'C', 's2', 3)];
    const sessions = [
      { id: '1', quizId: 'a', startedAt: 100, finishedAt: 200 },
      { id: '2', quizId: 'c', startedAt: 300 },
      { id: '3', quizId: 'unknown', startedAt: 999 },
    ] as QuizSession[];
    const r = buildRezidentiatOverview(folders, quizzes, {}, sessions).resume;
    expect(r?.quiz.id).toBe('c');
    expect(r?.disciplineId).toBe('d2');
  });
});

describe('quizzes filed straight into a discipline', () => {
  it('shows them as one "Alte grile" entry instead of dropping them', () => {
    const withLoose = [...folders, folder('own', 'Grile', 'root')];
    const quizzes = [quiz('a', 'Set propriu', 'own', 5), quiz('b', 'Esofagul — Test 1', 's1', 3)];
    const o = buildRezidentiatOverview(withLoose, quizzes, {}, []);
    const own = o.disciplines.find((d) => d.folder.id === 'own');
    expect(own?.specialties).toHaveLength(1);
    expect(own?.specialties[0]).toMatchObject({ name: 'Alte grile', loose: true, questionCount: 5 });
    expect(o.disciplines.find((d) => d.folder.id === 'd1')?.specialties[0].loose).toBe(false);
  });
});

describe('discipline matching', () => {
  it('matches books and folders regardless of diacritics', () => {
    expect(bookDisciplineHint('Lawrence – Chirurgie generală.pdf')).toBe('chirurgie');
    expect(bookDisciplineHint('Kumar și Clark – Medicină Clinică.pdf')).toBe('medicina-interna');
    expect(bookDisciplineHint('Sinopsis de medicină.pdf')).toBeNull();
    expect(disciplineKey('Medicină internă')).toBe('medicina-interna');
    expect(disciplineKey('Chirurgie')).toBe('chirurgie');
    expect(disciplineKey('Pediatrie')).toBeNull();
  });
});
