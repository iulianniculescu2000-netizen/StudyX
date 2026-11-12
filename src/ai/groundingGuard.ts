/**
 * Plasă de siguranță determinată (nu depinde de model) pentru răspunsurile din cărți:
 * partea marcată „Din cunoștințe generale” nu poartă citări [n], iar un răspuns întreg din
 * cunoștințe generale nu afișează chipurile de sursă ale fragmentelor căutate.
 */

/** „Din cunoștințe generale” / „Nu am găsit în cărți”, cu sau fără diacritice. */
const GENERAL_MARKER = /\b(?:din\s+cuno[sșş]tin[tțţ]e\s+generale|nu\s+am\s+g[aă]sit\s+[iî]n\s+c[aă]r[tțţ]i)\b/i;
const CITATION_TAG = /\s*\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]/g;

export function hasGeneralKnowledgeMarker(text: string): boolean {
  return GENERAL_MARKER.test(text);
}

export function hasInlineCitation(text: string): boolean {
  return /\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]/.test(text);
}

/**
 * Scoate etichetele [n] care apar după marcajul „Din cunoștințe generale” în același paragraf.
 * Fragmentele citate înainte de marcaj rămân neatinse.
 */
export function stripCitationsAfterGeneralKnowledge(text: string): string {
  if (!hasGeneralKnowledgeMarker(text)) return text;
  return text
    .split(/(\n\s*\n)/)
    .map((part) => {
      const match = GENERAL_MARKER.exec(part);
      if (!match) return part;
      const cut = match.index;
      return part.slice(0, cut) + part.slice(cut).replace(CITATION_TAG, '');
    })
    .join('');
}

/**
 * Chipurile de sursă se afișează doar dacă răspunsul chiar se sprijină pe carte: un răspuns care se declară
 * din cunoștințe generale și nu are nicio etichetă [n] nu arată surse.
 */
export function citationsForAnswer<T>(answer: string, citations: readonly T[]): T[] {
  if (hasGeneralKnowledgeMarker(answer) && !hasInlineCitation(answer)) return [];
  return [...citations];
}

/** Paragraful începe cu „Din cunoștințe generale (nu din cărți):” (cu sau fără diacritice, cu sau fără marcaje markdown). */
const GENERAL_SECTION_START = /^\s*[*_>#\s-]*din\s+cuno[sșş]tin[tțţ]e\s+generale\b/i;

/**
 * „Doar din cărți”: plasă deterministă peste prompt. Scoate paragrafele care deschid secțiunea „Din cunoștințe generale”
 * și paragrafele fără [n] care o urmează; dacă nu rămâne nimic, răspunsul devine „Nu am găsit în cărți.”.
 */
export function enforceBooksOnly(text: string): string {
  if (!hasGeneralKnowledgeMarker(text)) return text;
  const parts = text.split(/(\n\s*\n)/);
  const kept: string[] = [];
  let dropping = false;
  for (let i = 0; i < parts.length; i += 2) {
    const paragraph = parts[i];
    if (GENERAL_SECTION_START.test(paragraph)) { dropping = true; continue; }
    if (dropping && !hasInlineCitation(paragraph)) continue;
    dropping = false;
    kept.push(paragraph);
  }
  const result = kept.join('\n\n').trim();
  return result || 'Nu am găsit în cărți.';
}
