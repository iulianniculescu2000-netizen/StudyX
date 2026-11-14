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
  /** Cifrele din propozițiile citate care nu apar în pasajele citate (de verificat în carte). */
  unverified?: string[];
}

export interface SupportCitation {
  n?: number;
  score: number;
  /** Textul fragmentului trimis modelului; cu el se verifică cifrele din propozițiile care îl citează. */
  text?: string;
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

/** Numere cu cel puțin două cifre sau cu zecimale („4,5”, „140”, „126”); o singură cifră („2 tipuri”) nu se verifică. */
const FIGURE = /\d+(?:[.,]\d+)?/g;

function figuresOf(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(FIGURE)) {
    const figure = match[0].replace(',', '.');
    if (figure.length >= 2) found.push(figure);
  }
  return found;
}

/**
 * Cifrele (doze, praguri, procente) din propozițiile care poartă [n] și care nu apar în niciunul dintre pasajele
 * citate acolo. Determinist, fără model. O cifră absentă nu e neapărat greșită (poate fi un calcul sau o eroare de
 * OCR în carte), de aceea se raportează ca „de verificat”. Propozițiile ale căror pasaje nu au text nu se verifică.
 */
export function unverifiedFigures(answer: string, citations: readonly SupportCitation[]): string[] {
  const texts = new Map<number, string>();
  citations.forEach((citation) => {
    if (typeof citation.n === 'number' && citation.text) texts.set(citation.n, citation.text);
  });
  if (texts.size === 0) return [];

  const missing: string[] = [];
  // Propoziție sau rând de listă; punctul dintre cifre („4.5”) nu desparte.
  for (const sentence of answer.split(/\n+|(?<=[.!?])\s+(?=[\p{Lu}*\-•])/u)) {
    const cited = citedNumbers(sentence).filter((n) => texts.has(n));
    if (cited.length === 0) continue;
    const available = new Set(cited.flatMap((n) => figuresOf(texts.get(n) ?? '')));
    // Fără etichetele [n] și fără numerotarea de listă de la începutul rândului.
    const body = sentence.replace(TAG, ' ').replace(/^\s*\d{1,2}[.)]\s+/, '');
    for (const figure of figuresOf(body)) {
      if (!available.has(figure) && !missing.includes(figure)) missing.push(figure);
    }
  }
  return missing;
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
  const unverified = unverifiedFigures(answer, citations);
  if (unverified.length > 0) {
    return {
      level: 'partial',
      cited: used.length,
      label: unverified.length === 1 ? 'Parțial susținut: o cifră de verificat în carte' : `Parțial susținut: ${unverified.length} cifre de verificat în carte`,
      unverified,
    };
  }
  return {
    level: 'supported',
    cited: used.length,
    label: used.length === 1 ? 'Susținut de 1 sursă' : `Susținut de ${used.length} surse`,
  };
}
