import { CalendarClock, Layers3, Timer, Repeat2 } from 'lucide-react';
import type { TourDefinition } from '../types';

export const crunchTour: TourDefinition = {
  id: 'crunch', title: 'Aproape de examen',
  steps: [
    { id: 'crunch-date', title: 'Verifică data examenului',
      body: 'Numărătoarea inversă folosește data din Organizare. Cardul apare automat pe Panou în ultimele 30 de zile; Arată pe Panou tot timpul îl păstrează vizibil și mai devreme. Ghidul nu schimbă această opțiune.',
      icon: <CalendarClock size={22} />, target: '[data-tutorial="crunch-date"]', placement: 'bottom', route: '/aproape-examen' },
    { id: 'crunch-pool', title: 'Ce intră în recuperare',
      body: (ctx) => ctx.quizCount === 0
        ? 'Ai nevoie de grile și de activitate înregistrată. Sesiunea poate combina întrebări scadente, greșite des și întrebări încă nevăzute din seturi cu acoperire redusă; cifrele arată ce este disponibil acum.'
        : 'Cele trei grupuri sunt întrebări scadente, greșite des și lacune de acoperire. Lacunele pot include întrebări pe care încă nu le-ai văzut din seturi cu acoperire redusă. Citește cifrele fiecărui grup înainte să alegi sesiunea.',
      icon: <Layers3 size={22} />, target: '[data-tutorial="crunch-buckets"]', placement: 'bottom', route: '/aproape-examen' },
    { id: 'crunch-duration', title: 'Alege timpul disponibil',
      body: 'Fiecare opțiune arată durata și întrebările selectate din cele trei grupuri. Numărul folosește ritmul recent sau o valoare implicită când istoricul este insuficient. Apăsarea opțiunii creează și pornește sesiunea; ghidul nu apasă în locul tău.',
      icon: <Timer size={22} />, target: '[data-tutorial="crunch-duration"]', placement: 'top', optional: true, route: '/aproape-examen' },
    { id: 'crunch-finish', title: 'O rundă de consolidare',
      body: 'Sesiunea este marcată ca recuperare și nu intră în Caietul de erori. Dacă nu este nimic disponibil, lucrează mai întâi câteva grile și revino. Poți relua ghidul din Setări › Ajutor.',
      icon: <Repeat2 size={22} />, placement: 'center', route: '/aproape-examen' },
  ],
};
