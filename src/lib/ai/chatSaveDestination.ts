/**
 * Unde se salvează ce faci cu butoanele „Fă quiz” și „Flashcard” de sub un răspuns din chat.
 *
 * În chatul general rămân la Neclasificate / fără folder. În chatul Rezidențiat trebuie să rămână în Rezidențiat:
 * grilele pe specialitatea subiectului (aceeași regulă ca la „fă-mi grile despre X”), flashcardurile în Rezidențiat / Flashcarduri.
 * Altfel apar printre grilele și cardurile generale, iar în pagina Rezidențiat lipsesc.
 */
import { ensureTopicFolder } from '../rezidentiatPlacement';
import { defaultDestinationChoice, resolveDestination } from './studyDestinations';
import type { SourceScope } from './sourceScope';

export interface QuizSaveDestination {
  folderId: string | null;
  /** `null`: se păstrează categoria implicită a chatului. */
  category: string | null;
  tags: string[];
}

/** Grila din răspuns: în Rezidențiat, folderul specialității subiectului (se creează o singură dată). */
export function quizDestinationFor(space: SourceScope, subject: string): QuizSaveDestination {
  if (space !== 'rezidentiat') return { folderId: null, category: null, tags: [] };
  const folder = ensureTopicFolder(subject);
  return { folderId: folder.id, category: folder.name, tags: ['rezidentiat'] };
}

/** Flashcardul din răspuns: în Rezidențiat, rădăcina Flashcarduri (se creează o singură dată). */
export function flashcardDestinationFor(space: SourceScope): { folderId: string | null; tags: string[] } {
  if (space !== 'rezidentiat') return { folderId: null, tags: [] };
  return { folderId: resolveDestination('flashcards', 'rezidentiat', defaultDestinationChoice('flashcards', 'rezidentiat')), tags: ['rezidentiat'] };
}
