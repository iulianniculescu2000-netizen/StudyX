import type { TourContext } from './types';

export const aiStatus = (ctx: TourContext): string => ctx.aiReady
  ? 'Furnizorul ales are o cheie salvată.'
  : 'Configurează furnizorul ales în Setări › AI înainte de a cere generare sau răspunsuri AI.';

export function libraryStatus(ctx: TourContext): string {
  if (ctx.sourceCount === 0) return 'Biblioteca este goală. Adaugă un curs și așteaptă starea Gata înainte să îl folosești în chat sau Studio.';
  return `${ctx.readySourceCount} documente gata, ${ctx.indexingSourceCount} în indexare și ${ctx.failedSourceCount} cu eroare. ${ctx.readySourceCount > 0 ? 'AI poate folosi documentele gata.' : 'Așteaptă un document gata înainte de a cere răspunsuri din bibliotecă.'}${ctx.failedSourceCount > 0 ? ' Citește mesajul documentului cu eroare pentru următorul pas.' : ''}`;
}

export function cardStatus(ctx: TourContext): string {
  return `${ctx.generalDueCardCount} carduri scadente și ${ctx.generalNewCardCount} carduri noi. ${ctx.generalDueCardCount + ctx.generalNewCardCount > 0 ? 'Sesiunea le adună; o pornești când ești gata.' : 'Nu ai carduri de repetat acum. Revino mai târziu sau adaugă un pachet.'}`;
}
