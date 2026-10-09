/**
 * Text hygiene for flashcards. Course PDFs carry the legacy cedilla letters
 * (ş ţ), and the AI copies them next to its own correct comma-below ones
 * (ș ț), so one card mixed both spellings. The AI also wraps key terms in
 * markdown (**term**), which a plain card would show as literal asterisks.
 */

const DIACRITIC_FIXES: Array<[RegExp, string]> = [
  [/ş/g, 'ș'], // ş → ș
  [/Ş/g, 'Ș'], // Ş → Ș
  [/ţ/g, 'ț'], // ţ → ț
  [/Ţ/g, 'Ț'], // Ţ → Ț
];

/** Romanian s/t with comma below (ș ț) instead of the cedilla look-alikes (ş ţ). */
export function normalizeRomanianDiacritics(text: string): string {
  // NFC first, so a base letter followed by a combining cedilla/comma becomes one character.
  let result = text.normalize('NFC');
  for (const [pattern, replacement] of DIACRITIC_FIXES) result = result.replace(pattern, replacement);
  return result;
}

/** Drops **bold** / __bold__ markers — also a lone one left behind by a cut-off answer. */
export function stripInlineMarkdown(text: string): string {
  return text
    // **bold** with text hugging the markers (so "x**2 + y**2" and "5 ** 3" stay as they are)
    .replace(/(?<![\p{L}\p{N}])\*\*(?=\S)([^*]*?\S)\*\*(?![\p{L}\p{N}])/gu, '$1')
    // __bold__ around a word; never touches "____" fill-in blanks
    .replace(/__(?=\p{L})([^_]*?\p{L})__/gu, '$1')
    // an opening or closing marker left alone by a cut-off answer: "**word" / "word**" at a word edge
    .replace(/(^|\s)\*\*(?=\p{L})|(?<=\p{L})\*\*(?=\s|$)/gu, '$1');
}

/** The text a flashcard should actually show. */
export function cleanFlashcardText(text: string): string {
  return stripInlineMarkdown(normalizeRomanianDiacritics(text));
}
