import { create } from 'zustand';
import type { Quiz, QuizSession } from '../types';

function uid() { return crypto.randomUUID().replace(/-/g, '').slice(0, 12); }

interface QuizStore {
  quizzes: Quiz[];
  sessions: QuizSession[];
  _hasHydrated: boolean;
  addQuiz: (quiz: Quiz) => void;
  /** Ca apelarea `addQuiz` pe rând (ultimul adăugat ajunge primul), dar cu o singură notificare. */
  addQuizzes: (quizzes: Quiz[]) => void;
  updateQuiz: (id: string, updates: Partial<Quiz>) => void;
  /** `keepImages` defers the picture purge, for deletions that can still be undone. */
  deleteQuiz: (id: string, options?: { keepImages?: boolean }) => void;
  duplicateQuiz: (id: string) => string | null;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  moveToFolder: (quizId: string, folderId: string | null) => void;
  /** Hides (or shows again) individual questions in study sessions; nothing is deleted and stats stay. */
  setQuestionsHidden: (targets: Array<{ quizId: string; questionIds: string[] }>, hidden: boolean) => void;
  /** Detach quizzes from folders that no longer exist, so they stay reachable. */
  detachFromFolders: (folderIds: string[]) => void;
  addSession: (session: QuizSession) => void;
  getSessionsForQuiz: (quizId: string) => QuizSession[];
  getBestScore: (quizId: string) => number | null;
  getQuizzesByFolder: (folderId: string | null) => Quiz[];
  bulkDeleteQuizzes: (ids: string[]) => void;
  bulkMoveToFolder: (ids: string[], folderId: string | null) => void;
  cleanupOrphanImages: () => void;
  _hydrate: (data: { quizzes: Quiz[]; sessions: QuizSession[] }) => void;
  _snapshot: () => { quizzes: Quiz[]; sessions: QuizSession[] };
  reset: () => void;
}

