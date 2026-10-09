/** Minuscule, fără diacritice (ă â î ș ț, atât cu virgulă cât și cu sedilă), ca „sarcină” și „sarcina” să se potrivească. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Adevărat dacă toate cuvintele din `query` apar (în orice ordine) în `haystack`, ignorând diacriticele și majusculele. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const target = normalizeSearchText(haystack);
  return words.every((word) => target.includes(word));
}
