import { create } from 'zustand';
import type { PdfFlashcardPageSnapshot } from '../lib/imageProcessing';
import type { GeneratedDeckInfo } from '../pages/flashcard-hub/sections';

/** What "Continuă generarea" needs to pick an interrupted run up where it stopped. */
export interface FlashcardResumeHandle {
  deckId: string;
  text: string;
  sourceName: string;
  requested: number;
  nextChunk: number;
  pages: PdfFlashcardPageSnapshot[];
}

interface FlashcardHubSessionState {
  /** The profile the values below belong to; another profile never sees them. */
  profileId: string | null;
  createdDeck: GeneratedDeckInfo | null;
  resume: FlashcardResumeHandle | null;
  setCreatedDeck: (
    profileId: string | null,
    next: GeneratedDeckInfo | null | ((previous: GeneratedDeckInfo | null) => GeneratedDeckInfo | null),
  ) => void;
  setResume: (profileId: string | null, next: FlashcardResumeHandle | null) => void;
}

/**
 * Session-only memory (never persisted) for the Flashcarduri page: the "Pachet creat" card and the
 * resume handle of an interrupted generation used to live in the page's own state, so opening
 * another page and coming back lost the "Continuă generarea" button.
 */
export const useFlashcardHubSession = create<FlashcardHubSessionState>()((set, get) => ({
  profileId: null,
  createdDeck: null,
  resume: null,
  setCreatedDeck: (profileId, next) => {
    const state = get();
    const previous = state.profileId === profileId ? state.createdDeck : null;
    const value = typeof next === 'function' ? next(previous) : next;
    set(state.profileId === profileId
      ? { createdDeck: value }
      : { profileId, createdDeck: value, resume: null });
  },
  setResume: (profileId, next) => {
    const state = get();
    set(state.profileId === profileId
      ? { resume: next }
      : { profileId, resume: next, createdDeck: null });
  },
}));

/** The resume handle for this profile, if any. */
export function getFlashcardResume(profileId: string | null): FlashcardResumeHandle | null {
  const state = useFlashcardHubSession.getState();
  return state.profileId === profileId ? state.resume : null;
}
