import { CreditCard, RotateCw, ListChecks, Undo2 } from 'lucide-react';
import type { TourDefinition, TourStep } from '../types';

const inSession = (pathname: string) => /^\/flashcards\/session\/[^/]+$/.test(pathname);
const contextual = (step: TourStep): TourStep[] => [
  { ...step, when: (ctx) => inSession(ctx.pathname), optional: true },
  { ...step, id: `${step.id}-overview`, target: undefined, placement: 'center', when: (ctx) => !inSession(ctx.pathname) },
];

/** Manual: replaying from Settings explains the session without opening or rating any cards. */
export const flashcardSessionTour: TourDefinition = {
  id: 'flashcardSession', title: 'Sesiunea de flashcarduri',
  steps: [
    { id: 'fc-session-intro', title: 'Învață înainte să întorci cardul',
      body: (ctx) => inSession(ctx.pathname)
        ? 'Ghidul explică această sesiune. Închide-l înainte să întorci sau să evaluezi carduri; parcurgerea ghidului nu înregistrează răspunsuri.'
        : 'Din Flashcarduri deschide un pachet sau „De repetat azi”, apoi apasă ? în sesiune pentru repere pe ecran. Aici poți citi ghidul fără să pornești o sesiune.',
      icon: <CreditCard size={22} />, placement: 'center' },
    ...contextual({ id: 'fc-session-card', title: 'Întoarce și verifică',
      body: 'Încearcă să răspunzi din memorie. Un click pe fața cardului sau Spațiu îl întoarce. Pe verso citești răspunsul și explicația disponibilă; explicația AI este opțională și pornește la cererea ta.',
      icon: <RotateCw size={22} />, target: '[data-tutorial="fc-session-card"]', placement: 'right' }),
    ...contextual({ id: 'fc-session-rating', title: 'Alege cât de bine ai știut',
      body: 'După întoarcere alegi Greu, Bine sau Ușor, inclusiv cu tastele 1, 2, 3. Evaluarea înregistrează răspunsul și pregătește repetarea următoare. Alege după ce ai reușit să îți amintești.',
      icon: <ListChecks size={22} />, target: '[data-tutorial="fc-session-rating"]', placement: 'top' }),
    { id: 'fc-session-finish', title: 'Progresul și revenirea',
      body: 'Bara de sus arată progresul. Când este disponibil, Anulează revine la ultima evaluare. La final vezi repartizarea Greu/Bine/Ușor; în repetarea de azi, Continuă apare dacă mai sunt carduri scadente. Ghidul poate fi reluat din Setări › Ajutor.',
      icon: <Undo2 size={22} />, placement: 'center' },
  ],
};
