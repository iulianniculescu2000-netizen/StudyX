import { BookOpen, CalendarCheck, Target, GraduationCap } from 'lucide-react';
import type { TourDefinition } from '../types';

export const reviewTour: TourDefinition = {
  id: 'review',
  title: 'Recapitulare inteligentă',
  steps: [
    {
      id: 'review-intro', title: 'Alege ce ai nevoie să repeți',
      body: (ctx) => ctx.quizCount === 0
        ? 'Începe prin a adăuga o grilă și a răspunde la întrebări. Recapitularea folosește istoricul răspunsurilor tale; pachetele de flashcarduri au sesiunea lor separată.'
        : 'Aici alegi între repetarea programată, consolidarea punctelor slabe și pregătirea pentru examen. Ghidul îți prezintă opțiunile; sesiunea începe când alegi tu un mod.',
      icon: <BookOpen size={22} />, placement: 'center', route: '/review',
    },
    {
      id: 'review-due', title: 'Întrebări scadente',
      body: (ctx) => ctx.dueQuizCount > 0
        ? 'Cardul pentru întrebări scadente arată ce este programat pentru repetare. Pornește de aici când vrei să consolidezi ce ai studiat deja.'
        : 'Dacă nu sunt întrebări scadente, această opțiune este dezactivată. Răspunsurile înregistrate la grile construiesc programul de repetare.',
      icon: <CalendarCheck size={22} />, target: '[data-tutorial="review-due"]',
      placement: 'bottom', optional: true, route: '/review',
    },
    {
      id: 'review-weak', title: 'Consolidează punctele slabe',
      body: 'Puncte Slabe reia întrebările dificile. Caietul de erori păstrează greșelile și explicațiile, iar Quiz din Greșeli și recuperarea creează o grilă nouă când le alegi. Opțiunile fără istoric suficient sunt dezactivate.',
      icon: <Target size={22} />, target: '[data-tutorial="review-weak"]',
      placement: 'bottom', optional: true, route: '/review',
    },
    {
      id: 'review-exam', title: 'Antrenează-te pentru examen',
      body: 'Simulare de examen deschide pagina unde alegi condițiile probei. Examen adaptiv creează o grilă după istoricul disponibil. Închide ghidul și alege o opțiune când ești pregătit.',
      icon: <GraduationCap size={22} />, target: '[data-tutorial="review-adaptive-exam"]',
      placement: 'top', optional: true, route: '/review',
    },
  ],
};
