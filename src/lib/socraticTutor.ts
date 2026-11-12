import { buildSocraticTutorSystem, SOCRATIC_WRAP_UP_REQUEST, type SocraticCase } from '../ai/promptKit';
import type { ErrorEntry } from './errorNotebook';
import { distractorExplanationHints, distractorTagHints, normalizeErrorType, type ErrorTypeId } from './errorTypes';
import type { GroqMessage } from './groq';

/** Câte răspunsuri ale studentului adună tutorul înainte să ceară încheierea. */
export const MAX_STUDENT_TURNS = 3;

export interface SocraticTurn {
  role: 'assistant' | 'student';
  text: string;
}

export interface SocraticVerdict {
  type: ErrorTypeId;
  reason: string;
}

/** Cazul pentru prompt: enunț, variante cu cheia, explicația și indiciile despre distractori (tag-uri + explicație). */
export function socraticCaseFor(entry: Pick<ErrorEntry, 'question'>): SocraticCase {
  const { question } = entry;
  return {
    question: question.text,
    options: question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
    explanation: question.explanation,
    distractorTags: distractorTagHints(question),
    distractorReasons: distractorExplanationHints(question),
  };
}

export function buildSocraticMessages(entry: Pick<ErrorEntry, 'question'>, turns: readonly SocraticTurn[]): GroqMessage[] {
  const messages: GroqMessage[] = [
    { role: 'system', content: buildSocraticTutorSystem(socraticCaseFor(entry)) },
    { role: 'user', content: 'Începem. Pune prima întrebare.' },
  ];
  for (const turn of turns) {
    messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: turn.text });
  }
  if (turns.filter((turn) => turn.role === 'student').length >= MAX_STUDENT_TURNS) {
    messages.push({ role: 'user', content: SOCRATIC_WRAP_UP_REQUEST });
  }
  return messages;
}

/** Caută obiectul de concluzie în răspuns; un tip necunoscut nu se acceptă (studentul îl alege atunci manual). */
export function parseSocraticVerdict(text: string): SocraticVerdict | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { tip?: unknown; motiv?: unknown };
    const type = normalizeErrorType(parsed.tip);
    if (!type) return null;
    const reason = typeof parsed.motiv === 'string' ? parsed.motiv.trim().slice(0, 300) : '';
    return { type, reason };
  } catch {
    return null;
  }
}

export type SocraticStep =
  | { kind: 'question'; text: string }
  | { kind: 'verdict'; verdict: SocraticVerdict }
  /** Concluzia cerută, dar nevalidă: studentul alege tipul singur. */
  | { kind: 'manual'; text: string };

/** Un pas al dialogului: următoarea întrebare sau concluzia. Aruncă erori de rețea/cheie, apelantul trece pe varianta locală. */
export async function nextSocraticStep(
  entry: Pick<ErrorEntry, 'question'>,
  turns: readonly SocraticTurn[],
  signal?: AbortSignal,
): Promise<SocraticStep> {
  const { groqChat } = await import('./groq');
  const reply = (await groqChat(buildSocraticMessages(entry, turns), 0.4, {
    skipLibraryContext: true,
    maxTokens: 400,
    abortSignal: signal,
  })).trim();
  const verdict = parseSocraticVerdict(reply);
  if (verdict) return { kind: 'verdict', verdict };
  const studentTurns = turns.filter((turn) => turn.role === 'student').length;
  if (studentTurns >= MAX_STUDENT_TURNS) return { kind: 'manual', text: 'Nu am putut stabili singur tipul. Alege-l tu mai jos.' };
  return { kind: 'question', text: reply };
}
