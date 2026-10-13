/**
 * answerChecklist — a rămas doar `looksTruncated` (butonul „Continuă” din chat). Verificarea completă
 * a răspunsului (`checkAnswer`) a fost scoasă: servea modelul local, eliminat.
 */

/**
 * Răspunsul pare tăiat la mijloc de propoziție (peste 220 de caractere, fără punctuație la final, ultimul rând nu e un item scurt de
 * listă). Euristică: semnalul sigur e `finish_reason: "length"` al furnizorului; asta e rezerva când el lipsește.
 */
export function looksTruncated(text: string): boolean {
  const trimmed = text.trimEnd();
  return trimmed.length > 220 && !/[.!?:)\]»"”*`]$|```$/.test(trimmed) && !/\n\s*(?:[-*•➔→]|\d+[.)])\s+[^\n]{1,60}$/.test(trimmed);
}
