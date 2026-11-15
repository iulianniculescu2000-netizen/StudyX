import type { WhatsNew3DSlide } from './release11';
import { CopilotScene, EverydaySearchScene, Hero13Scene, PolishScene, SavedExplanationScene, SecondJudgeScene } from './scenes13';

/**
 * Noutățile din 1.3 față de 1.2, în cel mult șapte slide-uri. Cifrele, paginile și numele furnizorilor din scene sunt
 * doar pentru ilustrare. Copilot nu are conectare proprie în StudyX: folosește contul GitHub deja conectat pe calculator.
 */
export const RELEASE_13_SLIDES: WhatsNew3DSlide[] = [
  {
    id: 'hero-13',
    badge: 'Versiunea 1.3',
    title: 'StudyX 1.3',
    description: 'GitHub Copilot din contul tău, explicații cu sursă salvate pe grilă, verificare pe al doilea model, căutare cu vorbe de zi cu zi și cifre pe plăcuțe colorate.',
    scene: {
      Scene: Hero13Scene, durationMs: 8000, marks: [0, 2600, 5200],
      label: 'Animație: versiunea 1.3',
      captions: ['Versiunea 1.3, pe straturi de sticlă.', 'Noutățile se așază pe orbită.', 'Gata de explorat.'],
      transcript: 'Numărul 1.3 apare pe trei plăci de sticlă suprapuse în adâncime. În jurul lui, pe o orbită, se rotesc cinci noutăți: GitHub Copilot, explicațiile cu sursă din carte, verificarea pe al doilea model, căutarea cu vorbe de zi cu zi și finisajele de aspect.',
    },
  },
  {
    id: 'copilot-13',
    badge: 'GitHub Copilot',
    title: 'Copilot din contul tău GitHub, ca AI principal',
    description: 'Apeși „Conectează GitHub Copilot” în Setări AI, introduci un cod pe github.com și gata, fără terminal și fără parolă în StudyX. Copilot se ocupă de chat, explicații și grile; analizele și verificarea merg pe cheile tale, iar când cota contului se termină, cheile preiau tot.',
    scene: {
      Scene: CopilotScene, durationMs: 10000, marks: [0, 2600, 5600],
      label: 'Animație: conectarea GitHub Copilot cu un cod',
      captions: ['Apeși butonul și introduci codul pe github.com.', 'Copilot se ocupă de chat, explicații și grile.', 'Cota contului e limitată: la nevoie, cheile preiau tot.'],
      transcript: 'Pe un card apare butonul Conectează GitHub Copilot și un cod de exemplu, ABCD-1234, introdus pe github.com, apoi mesajul Cod confirmat. În față vine cardul GitHub Copilot, cu starea Conectat și o bară de cotă. Dedesubt se aprind Chat AI, Explicații și Grile. O placă separată spune că analizele și verificarea rămân pe cheile tale: Groq, Gemini, Mistral. Apoi bara de cotă se umple, starea devine Cotă atinsă, iar cardul spune că StudyX trece pe cheile API și reîncearcă mai târziu. Codul din animație este doar un exemplu; StudyX nu vede parola ta GitHub.',
    },
    cta: { label: 'Arată-mi Setările', to: '/settings', tour: 'settings' },
  },
  {
    id: 'saved-explanation-13',
    badge: 'Explicații la grile',
    title: 'Explicația arată pagina și rămâne salvată pe grilă',
    description: 'Explicația AI citează cartea cu pagina, iar „Deschide în carte” te duce la pasaj. Pentru aceeași grilă și același răspuns, explicația se păstrează și nu se mai cere a doua oară.',
    scene: {
      Scene: SavedExplanationScene, durationMs: 10000, marks: [0, 2600, 5200],
      label: 'Animație: explicație cu sursă, salvată pe grilă',
      captions: ['Apeși Explică AI pe o grilă.', 'Sursa cu pagină se deschide în carte.', 'Explicația rămâne salvată pe grilă.'],
      transcript: 'Pe o grilă se apasă Explică AI. În față vine cardul Explicație cu sursă, cu citarea 1 și butoanele Carte, Kumar, pagina 142, și Deschide în carte. Se apasă Deschide în carte, iar pagina din spate vine în față, cu două rânduri evidențiate. Jos apar două etichete: Salvată pe grilă și A doua oară: fără cerere nouă. Pagina și cartea sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Grilele', to: '/quizzes', tour: 'quizzes' },
  },
  {
    id: 'judge-13',
    badge: 'Verificare',
    title: 'Al doilea model verifică grilele și cifrele',
    description: 'Cu două chei, o grilă generată e verificată de alt furnizor decât cel care a scris-o, inclusiv variantele greșite. În chat, cifrele din propozițiile citate care nu apar în pasaj sunt semnalate.',
    scene: {
      Scene: SecondJudgeScene, durationMs: 10000, marks: [0, 2800, 5400],
      label: 'Animație: verificare pe al doilea model și cifre din pasaj',
      captions: ['O grilă scrisă de un furnizor.', 'Alt furnizor verifică și variantele greșite.', 'În chat, cifra din afara pasajului e semnalată.'],
      transcript: 'Un card spune că grila e scrisă de Groq. Dedesubt, cardul Verificată de, cu Mistral, bifează enunțul, răspunsul corect și variantele greșite, apoi arată că o variantă la fel de corectă duce la respingerea grilei, cu mesajul Variantă la fel de corectă: grila se respinge. În dreapta, un răspuns din chat spune că tratamentul durează 14 zile, cu citarea 1; cifra e subliniată, iar eticheta Parțial susținut: o cifră de verificat în carte apare dedesubt. Furnizorii, cifra și pagina sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Chatul', to: '/', tour: 'chat' },
  },
  {
    id: 'search-13',
    badge: 'Căutare în cărți',
    title: 'Vorbele de zi cu zi duc la termenul din carte',
    description: 'Cauți „lipsă de aer” sau „tuse cu sânge”, iar căutarea le leagă de „dispnee” și „hemoptizie”. Merge pentru expresiile uzuale cunoscute, nu pentru orice formulare.',
    scene: {
      Scene: EverydaySearchScene, durationMs: 9500, marks: [0, 2700, 5500],
      label: 'Animație: căutare cu vorbe de zi cu zi',
      captions: ['Scrii cu vorbele tale.', 'Căutarea găsește termenul din carte și paginile.', 'Același drum pentru alte expresii uzuale.'],
      transcript: 'În bara de căutare se scrie lipsă de aer. În față vine cardul Termenul din carte: dispnee, iar în dreapta apar trei fragmente din cărțile de bază, fiecare cu pagina. Jos se arată încă două exemple: tuse cu sânge duce la hemoptizie, iar scaun negru la melenă. Paginile sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Chatul', to: '/', tour: 'chat' },
  },
  {
    id: 'polish-13',
    badge: 'Aspect',
    title: 'Cifrele stau pe plăcuțe colorate',
    description: 'Panoul, Statistici, Realizări și Sesiunea zilnică au cifrele pe plăcuțe colorate. Notițele numără schemele separat, iar chatul AI și Setările AI au primit și ele finisaje.',
    scene: {
      Scene: PolishScene, durationMs: 9500, marks: [0, 2800, 5600],
      label: 'Animație: plăcuțe colorate și Notițe',
      captions: ['Cifrele din Panou, pe plăcuțe.', 'La fel în Statistici, Realizări și Sesiune zilnică.', 'Notițele numără schemele separat.'],
      transcript: 'Banda de cifre din Panou arată patru plăcuțe colorate: Grile 48, Serie 6 zile, Acuratețe 82% și Timp 12 h. Apoi trei carduri vin în față, fiecare cu plăcuța lui: Statistici, Realizări și Sesiune zilnică. La final, cardul Notițele mele arată 3 notițe din 2 grile și 1 schemă, cu eticheta Schemele, numărate separat. Cifrele sunt doar un exemplu.',
    },
    cta: { label: 'Arată-mi Panoul', to: '/', tour: 'dashboard' },
  },
];
