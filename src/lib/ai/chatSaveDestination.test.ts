import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from '../../store/folderStore';
import { residencyFolderIds } from '../flashcardGroups';
import { flashcardDestinationFor, quizDestinationFor } from './chatSaveDestination';

describe('chatSaveDestination', () => {
  beforeEach(() => {
    useFolderStore.setState({ folders: [] });
  });

  it('în chatul general, grilele și cardurile rămân fără folder, ca până acum', () => {
    expect(quizDestinationFor('general', 'artrita reumatoidă')).toEqual({ folderId: null, category: null, tags: [] });
    expect(flashcardDestinationFor('general')).toEqual({ folderId: null, tags: [] });
    expect(useFolderStore.getState().folders).toHaveLength(0);
  });

  it('în chatul Rezidențiat, grila se salvează într-un folder din Rezidențiat, cu eticheta rezidentiat', () => {
    const where = quizDestinationFor('rezidentiat', 'artrita reumatoidă');
    const folders = useFolderStore.getState().folders;
    expect(where.folderId).toBeTruthy();
    expect(where.tags).toEqual(['rezidentiat']);
    expect(where.category).toBe(folders.find((folder) => folder.id === where.folderId)?.name);
    expect(residencyFolderIds(folders).has(where.folderId!)).toBe(true);
  });

  it('o a doua grilă pe același subiect refolosește folderul, nu face altul', () => {
    const first = quizDestinationFor('rezidentiat', 'artrita reumatoidă');
    const count = useFolderStore.getState().folders.length;
    const second = quizDestinationFor('rezidentiat', 'artrita reumatoidă');
    expect(second.folderId).toBe(first.folderId);
    expect(useFolderStore.getState().folders).toHaveLength(count);
  });

  it('în chatul Rezidențiat, flashcardul merge în Rezidențiat › Flashcarduri', () => {
    const where = flashcardDestinationFor('rezidentiat');
    const folders = useFolderStore.getState().folders;
    expect(where.tags).toEqual(['rezidentiat']);
    expect(where.folderId).toBeTruthy();
    expect(residencyFolderIds(folders).has(where.folderId!)).toBe(true);
    expect(folders.find((folder) => folder.id === where.folderId)?.name).toBe('Flashcarduri');
  });
});
