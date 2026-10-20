/**
 * Which tours exist and which version of each the user has to have seen.
 * Kept free of React so the store can import it without pulling in the tour content.
 */
export type TourId =
  | 'onboarding'
  | 'welcomeFilm'
  | 'whatsNew'
  | 'dashboard'
  | 'quizzes'
  | 'create'
  | 'settings'
  | 'residency'
  | 'flashcards'
  | 'vault'
  | 'simulation'
  | 'errors'
  | 'organizare'
  | 'residencyFlashcards'
  | 'chat'
  | 'review'
  | 'daily'
  | 'notes'
  | 'stats'
  | 'flashcardSession'
  | 'quizSession'
  | 'quizResults'
  | 'gamification'
  | 'analytics'
  | 'crunch';

/**
 * The release whose content the tours currently describe. The one place the number lives: the "what's new"
 * slides and the tour versions read it, so a release under another number only needs this line changed.
 */
export const CURRENT_TOUR_VERSION = '1.1.0';

/** Numele sub care apare lansarea în „Ce e nou” și în notele de lansare. */
export const RELEASE_DISPLAY_NAME = '1.1';

interface TourMeta {
  /** Content version; bump it to show the tour once more to everyone who saw an older one. */
  version: string;
  /**
   * True for tours worth showing again when the version changes. The onboarding is not: someone who
   * finished it in an earlier version must not be walked through the basics again, only told what is new.
   */
  repeatOnNewVersion: boolean;
}

export const TOUR_META: Record<TourId, TourMeta> = {
  onboarding: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  welcomeFilm: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  whatsNew: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  dashboard: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  quizzes: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  create: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  settings: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  residency: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  flashcards: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  vault: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  simulation: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  errors: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  organizare: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  residencyFlashcards: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  chat: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: true },
  review: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  daily: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  notes: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  stats: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  flashcardSession: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  quizSession: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  quizResults: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  gamification: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  analytics: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
  crunch: { version: CURRENT_TOUR_VERSION, repeatOnNewVersion: false },
};

export const TOUR_IDS = Object.keys(TOUR_META) as TourId[];

/** Ghidurile care se pot porni oricând din Setări › Ajutor, în ordinea afișării. */
export const GUIDE_LIST: ReadonlyArray<{ id: Exclude<TourId, 'whatsNew' | 'welcomeFilm'>; title: string; description: string }> = [
  { id: 'onboarding', title: 'Turul de bun venit', description: 'Prezentarea de ansamblu, de la bara laterală la chat.' },
  { id: 'dashboard', title: 'Panoul', description: 'Ce vezi când deschizi aplicația și ce poți face de acolo.' },
  { id: 'quizzes', title: 'Grilele tale', description: 'Căutare, filtre, import și acțiunile de pe fiecare grilă.' },
  { id: 'create', title: 'Crearea unei grile', description: 'De la informații la întrebări scrise de mână sau generate cu AI.' },
  { id: 'flashcards', title: 'Flashcarduri', description: 'Repetarea de azi, pachetele tale și crearea lor.' },
  { id: 'vault', title: 'Biblioteca AI', description: 'Documentele din care lucrează AI-ul și AI Studio.' },
  { id: 'chat', title: 'Chatul AI', description: 'Cum ceri grile, carduri și scheme și cum citești răspunsurile.' },
  { id: 'residency', title: 'Rezidențiat', description: 'Disciplinele, folderele tale și resursele.' },
  { id: 'residencyFlashcards', title: 'Rezidențiat › Flashcarduri', description: 'Cardurile tale din Rezidențiat, cu foldere și AI.' },
  { id: 'organizare', title: 'Organizare', description: 'Planul de pregătire, săptămânile și ritmul zilnic.' },
  { id: 'simulation', title: 'Simulare de examen', description: 'Un examen de probă, cu ceas și penalizare.' },
  { id: 'errors', title: 'Caiet de erori', description: 'Greșelile tale, explicate și repetate până le fixezi.' },
  { id: 'settings', title: 'Setări', description: 'Aspect, date și backup, AI și ajutor.' },
  { id: 'review', title: 'Recapitulare inteligentă', description: 'Cum alegi între întrebări scadente, puncte slabe și antrenament pentru examen.' },
  { id: 'daily', title: 'Sesiune zilnică', description: 'Întrebările programate pentru azi și modul în care răspunsurile pregătesc repetarea următoare.' },
  { id: 'notes', title: 'Notițele mele', description: 'Notițe din grile, căutare și transformare cu AI.' },
  { id: 'stats', title: 'Performanță', description: 'Ritm, acuratețe și interpretarea progresului.' },
  { id: 'flashcardSession', title: 'Sesiunea de flashcarduri', description: 'Întoarcerea cardurilor, evaluarea și repetarea următoare.' },
  { id: 'quizSession', title: 'Rezolvarea unei grile', description: 'Alegerea răspunsurilor, verificarea și navigarea în sesiune.' },
  { id: 'quizResults', title: 'Rezultatele unei grile', description: 'Interpretarea rezultatului și alegerea următorului pas de studiu.' },
  { id: 'gamification', title: 'Realizări', description: 'Nivelul, seria de studiu și realizările câștigate.' },
  { id: 'analytics', title: 'Perspective AI', description: 'Interpretarea estimărilor, lacunelor și recomandărilor de studiu.' },
  { id: 'crunch', title: 'Aproape de examen', description: 'O sesiune de recuperare adaptată timpului disponibil.' },
];

/** Version recorded for profiles that finished the single tour of the earliest builds. */
export const LEGACY_ONBOARDING_VERSION = '0.9.0';

/** Whether a recorded version still counts as "seen" for this tour. */
export function isTourVersionCurrent(tourId: TourId, seenVersion: string | undefined): boolean {
  if (!seenVersion) return false;
  const meta = TOUR_META[tourId];
  return meta.repeatOnNewVersion ? seenVersion === meta.version : true;
}
