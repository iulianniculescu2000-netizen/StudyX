import type { TourId } from '../../tutorial/tourMeta';
import { BooksScene, ChatScene, FocusScene, GapsScene, HeroScene, PlanScene, ProvidersScene, SourceScene } from './scenes';
import type { WhatsNewScene } from './stage3d';

/** Edițiile prezentării: 1.0 prezintă aplicația întreagă, 1.1 doar ce s-a schimbat de la 1.0.0. */
export type WhatsNewEdition = '1.0' | '1.1';

/**
 * Ediția care se arată pentru numele lansării. Slide-urile 1.1 rămân ascunse până când `RELEASE_DISPLAY_NAME` devine „1.1”
 * (împreună cu `CURRENT_TOUR_VERSION`, la decizia proprietarului); până atunci se văd doar din previzualizarea de dezvoltare.
 */
export function whatsNewEditionFor(releaseDisplayName: string): WhatsNewEdition {
  return releaseDisplayName === '1.1' ? '1.1' : '1.0';
}

export interface WhatsNew3DSlide {
  id: string;
  badge: string;
  title: string;
  description: string;
  scene: WhatsNewScene;
  /** „Arată-mi”: închide slide-urile, deschide pagina și, când există, pornește turul ei scurt. */
  cta?: { label: string; to: string; tour?: TourId };
}

