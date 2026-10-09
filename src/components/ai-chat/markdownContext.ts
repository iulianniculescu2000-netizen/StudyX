import { createContext } from 'react';
import type { Citation } from './shared';

/** True while the block being rendered is still being written by the model (open fence / math). */
export const StreamingBlockContext = createContext(false);

/** Optional hooks a host can give diagrams (e.g. a future "flashcards from this schema" action). */
export interface DiagramActions {
  onCreateFlashcards?: (code: string) => void;
}
export const DiagramActionsContext = createContext<DiagramActions>({});

/** Citările numerotate ale răspunsului randat; `[n]` din text devine chip doar dacă n există aici. */
export const CitationsContext = createContext<readonly Citation[]>([]);
