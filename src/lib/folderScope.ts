import type { Folder, Quiz } from '../types';
import { isFlashcardDeck } from './deckKind';
import { isUnderRezidentiatRoot } from './rezidentiatRoot';

/** Foldere create din Flashcarduri: nu apar în bara laterală, în Grile și în pickerele de grile. */
export const FLASHCARD_SCOPE = 'flashcards' as const;

export const isFlashcardFolder = (folder: Pick<Folder, 'scope'>) => folder.scope === FLASHCARD_SCOPE;

/** Folderele pentru grile și restul aplicației (fără cele de Flashcarduri). */
export const withoutFlashcardFolders = <T extends Pick<Folder, 'scope'>>(folders: T[]): T[] =>
  folders.some(isFlashcardFolder) ? folders.filter((folder) => !isFlashcardFolder(folder)) : folders;

/** Doar folderele de Flashcarduri. */
export const onlyFlashcardFolders = <T extends Pick<Folder, 'scope'>>(folders: T[]): T[] => folders.filter(isFlashcardFolder);

type MigrationQuiz = Pick<Quiz, 'folderId' | 'kind' | 'tags' | 'questions'>;

/**
 * Migrare pentru folderele create din Flashcarduri înainte să existe `Folder.scope`.
 * Un folder (împreună cu descendenții lui) primește scope 'flashcards' doar dacă:
 * conține cel puțin un deck, nu conține nicio grilă reală (direct sau în descendenți),
 * nu e în arborele Rezidențiat, iar părintele lui e deja de Flashcarduri (sau e folder rădăcină).
 * Folderele goale sau mixte rămân neatinse (ambiguu). Pură și idempotentă:
 * întoarce aceeași referință dacă nu e nimic de schimbat.
 */
export function migrateFlashcardFolderScopes(folders: Folder[], quizzes: ReadonlyArray<MigrationQuiz>): Folder[] {
  if (folders.length === 0) return folders;

  const direct = new Map<string, { decks: number; quizzes: number }>();
  for (const quiz of quizzes) {
    if (!quiz.folderId) continue;
    const entry = direct.get(quiz.folderId) ?? { decks: 0, quizzes: 0 };
    if (isFlashcardDeck(quiz as Quiz)) entry.decks += 1;
    else entry.quizzes += 1;
    direct.set(quiz.folderId, entry);
  }

  const children = new Map<string, Folder[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? '';
    const list = children.get(key);
    if (list) list.push(folder); else children.set(key, [folder]);
  }

  const totals = new Map<string, { decks: number; quizzes: number }>();
  const visiting = new Set<string>();
  const total = (folder: Folder): { decks: number; quizzes: number } => {
    const cached = totals.get(folder.id);
    if (cached) return cached;
    const sum = { ...(direct.get(folder.id) ?? { decks: 0, quizzes: 0 }) };
    if (!visiting.has(folder.id)) {
      visiting.add(folder.id);
      for (const child of children.get(folder.id) ?? []) {
        const sub = total(child);
        sum.decks += sub.decks;
        sum.quizzes += sub.quizzes;
      }
      visiting.delete(folder.id);
    }
    totals.set(folder.id, sum);
    return sum;
  };

  const migrate = new Set<string>();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  // Doar rădăcinile se decid singure; un subfolder urmează părintele (altfel ar fi ambiguu).
  const isRoot = (folder: Folder) => !folder.parentId || !byId.has(folder.parentId);
  const walk = (folder: Folder, parentIsFlash: boolean, seen: Set<string>) => {
    if (seen.has(folder.id)) return;
    seen.add(folder.id);
    let isFlash = isFlashcardFolder(folder);
    if (!isFlash && !folder.scope && parentIsFlash) {
      // Descendent al unui folder de Flashcarduri: moștenește spațiul.
      isFlash = true;
      migrate.add(folder.id);
    } else if (!isFlash && !folder.scope && isRoot(folder)) {
      const sum = total(folder);
      if (sum.decks > 0 && sum.quizzes === 0 && !isUnderRezidentiatRoot(folder.id, folders)) {
        isFlash = true;
        migrate.add(folder.id);
      }
    }
    for (const child of children.get(folder.id) ?? []) walk(child, isFlash, seen);
  };
  const seen = new Set<string>();
  for (const folder of folders) {
    // Rădăcini (sau cu părinte inexistent).
    if (!folder.parentId || !byId.has(folder.parentId)) walk(folder, false, seen);
  }

  if (migrate.size === 0) return folders;
  return folders.map((folder) => (migrate.has(folder.id) ? { ...folder, scope: FLASHCARD_SCOPE } : folder));
}
