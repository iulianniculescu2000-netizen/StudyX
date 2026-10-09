/**
 * Official residency-exam curriculum ("Tematica și bibliografia pentru concursul de
 * rezidențiat", sesiunea noiembrie 2026) for the three reference textbooks. Hand-transcribed
 * from the source PDF — small, stable reference data, safer than parsing it at runtime.
 *
 * Used to anchor chapter detection for these specific books with real exam chapter titles,
 * instead of relying on the generic heading heuristic in documentProcessor.ts.
 */

export interface CurriculumBook {
  title: string;
  /** Lowercase substrings matched against an uploaded source's filename/title. */
  matchNames: string[];
  /** Top-level exam chapter titles, in book order. */
  chapters: string[];
}

export const RESIDENCY_CURRICULUM: CurriculumBook[] = [
  {
    title: 'Kumar și Clark – Medicină Clinică',
    matchNames: ['kumar', 'clark'],
    chapters: [
      'SEPSISUL ȘI TRATAMENTUL INFECȚIILOR BACTERIENE',
      'ECHILIBRUL HIDRO-ELECTROLITIC ȘI ACIDO-BAZIC',
      'TERAPIE INTENSIVĂ',
      'HEMATOLOGIE',
      'REUMATOLOGIE',
      'ENDOCRINOLOGIE',
      'DIABETUL ZAHARAT',
      'NEUROLOGIE',
      'PNEUMOLOGIE',
      'BOALA VENOASĂ TROMBOEMBOLICĂ',
      'CARDIOLOGIE',
      'HIPERTENSIUNEA ARTERIALĂ',
      'GASTROENTEROLOGIE',
      'BOLILE HEPATICE',
      'TULBURĂRI RENALE ȘI ALE TRACTULUI URINAR',
      'INFECȚII TRANSMISIBILE PE CALE SEXUALĂ ȘI INFECȚIA CU VIRUSUL IMUNODEFICIENȚEI UMANE',
    ],
  },
  {
    title: 'Lawrence – Chirurgie generală și specialități chirurgicale',
    matchNames: ['lawrence'],
    chapters: [
      'EVALUAREA ȘI MANAGEMENTUL PERIOPERATOR AL PACIENTULUI CHIRURGICAL',
      'SÂNGERĂRILE CHIRURGICALE',
      'INFECȚIILE CHIRURGICALE',
      'TRAUMATOLOGIE',
      'ARSURILE',
      'HERNIILE PERETELUI ABDOMINAL',
      'ESOFAGUL',
      'STOMACUL ȘI DUODENUL',
      'INTESTINUL SUBȚIRE ȘI APENDICELE',
      'COLON, RECT ȘI ANUS',
      'CĂILE BILIARE',
      'PANCREASUL',
      'FICATUL ȘI SPLINA',
      'BOLILE SISTEMULUI VASCULAR',
      'OTORINOLARINGOLOGIA: BOLILE CAPULUI ȘI GÂTULUI',
      'CHIRURGIE ORTOPEDICĂ: BOLILE SISTEMULUI MUSCULOSCHELETAL',
      'UROLOGIE: AFECȚIUNILE APARATULUI URO-GENITAL',
    ],
  },
  {
    title: 'Sinopsis de medicină',
    matchNames: ['sinopsis'],
    chapters: [
      'DERMATOLOGIE',
      'PEDIATRIE',
      'AFECȚIUNI GINECOLOGICE ȘI MAMARE',
      'OBSTETRICĂ',
      'TULBURĂRILE PSIHICE',
      'EPIDEMIOLOGIE ȘI ETICĂ',
    ],
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Fuzzy-matches an uploaded source's filename/title against the known curriculum books. */
export function matchBookByName(sourceName: string): CurriculumBook | null {
  const normalized = normalize(sourceName);
  return RESIDENCY_CURRICULUM.find((book) =>
    book.matchNames.some((name) => normalized.includes(normalize(name)))
  ) ?? null;
}
