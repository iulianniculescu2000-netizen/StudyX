import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import type { Quiz } from '../types';
import { deleteQuizFolder, userQuizFolders } from './rezidentiatQuizFolders';

const quiz = (id: string, folderId: string | null): Quiz => ({
  id, title: id, description: '', emoji: '📋', category: 'c', kind: 'quiz', folderId, color: 'blue', tags: ['rezidentiat'], createdAt: 1, questions: [],
});

let ids: { rez: string; grile: string; sesiune: string; sub: string; flash: string };
beforeEach(() => {
  useFolderStore.setState({ folders: [] });
  useQuizStore.setState({ quizzes: [] });
  const store = useFolderStore.getState();
  const rez = store.addFolder('Rezidențiat', '🩺', 'blue', null);
  const grile = store.addFolder('Grile', '📘', 'blue', rez);
  const sesiune = store.addFolder('Sesiunea 2027', '📁', 'blue', grile);
  const sub = store.addFolder('Cardio', '❤️', 'red', sesiune);
  const flash = store.addFolder('Flashcarduri', '🃏', 'purple', rez);
  store.addFolder('Recapitulare', '📁', 'blue', flash);
  ids = { rez, grile, sesiune, sub, flash };
});

describe('foldere proprii de grile', () => {
  it('listează doar ce e sub Grile, cu numărul de seturi, inclusiv foldere goale', () => {
    useQuizStore.setState({ quizzes: [quiz('a', ids.sub), quiz('b', ids.sesiune), { ...quiz('c', ids.sub), archived: true }, { ...quiz('d', ids.sub), kind: 'flashcard' }] });
    const rows = userQuizFolders(useFolderStore.getState().folders, useQuizStore.getState().quizzes);
    expect(rows.map((row) => [row.label, row.quizCount, row.depth])).toEqual([['Sesiunea 2027', 2, 0], ['Sesiunea 2027 / Cardio', 1, 1]]);
  });

  it('fără folderul Grile nu inventează nimic', () => {
    useFolderStore.setState({ folders: [] });
    expect(userQuizFolders([], [])).toEqual([]);
  });

  it('ștergerea păstrează seturile în Grile, în Rezidențiat', () => {
    useQuizStore.setState({ quizzes: [quiz('a', ids.sub), quiz('b', ids.sesiune)] });
    expect(deleteQuizFolder(ids.sesiune, false)).toEqual({ quizzes: 2 });
    expect(useQuizStore.getState().quizzes.map((entry) => entry.folderId)).toEqual([ids.grile, ids.grile]);
    expect(useFolderStore.getState().folders.some((folder) => folder.id === ids.sesiune || folder.id === ids.sub)).toBe(false);
  });

  it('ștergerea cu seturi le scoate și pe ele', () => {
    useQuizStore.setState({ quizzes: [quiz('a', ids.sub), quiz('keep', ids.grile)] });
    deleteQuizFolder(ids.sesiune, true);
    expect(useQuizStore.getState().quizzes.map((entry) => entry.id)).toEqual(['keep']);
  });
});
