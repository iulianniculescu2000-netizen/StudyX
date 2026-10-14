import { plural } from '../../lib/plural';
import { BookOpen, Download, FolderOpen, Layers, Plus, Stethoscope, SlidersHorizontal } from 'lucide-react';
import type { TourContext, TourDefinition, TourStep } from '../types';

const aiDialogOpen = () => !!document.querySelector('[data-tutorial="rez-ai-level"]');
const importDialogOpen = () => !!document.querySelector('[data-tutorial="rez-import-folder"]');

const overviewSteps: TourStep[] = [
    {
      id: 'residency-intro',
      title: 'Rezidențiat, într-un singur loc',
      body: (ctx) => ctx.residencyQuizCount === 0 ? 'Nu ai grile de Rezidențiat încă, chiar dacă ai alte grile în profil. Adaugă o bancă din lista de import sau folosește + pentru material propriu.' : `Ai ${plural(ctx.residencyQuizCount, 'set', 'seturi')} de grile pentru Rezidențiat și ${plural(ctx.residencyDeckCount, 'pachet', 'pachete')}. Deschide disciplina dorită pentru progres și teste.`,
      icon: <Stethoscope size={22} />,
      placement: 'center',
      route: '/rezidentiat',
      accent: '#0A84FF',
    },
    {
      id: 'residency-disciplines',
      title: 'Alege o disciplină',
      body: 'Intri într-o disciplină, apoi într-o specialitate: vezi testele, progresul și continui de unde ai rămas. „Joacă tot” amestecă toate testele unei specialități într-o sesiune.',
      icon: <Layers size={22} />,
      target: '[data-tutorial="residency-disciplines"]',
      targetPadding: 8,
      placement: 'bottom',
      route: '/rezidentiat',
      // No disciplines to point at until some grile are in the profile.
      when: (ctx) => ctx.residencyQuizCount > 0,
      optional: true,
    },
    {
      id: 'residency-add',
      title: 'Grilele tale, cu „+”',
      body: 'Din acest buton faci grile cu AI (alegi nivelul), imporți grile dintr-un fișier sau dintr-un alt AI, scrii o grilă de mână, creezi un folder sau adaugi un material PDF în banca ta.',
      icon: <Plus size={22} />,
      target: '[data-tutorial="rez-quiz-add"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/rezidentiat',
      accent: '#0A84FF',
      optional: true,
    },
    {
      id: 'residency-folders',
      title: 'Folderele tale de grile',
      body: 'Aici își găsesc locul grilele făcute de tine. Deschizi un folder oricând, iar la ștergere alegi dacă păstrezi grilele sau le ștergi odată cu el.',
      icon: <FolderOpen size={22} />,
      target: '[data-tutorial="rez-quiz-folders"]',
      targetPadding: 6,
      placement: 'top',
      route: '/rezidentiat',
      accent: '#5E5CE6',
      // Only drawn once at least one folder exists.
      optional: true,
    },
    {
      id: 'residency-resources',
      title: 'Resurse',
      body: 'Cărțile de bază (Kumar, Lawrence, Sinopsis) vin cu aplicația și sunt sursa de adevăr; materialele tale le completează. Aici ai Organizarea, cardurile și un chat care răspunde din cărți, cu pagina. Grilele generate de AI intră singure în Grile › specialitate.',
      icon: <BookOpen size={22} />,
      target: '[data-tutorial="residency-resources"]',
      targetPadding: 8,
      placement: 'top',
      route: '/rezidentiat',
      accent: '#BF6FFF',
    },
    {
      id: 'residency-import',
      title: 'Adaugă banca de grile',
      body: (ctx) => ctx.residencyQuizCount === 0 ? 'Alege o bancă disponibilă și apasă Adaugă când vrei să o imporți. Grilele se așază pe specialități.' : 'Lista arată băncile care mai pot fi adăugate. Poți importa materiale suplimentare chiar dacă ai deja grile.',
      icon: <Download size={22} />,
      target: '[data-tutorial="residency-import"]',
      targetPadding: 8,
      placement: 'top',
      route: '/rezidentiat',
      accent: '#30D158',
      // Remaining imports can exist in populated profiles too.
      optional: true,
    },
];

export const residencyTour: TourDefinition = {
  id: 'residency', title: 'Rezidențiat', autoStartRoute: '/rezidentiat',
  steps: [
    ...overviewSteps.map((step) => ({ ...step, when: (ctx: TourContext) => !aiDialogOpen() && !importDialogOpen() && (!step.when || step.when(ctx)) })),
    { id: 'rez-ai-intro', title: 'Grile cu AI, în acest dialog',
      body: 'Completezi un subiect, apoi alegi nivelul, tipul și destinația. Ai nevoie de o cheie AI configurată. Ghidul păstrează dialogul deschis și nu pornește generarea.',
      icon: <BookOpen size={22} />, placement: 'center', when: aiDialogOpen },
    { id: 'rez-ai-level-guide', title: 'Nivelul întrebărilor',
      body: 'Alege nivelul potrivit pentru ce exersezi. Alegerea ghidează cererea AI, dar nu garantează dificultatea fiecărei întrebări; verifică materialul generat înainte de studiu.',
      icon: <SlidersHorizontal size={22} />, target: '[data-tutorial="rez-ai-level"]', placement: 'bottom', optional: true, when: aiDialogOpen },
    { id: 'rez-ai-type-guide', title: 'Complement simplu sau multiplu',
      body: 'Complement simplu cere un singur răspuns corect. Complement multiplu permite mai multe răspunsuri corecte. Numărul de grile se alege separat, în același dialog.',
      icon: <Layers size={22} />, target: '[data-tutorial="rez-ai-type"]', placement: 'bottom', optional: true, when: aiDialogOpen },
    { id: 'rez-ai-folder-guide', title: 'Unde ajung grilele',
      body: 'Câmpul „Se salvează în” stabilește destinația: un folder existent, unul nou sau opțiunea automată disponibilă. Verifică selecția înainte să apeși Generează. Închide ghidul pentru a continua în dialog.',
      icon: <FolderOpen size={22} />, target: '[data-tutorial="rez-ai-folder"]', placement: 'top', optional: true, when: aiDialogOpen },
    { id: 'rez-import-intro', title: 'Importul începe cu destinația',
      body: 'Acest dialog pregătește folderul în care vor intra grilele. Ghidul nu selectează fișiere și nu importă materiale.',
      icon: <Download size={22} />, placement: 'center', when: importDialogOpen },
    { id: 'rez-import-folder-guide', title: 'Alege folderul pentru import',
      body: 'Poți selecta un folder existent sau pregăti unul nou. Dacă alegi un folder nou, completează numele înainte să continui. Verifică destinația pentru a găsi materialele după import.',
      icon: <FolderOpen size={22} />, target: '[data-tutorial="rez-import-folder"]', placement: 'bottom', optional: true, when: importDialogOpen },
    { id: 'rez-import-file-guide', title: 'Apoi alegi fișierul',
      body: 'Închide ghidul și apasă Continuă când destinația este pregătită. Pasul următor deschide alegerea fișierului pentru import; consultă explicația Ce pot importa? pentru formatul acceptat.',
      icon: <Download size={22} />, placement: 'center', when: importDialogOpen },
  ],
};
