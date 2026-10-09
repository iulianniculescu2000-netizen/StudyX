import { create } from 'zustand';

interface NewFolderDialogState {
  open: boolean;
  parentId: string | null;
  /** Când e adevărat, după creare rămâi unde ești (Flashcarduri); implicit se deschide folderul nou. */
  stay: boolean;
  /** Spațiul în care se creează folderul (Flashcarduri); implicit Grile. */
  scope: 'flashcards' | undefined;
  show: (parentId?: string | null, options?: { stay?: boolean; scope?: 'flashcards' }) => void;
  hide: () => void;
}

/**
 * Open/closed state of the "Folder nou" dialog, kept out of the Sidebar so that
 * opening it re-renders only the dialog — the sidebar (folder tree, counters,
 * every quiz-derived total) used to re-render in full on each click.
 */
export const useNewFolderDialog = create<NewFolderDialogState>((set) => ({
  open: false,
  parentId: null,
  stay: false,
  scope: undefined,
  show: (parentId = null, options) => set({ open: true, parentId, stay: options?.stay ?? false, scope: options?.scope }),
  hide: () => set({ open: false, parentId: null, stay: false, scope: undefined }),
}));
