import type { AIContextPayload } from '../../ai/types';
import { lacksSubject } from '../../components/ai-chat/retrievalQuery';

const MAX_ANSWER_CHARS = 6000;
const MAX_SUBJECT_CHARS = 160;

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const CONTINUATION = /^\s*continu[aă]/i;

/** Primul titlu markdown sau prima linie în bold din răspuns: numele real al subiectului, fără abrevieri ambigue. */
function headingOf(answer: string): string {
  const line = answer.split('\n').map((l) => l.trim()).find((l) => /^#{1,4}\s+\S/.test(l) || /^\*\*[^*]{3,}\*\*:?$/.test(l));
  return line ? clean(line.replace(/^#{1,4}\s+/, '').replace(/\*\*/g, '').replace(/:$/, '')) : '';
}

export interface AnswerQuizRequest {
  subject: string;
  prefetchedContext: AIContextPayload;
}

/**
 * „Fă quiz” dintr-un răspuns din chat: grilele trebuie să fie despre ce a explicat asistentul, nu despre ce găsește
 * căutarea în bibliotecă pe textul cererii. Răspunsul devine materialul de referință (fără RAG), iar cererea
 * studentului și titlul răspunsului numesc subiectul, ca o abreviere ca „AR” să nu se mute pe altă patologie.
 */
export function buildAnswerQuizRequest(userPrompt: string, answer: string): AnswerQuizRequest {
  const material = answer.trim().slice(0, MAX_ANSWER_CHARS);
  // „mai simplu”, „da”, „Continuă exact de unde ai rămas…” nu sunt subiecte: subiectul se ia din răspunsul însuși.
  const askedRaw = clean(userPrompt).slice(0, MAX_SUBJECT_CHARS);
  const asked = askedRaw && !lacksSubject(askedRaw) && !CONTINUATION.test(askedRaw) ? askedRaw : '';
  const heading = headingOf(material);
  const subject = asked && heading && !asked.toLowerCase().includes(heading.toLowerCase())
    ? `${asked} (${heading})`.slice(0, MAX_SUBJECT_CHARS * 2)
    : asked || heading || clean(material).slice(0, MAX_SUBJECT_CHARS);
  return {
    subject,
    prefetchedContext: {
      query: subject,
      summary: `Răspunsul asistentului la cererea „${asked || subject}”, singurul material de referință:\n\n${material}`,
      chunks: [],
      weakTopics: [],
    },
  };
}

const MAX_TITLE_CHARS = 52;

/**
 * Titlul setului făcut din chat: subiectul, nu „Test din chat · data” (zeci de seturi cu același nume nu se mai deosebeau).
 * Fără subiect rămâne titlul vechi cu data.
 */
export function chatQuizTitle(subject: string, now: Date = new Date()): string {
  const cleaned = clean(subject).replace(/[?!.:;,\s]+$/u, '');
  if (cleaned.length < 3) return `Test din chat · ${now.toLocaleDateString('ro-RO')}`;
  const capitalised = cleaned.charAt(0).toLocaleUpperCase('ro-RO') + cleaned.slice(1);
  if (capitalised.length <= MAX_TITLE_CHARS) return capitalised;
  const cut = capitalised.slice(0, MAX_TITLE_CHARS);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > 24 ? cut.slice(0, atWord) : cut).replace(/[,;:\s]+$/u, '')}…`;
}
