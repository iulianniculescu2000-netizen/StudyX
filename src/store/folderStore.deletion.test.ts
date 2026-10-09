/**
 * Folder deletion must never make a quiz unreachable.
 *
 * A quiz whose `folderId` points at a deleted folder is shown by nothing:
 * `getQuizzesByFolder` matches either an existing folder or `null`, so the quiz
 * still exists in storage but vanishes from the entire UI.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from './folderStore';
import { useQuizStore } from './quizStore';
import type { Quiz } from '../types';

function quiz(id: string, folderId: string | null): Quiz {
  return {
    id,
    title: id,
    description: '',
    emoji: '📘',
    category: 'test',
    color: 'blue',
    questions: [],
    createdAt: 1,
    folderId,
  };
}

beforeEach(() => {
  useFolderStore.getState()._hydrate({ folders: [] });
  useQuizStore.getState()._hydrate({ quizzes: [], sessions: [] });
});

describe('deleteFolder', () => {
  it('detaches quizzes instead of leaving them pointing at a deleted folder', () => {
    const folderId = useFolderStore.getState().addFolder('Cardiologie', '❤️', 'red');
    useQuizStore.getState().addQuiz(quiz('q1', folderId));

    useFolderStore.getState().deleteFolder(folderId);

    expect(useQuizStore.getState().quizzes).toHaveLength(1);
    expect(useQuizStore.getState().getQuizzesByFolder(null).map((q) => q.id)).toEqual(['q1']);
  });

  it('detaches quizzes from nested subfolders too', () => {
    const parent = useFolderStore.getState().addFolder('Rezidențiat', '🩺', 'blue');
    const child = useFolderStore.getState().addFolder('Cardiologie', '❤️', 'red', parent);
    useQuizStore.getState().addQuiz(quiz('q-child', child));

    useFolderStore.getState().deleteFolder(parent);

    expect(useQuizStore.getState().getQuizzesByFolder(null).map((q) => q.id)).toEqual(['q-child']);
  });

  it('leaves quizzes in other folders alone', () => {
    const a = useFolderStore.getState().addFolder('A', '📁', 'blue');
    const b = useFolderStore.getState().addFolder('B', '📁', 'green');
    useQuizStore.getState().addQuiz(quiz('q-a', a));
    useQuizStore.getState().addQuiz(quiz('q-b', b));

    useFolderStore.getState().deleteFolder(a);

    expect(useQuizStore.getState().getQuizzesByFolder(b).map((q) => q.id)).toEqual(['q-b']);
  });

  it('returns the deleted folders so a caller can undo', () => {
    const parent = useFolderStore.getState().addFolder('Rezidențiat', '🩺', 'blue');
    const child = useFolderStore.getState().addFolder('Cardiologie', '❤️', 'red', parent);

    const removed = useFolderStore.getState().deleteFolder(parent);

    expect(removed.map((f) => f.id).sort()).toEqual([parent, child].sort());
  });
});

describe('restoreFolders', () => {
  it('brings folders back with their original ids so quizzes can be re-linked', () => {
    const folderId = useFolderStore.getState().addFolder('Cardiologie', '❤️', 'red');
    useQuizStore.getState().addQuiz(quiz('q1', folderId));

    const removed = useFolderStore.getState().deleteFolder(folderId);
    // Undo, the way the AI agent performs it.
    useFolderStore.getState().restoreFolders(removed);
    useQuizStore.getState().moveToFolder('q1', folderId);

    expect(useFolderStore.getState().folders.map((f) => f.id)).toEqual([folderId]);
    expect(useQuizStore.getState().getQuizzesByFolder(folderId).map((q) => q.id)).toEqual(['q1']);
  });

  it('does not duplicate a folder that already exists', () => {
    const folderId = useFolderStore.getState().addFolder('A', '📁', 'blue');
    const snapshot = useFolderStore.getState().folders;

    useFolderStore.getState().restoreFolders(snapshot);

    expect(useFolderStore.getState().folders.filter((f) => f.id === folderId)).toHaveLength(1);
  });
});
