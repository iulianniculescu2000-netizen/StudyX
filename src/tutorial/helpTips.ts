import type { TourId } from './tourMeta';

/** Un indiciu „?”: titlu scurt, 1–3 propoziții, opțional turul paginii pornit din „Mai mult”. */
export interface HelpTipEntry {
  title: string;
  body: string;
  /** Turul care se pornește din linkul „Mai mult”; lipsește când nu există unul potrivit. */
  tour?: Exclude<TourId, 'whatsNew' | 'welcomeFilm'>;
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
  },
  'fc-deck-created': {
    title: 'Pachet creat',
    body: 'Pachetul e deja salvat și îl poți studia imediat. Dacă folderul nu e cel dorit, îl schimbi din „Mută în”.',
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
  },
  'rez-ai-type': {
    title: 'Complement simplu sau multiplu',
    body: 'La complement simplu un singur răspuns e corect. La complement multiplu pot fi corecte mai multe variante, ca la examen.',
  },
  'rez-import-quiz': {
    title: 'Importă grile',
    body: 'Aduci grile gata făcute: dintr-un fișier JSON, dintr-un document sau copiate de la alt AI.',
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
  },
  'chat-studio': {
    title: 'AI Studio',
    body: 'Din Studio generezi pachete de grile direct din documentele tale: alegi documentul și capitolul, apoi dimensiunea și folderul de destinație.',
  },
  'chat-option-cards': {
    title: 'Cartea de opțiuni',
    body: 'Când ceri flashcarduri sau grile, AI-ul îți arată o fișă cu setările: subiect, nivel, număr și folderul de salvare. Le ajustezi și abia apoi pornești generarea.',
  },
  'chat-cross-check': {
    title: 'Verifică cu alt model',
    body: 'Trimite întrebarea și răspunsul la un alt furnizor AI și îți arată dacă sunt de acord. Pornește doar când apeși tu și are nevoie de o a doua cheie salvată.',
  },
  'chat-citations': {
    title: 'Citările [n] și „Deschide în carte”',
    body: 'Numerele între paranteze arată din ce parte a cărților tale vine răspunsul. „Deschide în carte” te duce la pasajul respectiv, ca să verifici sursa.',
  },
  'chat-diagram': {
    title: 'Scheme interactive',
    body: 'Treci cu mouse-ul peste un pas ca să vezi drumul care duce la el. Apasă pe pas ca să-l fixezi și să citești nota lui; încă o apăsare sau Esc îl eliberează.',
  },

  // Pagini fără tur propriu: un răspuns scurt, lângă titlu
  'page-stats': {
    title: 'Statistici',
    body: 'Se completează din sesiunile tale: acuratețe, activitate pe zile, grilele cu rezultate slabe și întrebările greșite cel mai des. Cu cât lucrezi mai mult, cu atât sunt mai precise.',
  },
  'page-review': {
    title: 'Recapitulare inteligentă',
    body: 'Alegi modul potrivit pentru azi. Aplicația ia din toate grilele tale întrebările scadente sau cele la care greșești des și le pune într-o singură sesiune.',
  },
  'page-daily': {
    title: 'Sesiunea zilnică',
    body: 'Sunt întrebările scadente azi, după repetarea spațiată: ce știi bine revine mai rar, ce greșești revine curând. După fiecare notezi cât de sigur ai fost.',
  },
  'page-notes': {
    title: 'Notițele tale',
    body: 'Notițele le scrii în timpul unei grile, după ce răspunzi. Aici le găsești pe toate, cu grila de unde vin. Le poți filtra, poți deschide grila sau le poți șterge.',
  },
  'page-gamification': {
    title: 'Realizări',
    body: 'Nivelul și seria se calculează din sesiunile tale. Realizările se câștigă o singură dată și rămân ale tale; unele se văd abia după ce le atingi.',
  },
  'page-analytics': {
    title: 'Perspective AI',
    body: 'Prognoza și lacunele se calculează din răspunsurile tale, fără AI. Intervalul arată cât de sigură e estimarea: cu mai multe răspunsuri devine mai îngust.',
  },

  // Grile
  'create-penalty': {
    title: 'Mod Rezidențiat',
    body: 'Răspuns corect: +1 punct. Fiecare opțiune greșită bifată: −0,25. Scorul net nu coboară sub 0. Îl pornești pentru grilele pe care vrei să le exersezi ca la examen.',
    tour: 'create',
  },
  'create-ai': {
    title: 'Grile generate cu AI',
    body: 'Lipești un text sau un PDF, alegi nivelul și câte grile vrei, iar AI-ul le scrie din textul tău. Ai nevoie de o cheie AI salvată în Setări.',
    tour: 'create',
  },
  'quiz-modes': {
    title: 'Moduri de lucru',
    body: 'Studiu: feedback imediat, cu explicații. Simulare Examen: fără feedback până la final. Cronometrat: timp limitat pe întrebare. „Pornește N” face o sesiune scurtă din setul mare.',
  },

  // Flashcarduri și Biblioteca AI
  'fc-rating': {
    title: 'Greu, Bine, Ușor',
    body: 'Întorci cartonașul cu Spațiu, apoi alegi Greu (1), Bine (2) sau Ușor (3). Alegerea hotărăște când revine cardul: Greu revine curând, Ușor peste mai multe zile.',
    tour: 'flashcards',
  },

  // Setări AI
  'ai-free-keys': {
    title: 'Chei gratuite',
    body: 'Unii furnizori oferă chei fără plată. Le obții de pe site-ul lor și le lipești în Setări; ghidul din aplicație te duce pas cu pas.',
  },
  'ai-mode': {
    title: 'Modul de lucru',
    body: 'Alegi care furnizor AI răspunde (Groq, Google Gemini sau Mistral) și ce model folosește. Poți schimba oricând, fără să pierzi nimic.',
  },

  // Recapitulare
  'quiz-rhythm': {
    title: 'Ritm: Auto sau manual',
    body: 'La Auto, după un răspuns aplicația trece singură la întrebarea următoare. La Man. treci tu, când ești gata. Îl schimbi din butonul Auto de sus.',
  },
  'crunch-session': {
    title: 'Sesiune de recuperare',
    body: 'Alegi cât timp ai, iar aplicația pune laolaltă ce e scadent, ce ai greșit des și ce n-ai văzut încă. E marcată ca recuperare și nu intră în Caietul de erori.',
  },

  // Simulare și apropierea examenului
  'sim-length': {
    title: 'Lungimea simulării',
    body: 'Cu cât are mai multe grile, cu atât primești mai mult timp. Când timpul se termină, simularea se încheie cu ce ai răspuns până atunci.',
    tour: 'simulation',
  },
  'crunch-near-exam': {
    title: 'Aproape de examen',
    body: 'Pentru ultimele săptămâni: doar consolidare, fără material nou. Alegi timpul de care dispui și primești întrebările potrivite.',
  },

  // Organizare
  'org-rhythm': {
    title: 'Ritm zilnic',
    body: 'Notezi în câteva secunde cât ai lucrat azi și cum ți-au mers grilele. Pagina calculează ritmul, regularitatea și cât ești față de plan.',
    tour: 'organizare',
  },
} as const satisfies Record<string, HelpTipEntry>;

export type HelpTipId = keyof typeof HELP_TIPS;

/**
 * Indicii cu text gata, dar al căror „?” nu e încă plasat în interfață (fișierele lor aparțin altor lucrări).
 * Scoate id-ul de aici când `<HelpTip id=… />` apare în cod; testul din `helpTips.test.ts` verifică restul.
 */
export const HELP_TIPS_PENDING: readonly HelpTipId[] = [];
