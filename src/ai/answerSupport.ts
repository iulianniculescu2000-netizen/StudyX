/**
 * Indicatorul de încredere de sub un răspuns bazat pe bibliotecă. Calcul determinist (nu al modelului) din etichetele [n]
 * puse în text și din scorurile retrieverului pentru fragmentele citate.
 */
import { hasGeneralKnowledgeMarker } from './groundingGuard';

export type AnswerSupportLevel = 'supported' | 'partial' | 'none';

export interface AnswerSupport {
  level: AnswerSupportLevel;
  /** Câte fragmente diferite din context sunt citate în text. */
  cited: number;
  label: string;
}

export interface SupportCitation {
  n?: number;
  score: number;
}

/** Sub acest scor mediu al fragmentelor citate, răspunsul e doar „parțial susținut”. */
export const SUPPORT_MIN_SCORE = 0.45;

const TAG = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g;

/** Numerele din etichetele [n], [1, 2], [1-3] (intervalul se extinde), fără duplicate. */
export function citedNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(TAG)) {
    const body = match[1];
    if (/[–-]/.test(body) && !body.includes(',')) {
      const [from, to] = body.split(/[–-]/).map((value) => Number(value.trim()));
      if (to >= from && to - from <= 10) for (let n = from; n <= to; n += 1) found.add(n);
      continue;
    }
    for (const piece of body.split(/[,–-]/)) found.add(Number(piece.trim()));
  }
  return [...found];
}

export function assessAnswerSupport(answer: string, citations: readonly SupportCitation[]): AnswerSupport {
  const available = new Map<number, number>();
  citations.forEach((citation) => {
    if (typeof citation.n === 'number') available.set(citation.n, citation.score);
  });
  const used = citedNumbers(answer).filter((n) => available.has(n));
  if (used.length === 0) return { level: 'none', cited: 0, label: 'Fără surse în cărți' };

  const mean = used.reduce((sum, n) => sum + (available.get(n) ?? 0), 0) / used.length;
  const mixed = hasGeneralKnowledgeMarker(answer);
  if (mixed || mean < SUPPORT_MIN_SCORE) return { level: 'partial', cited: used.length, label: 'Parțial susținut' };
  return {
    level: 'supported',
    cited: used.length,
    label: used.length === 1 ? 'Susținut de 1 sursă' : `Susținut de ${used.length} surse`,
  };
}
