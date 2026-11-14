/**
 * Citările din explicația unei grile (rezolvare): ce surse numerotate a folosit cu adevărat modelul.
 * Determinist, fără model: se arată doar sursele al căror [n] apare în text, iar un [n] care nu
 * corespunde niciunei surse trimise se scoate (altfel ar rămâne o trimitere spre nimic).
 */
import { citedNumbers } from './answerSupport';
import type { ContextSource } from './contextBuilder';

const TAG = /\s*\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g;

/** Sursele citate în text, în ordinea numerelor lor. */
export function citedSources(text: string, sources: readonly ContextSource[]): ContextSource[] {
  const used = new Set(citedNumbers(text));
  return sources.filter((source) => used.has(source.n));
}

/** Scoate etichetele [n] care nu trimit toate la surse existente; cele valide rămân neatinse. */
export function dropUnknownCitations(text: string, sources: readonly ContextSource[]): string {
  const known = new Set(sources.map((source) => source.n));
  return text.replace(TAG, (tag) => (citedNumbers(tag).every((n) => known.has(n)) ? tag : ''));
}

/** Textul fără nicio etichetă [n] (pentru locurile care nu afișează sursele, ex. banca de greșeli). */
export function withoutCitations(text: string): string {
  return text.replace(TAG, '');
}
