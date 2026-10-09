import { create } from 'zustand';

const MAX_HISTORY = 20;

interface NotesStore {
  notes: Record<string, string>;
  history: Record<string, string[]>; // questionId -> stack of previous values
  setNote: (questionId: string, text: string) => void;
  undoNote: (questionId: string) => void;
  getNote: (questionId: string) => string;
  deleteNote: (questionId: string) => void;
  _hydrate: (data: { notes: Record<string, string> }) => void;
  _snapshot: () => { notes: Record<string, string> };
}

export const useNotesStore = create<NotesStore>()(
  (set, get) => ({
    notes: {},
    history: {},

    setNote: (questionId, text) =>
      set(s => {
        const prev = s.notes[questionId];
        const stack = s.history[questionId] ?? [];
        const newStack = prev !== undefined
          ? [...stack, prev].slice(-MAX_HISTORY)
          : stack;
        return {
          notes: { ...s.notes, [questionId]: text },
          history: { ...s.history, [questionId]: newStack },
        };
      }),

    undoNote: (questionId) =>
      set(s => {
        const stack = s.history[questionId] ?? [];
        if (stack.length === 0) return s;
        const prev = stack[stack.length - 1];
        return {
          notes: { ...s.notes, [questionId]: prev },
          history: { ...s.history, [questionId]: stack.slice(0, -1) },
        };
      }),

    getNote: (questionId) => get().notes[questionId] ?? '',

    deleteNote: (questionId) =>
      set(s => {
        const n = { ...s.notes };
        delete n[questionId];
        // Drop the undo stack too: leaving it behind let a deleted note be
        // resurrected by an undo, which reads as the deletion silently failing.
        const history = { ...s.history };
        delete history[questionId];
        return { notes: n, history };
      }),

    _hydrate: (data) => set({ notes: data.notes ?? {}, history: {} }),
    _snapshot: () => ({ notes: get().notes }),
  })
);
