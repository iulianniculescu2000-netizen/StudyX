/**
 * Reparații sigure pentru textul extras din PDF prin OCR (cărțile incluse și documentele din bibliotecă). Nu se ghicesc cuvinte
 * medicale: se repară doar (1) cifrele puse în loc de litere în mijlocul unui cuvânt și (2) un dicționar de greșeli sistematice
 * găsite în cărțile incluse (`scripts/build-ocr-corrections.mjs`: un cuvânt rar care, printr-o confuzie tipică OCR, devine un
 * cuvânt mult mai frecvent din aceleași cărți, de exemplu „pentrn” → „pentru”).
 */
import corrections from '../data/ocrCorrections.json';

const FIXES = new Map<string, string>(Object.entries(corrections as Record<string, string>));
const OCR_DIGITS: Record<string, string> = { '0': 'o', '1': 'r' };
const LETTERS = /\p{L}+/gu;

const lookupKey = (word: string) => word.replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț').toLowerCase();

/** Păstrează majusculele cuvântului stricat: „Pentrn” → „Pentru”, „PENTRN” → „PENTRU”. */
function matchCase(original: string, fixed: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return fixed.toUpperCase();
  if (original[0] !== original[0].toLowerCase()) return fixed.charAt(0).toUpperCase() + fixed.slice(1);
  return fixed;
}

/**
 * Cifrele care țin loc de litere se repară doar între litere mici („a1ticulară” → „articulară”, „rap01t” → „raport”), ca
 * „B12”, „H1N1” sau „10 mg” să rămână. Apoi se aplică dicționarul de greșeli sistematice, cuvânt întreg, nu bucăți de cuvânt.
 */
export function repairOcr(text: string): string {
  if (!text) return text;
  return text
    // „vitamina 8 12” (B citit ca 8), doar după cuvântul „vitamina”.
    .replace(/(vitamin[aăei]i?\s+)8(\s?(?:12|6|1|2)(?!\d))/giu, '$1B$2')
    .replace(/(?<=\p{Ll})[01]+(?=\p{Ll})/gu, (digits) => Array.from(digits, (digit) => OCR_DIGITS[digit]).join(''))
    .replace(LETTERS, (word) => {
      const fixed = FIXES.get(lookupKey(word));
      return fixed ? matchCase(word, fixed) : word;
    });
}

/** Câte greșeli sistematice cunoaște dicționarul (pentru teste și diagnostic). */
export const OCR_CORRECTION_COUNT = FIXES.size;
