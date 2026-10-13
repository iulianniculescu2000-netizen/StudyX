import type { TourId } from './tourMeta';

/** Un indiciu „?”: titlu scurt, explicație și acces la ghidul potrivit. */
export interface HelpTipEntry {
  title: string;
  body: string;
  /** Turul pornit din „Ghid pas cu pas”. */
  tour: Exclude<TourId, 'whatsNew' | 'welcomeFilm'>;
}

/**
 * Textele tuturor indiciilor „?” din aplicație. Cheia e `id`-ul dat lui `<HelpTip id=… />`.
 * Texte scurte, concrete, fără cifre de limită (limitele se schimbă; aplicația le arată singură).
 */
export const HELP_TIPS = {
  // Flashcarduri
  'fc-save-in': {
    title: 'Salvează în',
    body: 'Alege folderul în care ajunge pachetul nou. Poți crea un folder chiar de aici, iar pachetul îl muți oricând după aceea.',
    tour: 'flashcards',
  },
  'fc-new-folder': {
    title: 'Folder nou',
    body: 'Folderele țin pachetele ordonate, pe materii sau pe capitole. Un folder poate avea subfoldere.',
    tour: 'flashcards',
  },
  'fc-import': {
    title: 'Import CSV și Anki',
    body: 'CSV: un card pe linie, față și spate separate prin virgulă sau punct și virgulă. Din Anki alegi fișierul .apkg, iar deck-urile devin foldere și pachete.',
    tour: 'flashcards',
  },
  'fc-delete-folder': {
    title: 'Ștergerea unui folder',
    body: 'Când folderul are pachete, alegi: le ștergi odată cu el sau ștergi doar folderul și pachetele rămân în aplicație.',
    tour: 'flashcards',
  },
  'fc-deck-created': {
    title: 'Pachet creat',
    body: 'Pachetul este salvat. Verifică numărul de carduri; dacă generarea s-a oprit, folosește Continuă generarea. Schimbă folderul din Mută în.',
    tour: 'flashcards',
  },

  // Rezidențiat
  'rez-plus': {
    title: 'Butonul „+”',
    body: 'De aici adaugi material nou: carduri, grile generate cu AI sau grile importate. Fiecare opțiune are o scurtă descriere.',
    tour: 'residency',
  },
  'rez-ai-level': {
    title: 'Nivelul grilelor',
    body: 'Nivelul hotărăște cât de grele sunt întrebările. „Auto” lasă AI-ul să potrivească dificultatea cu materialul.',
    tour: 'residency',
  },
  'rez-ai-type': {
    title: 'Complement simplu sau multiplu',
    body: 'La complement simplu un singur răspuns e corect. La complement multiplu pot fi corecte mai multe variante, ca la examen.',
    tour: 'residency',
  },
  'rez-import-quiz': {
    title: 'Importă grile',
    body: 'Aduci grile gata făcute: dintr-un fișier JSON, dintr-un document sau copiate de la alt AI.',
    tour: 'residency',
  },
  'rez-quiz-folders': {
    title: 'Folderele tale de grile',
    body: 'Aici ții băncile de grile pe materii. Poți șterge un folder cu tot cu grile sau păstrând grilele.',
    tour: 'residency',
  },

  // Chat AI
  'chat-mode': {
    title: 'Modul răspunsului',
    body: 'Implicit, „Auto” alege singur cum să-ți răspundă. Dacă vrei un anumit fel de răspuns, îl alegi de aici, iar alegerea rămâne până revii la „Auto”.',
    tour: 'chat',
  },
  'chat-studio': {
    title: 'AI Studio',
    body: 'Alege un document cu starea Gata, capitolul, numărul de grile și folderul. AI Studio are nevoie de o cheie pentru furnizorul ales; generarea începe când apeși tu.',
    tour: 'chat',
  },
  'chat-option-cards': {
    title: 'Cartea de opțiuni',
    body: 'Când ceri flashcarduri sau grile, AI-ul îți arată o fișă cu setările: subiect, nivel, număr și folderul de salvare. Le ajustezi și abia apoi pornești generarea.',
    tour: 'chat',
  },
  'chat-cross-check': {
    title: 'Verifică cu alt model',
    body: 'Trimite întrebarea și răspunsul la un alt furnizor AI și îți arată dacă sunt de acord. Pornește doar când apeși tu și are nevoie de o a doua cheie salvată.',
    tour: 'chat',
  },
  'chat-citations': {
    title: 'Citările [n] și „Deschide în carte”',
    body: 'Apasă citarea pentru fragmentul folosit, apoi Deschide în carte pentru context. Fără documente gata, răspunsul nu poate fi verificat în biblioteca ta.',
    tour: 'chat',
  },
  'chat-diagram': {
    title: 'Scheme interactive',
    body: 'Treci cu mouse-ul peste un pas ca să vezi drumul care duce la el. Apasă pe pas ca să-l fixezi și să citești nota lui; încă o apăsare sau Esc îl eliberează.',
    tour: 'chat',
  },

  // Grile
  'create-penalty': {
    title: 'Mod Rezidențiat',
    body: 'Răspuns corect: +1 punct. Fiecare opțiune greșită bifată: −0,25. Scorul net nu coboară sub 0. Îl pornești pentru grilele pe care vrei să le exersezi ca la examen.',
    tour: 'create',
  },
  'create-ai': {
    title: 'Grile generate cu AI',
    body: 'Alege textul sau PDF-ul, nivelul și numărul de întrebări. Salvează o cheie pentru furnizorul ales în Setări › AI. Apasă Generează, apoi verifică răspunsurile înainte de salvare.',
    tour: 'create',
  },
  'quiz-modes': {
    title: 'Moduri de lucru',
    body: 'Studiu: feedback imediat, cu explicații. Simulare Examen: fără feedback până la final. Cronometrat: timp limitat pe întrebare. „Pornește N” face o sesiune scurtă din setul mare.',
    tour: 'quizSession',
  },

  // Flashcarduri și Biblioteca AI
  'fc-rating': {
    title: 'Greu, Bine, Ușor',
    body: 'Întorci cartonașul cu Spațiu, apoi alegi Greu (1), Bine (2) sau Ușor (3). Alegerea hotărăște când revine cardul: Greu revine curând, Ușor peste mai multe zile.',
    tour: 'flashcardSession',
  },

  // Setări AI
  'ai-free-keys': {
    title: 'Chei gratuite',
    body: 'Unii furnizori oferă chei fără plată. Le obții de pe site-ul lor și le lipești în Setări; ghidul din aplicație te duce pas cu pas.',
    tour: 'settings',
  },
  'ai-mode': {
    title: 'Modul de lucru',
    body: 'Selectează furnizorul și modelul, apoi salvează cheia acelui furnizor. O cheie salvată la alt furnizor nu îl configurează pe cel ales.',
    tour: 'settings',
  },

  // Recapitulare
  'quiz-rhythm': {
    title: 'Ritm: Auto sau manual',
    body: 'La Auto, după un răspuns aplicația trece singură la întrebarea următoare. La Man. treci tu, când ești gata. Îl schimbi din butonul Auto de sus.',
    tour: 'quizSession',
  },
  'crunch-session': {
    title: 'Sesiune de recuperare',
    body: 'Alegi cât timp ai, iar aplicația pune laolaltă ce e scadent, ce ai greșit des și ce n-ai văzut încă. E marcată ca recuperare și nu intră în Caietul de erori.',
    tour: 'crunch',
  },

  // Simulare și apropierea examenului
  'sim-length': {
    title: 'Lungimea simulării',
    body: 'Apăsarea unei lungimi pornește imediat simularea. Numărul disponibil depinde de disciplină; la expirarea timpului se încheie cu răspunsurile date.',
    tour: 'simulation',
  },
  'crunch-near-exam': {
    title: 'Aproape de examen',
    body: 'Pentru ultimele săptămâni: combină scadente, greșeli și întrebări nevăzute din seturi cu acoperire redusă. Alegi timpul și pornești sesiunea potrivită.',
    tour: 'crunch',
  },

  // Organizare
  'org-rhythm': {
    title: 'Ritm zilnic',
    body: 'Notează orele lucrate și grilele rezolvate azi. Ritmul se compară cu planul acestui profil; verifică și data examenului în Organizare.',
    tour: 'organizare',
  },
} as const satisfies Record<string, HelpTipEntry>;

export type HelpTipId = keyof typeof HELP_TIPS;
