import { CalendarClock, CalendarDays, Compass, LayoutGrid } from 'lucide-react';
import type { TourDefinition } from '../types';

export const organizareTour: TourDefinition = {
  id: 'organizare',
  title: 'Organizare',
  autoStartRoute: '/rezidentiat/organizare',
  steps: [
    {
      id: 'organizare-intro',
      title: 'Planul tău pentru rezidențiat',
      body: 'Patru treceri prin materie, topicuri aranjate pe săptămâni și zilele rămase până la examen. Un tur scurt prin pagină.',
      icon: <Compass size={22} />,
      placement: 'center',
      route: '/rezidentiat/organizare',
      accent: '#0A84FF',
    },
    {
      id: 'organizare-exam',
      title: 'Spune-i când e examenul',
      body: 'Data e o estimare, dar planul se aliniază după ea. O poți schimba oricând.',
      icon: <CalendarDays size={22} />,
      target: '[data-tutorial="organizare-exam"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/rezidentiat/organizare',
      accent: '#FF9F0A',
    },
    {
      id: 'organizare-panel',
      title: 'Cum stai acum',
      body: 'Zilele rămase, topicurile terminate și progresul trecerii curente, dintr-o privire. Mai jos vezi ce urmează.',
      icon: <CalendarClock size={22} />,
      target: '[data-tutorial="organizare-panel"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/rezidentiat/organizare',
      accent: '#30D158',
    },
    {
      id: 'organizare-tabs',
      title: 'Cinci secțiuni',
      body: 'Panou pentru imaginea de ansamblu, Topicuri pentru bifat, Săptămâni pentru calendar, Ritm zilnic și un Ghid. Progresul se salvează singur.',
      icon: <LayoutGrid size={22} />,
      target: '[data-tutorial="organizare-tabs"]',
      targetPadding: 4,
      placement: 'bottom',
      route: '/rezidentiat/organizare',
      accent: '#BF6FFF',
    },
  ],
};
