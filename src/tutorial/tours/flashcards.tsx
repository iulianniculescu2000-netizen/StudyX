import { plural } from '../../lib/plural';
import { aiStatus, cardStatus } from '../contextText';
import { CreditCard, Layers, Plus, RefreshCw } from 'lucide-react';
import type { TourDefinition } from '../types';

export const flashcardsTour: TourDefinition = {
  id: 'flashcards',
  title: 'Flashcarduri',
  autoStartRoute: '/flashcards',
  steps: [
    {
      id: 'flashcards-intro',
      title: 'Flashcarduri, pe înțelesul tău',
      body: (ctx) => ctx.generalDeckCount === 0 ? 'Nu ai pachete încă. Creează unul manual sau importă CSV/Anki; generarea AI este opțională.' : `Ai ${plural(ctx.generalDeckCount, 'pachet', 'pachete')}. ${cardStatus(ctx)}`,
      icon: <CreditCard size={22} />,
      placement: 'center',
      route: '/flashcards',
      accent: '#BF6FFF',
    },
    {
      id: 'flashcards-due',
      title: 'De repetat azi',
      body: (ctx) => cardStatus(ctx),
      icon: <RefreshCw size={22} />,
      target: '[data-tutorial="flashcards-due"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/flashcards',
      // Without any deck there is no "de repetat" card to point at.
      when: (ctx) => ctx.generalDeckCount > 0,
    },
    {
      id: 'flashcards-decks',
      title: 'Pachetele tale',
      body: 'Poți edita un pachet sau îl poți șterge (cu confirmare). Un pachet generat de AI apare întâi într-un card „Pachet creat”: acolo vezi în ce folder a ajuns și îl muți cu „Mută în”.',
      icon: <Layers size={22} />,
      target: '[data-tutorial="flashcards-decks"]',
      targetPadding: 6,
      placement: 'top',
      route: '/flashcards',
      accent: '#5E5CE6',
      when: (ctx) => ctx.generalDeckCount > 0,
    },
    {
      id: 'flashcards-create',
      title: 'Creează un pachet nou',
      body: (ctx) => `${aiStatus(ctx)} ${ctx.errorCount > 0 ? 'Poți crea și un pachet din greșelile tale.' : 'Pentru un pachet din greșeli, ai nevoie întâi de răspunsuri greșite înregistrate.'} Importul și crearea manuală sunt alternative fără AI.`,
      icon: <Plus size={22} />,
      target: '[data-tutorial="flashcards-create"]',
      targetPadding: 6,
      placement: 'top',
      route: '/flashcards',
      accent: '#30D158',
    },
  ],
};
