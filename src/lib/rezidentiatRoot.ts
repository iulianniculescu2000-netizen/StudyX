/**
 * Single source of truth for "the Rezidențiat root folder" name and lookup,
 * shared across the two independent stores that each keep their own folder
 * with this exact name (`useFolderStore`'s quiz folders and `useAIStore`'s
 * AI-library folders — see rezidentiatBank.ts / rezidentiatLibrary.ts).
 *
 * Before this existed, five separate files each declared their own copy of
 * the string 'Rezidențiat' and, in two of them, matched it at ANY folder
 * depth instead of only at the root — since folder creation is completely
 * unconstrained (including from the AI agent), a nested folder someone named
 * "Rezidențiat" would get misidentified as the actual root. Every lookup
 * should go through here instead of re-declaring the name or the check.
 */
import { useFolderStore } from '../store/folderStore';
import { useAIStore } from '../store/aiStore';
import type { Folder } from '../types';

export const REZIDENTIAT_ROOT_NAME = 'Rezidențiat';
/** Where AI-generated chapter flashcard decks land — kept separate from the discipline/specialty tree the real question banks build, so generated content doesn't get mixed in with verified imports. */
export const REZIDENTIAT_AI_FLASHCARDS_FOLDER_NAME = '🃏 Flashcarduri AI';

interface NamedFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

function normalize(name: string): string {
  // Diacritic-insensitive, like every other Rezidențiat lookup ("Rezidentiat" and "Rezidenţiat" are the same folder).
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** True only for a TOP-LEVEL folder named exactly "Rezidențiat" — never a nested one. */
export function isRezidentiatRootFolder(folder: NamedFolder): boolean {
  return !folder.parentId && normalize(folder.name) === normalize(REZIDENTIAT_ROOT_NAME);
}

/** The one true root folder in a folder list, or null if it doesn't exist yet. */
export function findRezidentiatRootFolder<T extends NamedFolder>(folders: T[]): T | null {
  return folders.find(isRezidentiatRootFolder) ?? null;
}

/** Whether `folderId` is the Rezidențiat root itself or nested anywhere under it. */
export function isUnderRezidentiatRoot(folderId: string, folders: NamedFolder[]): boolean {
  let folder = folders.find((f) => f.id === folderId);
  while (folder) {
    if (!folder.parentId) return isRezidentiatRootFolder(folder);
    folder = folders.find((f) => f.id === folder!.parentId);
  }
  return false;
}

/**
 * Finds (or creates) the "🃏 Flashcarduri AI" subfolder under the Rezidențiat
 * root, creating the root itself first if it doesn't exist yet (e.g. no real
 * bank has been imported, but the user generates flashcards straight away).
 * Talks to `useFolderStore` directly — mirrors the pattern already used by
 * `rezidentiatBank.ts`'s `findOrCreateFolder`, just for this one fixed subfolder.
 */
export function findOrCreateAiFlashcardsFolder(): string {
  const { folders, addFolder } = useFolderStore.getState();

  const root = findOrCreateRezidentiatQuizRoot();
  const existing = folders.find(
    (f) => f.parentId === root.id && f.name.trim().toLowerCase() === REZIDENTIAT_AI_FLASHCARDS_FOLDER_NAME.toLowerCase(),
  );
  if (existing) return existing.id;
  return addFolder(REZIDENTIAT_AI_FLASHCARDS_FOLDER_NAME, '🃏', 'purple', root.id);
}

/**
 * Finds (or creates) the Rezidențiat root in the QUIZ folder tree
 * (`useFolderStore` — the tree FolderView/Sidebar render). Any AI action that
 * creates a folder or places generated content without an explicit
 * destination, while the user is inside the Rezidențiat section, should land
 * here instead of at the true tree root (which is the general/"toate
 * folderele" screen, one level above Rezidențiat itself).
 */
export function findOrCreateRezidentiatQuizRoot(): Folder {
  const { folders, addFolder } = useFolderStore.getState();
  const existing = findRezidentiatRootFolder(folders);
  if (existing) return existing;
  const id = addFolder(REZIDENTIAT_ROOT_NAME, '🩺', 'blue', null);
  return { id, name: REZIDENTIAT_ROOT_NAME, emoji: '🩺', color: 'blue', parentId: null, createdAt: Date.now() };
}

/** Same as `findOrCreateRezidentiatQuizRoot`, for the separate AI LIBRARY folder tree (`useAIStore`). */
export function findOrCreateRezidentiatLibraryRoot(): string {
  const { libraryFolders, addLibraryFolder } = useAIStore.getState();
  const existing = findRezidentiatRootFolder(libraryFolders);
  if (existing) return existing.id;
  return addLibraryFolder(REZIDENTIAT_ROOT_NAME, '🩺');
}
