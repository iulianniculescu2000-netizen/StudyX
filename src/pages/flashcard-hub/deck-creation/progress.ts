/** Pure helpers for the texts shown while a flashcard deck is generated. */

export function generationProgressText(done: number, target: number, resume?: { already: number; requested: number }): string {
  return `Generez flashcardurile... ${(resume?.already ?? 0) + done}/${resume?.requested ?? target}`;
}

export function rateLimitProgressText(seconds: number): string {
  return `Limita modelului AI e atinsă — reiau în ${seconds} s...`;
}

/** Some messages already open with "Nu s-au putut genera…"; do not say it twice. */
export function generationFailedToastText(message: string): string {
  const alreadySaysIt = /^nu s-au (putut )?genera/i.test(message);
  return alreadySaysIt ? message : `Nu s-au generat flashcardurile. ${message}`;
}

export const PROFILE_CHANGED_TOAST = 'Profilul s-a schimbat în timpul generării, deci pachetul nu a fost salvat.';
