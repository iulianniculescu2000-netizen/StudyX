import { Bot, ListChecks, Pencil, PenLine, Scale } from 'lucide-react';
import type { TourDefinition } from '../types';

export const createTour: TourDefinition = {
  id: 'create',
  title: 'Crearea unei grile',
  steps: [
    {
      id: 'create-intro',
      title: 'Două etape, nimic complicat',
      body: 'Întâi dai grilei un titlu și o descriere, apoi adaugi întrebările: de mână sau generate cu AI.',
      icon: <ListChecks size={22} />,
      placement: 'center',
      route: '/create',
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
      route: '/create',
      accent: '#30D158',
    },
    {
      id: 'create-options',
      title: 'Opțiuni pentru grilă',
      body: 'Poți amesteca întrebările sau răspunsurile la fiecare sesiune. „Mod Rezidențiat” notează ca la examen: +1 punct pentru un răspuns corect, −0,25 pentru fiecare opțiune greșită bifată.',
      icon: <Scale size={22} />,
      target: '[data-tutorial="create-options"]',
      targetPadding: 6,
      placement: 'top',
      route: '/create',
      accent: '#FF9F0A',
    },
    {
      id: 'create-questions',
      title: 'Apoi, întrebările',
      body: 'La „Manual” scrii enunțul, bifezi răspunsurile corecte (una sau mai multe), adaugi explicație și, dacă vrei, o imagine. Întrebările se pot reordona prin tragere.',
      icon: <Pencil size={22} />,
      placement: 'center',
      accent: '#5E5CE6',
    },
    {
      id: 'create-ai',
      title: 'Sau lasă AI-ul să le scrie',
      body: 'La „Generează cu AI” lipești un text sau un PDF, alegi nivelul și câte grile vrei. Ai nevoie de o cheie AI, din Setări › Inteligență artificială.',
      icon: <Bot size={22} />,
      placement: 'center',
      accent: '#BF6FFF',
    },
  ],
};
