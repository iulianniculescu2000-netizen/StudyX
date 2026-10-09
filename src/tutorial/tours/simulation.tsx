import { Gauge, GraduationCap, ListChecks, Timer } from 'lucide-react';
import type { TourDefinition } from '../types';

export const simulationTour: TourDefinition = {
  id: 'simulation',
  title: 'Simulare de examen',
  autoStartRoute: '/simulare',
  steps: [
    {
      id: 'simulation-intro',
      title: 'Exersează ca la examen',
      body: 'O simulare te pune în condiții reale: grile amestecate, un ceas care merge și punctaj cu penalizare. Un tur scurt, ca să știi cum o pornești.',
      icon: <GraduationCap size={22} />,
      placement: 'center',
      route: '/simulare',
      accent: '#0A84FF',
    },
    {
      id: 'simulation-discipline',
      title: 'Alege disciplina',
      body: 'Poți simula toate disciplinele deodată sau doar una, ca pentru un test pe materie. Între paranteze vezi câte grile ai la dispoziție.',
      icon: <ListChecks size={22} />,
      target: '[data-tutorial="simulation-discipline"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/simulare',
      accent: '#BF6FFF',
      // Nothing to pick from until some grile are in the profile.
      when: (ctx) => ctx.quizCount > 0,
    },
    {
      id: 'simulation-lengths',
      title: 'Alege lungimea',
      body: 'Apeși pe o variantă și simularea începe. Primește un timp total; dacă el se scurge, simularea se încheie singură, cu ce ai răspuns până atunci.',
      icon: <Timer size={22} />,
      target: '[data-tutorial="simulation-lengths"]',
      targetPadding: 8,
      placement: 'bottom',
      route: '/simulare',
      accent: '#FF9F0A',
      when: (ctx) => ctx.quizCount > 0,
    },
    {
      id: 'simulation-result',
      title: 'Penalizare și rezultat',
      body: 'Fiecare opțiune greșită scade 0,25 puncte. Explicațiile le vezi abia la final, împreună cu rezultatul pe discipline: așa afli unde mai ai de lucrat.',
      icon: <Gauge size={22} />,
      placement: 'center',
      route: '/simulare',
      accent: '#30D158',
    },
  ],
};
