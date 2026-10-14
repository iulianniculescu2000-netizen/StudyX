/**
 * Ierarhia surselor din Rezidențiat.
 *   - `book`:    cele trei cărți incluse în aplicație (Kumar și Clark, Lawrence, Sinopsis): sursa de adevăr. Vin cu installerul,
 *                nu se șterg, nu se mută și au întâietate la căutare, la răspunsuri și la citări.
 *   - `bank`:    materialele studentului din Rezidențiat (capitole, note, culegeri indexate): banca de informații care completează cărțile.
 *   - `general`: tot ce e în afara Rezidențiatului (biblioteca generală).
 * Un singur loc decide nivelul unei surse, ca interfața, căutarea și prompturile să nu-și facă fiecare propria regulă.
 */
import type { AILibraryFolder, AIKnowledgeSource } from '../store/aiStore';
import { isBundledLibraryBookName } from './rezidentiatLibrary';
import { isRezidentiatSource, rezidentiatFolderIds } from './ai/sourceScope';

export type SourceTier = 'book' | 'bank' | 'general';

type TierInput = Pick<AIKnowledgeSource, 'name' | 'folderId'>;

/** Ordinea importanței: cărțile primele. */
export const TIER_RANK: Record<SourceTier, number> = { book: 0, bank: 1, general: 2 };

/** Eticheta scurtă pentru interfață și citări. */
export const TIER_LABEL: Record<SourceTier, string> = { book: 'Carte de bază', bank: 'Material', general: 'Bibliotecă' };

/** Nivelul unei surse. O carte inclusă rămâne `book` oriunde ar fi pusă în bibliotecă. */
export function sourceTier(source: TierInput, folders: ReadonlyArray<AILibraryFolder>): SourceTier {
  if (isBundledLibraryBookName(source.name)) return 'book';
  return isRezidentiatSource(source, rezidentiatFolderIds(folders)) ? 'bank' : 'general';
}

/** Împarte sursele pe niveluri, păstrând ordinea primită în fiecare. */
export function groupByTier<T extends TierInput>(sources: ReadonlyArray<T>, folders: ReadonlyArray<AILibraryFolder>): Record<SourceTier, T[]> {
  const rez = rezidentiatFolderIds(folders);
  const out: Record<SourceTier, T[]> = { book: [], bank: [], general: [] };
  for (const source of sources) {
    const tier: SourceTier = isBundledLibraryBookName(source.name) ? 'book' : isRezidentiatSource(source, rez) ? 'bank' : 'general';
    out[tier].push(source);
  }
  return out;
}
