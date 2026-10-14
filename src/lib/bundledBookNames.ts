/**
 * Numele celor trei cărți de bază, într-un modul fără dependențe: store-ul bibliotecii AI le citește ca să le apere
 * (fără ciclu de importuri cu `rezidentiatLibrary`, care depinde de store). Numele trebuie să rămână identice cu
 * `matchNames` din `residencyCurriculum.ts`.
 */
export const BUNDLED_BOOK_NAMES = {
  kumar: 'Kumar și Clark – Medicină Clinică.pdf',
  lawrence: 'Lawrence – Chirurgie generală și specialități chirurgicale.pdf',
  sinopsis: 'Sinopsis de medicină.pdf',
} as const;

const NAME_SET: ReadonlySet<string> = new Set(Object.values(BUNDLED_BOOK_NAMES));

export function isBundledBookFileName(name: string): boolean {
  return NAME_SET.has(name);
}
