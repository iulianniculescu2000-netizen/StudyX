import { BookMarked, Repeat2, Search, Sparkles } from 'lucide-react';
import type { TourDefinition } from '../types';

export const errorsTour: TourDefinition = {
  id: 'errors',
  title: 'Caiet de erori',
  autoStartRoute: '/erori',
  steps: [
    {
      id: 'errors-intro',
      title: 'Învață din ce ai greșit',
      body: 'Caietul adună grilele la care ai greșit, pe discipline, cu explicațiile lor. Când le fixezi, dispar de aici.',
      icon: <BookMarked size={22} />,
      placement: 'center',
      route: '/erori',
      accent: '#FF453A',
    },
    {
      id: 'errors-toolbar',
      title: 'Caută și ordonează',
      body: 'Găsești repede o greșeală după text. O poți ordona după cât de des ai greșit-o, după acuratețe sau după cât de recentă e.',
      icon: <Search size={22} />,
      target: '[data-tutorial="errors-toolbar"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/erori',
      accent: '#0A84FF',
    },
    {
      id: 'errors-entry',
      title: 'Deschide o greșeală',
      body: 'Apeși pe o întrebare și vezi varianta corectă și explicația. Cu „Explică-mi” sau „3 grile similare” ceri ajutorul AI-ului, ca să fixezi ideea.',
      icon: <Sparkles size={22} />,
      target: '[data-tutorial="errors-entry"]',
      targetPadding: 4,
      placement: 'bottom',
      route: '/erori',
      accent: '#BF6FFF',
    },
    {
      id: 'errors-practice',
      title: 'Repetă într-un test scurt',
      body: 'Un test făcut din greșelile tale, ca să le exersezi pe loc. După trei răspunsuri corecte la rând, o greșeală se închide singură.',
      icon: <Repeat2 size={22} />,
      target: '[data-tutorial="errors-practice"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/erori',
      accent: '#30D158',
    },
  ],
};
