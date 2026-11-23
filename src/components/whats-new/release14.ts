import type { WhatsNew3DSlide } from './release11';
import { FluidScrollScene, Hero14Scene, IdlePowerScene, MotionUnlockScene, NavPolishScene } from './scenes14';

/**
 * Noutățile din 1.4 față de 1.3, în cinci slide-uri. Cifrele din scene sunt doar pentru ilustrare.
 */
export const RELEASE_14_SLIDES: WhatsNew3DSlide[] = [
  {
    id: 'hero-14',
    badge: 'Versiunea 1.4',
    title: 'StudyX 1.4',
    description: 'Derulare mult mai fluidă pe Panou, Grile și Statistici, animații și efecte de sticlă care nu se mai blochează după o închidere bruscă, consum redus de procesor în repaus și finisaje în bara laterală și tururi.',
    scene: {
      Scene: Hero14Scene, durationMs: 8000, marks: [0, 2600, 5200],
      label: 'Animație: versiunea 1.4',
      captions: ['Versiunea 1.4, pe straturi de sticlă.', 'Noutățile se așază pe orbită.', 'Gata de explorat.'],
      transcript: 'Numărul 1.4 apare pe trei plăci de sticlă suprapuse în adâncime. În jurul lui, pe o orbită, se rotesc patru noutăți: derularea fluidă, animațiile deblocate, consumul redus în repaus și finisajele de navigare.',
    },
  },
  {
    id: 'fluid-scroll-14',
    badge: 'Fluiditate',
    title: 'Scroll lin, fără sacadări, cu toate efectele păstrate',
    description: 'Aura de fundal și efectele de sticlă au fost mutate pe randare ușoară, iar cardurile de grile nu mai reîncarcă interfața când treci cu mouse-ul în timpul derulării. Păstrezi toate animațiile și efectele, fără sacadări.',
    scene: {
      Scene: FluidScrollScene, durationMs: 9500, marks: [0, 2800, 5800],
      label: 'Animație: derulare fluidă și hover în CSS',
      captions: ['Aura moale și cardurile de grile intră în scenă.', 'Derulare cursivă, fără cadre blocate.', 'Hover-ul răspunde din CSS, fără re-randări.'],
      transcript: 'Pe un fundal cu aură pastelată pe gradiente moi, trei carduri de grile glisează cursiv în sus. În dreapta apare cardul Derulare lină cu etichetele Panou 4 ori mai fluid și Grile 0 cadre lungi, urmat de mesajul Hover în CSS, fără re-randare. Cifrele sunt doar pentru ilustrare.',
    },
    cta: { label: 'Arată-mi Grilele', to: '/quizzes', tour: 'quizzes' },
  },
  {
    id: 'motion-unlock-14',
    badge: 'Animații și aspect',
    title: 'Efectele rămân active și răspund instant',
    description: 'Profilurile care rămăseseră blocate pe modul economic din versiunile vechi revin automat la aspectul complet. Comutarea între Auto, Economic și Complet se aplică pe loc, iar o închidere rapidă nu mai dezactivează animațiile.',
    scene: {
      Scene: MotionUnlockScene, durationMs: 9500, marks: [0, 2600, 5400],
      label: 'Animație: deblocarea aspectului complet',
      captions: ['Profilul trece din modul economic vechi pe Auto.', 'Sticla, aura și tranzițiile pornesc pe loc.', 'Pornirea se confirmă în 0,5 secunde.'],
      transcript: 'Cardul Performanță trece din eticheta Economic vechi în eticheta Complet, selectând opțiunea Auto și afișând Sticlă, aură și tranziții active instant. În dreapta apare cardul Pornire sigură cu valoarea 0,5 s și mesajul Fără blocări la închidere rapidă.',
    },
    cta: { label: 'Arată-mi Performanța', to: '/settings?s=performanta' },
  },
  {
    id: 'idle-power-14',
    badge: 'Consum redus',
    title: 'Mai puțin procesor și GPU când doar citești',
    description: 'Mascota Pip și punctul din logo rulează acum pe straturi proprii, Panoul nu se mai redesenează în fiecare minut, iar când minimizezi fereastra cronometrele decorative se opresc. Mai rece pe laptop, aceeași experiență.',
    scene: {
      Scene: IdlePowerScene, durationMs: 9500, marks: [0, 3000, 5600],
      label: 'Animație: randare ușoară în repaus',
      captions: ['Mascota Pip rulează pe straturi independente.', 'Cardurile opace din tema Luminos economisesc GPU.', 'Când minimizezi fereastra, ceasurile intră în pauză.'],
      transcript: 'În stânga, trei straturi intitulate Corp, Ochi și Antenă se separă ușor în adâncime. În dreapta sus apare cardul Tema Luminos cu Sticlă ușoară pe carduri și minus 38% GPU în repaus pe Grile, iar jos cardul În repaus cu mesajul Ceasurile intră în pauză când fereastra e minimizată.',
    },
    cta: { label: 'Arată-mi Panoul', to: '/', tour: 'dashboard' },
  },
  {
    id: 'nav-polish-14',
    badge: 'Navigare și tururi',
    title: 'Bară laterală curată și tururi care nu rămân peste alte pagini',
    description: 'În modul restrâns, butoanele din bara laterală au zona de click pe toată iconița fără margini tăiate, trecerea între fereastră îngustă și lată e curată, iar tururile de pagină se închid automat dacă pleci pe alt ecran.',
    scene: {
      Scene: NavPolishScene, durationMs: 9500, marks: [0, 2900, 5600],
      label: 'Animație: bara laterală, Aspect și tururi locale',
      captions: ['Bara laterală trece curat între restrâns și extins.', 'Comutatorul de temă aliniat pe trei coloane egale.', 'Tururile de pagină se închid automat la plecare.'],
      transcript: 'În stânga, bara laterală se extinde lin din modul cu iconițe centrate în lista cu Panou, Grile și Setări. În dreapta sus apare comutatorul Aspect cu trei coloane egale: Luminos, Întunecat și Automat. Jos apare cardul Tururile locale se închid singure când schimbi pagina din meniu.',
    },
    cta: { label: 'Arată-mi Setările', to: '/settings', tour: 'settings' },
  },
];
