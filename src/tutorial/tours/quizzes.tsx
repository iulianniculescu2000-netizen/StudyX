import { plural } from '../../lib/plural';
import { libraryStatus, aiStatus } from '../contextText';
import { BookOpen, Filter, MousePointerClick, Plus, Upload } from 'lucide-react';
import type { TourDefinition } from '../types';

export const quizzesTour: TourDefinition = {
  id: 'quizzes',
  title: 'Grilele tale',
  steps: [
    {
      id: 'quizzes-intro',
      title: 'Biblioteca ta de grile',
      body: (ctx) => ctx.quizCount === 0 ? 'Nu ai grile încă. Folosește Grilă nouă pentru editor sau Import grile pentru un fișier JSON.' : `Ai ${plural(ctx.quizCount, 'grilă', 'grile')} în profil. Caută după titlu sau filtrează lista pentru a găsi setul dorit.`,
      icon: <BookOpen size={22} />,
      placement: 'center',
      route: '/quizzes',
      accent: '#0A84FF',
    },
    {
      id: 'quizzes-add',
      title: 'Grilă nouă sau import',
      body: '„Grilă nouă” deschide editorul. „Import grile” aduce un fișier .json primit de la un coleg sau exportat din StudyX.',
      icon: <Plus size={22} />,
      target: '[data-tutorial="quizzes-actions"]',
      targetPadding: 8,
      placement: 'bottom',
      route: '/quizzes',
      accent: '#30D158',
    },
    {
      id: 'quizzes-filters',
      title: 'Caută și filtrează',
      body: 'Cauți după titlu, descriere sau subiect, filtrezi după categorie sau etichetă și ordonezi după nume, număr de întrebări sau scor maxim.',
      icon: <Filter size={22} />,
      target: '[data-tutorial="quizzes-filters"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/quizzes',
      accent: '#FF9F0A',
    },
    {
      id: 'quizzes-card',
      when: (ctx) => ctx.quizCount > 0,
      title: 'O grilă, la îndemână',
      body: 'Apeși pe grilă ca să vezi detaliile și să alegi modul de lucru. Cu mouse-ul deasupra apar „Joacă”, fixarea sus, editarea și ștergerea (cu confirmare).',
      icon: <MousePointerClick size={22} />,
      target: '[data-tutorial="quiz-card"]',
      targetPadding: 6,
      placement: 'right',
      route: '/quizzes',
      accent: '#BF6FFF',
      optional: true,
    },
    {
      id: 'quizzes-more',
      title: 'Ai cursuri, nu grile gata făcute?',
      body: (ctx) => `${libraryStatus(ctx)} ${aiStatus(ctx)}`,
      icon: <Upload size={22} />,
      placement: 'center',
      accent: '#64D2FF',
    },
  ],
};
