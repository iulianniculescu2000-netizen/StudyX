import { Trophy, ListChecks, Repeat2, BookOpen } from 'lucide-react';
import type { TourDefinition, TourStep } from '../types';

const inResults = (pathname: string) => /^\/results\/[^/]+$/.test(pathname);
const contextual = (step: TourStep): TourStep[] => [
  { ...step, when: (ctx) => inResults(ctx.pathname), optional: true },
  { ...step, id: `${step.id}-overview`, target: undefined, placement: 'center', when: (ctx) => !inResults(ctx.pathname) },
];

export const quizResultsTour: TourDefinition = {
  id: 'quizResults', title: 'Rezultatele unei grile',
  steps: [
    { id: 'quiz-results-intro', title: 'Înțelege rezultatul sesiunii',
      body: (ctx) => inResults(ctx.pathname)
        ? 'Rezultatul descrie sesiunea afișată. Citește scorul împreună cu modul de notare și răspunsurile; ghidul nu creează o altă sesiune.'
        : 'După încheierea unei grile deschizi rezultatele și poți relua acest ghid cu ?. Din Setări citești explicațiile fără să deschizi un rezultat sau să pornești o sesiune.',
      icon: <Trophy size={22} />, placement: 'center' },
    ...contextual({ id: 'quiz-results-score', title: 'Scor, timp și progres',
      body: 'Rezumatul arată scorul și timpul sesiunii. Procentul principal arată scorul sesiunii raportat la total. Pentru grilele cu penalizare citește separat „Scor net Rezidențiat” și regula afișată lângă el.',
      icon: <Trophy size={22} />, target: '[data-tutorial="quiz-results-score"]', placement: 'bottom' }),
    ...contextual({ id: 'quiz-results-answers', title: 'Revizuiește răspunsurile',
      body: 'În Revizuire răspunsuri compari selecția ta cu răspunsul corect și citești explicația disponibilă. Explicațiile AI sunt opționale și necesită configurarea unui furnizor.',
      icon: <ListChecks size={22} />, target: '[data-tutorial="quiz-results-answers"]', placement: 'top' }),
    ...contextual({ id: 'quiz-results-next', title: 'Alege următorul pas',
      body: 'Continuă inteligent oferă flashcarduri din greșeli, recuperare sau simulare adaptivă, după datele disponibile. Aceste acțiuni creează materiale sau sesiuni doar când le apeși. Poți și să revii la grile.',
      icon: <Repeat2 size={22} />, target: '[data-tutorial="quiz-results-next"]', placement: 'top' }),
    { id: 'quiz-results-finish', title: 'Revino când ai nevoie',
      body: 'Ghidul rămâne disponibil pe pagina rezultatelor și în Setări › Ajutor. O sesiune fără rezultat salvat nu are un raport de deschis; începe din grile când vrei să exersezi din nou.',
      icon: <BookOpen size={22} />, placement: 'center' },
  ],
};
