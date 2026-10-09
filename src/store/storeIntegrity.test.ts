/**
 * Guards on two store operations that silently destroy more than they claim.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from './folderStore';
import { useNotesStore } from './notesStore';
import { useQuizStore } from './quizStore';

beforeEach(() => {
  useFolderStore.getState()._hydrate({ folders: [] });
  useQuizStore.getState()._hydrate({ quizzes: [], sessions: [] });
  useNotesStore.getState()._hydrate({ notes: {} });
});

describe('reorderFolders', () => {
  it('keeps folders that were not part of the reorder', () => {
    const a = useFolderStore.getState().addFolder('A', '📁', 'blue');
    const b = useFolderStore.getState().addFolder('B', '📁', 'green');

    // A drag within one subtree only knows about the ids it moved.
    useFolderStore.getState().reorderFolders([b]);

    const ids = useFolderStore.getState().folders.map((f) => f.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });

  it('applies the requested order', () => {
    const a = useFolderStore.getState().addFolder('A', '📁', 'blue');
    const b = useFolderStore.getState().addFolder('B', '📁', 'green');

    useFolderStore.getState().reorderFolders([b, a]);

    expect(useFolderStore.getState().folders.map((f) => f.id)).toEqual([b, a]);
  });

  it('ignores ids that no longer exist', () => {
    const a = useFolderStore.getState().addFolder('A', '📁', 'blue');
    useFolderStore.getState().reorderFolders(['ghost', a]);
    expect(useFolderStore.getState().folders.map((f) => f.id)).toEqual([a]);
  });
});

describe('deleteNote', () => {
  it('does not leave the note resurrectable through undo', () => {
    const notes = useNotesStore.getState();
    notes.setNote('q1', 'prima versiune');
    notes.setNote('q1', 'a doua versiune');
    notes.deleteNote('q1');

    useNotesStore.getState().undoNote('q1');

    expect(useNotesStore.getState().getNote('q1')).toBe('');
  });

  it('still supports undo for a normal edit', () => {
    const notes = useNotesStore.getState();
    notes.setNote('q1', 'prima versiune');
    notes.setNote('q1', 'a doua versiune');

    useNotesStore.getState().undoNote('q1');

    expect(useNotesStore.getState().getNote('q1')).toBe('prima versiune');
  });
});
