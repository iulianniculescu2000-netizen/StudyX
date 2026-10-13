import { CalendarCheck, Clock, Play, Repeat2 } from 'lucide-react';
import type { TourDefinition } from '../types';

export const dailyTour: TourDefinition = {
  id: 'daily',
  title: 'Sesiune zilnică',
  steps: [
    {
      id: 'daily-intro', title: 'Repetarea programată pentru azi',
      body: (ctx) => ctx.quizCount === 0
        ? 'Sesiunea zilnică se construiește din grilele la care ai răspuns. Adaugă o grilă, studiază întrebările și revino aici când sunt programate pentru repetare. Flashcardurile se repetă în pagina lor.'
        : 'Sesiunea zilnică adună întrebările din grile programate pentru repetare. Dacă pagina spune că ești la zi, poți continua în alt mod de studiu și reveni când apar întrebări scadente.',
      icon: <CalendarCheck size={22} />, placement: 'center', route: '/daily-review',
    },
    {
      id: 'daily-summary', title: 'Vezi cât ai de repetat',
      body: 'Numărul de întrebări și timpul estimat apar înainte de sesiune. Estimarea folosește aproximativ 30 de secunde pe întrebare; poți lucra în ritmul tău.',
      icon: <Clock size={22} />, target: '[data-tutorial="daily-summary"]',
      placement: 'bottom', optional: true, route: '/daily-review',
    },
    {
      id: 'daily-start', title: 'Pornește când ești pregătit',
      body: 'Începe sesiunea fixează lista de întrebări pentru această rundă. Ghidul nu apasă butonul. La răspuns unic, alegerea verifică imediat răspunsul; la răspuns multiplu, selectezi opțiunile și apoi verifici.',
      icon: <Play size={22} />, target: '[data-tutorial="daily-start"]',
      placement: 'top', optional: true, route: '/daily-review',
    },
    {
      id: 'daily-schedule', title: 'Răspunsurile pregătesc repetarea următoare',
      body: 'După verificare poți citi răspunsul corect și explicația disponibilă. Răspunsul se înregistrează și ajustează programul de repetare. La final vezi rezultatul sesiunii. Poți relua acest ghid din Setări › Ajutor.',
      icon: <Repeat2 size={22} />, placement: 'center', route: '/daily-review',
    },
  ],
};
