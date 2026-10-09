/**
 * Tokenizare pentru căutarea lexicală în Biblioteca AI (BM25): fără diacritice, fără cuvinte de
 * legătură, cu o stemare ușoară pentru terminațiile românești uzuale (insuficiență/insuficienței,
 * fibrilație/fibrilația, atrială/atriale) și cu abrevierile medicale scurte păstrate („IC", „DZ").
 *
 * Doar în memorie: nu influențează vectorii stocați în IndexedDB (care folosesc `embeddings.ts`).
 */
import { KNOWN_ABBREVIATION_KEYS } from './medicalSynonyms';

const STOP = new Set([
  'si', 'sau', 'din', 'pentru', 'prin', 'cel', 'cei', 'cea', 'ale', 'unui', 'unei', 'care', 'este', 'sunt',
  'nu', 'mai', 'dar', 'daca', 'iar', 'tot', 'fost', 'avea', 'face', 'poate', 'trebuie', 'despre', 'cand',
  'unde', 'cum', 'ce', 'fie', 'acest', 'aceasta', 'acesta', 'aceste', 'acesti', 'intre', 'dupa', 'catre',
  'spre', 'dintre', 'asupra', 'foarte', 'cat', 'cate', 'prezinta', 'spune', 'explica', 'spuneti',
  'the', 'and', 'of', 'to', 'is', 'are', 'with', 'for', 'this', 'that',
]);

// Cele mai lungi întâi; se scoate un singur sufix și rămân minimum 4 litere.
const SUFFIXES = ['ilor', 'elor', 'ului', 'ile', 'ele', 'ule', 'lor', 'ul', 'ei', 'ii', 'a', 'e', 'i'];
const MIN_STEM = 4;

export function stemRo(token: string): string {
  if (token.length <= MIN_STEM) return token;
  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= MIN_STEM) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** Tokeni normalizați ai unui text. Abrevierile cunoscute scrise cu majuscule se păstrează nestemate. */
export function tokenizeForSearch(text: string): string[] {
  const raw = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const piece of raw) {
    const lower = piece.toLowerCase();
    if (piece === piece.toUpperCase() && KNOWN_ABBREVIATION_KEYS.has(lower)) {
      tokens.push(lower);
      continue;
    }
    if (lower.length <= 2 || STOP.has(lower)) continue;
    tokens.push(stemRo(lower));
  }
  return tokens;
}

/** Tokenii unei fraze de expandare: o abreviere cunoscută (ex. „ic") rămâne ca atare, restul se tokenizează normal. */
export function tokenizeExpansionPhrase(phrase: string): string[] {
  const key = phrase.trim().toLowerCase();
  if (KNOWN_ABBREVIATION_KEYS.has(key)) return [key];
  return tokenizeForSearch(phrase);
}
