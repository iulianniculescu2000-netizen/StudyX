import { create } from 'zustand';
import { useQuizStore } from './quizStore';
import type { Folder, QuizColor } from '../types';

function uid() { return crypto.randomUUID().replace(/-/g, '').slice(0, 12); }

interface FolderStore {
  folders: Folder[];
  addFolder: (name: string, emoji: string, color: QuizColor, parentId?: string | null, scope?: Folder['scope']) => string;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  /** Deletes a folder and its descendants; returns them so a caller can undo. */
  deleteFolder: (id: string) => Folder[];
  /** Re-inserts folders with their ORIGINAL ids (undo), unlike addFolder. */
  restoreFolders: (folders: Folder[]) => void;
  reorderFolders: (ids: string[]) => void;
  _hydrate: (data: { folders: Folder[] }) => void;
  _snapshot: () => { folders: Folder[] };
}

export const useFolderStore = create<FolderStore>()(
  (set, get) => ({
    folders: [],

    addFolder: (name, emoji, color, parentId = null, scope) => {
      const id = `f-${uid()}`;
      set((s) => {
        // Un subfolder rămâne în același spațiu cu părintele (Flashcarduri sau Grile).
        const effectiveScope = scope ?? s.folders.find((folder) => folder.id === parentId)?.scope;
        return {
          folders: [...s.folders, { id, name, emoji, color, parentId: parentId ?? null, createdAt: Date.now(), ...(effectiveScope ? { scope: effectiveScope } : {}) }],
        };
      });
      return id;
    },

    updateFolder: (id, updates) =>
      set((s) => {
        const parentId = updates.parentId ?? undefined;
        if (parentId === id) return s;

        const descendants = new Set<string>();
        const collect = (folderId: string) => {
          s.folders
            .filter((folder) => folder.parentId === folderId)
            .forEach((folder) => {
              descendants.add(folder.id);
              collect(folder.id);
            });
        };
        collect(id);

        if (parentId && descendants.has(parentId)) return s;
        return { folders: s.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)) };
      }),

    deleteFolder: (id) => {
      const all = get().folders;
      const toDelete = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const folder of all) {
          if (folder.parentId && toDelete.has(folder.parentId) && !toDelete.has(folder.id)) {
            toDelete.add(folder.id);
            changed = true;
          }
        }
      }

      const removed = all.filter((f) => toDelete.has(f.id));
      set({ folders: all.filter((f) => !toDelete.has(f.id)) });

      // A quiz left pointing at a deleted folder disappears from every view —
      // getQuizzesByFolder only matches an existing folder or null. Detaching
      // here makes that impossible no matter who deletes the folder; the UI
      // path removes the contained quizzes first anyway, on purpose.
      useQuizStore.getState().detachFromFolders([...toDelete]);
      return removed;
    },

    restoreFolders: (restored) =>
      set((s) => {
        const existing = new Set(s.folders.map((f) => f.id));
        return { folders: [...s.folders, ...restored.filter((f) => !existing.has(f.id))] };
      }),

    reorderFolders: (ids) =>
      set((s) => {
        // Rebuilding the list purely from `ids` DELETED every folder the caller
        // didn't mention — a drag inside one subtree only knows its own ids, so
        // reordering there would have wiped the rest of the tree.
        const ordered = ids
          .map((id) => s.folders.find((f) => f.id === id))
          .filter((folder): folder is NonNullable<typeof folder> => !!folder);
        const moved = new Set(ordered.map((f) => f.id));
        return { folders: [...ordered, ...s.folders.filter((f) => !moved.has(f.id))] };
      }),

    _hydrate: (data) => set({ folders: data.folders ?? [] }),
    _snapshot: () => ({ folders: get().folders }),
  })
);
