import { plural } from '../../lib/plural';
import { aiStatus } from '../contextText';
import { FolderTree, Layers, Plus, Sparkles } from 'lucide-react';
import type { TourDefinition } from '../types';

export const residencyFlashcardsTour: TourDefinition = {
  id: 'residencyFlashcards',
  title: 'Rezidențiat › Flashcarduri',
  autoStartRoute: '/rezidentiat/flashcarduri',
  steps: [
    {
      id: 'rez-flash-add',
      title: 'Cardurile tale, cu „+”',
      body: (ctx) => ctx.residencyDeckCount === 0 ? 'Nu ai pachete de Rezidențiat încă. Din + creezi unul manual sau imporți CSV/Anki în această secțiune.' : `Ai ${plural(ctx.residencyDeckCount, 'pachet', 'pachete')} de Rezidențiat. Din + adaugi un pachet sau un folder.`,
      icon: <Plus size={22} />,
      target: '[data-tutorial="rez-flash-add"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/rezidentiat/flashcarduri',
      accent: '#BF6FFF',
    },
    {
      id: 'rez-flash-ai',
      title: 'Cu AI, la nivelul tău',
      body: (ctx) => `${aiStatus(ctx)} Alegi nivelul, numărul de carduri și folderul. Generarea începe doar după confirmarea ta.`,
      icon: <Sparkles size={22} />,
      target: '[data-tutorial="rez-flash-add"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/rezidentiat/flashcarduri',
      accent: '#0A84FF',
    },
    {
      id: 'rez-flash-folders',
      when: (ctx) => ctx.residencyDeckCount > 0,
      title: 'Foldere și pachete',
      body: 'Pachetele stau în foldere. Le muți cu „Mută în…”, le redenumești, iar la ștergere ți se cere confirmarea.',
      icon: <FolderTree size={22} />,
      target: '[data-tutorial="flashcards-decks"]',
      targetPadding: 6,
      placement: 'top',
      route: '/rezidentiat/flashcarduri',
      accent: '#5E5CE6',
      optional: true,
    },
    {
      id: 'rez-flash-due',
      when: (ctx) => ctx.residencyDeckCount > 0,
      title: 'Repetă ce e scadent',
      body: (ctx) => `${plural(ctx.residencyDueCardCount, 'card scadent', 'carduri scadente')} și ${plural(ctx.residencyNewCardCount, 'card nou', 'carduri noi')} în pachetele de Rezidențiat. ${ctx.residencyDueCardCount + ctx.residencyNewCardCount === 0 ? 'Nu ai carduri de repetat acum; revino mai târziu sau adaugă un pachet.' : 'Pornești sesiunea când ești gata.'}`,
      icon: <Layers size={22} />,
      target: '[data-tutorial="flashcards-due"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/rezidentiat/flashcarduri',
      accent: '#30D158',
      optional: true,
    },
  ],
};
