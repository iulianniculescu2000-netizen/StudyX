/**
 * Explicațiile AI ale grilelor, păstrate pe profil: aceeași grilă cu același răspuns nu mai cere o explicație nouă
 * (fiecare cerere consumă din cota gratuită a furnizorului). E doar o memorie de lucru, nu date ale utilizatorului:
 * are plafon, nu intră în backup și se poate pierde fără nicio pagubă (explicația se cere din nou).
 *
 * Cheia ține de conținutul grilei și de răspunsul dat: dacă grila e editată sau studentul răspunde altfel, e o
 * explicație nouă. Explicațiile de rezervă (fără AI) nu se păstrează.
 */
import type { AIAnalysisResult } from '../ai/types';
import type { Question } from '../types';

/** Câte explicații se păstrează pe profil; cele mai vechi ies primele. */
export const EXPLANATION_CACHE_LIMIT = 200;

interface Entry {
  key: string;
  at: number;
  analysis: AIAnalysisResult;
}

const storageKey = (profileId: string) => `studyx-p-${profileId}-ai-explanations`;

/** Amprentă scurtă și stabilă (djb2) a textului. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export function explanationKey(question: Pick<Question, 'id' | 'text' | 'options'>, userAnswer: string): string {
  const content = [question.text, ...question.options.map((option) => `${option.isCorrect ? '+' : '-'}${option.text}`), userAnswer].join('\n');
  return `${question.id}:${fingerprint(content)}`;
}

function readAll(profileId: string): Entry[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is Entry => !!entry && typeof entry.key === 'string' && typeof entry.analysis?.explanation === 'string')
      : [];
  } catch {
    return [];
  }
}

export function loadExplanation(profileId: string, key: string): AIAnalysisResult | null {
  return readAll(profileId).find((entry) => entry.key === key)?.analysis ?? null;
}

/** Salvează explicația; la plafon ies cele mai vechi. Fără spațiu în stocare, renunță în tăcere. */
export function saveExplanation(profileId: string, key: string, analysis: AIAnalysisResult, now = Date.now()): void {
  if (!analysis.explanation?.trim()) return;
  const entries = [{ key, at: now, analysis }, ...readAll(profileId).filter((entry) => entry.key !== key)].slice(0, EXPLANATION_CACHE_LIMIT);
  try {
    localStorage.setItem(storageKey(profileId), JSON.stringify(entries));
  } catch {
    try {
      // Stocare plină: păstrează doar jumătate; dacă nici așa nu încape, explicația rămâne doar în sesiune.
      localStorage.setItem(storageKey(profileId), JSON.stringify(entries.slice(0, Math.floor(EXPLANATION_CACHE_LIMIT / 2))));
    } catch {
      // nimic de făcut
    }
  }
}
