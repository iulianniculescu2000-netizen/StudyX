/** Minuscule, fără diacritice (ă â î ș ț, atât cu virgulă cât și cu sedilă), ca „sarcină” și „sarcina” să se potrivească. */
export function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Calculează distanța Levenshtein dintre două cuvinte pentru toleranță la greșeli de tastare. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  if (a.length > b.length) {
    const tmp = a; a = b; b = tmp;
  }

  const prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  const curr = new Array(a.length + 1);

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    const bChar = b[j - 1];
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === bChar ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,
        prev[i] + 1,
        prev[i - 1] + cost
      );
    }
    for (let i = 0; i <= a.length; i++) {
      prev[i] = curr[i];
    }
  }
  return prev[a.length];
}

/** Verifică dacă un cuvânt căutat se potrivește cu un cuvânt țintă (prefix sau fuzzy cu 1-2 litere tolerate). */
export function matchesWordFuzzy(targetWord: string, queryWord: string): boolean {
  if (targetWord === queryWord || targetWord.startsWith(queryWord)) return true;

  // Numerele pure trebuie să se potrivească exact sau prin prefix, nu prin distanță Levenshtein (ex: 2024 nu e typo pentru 2025)
  if (/^\d+$/.test(queryWord)) return false;

  if (queryWord.length < 4) return false;
  // Prevenim execuția costisitoare pentru cuvinte anormal de lungi inserate accidental
  if (queryWord.length > 50) return false;

  const maxAllowed = queryWord.length >= 7 ? 2 : 1;

  // Potrivire prefix cu toleranță doar când cuvântul țintă este cel puțin la fel de lung ca prefixul căutat
  if (targetWord.length >= queryWord.length) {
    const prefix = targetWord.slice(0, queryWord.length);
    if (editDistance(queryWord, prefix) <= maxAllowed) return true;
  }

  // Potrivire pe întregul cuvânt în marja de lungime permisă
  if (Math.abs(targetWord.length - queryWord.length) <= maxAllowed) {
    if (editDistance(queryWord, targetWord) <= maxAllowed) return true;
  }
  return false;
}

export interface MatchesQueryOptions {
  fuzzy?: boolean;
}

/**
 * Adevărat dacă toate cuvintele din `query` apar (în orice ordine) în `haystack`.
 * Suportă diacritice, majuscule, potrivire prin prefix și toleranță la greșeli de tastare (fuzzy).
 */
export function matchesQuery(haystack?: string | null, query?: string | null, options?: MatchesQueryOptions): boolean {
  if (!query || !query.trim()) return true;
  if (!haystack) return false;

  const rawWords = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return true;
  const target = normalizeSearchText(haystack);

  const isFuzzy = options?.fuzzy ?? true;

  // 1. Dacă toate cuvintele din query sunt deja incluse exact în haystack, returnăm instant
  if (rawWords.every((word) => target.includes(word))) return true;

  // Eliminăm delimitatorii externi din cuvintele căutate (ex: "[ghid]", "(tratament)", "cord,", "termen?"),
  // dar păstrăm simbolurile dacă cuvântul era format doar din ele sau dacă e intern (ex: "c++")
  const words = rawWords.map((w) => {
    const cleaned = w.replace(/^[()[\]{}"',.:;!?]+|[()[\]{}"',.:;!?]+$/g, '');
    return cleaned || w;
  });

  if (words.every((word) => target.includes(word))) return true;

  if (!isFuzzy) {
    return false;
  }

  // 2. Pentru cuvintele care nu apar identic, căutăm potrivire fuzzy pe tokeni
  const targetWords = target.split(/[\s,.;:!?()[\]{}"'\\/+-]+/).filter(Boolean);

  return words.every((word) => {
    if (target.includes(word)) return true;
    return targetWords.some((tw) => matchesWordFuzzy(tw, word));
  });
}
