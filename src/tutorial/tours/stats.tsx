import { BarChart3, Target, CalendarCheck, Brain } from 'lucide-react';
import type { TourDefinition } from '../types';

export const statsTour: TourDefinition = {
  id: 'stats', title: 'Performanță',
  steps: [
    {
      id: 'stats-intro', title: 'Citește progresul în context',
      body: (ctx) => ctx.quizCount === 0
        ? 'Adaugă o grilă și începe să studiezi pentru a construi progresul. Dacă nu ai sesiuni înregistrate, pagina îți arată de unde poți începe; cifrele se completează pe măsură ce lucrezi.'
        : 'Pagina adună ritmul, acuratețea și timpul de studiu. Dacă încă nu ai sesiuni înregistrate, începe un set de întrebări; simpla existență a unei grile nu înseamnă că ai studiat-o.',
      icon: <BarChart3 size={22} />, placement: 'center', route: '/stats',
    },
    {
      id: 'stats-summary', title: 'Sesiuni, acuratețe și timp',
      body: 'Rezumatul arată numărul sesiunilor, acuratețea globală și orele de studiu înregistrate. Citește procentul împreună cu istoricul: câteva răspunsuri oferă mai puțin context decât mai multe sesiuni.',
      icon: <Target size={22} />, target: '[data-tutorial="stats-summary"]', placement: 'bottom', route: '/stats',
    },
    {
      id: 'stats-activity', title: 'Urmărește consecvența',
      body: 'Harta de activitate acoperă 90 de zile, iar graficul următor arată ultimele 14 zile. Mai jos găsești tendința acurateței și rezultatele pe grile, atunci când există date pentru ele.',
      icon: <CalendarCheck size={22} />, target: '[data-tutorial="stats-activity"]', placement: 'bottom', optional: true, route: '/stats',
    },
    {
      id: 'stats-ai', title: 'O direcție pentru studiul următor',
      body: (ctx) => ctx.aiReady
        ? 'Ce nu știu? poate genera un raport AI din greșeli, categorii și progres. Analiza pornește când apeși Analizează; folosește recomandările împreună cu rezultatele tale, apoi alege ce repeți.'
        : 'Statisticile și graficele funcționează fără AI. Pentru raportul Ce nu știu?, configurează furnizorul ales în Setări › AI. Ghidul nu generează rapoarte și nu schimbă rezultatele.',
      icon: <Brain size={22} />, placement: 'center', route: '/stats',
    },
  ],
};
