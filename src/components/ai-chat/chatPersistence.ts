import type { ChatMessage } from './shared';

/** Un mesaj de asistent fără text și fără altceva de arătat (card, job, buton) e un placeholder de streaming rămas pe loc. */
function isEmptyPlaceholder(message: ChatMessage): boolean {
  return message.role === 'assistant'
    && !message.content.trim()
    && !message.optionCard
    && !message.agentJobId
    && !message.openRoute;
}

/**
 * Ce se salvează și ce se reîncarcă din conversație. Chatul adaugă un mesaj gol de asistent înainte de primul token;
 * dacă aplicația se închide, rețeaua cade sau cererea nu se termină, acel placeholder (cu sursele lui) ajungea în istoric
 * și reapărea ca „răspuns” fără text, cu o animație de așteptare și surse fără legătură.
 */
export function persistableMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => !isEmptyPlaceholder(message));
}