export const useQuizStore = create<QuizStore>()(
  (set, get) => ({
    quizzes: [],
    sessions: [],
    _hasHydrated: false,

    addQuiz: (quiz) => set((s) => ({ quizzes: [quiz, ...s.quizzes] })),

    addQuizzes: (added) => {
      if (added.length === 0) return;
      set((s) => ({ quizzes: [...added.slice().reverse(), ...s.quizzes] }));
    },

    updateQuiz: (id, updates) =>
      set((s) => ({
        quizzes: s.quizzes.map((q) => q.id === id ? { ...q, ...updates, updatedAt: Date.now() } : q),
      })),

    deleteQuiz: (id, options) => {
      // `keepImages` is for deletions that can still be undone. The image purge
      // used to fire unconditionally as a floating promise, so an undo restored
      // the deck with every picture already gone — and the delete could even
      // land AFTER the undo. Whatever is kept is reclaimed by cleanupOrphanImages.
      if (!options?.keepImages) {
        void import('../lib/flashcardImageStore')
          .then((m) => m.deleteFlashcardImagesForQuiz(id))
          .catch((e) => console.error('[StudyX] Failed to delete flashcard images for quiz', id, e));
      }
      set((s) => ({ quizzes: s.quizzes.filter((q) => q.id !== id) }));
    },

    duplicateQuiz: (id) => {
      const original = get().quizzes.find((q) => q.id === id);
      if (!original) return null;
      const newId = uid();
      const copy: Quiz = {
        ...original,
        id: newId,
        title: `Copie — ${original.title}`,
        createdAt: Date.now(),
        updatedAt: undefined,
        // Resetăm archived și pinned — copia trebuie să fie vizibilă și nepinned
        archived: false,
        pinned: false,
        questions: original.questions.map((q) => ({
          ...q,
          id: uid(),
          // Deep copy al opțiunilor — referința partajată ar face ca editele din
          // copie să modifice și originalul (shallow copy bug).
          options: (q.options ?? []).map((o) => ({ ...o, id: uid() })),
        })),
      };
      set((s) => ({ quizzes: [copy, ...s.quizzes] }));
      return newId;
    },

    togglePin: (id) =>
      set((s) => ({
        quizzes: s.quizzes.map((q) => q.id === id ? { ...q, pinned: !q.pinned } : q),
      })),

    toggleArchive: (id) =>
      set((s) => ({
        quizzes: s.quizzes.map((q) => q.id === id
          ? { ...q, archived: !q.archived, pinned: q.archived ? q.pinned : false }
          : q),
      })),

    moveToFolder: (quizId, folderId) =>
      set((s) => ({
        quizzes: s.quizzes.map((q) => q.id === quizId ? { ...q, folderId } : q),
      })),

    setQuestionsHidden: (targets, hidden) =>
      set((s) => {
        const byQuiz = new Map<string, Set<string>>();
        for (const target of targets) {
          const ids = byQuiz.get(target.quizId) ?? new Set<string>();
          target.questionIds.forEach((id) => ids.add(id));
          byQuiz.set(target.quizId, ids);
        }
        if (byQuiz.size === 0) return s;
        const now = Date.now();
        return {
          quizzes: s.quizzes.map((quiz) => {
            const ids = byQuiz.get(quiz.id);
            if (!ids || !quiz.questions.some((question) => ids.has(question.id) && (question.hidden === true) !== hidden)) return quiz;
            const questions = quiz.questions.map((question) => {
              if (!ids.has(question.id)) return question;
              if (hidden) return { ...question, hidden: true };
              const shown = { ...question };
              delete shown.hidden;
              return shown;
            });
            return { ...quiz, questions, updatedAt: now };
          }),
        };
      }),

    detachFromFolders: (folderIds) =>
      set((s) => {
        const removed = new Set(folderIds);
        return {
          quizzes: s.quizzes.map((q) => (q.folderId && removed.has(q.folderId) ? { ...q, folderId: null } : q)),
        };
      }),

    addSession: (session) =>
      set((s) => ({ sessions: [session, ...s.sessions] })),

    getSessionsForQuiz: (quizId) =>
      get().sessions.filter((s) => s.quizId === quizId),

    getBestScore: (quizId) => {
      const sessions = get().sessions.filter((s) => s.quizId === quizId);
      if (!sessions.length) return null;
      return Math.max(...sessions.map((s) => Math.round((s.score / s.total) * 100)));
    },

    getQuizzesByFolder: (folderId) =>
      get().quizzes.filter((q) => {
        if (folderId === null) return !q.folderId;
        return q.folderId === folderId;
      }),

    bulkDeleteQuizzes: (ids) => {
      void import('../lib/flashcardImageStore')
        .then((m) => Promise.all(ids.map((id) => m.deleteFlashcardImagesForQuiz(id))))
        .catch((e) => console.error('[StudyX] Failed to delete flashcard images for quizzes', ids, e));
      set((s) => ({ quizzes: s.quizzes.filter((q) => !ids.includes(q.id)) }));
    },

    bulkMoveToFolder: (ids, folderId) =>
      set((s) => ({
        quizzes: s.quizzes.map((q) => ids.includes(q.id) ? { ...q, folderId } : q),
      })),

    cleanupOrphanImages: () => {
      // Was a no-op stub whose comment claimed images live inline as base64 —
      // they haven't since flashcardImageStore moved them to IndexedDB, so
      // pictures from deleted decks simply accumulated forever.
      void (async () => {
        try {
          const store = await import('../lib/flashcardImageStore');
          const stored = await store.listFlashcardImageQuizIds();
          // Re-read AFTER the await — reading before would snapshot the quiz list
          // before the IO, then any deck added concurrently during the await would
          // not be in `owned` and its images would be wrongly deleted as "orphans".
          const owned = new Set(get().quizzes.map((q) => q.id));
          await Promise.all(
            stored.filter((quizId) => !owned.has(quizId)).map((quizId) => store.deleteFlashcardImagesForQuiz(quizId)),
          );
        } catch (error) {
          console.error('[StudyX] Orphan image cleanup failed', error);
        }
      })();
    },

    _hydrate: (data) => set({ quizzes: data.quizzes ?? [], sessions: data.sessions ?? [], _hasHydrated: true }),
    _snapshot: () => ({ quizzes: get().quizzes, sessions: get().sessions }),
    reset: () => set({ quizzes: [], sessions: [], _hasHydrated: true }),
  })
);
