import { BookOpen, ListChecks, Play, CheckCircle } from 'lucide-react';
import type { TourDefinition, TourStep } from '../types';

const inQuiz = (pathname: string) => /^\/(quiz|play)\/[^/]+$/.test(pathname);
const contextual = (step: TourStep): TourStep[] => [
  { ...step, when: (ctx) => inQuiz(ctx.pathname), optional: true },
  { ...step, id: `${step.id}-overview`, target: undefined, placement: 'center', when: (ctx) => !inQuiz(ctx.pathname) },
];

export const quizSessionTour: TourDefinition = {
  id: 'quizSession', title: 'Rezolvarea unei grile',
  steps: [
    { id: 'quiz-session-intro', title: 'Alege cum vrei să exersezi',
      body: (ctx) => ctx.pathname.startsWith('/play/')
        ? 'Ghidul explică rezolvarea. În modurile cu timp limitat cronometrul continuă și cât timp citești ghidul; închide-l înainte să răspunzi.'
        : 'Din Grile deschide un set și alege Studiu sau Simulare Examen. Acest ghid poate fi citit și din Setări; nu pornește o sesiune și nu trimite răspunsuri.',
      icon: <BookOpen size={22} />, placement: 'center' },
    ...contextual({ id: 'quiz-session-controls', title: 'Modul și progresul',
      body: 'Studiu arată feedback pe parcurs. Simulare Examen păstrează evaluarea pentru final. Citește modul și timpul afișate; progresul îți arată unde ai ajuns. Opțiunile disponibile depind de set și de modul ales.',
      icon: <Play size={22} />, target: '[data-tutorial="quiz-session-controls"]', placement: 'bottom' }),
    ...contextual({ id: 'quiz-session-answer', title: 'Selectează și confirmă',
      body: 'Citește enunțul și verifică dacă are răspunsuri multiple. În Studiu selectezi variantele și apeși Verifică. În Examen, un răspuns unic trece imediat mai departe; răspunsurile multiple se confirmă. Urmează eticheta butonului pentru a continua.',
      icon: <ListChecks size={22} />, target: '[data-tutorial="quiz-session-question"]', placement: 'top' }),
    { id: 'quiz-session-feedback', title: 'Folosește feedbackul',
      body: 'În Studiu citește explicația după verificare și evaluează cât de sigur ai fost, dacă apar controalele de încredere. În Examen evaluarea vine la final. La rezultate poți revizui răspunsurile și alege următorul pas. Ghidul este reluabil din Setări › Ajutor.',
      icon: <CheckCircle size={22} />, placement: 'center' },
  ],
};
