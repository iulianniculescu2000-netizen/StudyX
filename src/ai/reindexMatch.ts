/** Potrivește fișierele alese de utilizator cu sursele de reindexat (octeții originali nu se păstrează, deci după nume). */

export function plainFileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface MatchResult<F, S> {
  pairs: Array<{ file: F; source: S }>;
  unmatchedFiles: F[];
  unmatchedSources: S[];
}

/** O sursă primește cel mult un fișier și invers; potrivire exactă pe numele normalizat (fără diacritice, majuscule, extensie). */
export function matchFilesToSources<F extends { name: string }, S extends { name: string }>(files: readonly F[], sources: readonly S[]): MatchResult<F, S> {
  const free = [...sources];
  const pairs: Array<{ file: F; source: S }> = [];
  const unmatchedFiles: F[] = [];
  for (const file of files) {
    const key = plainFileName(file.name);
    const at = free.findIndex((source) => plainFileName(source.name) === key);
    if (at < 0) { unmatchedFiles.push(file); continue; }
    pairs.push({ file, source: free[at] });
    free.splice(at, 1);
  }
  return { pairs, unmatchedFiles, unmatchedSources: free };
}
