import { plural } from '../../lib/plural';
import { aiStatus } from '../contextText';
import { Bot, ListChecks, Pencil, PenLine, Scale } from 'lucide-react';
import type { TourContext, TourDefinition, TourStep } from '../types';

const visibleAtEntry = (ctx: TourContext, target: string) => ctx.pathname === '/create' && !!document.querySelector(target);
const contextual = (step: TourStep): TourStep[] => [
  { ...step, when: (ctx) => visibleAtEntry(ctx, step.target!), optional: true },
  { ...step, id: `${step.id}-overview`, target: undefined, placement: 'center', when: (ctx) => !visibleAtEntry(ctx, step.target!) },
];

export const createTour: TourDefinition = {
  id: 'create',
  title: 'Crearea unei grile',
  steps: [
    {
      id: 'create-intro',
      title: 'Două etape, nimic complicat',
      body: (ctx) => ctx.quizCount === 0 ? 'Pentru prima grilă, completează titlul și descrierea, apoi adaugă întrebări manual. AI este opțional.' : `Ai ${plural(ctx.quizCount, 'grilă', 'grile')}. Pentru un set nou, completează titlul și descrierea, apoi adaugă întrebările.`,
      icon: <ListChecks size={22} />,
      placement: 'center',
      when: (ctx) => ctx.pathname === '/create',
      accent: '#0A84FF',
    },
    {
      id: 'create-intro-open',
      title: 'Două etape, nimic complicat',
      body: 'Completează titlul și descrierea, apoi adaugă întrebări manual sau cu AI. Ghidul deschide pagina de creare; completarea și salvarea rămân la alegerea ta.',
      icon: <ListChecks size={22} />,
      placement: 'center',
      route: '/create',
      when: (ctx) => ctx.pathname !== '/create',
      accent: '#0A84FF',
    },
    {
      id: 'create-title',
      title: 'Titlu și descriere',
      body: 'Sunt singurele câmpuri obligatorii. Un titlu clar te ajută să găsești grila mai târziu, în căutare și în foldere.',
      icon: <PenLine size={22} />,
      target: '[data-tutorial="create-title"]',
      targetPadding: 6,
      placement: 'bottom',
      accent: '#30D158',
      when: (ctx) => !visibleAtEntry(ctx, '[data-tutorial="create-question-tabs"]'),
      optional: true,
    },
    {
      id: 'create-options',
      title: 'Opțiuni pentru grilă',
      body: 'Poți amesteca întrebările sau răspunsurile la fiecare sesiune. „Mod Rezidențiat” notează ca la examen: +1 punct pentru un răspuns corect, −0,25 pentru fiecare opțiune greșită bifată.',
      icon: <Scale size={22} />,
      target: '[data-tutorial="create-options"]',
      targetPadding: 6,
      placement: 'top',
      accent: '#FF9F0A',
      when: (ctx) => !visibleAtEntry(ctx, '[data-tutorial="create-question-tabs"]'),
      optional: true,
    },
    ...contextual({
      id: 'create-questions',
      title: 'Apoi, întrebările',
      body: 'După titlu și descriere apeși Continuă pentru etapa Întrebări. La Manual scrii enunțul, marchezi răspunsurile corecte, adaugi explicație și, dacă vrei, o imagine. Cu + adaugi o întrebare; filele se pot reordona prin tragere. Ghidul nu schimbă etapa sau întrebările.',
      icon: <Pencil size={22} />,
      target: '[data-tutorial="create-question-editor"]',
      placement: 'top',
      accent: '#5E5CE6',
    }),
    ...contextual({
      id: 'create-ai',
      title: 'Sau lasă AI-ul să le scrie',
      body: (ctx) => `${aiStatus(ctx)} În etapa Întrebări deschizi Generează cu AI. Lipești text sau imporți PDF, alegi modul, nivelul, numărul și tipurile de întrebări. Citește întrebările generate înainte de salvare. Ghidul nu deschide fila și nu pornește generarea.`,
      icon: <Bot size={22} />,
      target: '[data-tutorial="create-ai-panel"]',
      placement: 'top',
      accent: '#BF6FFF',
    }),
  ],
};
