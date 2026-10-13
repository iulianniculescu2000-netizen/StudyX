import { libraryStatus, aiStatus } from '../contextText';
import { Database, Layers3, Plus, Search } from 'lucide-react';
import type { TourDefinition } from '../types';

export const vaultTour: TourDefinition = {
  id: 'vault',
  title: 'Biblioteca AI',
  autoStartRoute: '/vault',
  steps: [
    {
      id: 'vault-intro',
      title: 'Biblioteca AI',
      body: (ctx) => libraryStatus(ctx),
      icon: <Database size={22} />,
      placement: 'center',
      route: '/vault',
      accent: '#64D2FF',
    },
    {
      id: 'vault-add',
      title: 'Adaugă un document',
      body: (ctx) => ctx.indexingSourceCount > 0 ? 'Documentele încă se indexează. Așteaptă starea Gata înainte să le folosești; poți adăuga și alte PDF-uri, DOCX, texte sau poze.' : ctx.failedSourceCount > 0 ? 'Pentru documentele cu eroare, citește mesajul afișat și reîncarcă fișierul dacă indexarea a fost întreruptă.' : 'Adaugă un PDF, DOCX, text sau poze. Așteaptă starea Gata înainte să folosești documentul în AI.',
      icon: <Plus size={22} />,
      target: '[data-tutorial="vault-add"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/vault',
      accent: '#0A84FF',
    },
    {
      id: 'vault-search',
      title: 'Caută în tot ce ai adăugat',
      body: 'Căutarea ignoră diacriticele, deci „sarcina” găsește și „sarcină”. Într-un folder poți filtra după tip.',
      icon: <Search size={22} />,
      target: '[data-tutorial="vault-search"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/vault',
    },
    {
      id: 'vault-studio',
      title: 'AI Studio',
      body: (ctx) => `${aiStatus(ctx)} ${ctx.readySourceCount > 0 ? 'În Studio alegi un document gata, capitolul și folderul. Verifică opțiunile înainte să pornești generarea.' : 'Studio are nevoie de un document gata. Adaugă unul și așteaptă indexarea.'}`,
      icon: <Layers3 size={22} />,
      target: '[data-tutorial="vault-studio"]',
      targetPadding: 6,
      placement: 'bottom',
      route: '/vault',
      accent: '#BF6FFF',
    },
  ],
};
