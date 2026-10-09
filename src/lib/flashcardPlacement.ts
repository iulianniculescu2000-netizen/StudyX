import type { Folder } from '../types';
import { isUnderRezidentiatRoot } from './rezidentiatRoot';

/** Lowercase, no diacritics, no extension, words separated by single spaces. */
function normalizeName(name: string): string {
  return name
    .replace(/\.[^.\s]{2,5}$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MIN_NAME_LENGTH = 4;

/**
 * Picks the folder an AI deck most plausibly belongs in, from the course name
 * alone: a folder whose name appears in the course name ("Balneofizioterapie"
 * for "Curs balneofizioterapie 2024.pdf") or the other way round. The longest
 * folder name wins, so "Chirurgie generală" beats "Chirurgie". Returns null
 * when nothing fits — the caller then leaves the deck in "Neclasificate".
 *
 * The Rezidențiat tree is skipped: its folders are filled by the residency
 * placement rules, not by whatever course happens to share a specialty's name.
 */
export function suggestFlashcardFolder(sourceName: string, folders: Folder[]): Folder | null {
  const source = normalizeName(sourceName);
  if (source.length < MIN_NAME_LENGTH) return null;
  const paddedSource = ` ${source} `;

  let best: { folder: Folder; length: number } | null = null;
  for (const folder of folders) {
    const name = normalizeName(folder.name);
    if (name.length < MIN_NAME_LENGTH) continue;
    if (isUnderRezidentiatRoot(folder.id, folders)) continue;

    const matches = paddedSource.includes(` ${name} `) || ` ${name} `.includes(paddedSource);
    if (!matches) continue;
    if (!best || name.length > best.length) best = { folder, length: name.length };
  }
  return best?.folder ?? null;
}
