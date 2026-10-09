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
      body: 'Cartonașe cu repetare spațiată: aplicația îți arată ce ai de repetat azi și cât din fiecare pachet ai stăpânit. Trecem rapid prin pagină.',
      icon: <CreditCard size={22} />,
      placement: 'center',
      route: '/flashcards',
      accent: '#BF6FFF',
    },
    {
      id: 'flashcards-due',
      title: 'De repetat azi',
      body: 'Numără exact ce primești în sesiune: cardurile scadente și cele noi. Seria ta de zile apare tot aici.',
      icon: <RefreshCw size={22} />,
      target: '[data-tutorial="flashcards-due"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/flashcards',
      // Without any deck there is no "de repetat" card to point at.
      when: (ctx) => ctx.deckCount > 0,
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
      when: (ctx) => ctx.deckCount > 0,
    },
    {
      id: 'flashcards-create',
      title: 'Creează un pachet nou',
      body: 'Din cursurile tale (10, 25, 50 sau 100 de carduri), din greșelile tale sau din import. Dacă AI-ul se oprește pe drum, cardurile deja făcute rămân și poți apăsa „Continuă generarea”.',
      icon: <Plus size={22} />,
      target: '[data-tutorial="flashcards-create"]',
      targetPadding: 6,
      placement: 'top',
      route: '/flashcards',
      accent: '#30D158',
    },
  ],
};
