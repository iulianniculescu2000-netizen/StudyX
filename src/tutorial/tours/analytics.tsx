import { BarChart3, CalendarDays, Target, Brain } from 'lucide-react';
import type { TourDefinition } from '../types';

export const analyticsTour: TourDefinition = {
  id: 'analytics', title: 'Perspective AI',
  steps: [
    { id: 'analytics-intro', title: 'O estimare, construită din răspunsuri',
      body: (ctx) => ctx.quizCount === 0
        ? 'Adaugă grile și înregistrează răspunsuri pentru a construi estimarea. Prognoza, acoperirea și lacunele sunt calcule locale; fără istoric suficient, pagina arată că datele sunt puține sau lipsesc.'
        : 'Prognoza și lacunele sunt calculate local din răspunsurile tale. Intervalul exprimă incertitudinea estimării; citește și presupunerile afișate. Scorul estimat nu este scorul oficial al examenului.',
      icon: <BarChart3 size={22} />, placement: 'center', route: '/analytics' },
    { id: 'analytics-period', title: 'Alege perioada de analiză',
      body: 'Controlul de sus schimbă fereastra pentru activitatea recentă și ritmul de studiu. Prognoza de examen folosește propriul calcul; schimbarea perioadei nu înseamnă că toate cifrele paginii au aceeași fereastră.',
      icon: <CalendarDays size={22} />, target: '[data-tutorial="analytics-period"]', placement: 'bottom', route: '/analytics' },
    { id: 'analytics-gaps', title: 'Acoperire și puncte de consolidat',
      body: 'Acoperirea arată cât ai parcurs din întrebările cunoscute. Lacunele grupează topicurile cu date suficiente și arată acuratețea, încercările și distanța până la țintă. Vezi și data examenului setată în Organizare.',
      icon: <Target size={22} />, placement: 'center', route: '/analytics' },
    { id: 'analytics-ai', title: 'Cere ajutor pe un topic',
      body: (ctx) => ctx.aiReady
        ? 'La un topic poți deschide grilele potrivite sau cere ajutor AI. AI-ul intervine doar când alegi acea acțiune; ghidul nu trimite cereri și nu modifică rezultatele.'
        : 'Poți consulta estimările și deschide grile fără AI. Pentru ajutor AI pe un topic, configurează furnizorul ales în Setări › AI; calculele locale rămân disponibile fără cheie.',
      icon: <Brain size={22} />, placement: 'center', route: '/analytics' },
  ],
};
