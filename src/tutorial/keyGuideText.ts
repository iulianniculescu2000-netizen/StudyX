import { providerName } from '../lib/ai/providerCatalog';

/** What the guide says for a given number of saved keys. No limits are quoted: the provider's page has the current ones. */
export function keyGuideIntro(keyCount: number, providers: string[]): string {
  if (keyCount === 0) {
    return 'Fără AI merg grilele, flashcardurile și repetarea. Cu AI primești generare de carduri și grile, chat și agent. Durează aproximativ 2 minute: alegi un furnizor, îți faci un cont (fără card), copiezi cheia și o lipești aici.';
  }
  if (keyCount === 1) {
    return `Ai ${providerName(providers[0])}. Merge, dar limita gratuită pe minut se atinge repede la cursuri mari. Adaugă o a doua cheie: când prima e plină, StudyX trece singur pe următoarea.`;
  }
  return `Ai ${keyCount} chei: ${providers.map(providerName).join(', ')}. Când limita unui furnizor se atinge, aplicația continuă pe următorul, fără să faci nimic.`;
}
