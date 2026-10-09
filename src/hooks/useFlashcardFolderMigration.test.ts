import { beforeEach, describe, expect, it } from 'vitest';
import { runFlashcardFolderMigration } from './useFlashcardFolderMigration';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';

describe('runFlashcardFolderMigration', () => {
  beforeEach(() => {
    useFolderStore.setState({ folders: [{ id: 'a', name: 'A', emoji: '📁', color: 'blue', createdAt: 0, parentId: null }] });
    useQuizStore.setState({ quizzes: [{ id: 'q', folderId: 'a', kind: 'flashcard', tags: [], questions: [] } as never], _hasHydrated: false });
  });

  it('așteaptă hidratarea quizStore', () => {
    expect(runFlashcardFolderMigration()).toBe(false);
    expect(useFolderStore.getState().folders[0].scope).toBeUndefined();
  });

  it('aplică migrarea o dată și e idempotentă', () => {
    useQuizStore.setState({ _hasHydrated: true });
    expect(runFlashcardFolderMigration()).toBe(true);
    expect(useFolderStore.getState().folders[0].scope).toBe('flashcards');
    expect(runFlashcardFolderMigration()).toBe(false);
  });
});
