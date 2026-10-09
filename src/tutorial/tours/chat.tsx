import { Bot, ListChecks, Network, RotateCcw } from 'lucide-react';
import type { TourDefinition } from '../types';

/** No page of its own, so no autostart: it is reached from "what's new" and from the "?" in the chat header. */
export const chatTour: TourDefinition = {
  id: 'chat',
  title: 'Chat AI',
  steps: [
    {
      id: 'chat-open',
      title: 'Chatul te ajută cu tot',
      body: 'Îl deschizi din butonul cu Pip. Scrii ce vrei, în română, și răspunde din cursurile și cărțile tale.',
      icon: <Bot size={22} />,
      target: '[data-tutorial="ai-chat-button"]',
      targetPadding: 8,
      placement: 'left',
      accent: '#BF6FFF',
    },
    {
      id: 'chat-options',
      title: 'Te întreabă ce îi lipsește',
      body: 'Când ceri grile sau flashcarduri, chatul îți arată o cartelă: alegi nivelul (ușor, mediu, greu), câte să fie și în ce folder intră. Apeși o dată și le face.',
      icon: <ListChecks size={22} />,
      placement: 'center',
      accent: '#0A84FF',
    },
    {
      id: 'chat-schemas',
      title: 'Scheme pe care le poți explora',
      body: 'Cere „fă-mi o schemă” și primești un desen. Treci cu mouse-ul peste un pas ca să vezi calea care duce la el, iar cu un click o ții aprinsă și îi vezi nota. Click din nou sau Esc ca să renunți.',
      icon: <Network size={22} />,
      placement: 'center',
      accent: '#30D158',
    },
    {
      id: 'chat-errors',
      title: 'Dacă un model se blochează',
      body: 'Vezi un mesaj clar, nu o eroare: „Încearcă din nou” repetă cererea, iar „Alt model” o trimite prin alt furnizor. De multe ori StudyX o face singur, fără să observi.',
      icon: <RotateCcw size={22} />,
      placement: 'center',
      accent: '#FF9F0A',
    },
  ],
};
