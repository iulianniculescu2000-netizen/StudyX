import { describe, expect, it } from 'vitest';
import { buildRezidentiatOverview } from './rezidentiatOverview';
import { buildBankTree } from './rezidentiatBankTree';
import type { Folder, Quiz, QuestionStat } from '../types';

const folder = (id: string, name: string, parentId: string | null = null): Folder =>
  ({ id, name, emoji: '', color: 'blue', createdAt: 0, parentId }) as Folder;
const quiz = (id: string, title: string, folderId: string, n: number): Quiz =>
  ({
    id, title, description: '', emoji: '', category: '', folderId, createdAt: 0, color: 'blue', tags: ['rezidentiat'],
    questions: Array.from({ length: n }, (_, i) => ({ id: `${id}-q${i}`, text: 'q', options: [], explanation: '' })),
  }) as unknown as Quiz;

const folders = [
  folder('root', 'Rezidențiat'),
  folder('dk', 'Medicină internă', 'root'),
  folder('dl', 'Chirurgie', 'root'),
  folder('dp', 'Pediatrie', 'root'),
  folder('cardio', 'Cardiologie', 'dk'),
  folder('hernii', 'Hernii', 'dl'),
  folder('rare', 'Boli rare fără capitol', 'dk'),
  folder('ped', 'Nou-născutul', 'dp'),
];

describe('banca de grile pe cărți și capitole', () => {
  it('pune specialitățile pe Kumar și Lawrence, la capitolul lor', () => {
    const quizzes = [quiz('a', 'Cardiologie — Test 1', 'cardio', 10), quiz('b', 'Hernii — Test 1', 'hernii', 6)];
    const stats: Record<string, QuestionStat> = { 'a:a-q0': { timesCorrect: 1, timesWrong: 0 } as QuestionStat };
    const tree = buildBankTree(buildRezidentiatOverview(folders, quizzes, stats, []));
    expect(tree.books.map((book) => book.short)).toEqual(['Kumar', 'Lawrence']);
    const kumar = tree.books[0];
    expect(kumar.chapters).toHaveLength(1);
    expect(kumar.chapters[0].chapter.title.toLowerCase()).toContain('cardio');
    expect(kumar.chapters[0].questionCount).toBe(10);
    expect(kumar.chapters[0].progress).toBe(10);
    expect(tree.books[1].chapters[0].quizzes.map((q) => q.id)).toEqual(['b']);
    expect(tree.questionCount).toBe(16);
  });

  it('ce nu se leagă de un capitol rămâne în „altele”, nu dispare', () => {
    const quizzes = [quiz('a', 'Rare — Test 1', 'rare', 5), quiz('c', 'Nou-născut — Test 1', 'ped', 7)];
    const tree = buildBankTree(buildRezidentiatOverview(folders, quizzes, {}, []));
    expect(tree.books).toEqual([]);
    expect(tree.other.map((s) => s.folder.id).sort()).toEqual(['ped', 'rare']);
    expect(tree.questionCount).toBe(12);
  });
});
