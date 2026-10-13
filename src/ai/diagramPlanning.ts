/** Small request-specific hints; they describe layout, never invent medical facts. */
export type DiagramIntent = 'classification' | 'sequence' | 'decision' | 'general';

function foldRomanian(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function diagramIntent(message?: string): DiagramIntent {
  const text = foldRomanian(message ?? '');
  if (/\b(clasific\w*|form\w*|tipur\w*|variant\w*|subtip\w*|categor\w*|manifestar\w*)\b/.test(text)) return 'classification';
  if (/\b(algoritm\w*|decizi\w*|conduit\w*|diagnostic\w*|tratament\w*|daca\b|cand\b)/.test(text)) return 'decision';
  if (/\b(etap\w*|stadi\w*|cronologi\w*|evoluti\w*|mecanism\w*|succesiun\w*)\b/.test(text)) return 'sequence';
  return 'general';
}

const HINTS: Record<DiagramIntent, string> = {
  classification: 'ARANJAMENT: clasificare cu o singură rădăcină și ramuri distincte; pentru fiecare formă, cel mult 1-2 indicii scurte. Nu lega formele între ele ca etape.',
  decision: 'ARANJAMENT: pornește de la întrebarea sau situația clinică; marchează deciziile cu ? și ramurile da> / nu>; păstrează criteriul pe ramura corectă.',
  sequence: 'ARANJAMENT: un traseu în ordine cauzală sau temporală, cu săgeți; folosește ramuri numai când sunt alternative reale.',
  general: 'ARANJAMENT: alege mai întâi relația corectă dintre concepte (clasificare, succesiune sau decizie); o singură rădăcină clară, fără ramuri decorative.',
};

export function diagramLayoutHint(message?: string): string {
  return HINTS[diagramIntent(message)];
}
