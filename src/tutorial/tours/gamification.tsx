import { Trophy, Target, TrendingUp, Calculator } from 'lucide-react';
import type { TourDefinition } from '../types';

export const gamificationTour: TourDefinition = {
  id: 'gamification', title: 'Realizări',
  steps: [
    { id: 'gamification-intro', title: 'Progresul tău, din activitatea reală',
      body: (ctx) => ctx.quizCount + ctx.deckCount === 0
        ? 'Începe cu un set creat sau importat și o sesiune de studiu. Nivelul, punctele și realizările se construiesc din activitatea înregistrată; această pagină nu generează premii prin AI.'
        : 'Nivelul, punctele, seria și realizările se calculează din activitatea ta înregistrată. O realizare câștigată rămâne a ta, iar nivelul nu scade sub cea mai mare valoare atinsă.',
      icon: <Trophy size={22} />, placement: 'center', route: '/gamification' },
    { id: 'gamification-tabs', title: 'Realizări și provocări',
      body: 'Realizări arată ce ai câștigat și ce mai ai de îndeplinit. Provocări urmărește sesiunile de grile încheiate în ultimele șapte zile calendaristice; progresul lor se recalculează din datele curente.',
      icon: <Target size={22} />, target: '[data-tutorial="gamification-tabs"]', placement: 'bottom', optional: true, route: '/gamification' },
    { id: 'gamification-self', title: 'Compară-te cu propriul ritm',
      body: 'Tu vs. tine compară activitatea ta recentă cu perioada precedentă. Închide ghidul pentru a schimba secțiunea și a explora cifrele; comparația reflectă ce ai înregistrat în aplicație.',
      icon: <TrendingUp size={22} />, target: '[data-tutorial="gamification-tab-self"]', placement: 'bottom', optional: true, route: '/gamification' },
    { id: 'gamification-formula', title: 'Vezi cum se calculează',
      body: 'La finalul paginii, Cum se calculează explică nivelul, punctele, sesiunile impecabile și provocările. Seria curentă reprezintă zile consecutive de studiu și revine la zero dacă sari o zi.',
      icon: <Calculator size={22} />, placement: 'center', route: '/gamification' },
  ],
};
