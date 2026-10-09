import { type DragEvent } from 'react';
import { folderDeleteImpact } from '../../lib/flashcardGroups';
import { bookChapterTag, chapterOfSummary } from '../../lib/flashcardTreeView';
import { type FlashcardDeckSummary } from './sections';

export const QUIZ_DRAG_MIME = 'application/x-studyx-quiz-id';
export const ROW_HEIGHT = 38;
/** De la câte pachete în sus rândurile sar peste randarea celor din afara ecranului. */
export const VIRTUALIZE_FROM = 40;

export const BOOK_FALLBACK = 'Capitole';
/** Eticheta „Cap. N” din carte pentru un pachet de capitol. */
export const chapterTag = (deck: FlashcardDeckSummary): string | null => {
  const chapter = chapterOfSummary(deck);
  return chapter ? bookChapterTag(chapter) : null;
};

export const isQuizDrag = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer?.types ?? []).includes(QUIZ_DRAG_MIME);

export const restanteLabel = (count: number) => `${count} ${count === 1 ? 'restantă' : 'restante'}`;

/** Acțiunile apar doar la hover / focus în rând, iar pe ecrane fără hover rămân mereu vizibile. */
export const REVEAL = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

export function describeFolderDelete(impact: ReturnType<typeof folderDeleteImpact> | null): string {
  if (!impact) return '';
  const parts: string[] = [];
  if (impact.decks > 0) parts.push(`Cele ${impact.decks} ${impact.decks === 1 ? 'pachet rămâne' : 'pachete rămân'}, dar ${impact.decks === 1 ? 'trece' : 'trec'} la Neclasificate.`);
  if (impact.otherSets > 0) parts.push(`${impact.otherSets} ${impact.otherSets === 1 ? 'grilă din folder trece' : 'grile din folder trec'} și ${impact.otherSets === 1 ? 'ea' : 'ele'} la Neclasificate.`);
  if (impact.subfolders === 1) parts.push('Se șterge și 1 subfolder.');
  else if (impact.subfolders > 1) parts.push(`Se șterg și ${impact.subfolders} subfoldere.`);
  if (parts.length === 0) return 'Folderul este gol.';
  return parts.join(' ');
}
