/**
 * Reindexarea automată a cărților din Rezidențiat: aplicația știe deja unde stau cărțile compilate (`BOOK_FILES`) în
 * folderul ales la Organizare, deci nu mai e nevoie ca studentul să le aleagă din nou cu un selector. Pur: fără disc,
 * fără stores. Citirea octeților (`organizare:read-pdf`) și indexarea rămân în `useReindexSources`.
 */
import { BOOK_FILES, type BookCode } from '../bookPages';
import { bookOfSourceName } from '../curriculum';
import { plainFileName } from '../../ai/reindexMatch';

export interface AutoReindexTarget<S> {
  source: S;
  code: BookCode;
  /** Calea relativă la folderul rădăcină ales de student. */
  relPath: string;
}

/** Surse cu o carte cunoscută (K/L/S) → citite singure; restul rămân pentru selectorul manual. */
export function planAutoReindex<S extends { name: string }>(sources: readonly S[]): { auto: AutoReindexTarget<S>[]; manual: S[] } {
  const auto: AutoReindexTarget<S>[] = [];
  const manual: S[] = [];
  for (const source of sources) {
    const code = bookOfSourceName(source.name);
    if (code) auto.push({ source, code, relPath: BOOK_FILES[code] });
    else manual.push(source);
  }
  return { auto, manual };
}

export interface DuplicateGroup<S> {
  keep: S;
  extra: S[];
}

/** Aceeași carte indexată de mai multe ori: același nume (normalizat) și același număr de fragmente. Păstrează prima. */
export function findDuplicateSources<S extends { name: string; chunkCount: number }>(sources: readonly S[]): DuplicateGroup<S>[] {
  const groups = new Map<string, S[]>();
  for (const source of sources) {
    if (!source.chunkCount) continue;
    const key = `${plainFileName(source.name)}::${source.chunkCount}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map(([keep, ...extra]) => ({ keep, extra }));
}
