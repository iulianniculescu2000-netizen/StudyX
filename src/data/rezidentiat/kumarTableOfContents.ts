/**
 * Cuprinsul autentic, tipărit de editură, al cărții Kumar și Clark — Medicină
 * Clinică (41 de capitole + Index), transcris manual din blocul „Cuprins" real
 * găsit în `library/kumar.txt` (liniile ~42-178). Diferit de lista curată din
 * `residencyCurriculum.ts` (16 capitole, aliniate pe Tematica oficială de examen,
 * nu pe structura reală a cărții).
 *
 * IMPORTANT — verificat direct, nu presupus: textul extras al cărții NU conține
 * corpul tuturor celor 41 de capitole (sursa PDF pare deja un extras orientat pe
 * examen) — doar capitolele care se suprapun cu lista curată din
 * residencyCurriculum.ts au text recuperabil. `BookTableOfContents.tsx` arată
 * totuși toate cele 41 de intrări (valoare de referință, ca-n cuprinsul real al
 * cărții), dar face clic-abile DOAR intrările care se potrivesc unui heading deja
 * indexat pentru sursă — restul sunt marcate explicit „text indisponibil", nu
 * ascunse și nu ghicite.
 *
 * Hand-transcribed, date stabile — la fel ca residencyCurriculum.ts, mai sigur
 * decât parsarea cuprinsului la runtime.
 */

export interface KumarChapterEntry {
  /** Numărul capitolului, ca în cuprinsul tipărit (1-41). */
  number: number;
  title: string;
  /** Pagina tipărită din carte — reală, nu estimată. */
  page: number;
}

export const KUMAR_TABLE_OF_CONTENTS: KumarChapterEntry[] = [
  { number: 1, title: 'Diagnosticul: Arta de a fi doctor', page: 1 },
  { number: 2, title: 'Genetica umană', page: 13 },
  { number: 3, title: 'Imunitate', page: 41 },
  { number: 4, title: 'Practică bazată pe dovezi', page: 69 },
  { number: 5, title: 'Etică și comunicare în practica medicală', page: 81 },
  { number: 6, title: 'Boli maligne', page: 95 },
  { number: 7, title: 'Îngrijiri paliative și controlul simptomelor', page: 137 },
  { number: 8, title: 'Sepsisul și tratamentul infecțiilor bacteriene', page: 151 },
  { number: 9, title: 'Echilibrul hidro-electrolitic și acido-bazic', page: 169 },
  { number: 10, title: 'Terapie intensivă', page: 203 },
  { number: 11, title: 'Chirurgie', page: 239 },
  { number: 12, title: 'Prescriere, terapeutică și toxicologie', page: 251 },
  { number: 13, title: 'Sănătate globală', page: 277 },
  { number: 14, title: 'Sănătate publică', page: 285 },
  { number: 15, title: 'Medicina geriatrică, fragilitatea și multimorbiditatea', page: 297 },
  { number: 16, title: 'Hematologie', page: 319 },
  { number: 17, title: 'Hematologie oncologică', page: 379 },
  { number: 18, title: 'Reumatologie', page: 411 },
  { number: 19, title: 'Bolile osoase', page: 471 },
  { number: 20, title: 'Boli infecțioase', page: 487 },
  { number: 21, title: 'Endocrinologie', page: 583 },
  { number: 22, title: 'Dermatologie', page: 651 },
  { number: 23, title: 'Diabetul zaharat', page: 699 },
  { number: 24, title: 'Dislipidemiile și bolile metabolice ereditare', page: 743 },
  { number: 25, title: 'Psihiatrie de legătură', page: 763 },
  { number: 26, title: 'Neurologie', page: 801 },
  { number: 27, title: 'ORL și oftalmologie', page: 899 },
  { number: 28, title: 'Pneumologie', page: 927 },
  { number: 29, title: 'Boala venoasă tromboembolică', page: 1001 },
  { number: 30, title: 'Cardiologie', page: 1019 },
  { number: 31, title: 'Hipertensiunea arterială', page: 1133 },
  { number: 32, title: 'Gastroenterologie', page: 1147 },
  { number: 33, title: 'Nutriție', page: 1225 },
  { number: 34, title: 'Bolile hepatice', page: 1261 },
  { number: 35, title: 'Afecțiunile tractului biliar și ale pancreasului', page: 1313 },
  { number: 36, title: 'Tulburări renale și ale tractului urinar', page: 1339 },
  { number: 37, title: 'Infecții transmisibile pe cale sexuală și infecția cu virusul imunodeficienței umane', page: 1409 },
  { number: 38, title: 'Obstetrică medicală', page: 1451 },
  { number: 39, title: 'Sănătatea reproducerii la femeie', page: 1463 },
  { number: 40, title: 'Sănătatea bărbatului', page: 1477 },
  { number: 41, title: 'Medicina mediului înconjurător', page: 1487 },
];
