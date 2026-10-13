import { plural } from '../../lib/plural';
import { aiStatus } from '../contextText';
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
      body: (ctx) => ctx.errorCount === 0 ? 'Nu ai greșeli deschise. Caietul se completează din răspunsurile greșite înregistrate; greșelile fixate nu mai apar în lista curentă.' : `Ai ${plural(ctx.errorCount, 'greșeală deschisă', 'greșeli deschise')}. Deschide o întrebare pentru răspunsul corect și explicație.`,
      icon: <BookMarked size={22} />,
      placement: 'center',
      route: '/erori',
      accent: '#FF453A',
    },
    {
      id: 'errors-toolbar',
      when: (ctx) => ctx.errorCount > 0,
      optional: true,
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
      when: (ctx) => ctx.errorCount > 0,
      optional: true,
      title: 'Deschide o greșeală',
      body: (ctx) => `${aiStatus(ctx)} Deschide întrebarea pentru explicația salvată. Explică-mi și 3 grile similare trimit cereri AI doar când apeși tu.`,
      icon: <Sparkles size={22} />,
      target: '[data-tutorial="errors-entry"]',
      targetPadding: 4,
      placement: 'bottom',
      route: '/erori',
      accent: '#BF6FFF',
    },
    {
      id: 'errors-practice',
      when: (ctx) => ctx.errorCount > 0,
      optional: true,
      title: 'Repetă într-un test scurt',
      body: (ctx) => `Ai ${plural(ctx.errorCount, 'greșeală', 'greșeli')} de exersat. Testul pornește doar când apeși tu. După trei răspunsuri corecte la rând, greșeala se închide.`,
      icon: <Repeat2 size={22} />,
      target: '[data-tutorial="errors-practice"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/erori',
      accent: '#30D158',
    },
  ],
};
