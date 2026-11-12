import type { WhatsNew3DSlide } from './release11';
import { BookCardsScene, DailyReviewScene, ExamScene, Hero12Scene, SimulationScene, SocraticScene } from './scenes12';

/** Noutățile din 1.2 față de 1.1, în cel mult șapte slide-uri. Estimările din simulare sunt orientative, nu promisiuni. */
export const RELEASE_12_SLIDES: WhatsNew3DSlide[] = [
  {
    id: 'hero-12',
    badge: 'Versiunea 1.2',
    title: 'StudyX 1.2',
    description: 'O singură coadă pentru ce ai de revăzut, simulări pe măsura ta, un tutor care te ghidează prin greșeli și noutăți din cărți și din Organizare.',
    scene: {
      Scene: Hero12Scene, durationMs: 8000, marks: [0, 2600, 5200],
      label: 'Animație: versiunea 1.2',
      captions: ['Versiunea 1.2, pe straturi de sticlă.', 'Noutățile se așază pe orbită.', 'Gata de explorat.'],
      transcript: 'Numărul 1.2 apare pe trei plăci de sticlă suprapuse în adâncime. În jurul lui, pe o orbită, se rotesc cinci noutăți: Azi de revăzut, Simularea, tutorul din Caietul de erori, cardurile din carte și Organizarea.',
    },
  },
  {
    id: 'daily-12',
    badge: 'Azi de revăzut',
    title: 'O singură coadă pentru tot ce ai de repetat',
    description: 'Cardurile scadente, grilele și greșelile se strâng într-o coadă unică. „Începe, 15 min” te duce direct la ea.',
    scene: {
      Scene: DailyReviewScene, durationMs: 9000, marks: [0, 2600, 4400],
      label: 'Animație: coada Azi de revăzut',
      captions: ['Carduri, grile și greșeli, separate.', 'Se strâng într-o singură coadă.', 'Începe, 15 min.'],
      transcript: 'Trei rânduri stau în adâncime: Carduri scadente, 9 de repetat; Grile de refăcut, 4 recente; Greșeli din caiet, 2 de înțeles. Se apropie și formează o singură coadă. Dedesubt vine în față butonul Începe, 15 min, care este apăsat. Cifrele sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Azi de revăzut', to: '/daily-review', tour: 'daily' },
  },
  {
    id: 'simulation-12',
    badge: 'Simulare',
    title: 'Simulări pe măsura ta, cu raport la final',
    description: 'Alegi numărul de întrebări și amestecul de grile cu răspuns unic și cu răspunsuri multiple. La final primești un raport cu o estimare orientativă, nu o promisiune de rezultat.',
    scene: {
      Scene: SimulationScene, durationMs: 9500, marks: [0, 2400, 4400],
      label: 'Animație: simularea configurabilă',
      captions: ['Alegi numărul de întrebări.', 'Amesteci grilele CS și CM.', 'Raport cu estimare orientativă.'],
      transcript: 'Un card Simulare arată numărul de întrebări crescând spre 100, cu două etichete dedesubt: CS, răspuns unic, și CM, răspunsuri multiple. Apoi vine în față raportul, cu o estimare orientativă de aproximativ 68% și mențiunea că nu este o promisiune de rezultat la examen. Cifrele sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Simularea', to: '/simulare', tour: 'simulation' },
  },
  {
    id: 'socratic-12',
    badge: 'Caietul de erori',
    title: 'Tutorul care te întreabă, nu îți dă răspunsul',
    description: 'Întrebări de ghidare pas cu pas, tipul erorii salvat pentru fiecare greșeală și, în Statistici, cardul „Unde se rupe raționamentul”.',
    scene: {
      Scene: SocraticScene, durationMs: 9500, marks: [0, 3200, 4600],
      label: 'Animație: tutorul socratic',
      captions: ['Întrebări care te ghidează.', 'Tipul erorii se salvează.', 'Unde se rupe raționamentul.'],
      transcript: 'Două întrebări de ghidare apar una sub alta: Ce ți-a spus enunțul despre debit? și Ce se întâmplă cu presiunea dacă…? Apoi apare eticheta Tip de eroare salvat. În față vine cardul Unde se rupe raționamentul, din Statistici, cu trei bare: confuzie între concepte 46%, detaliu uitat 32% și citit în grabă 22%. Cifrele sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Caietul de erori', to: '/erori', tour: 'errors' },
  },
  {
    id: 'book-cards-12',
    badge: 'Din carte',
    title: 'Scheme și carduri făcute din carte',
    description: 'Fiecare schemă sau card vine cu citarea paginii și îl accepți pe rând, doar pe cele care ți se potrivesc.',
    scene: {
      Scene: BookCardsScene, durationMs: 9000, marks: [0, 2800, 5200],
      label: 'Animație: scheme și carduri din carte',
      captions: ['O pagină din carte, cu pasajul evidențiat.', 'Din ea ies o schemă și un card.', 'Accepți fiecare element pe rând.'],
      transcript: 'O pagină din Lawrence, pagina 412, are două rânduri evidențiate. Lângă ea apar două elemente: o schemă, conduita în tahicardie, și un card, criterii de cardioversie, fiecare cu citarea Lawrence, pagina 412. Butonul Acceptă de pe schemă devine Acceptat.',
    },
    cta: { label: 'Arată-mi Rezidențiat', to: '/rezidentiat', tour: 'residency' },
  },
  {
    id: 'exam-12',
    badge: 'Organizare',
    title: '„La examen”, pe fiecare temă',
    description: 'Fiecare temă arată câte grile au căzut în 2021–2025, în ce ani și care sunt paginile fierbinți din carte.',
    scene: {
      Scene: ExamScene, durationMs: 9000, marks: [0, 2400, 4200],
      label: 'Animație: La examen în Organizare',
      captions: ['Temele din plan.', 'La examen se deschide pe tema aleasă.', 'Grile, ani și pagini fierbinți.'],
      transcript: 'Trei teme stau pe rând: Insuficiența cardiacă, Hiponatremia și Artrita reumatoidă. La prima, La examen se deschide și vine în față: 14 grile, 2021–2025, cu eticheta Pagină fierbinte, pagina 212. Cifrele sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Organizarea', to: '/rezidentiat/organizare', tour: 'organizare' },
  },
];