/** Noutățile din 1.1 (commit-urile de după „StudyX 1.0.0”), în cel mult opt slide-uri. */
export const RELEASE_11_SLIDES: WhatsNew3DSlide[] = [
  {
    id: 'hero-11',
    badge: 'Versiunea 1.1',
    title: 'StudyX 1.1',
    description: 'Cărțile de bază vin pregătite, răspunsurile arată pagina din care vin, iar aplicația îți spune ce să repeți azi.',
    scene: {
      Scene: HeroScene, durationMs: 8000, marks: [0, 2600, 5200],
      label: 'Animație: versiunea 1.1',
      captions: ['Versiunea 1.1, pe straturi de sticlă.', 'Noutățile se așază pe orbită.', 'Gata de explorat.'],
      transcript: 'Numărul 1.1 apare pe trei plăci de sticlă suprapuse în adâncime. În jurul lui, pe o orbită, se rotesc șapte noutăți: cărțile de bază, Vezi în carte, Pentru tine, chatul din cărți, Organizare, Ce nu știu? și Stare furnizori.',
    },
  },
  {
    id: 'books',
    badge: 'Cărțile de bază',
    title: 'Kumar, Lawrence și Sinopsis, gata de la prima pornire',
    description: 'Se pregătesc singure pe calculatorul tău, sunt protejate și au prioritate la căutare. Materialele tale rămân alături, în Banca de materiale.',
    scene: {
      Scene: BooksScene, durationMs: 9000, marks: [0, 1600, 5000],
      label: 'Animație: cărțile de bază',
      captions: ['Cele trei cărți vin cu aplicația.', 'Se pregătesc singure, pe calculatorul tău.', 'Protejate și primele la căutare.'],
      transcript: 'Cărțile Kumar, Lawrence și Sinopsis stau în picioare, în perspectivă. Un indicator arată pregătirea lor automată la pornire, de la 0 la 100%. Apoi fiecare primește eticheta Carte de bază, iar Banca de materiale rămâne în spate, cu prioritate mai mică la căutare.',
    },
    cta: { label: 'Arată-mi Rezidențiat', to: '/rezidentiat', tour: 'residency' },
  },
  {
    id: 'source',
    badge: 'Vezi în carte',
    title: 'De la grilă la pagina din carte',
    description: 'Pe orice grilă din bănci, „Vezi în carte” deschide pasajul care susține răspunsul corect, evidențiat. Merge și fără cheie AI.',
    scene: {
      Scene: SourceScene, durationMs: 9500, marks: [0, 2000, 3600, 6000],
      label: 'Animație: Vezi în carte',
      captions: ['O grilă din bancă, cu răspunsul corect.', 'Vezi în carte deschide pagina din spate.', 'Pasajul care susține răspunsul, evidențiat.', 'Cu cartea și pagina tipărită.'],
      transcript: 'O grilă: tahicardie regulată cu QRS larg, pacient hipotensiv; răspunsul corect este cardioversie electrică sincronizată. Apeși Vezi în carte, grila se rotește la o parte și pagina din carte vine în față. Pasajul care susține răspunsul se evidențiază, apoi apare sursa: Lawrence, pagina 412.',
    },
  },
  {
    id: 'focus-11',
    badge: 'Pentru tine',
    title: 'Ce să exersezi azi, din răspunsurile tale',
    description: 'Panoul strânge subiectele cu cele mai multe greșeli și pe cele lăsate în urmă. Apeși Exersează, iar la final vezi cât a crescut stăpânirea.',
    scene: {
      Scene: FocusScene, durationMs: 9500, marks: [0, 2400, 4200],
      label: 'Animație: cardul Pentru tine',
      captions: ['Subiectele care merită atenție azi.', 'Exersează și cardul se întoarce.', 'Stăpânirea, înainte și după.'],
      transcript: 'Trei carduri de subiect stau în adâncime: Aritmii, cu 10 greșeli din 12 și stăpânire 21%; Insuficiență cardiacă, neatinsă de 10 zile; Tiroidă, cu 6 greșeli din 9. Apeși Exersează pe Aritmii, cardul se întoarce și arată stăpânirea urcând de la 21% la 50%, adică 29 de puncte.',
    },
    cta: { label: 'Arată-mi Panoul', to: '/', tour: 'dashboard' },
  },
  {
    id: 'chat-11',
    badge: 'Chat AI',
    title: 'Răspunsuri din cărți, cu sursa la vedere',
    description: 'Chatul caută în cărțile de bază și în materialele tale. Fiecare citare spune dacă vine din Carte sau din Material și se deschide la pagină.',
    scene: {
      Scene: ChatScene, durationMs: 9500, marks: [0, 3200, 5600],
      label: 'Animație: chatul din cărți',
      captions: ['Chatul caută întâi în cărțile de bază.', 'Fiecare citare spune de unde vine.', 'Și sugestii pe același subiect.'],
      transcript: 'În chat, răspunsul se scrie: cardioversia sincronizată este prima conduită la pacientul instabil, cu citarea 1, iar amiodarona rămâne pentru cel stabil, cu citarea 2. Citarea 1 vine din Carte, Lawrence pagina 412; citarea 2 din Material, cursul tău de cardiologie, pagina 7. Dedesubt apare sugestia: fă 5 grile pe Aritmii.',
    },
    cta: { label: 'Arată-mi Chatul', to: '/', tour: 'chat' },
  },
  {
    id: 'plan-11',
    badge: 'Organizare',
    title: 'Planul de rezidențiat nu mai pierde restanțele',
    description: 'Topicurile rămase în urmă se strâng într-un rând „restanțe” care te duce direct la ele. Graficele se citesc pe orice ecran, iar planul te anunță când data examenului îi taie fazele.',
    scene: {
      Scene: PlanScene, durationMs: 9000, marks: [0, 2800, 5000],
      label: 'Animație: restanțele din Organizare',
      captions: ['Cele patru treceri, cu ziua de azi.', 'Restanțele ies în față.', 'Un clic și ești la ele.'],
      transcript: 'Bara celor patru treceri stă pe o placă de sticlă: Faza 1, Faza 2, Faza 3, Faza 4 și Simulări, cu marcajul Azi la începutul primei faze. Din spatele ei vine în față rândul 3 restanțe, cu eticheta termen trecut. Rândul e apăsat și dedesubt apar topicurile lui, fiecare marcat restant: Artrita reumatoidă, Hiponatremia și Diureticele.',
    },
    cta: { label: 'Arată-mi Organizarea', to: '/rezidentiat/organizare', tour: 'organizare' },
  },
  {
    id: 'gaps',
    badge: 'Performanță',
    title: 'Ce nu știu? pornește de la subiecte',
    description: 'Raportul pornește de la subiectele unde greșești cel mai des, nu de la categorii largi, și e organizat pe categoriile slabe.',
    scene: {
      Scene: GapsScene, durationMs: 9000, marks: [0, 2600, 5000],
      label: 'Animație: raportul Ce nu știu?',
      captions: ['Răspunsurile tale, pe subiecte.', 'Subiectele slabe ies în față.', 'Raportul pornește de la ele.'],
      transcript: 'Un grafic cu bare în trei dimensiuni, așezat pe o podea în perspectivă, arată stăpânirea pe cinci subiecte. Barele cresc, iar cele mai scurte, Aritmii cu 21% și Tiroidă cu 38%, se colorează și ies în față. Lângă grafic apare lista subiectelor slabe de la care pornește raportul Ce nu știu?.',
    },
    cta: { label: 'Arată-mi Performanța', to: '/stats', tour: 'stats' },
  },
  {
    id: 'providers',
    badge: 'Asistent AI',
    title: 'Știi mereu ce model îți răspunde',
    description: 'Stare furnizori arată ce model merge, ce cotă s-a epuizat și până la ce oră. Când unul cade, cererea trece singură pe altul. Nou: Gemini 4 Argon.',
    scene: {
      Scene: ProvidersScene, durationMs: 10000, marks: [0, 2600, 5600],
      label: 'Animație: Stare furnizori',
      captions: ['Fiecare furnizor, cu starea lui reală.', 'Cota epuizată, cu ora la care revine.', 'Cererea trece singură pe altul.'],
      transcript: 'Trei furnizori stau pe un inel care se rotește în spațiu. Groq e activ. Gemini, cu noul model Gemini 4 Argon, are cota epuizată până la ora 14:00, iar un model vechi apare estompat ca retras. Inelul se rotește la Mistral, activ, și apare mesajul: comutare automată de la Gemini la Mistral.',
    },
    cta: { label: 'Arată-mi Setările', to: '/settings', tour: 'settings' },
  },
];
