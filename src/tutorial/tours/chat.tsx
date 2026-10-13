import { plural } from '../../lib/plural';
import { aiStatus } from '../contextText';
import { Bot, ListChecks, Network, Layers3, BookOpen, ShieldCheck } from 'lucide-react';
import type { TourDefinition } from '../types';

/** Manual and without routes: replaying help preserves the current chat, panel and draft. */
export const chatTour: TourDefinition = {
  id: 'chat', title: 'Chat AI',
  steps: [
    { id: 'chat-open', title: 'Ajutor când ai nevoie',
      body: (ctx) => `${aiStatus(ctx)} Poți cere explicații, grile, flashcarduri sau scheme. Ghidul explică opțiunile; nu trimite mesaje și nu pornește generări.`,
      icon: <Bot size={22} />, target: '[data-tutorial="ai-chat-button"]', targetPadding: 8, placement: 'left', accent: '#BF6FFF' },
    { id: 'chat-options', title: 'Modul răspunsului și setările materialului',
      body: 'Auto alege forma răspunsului; modul ales manual rămâne până revii la Auto și nu trimite singur mesaje. Pentru grile și flashcarduri, cartea de opțiuni îți permite să alegi subiectul, nivelul, numărul și folderul; generarea pornește după confirmarea ta.',
      icon: <ListChecks size={22} />, placement: 'center', accent: '#0A84FF' },
    { id: 'chat-citations', title: 'Documentele și citările',
      body: (ctx) => `${ctx.readySourceCount > 0 ? `Ai ${plural(ctx.readySourceCount, 'document gata', 'documente gata')} pentru context.` : 'Adaugă un document în Biblioteca AI și așteaptă starea Gata.'} Citările [n] deschid fragmentul folosit; Deschide în carte oferă contextul disponibil. Fără documente gata, răspunsul nu poate fi verificat în biblioteca ta.`,
      icon: <BookOpen size={22} />, placement: 'center' },
    { id: 'chat-studio', title: 'AI Studio lucrează din documente',
      body: (ctx) => `${aiStatus(ctx)} În AI Studio alegi un document Gata, capitolul, numărul de grile și folderul de salvare. Verifică setările înainte să apeși Generează. Fără documente gata, adaugă material în Biblioteca AI și așteaptă indexarea.`,
      icon: <Layers3 size={22} />, placement: 'center' },
    { id: 'chat-cross-check', title: 'Verificare și un alt model',
      body: (ctx) => `${ctx.aiKeyCount > 1 ? 'Ai mai mulți furnizori salvați.' : 'Pentru verificare la alt furnizor, salvează o a doua cheie.'} Verifică cu alt model trimite întrebarea și răspunsul doar când apeși tu. Acordul modelelor nu garantează corectitudinea; citește explicațiile și sursele. La erori, Încearcă din nou și Alt model trimit o nouă cerere.`,
      icon: <ShieldCheck size={22} />, placement: 'center' },
    { id: 'chat-schemas', title: 'Scheme pe care le poți explora',
      body: 'Cere o schemă interactivă și treci cu mouse-ul peste un pas pentru calea lui. Click îl fixează și arată nota; click din nou sau Esc îl eliberează. Poți continua conversația pentru clarificări; fiecare mesaj trimis cere un nou răspuns.',
      icon: <Network size={22} />, placement: 'center', accent: '#30D158' },
  ],
};
