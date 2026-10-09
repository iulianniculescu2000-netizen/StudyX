import type { Question } from '../../types';
import { evaluateSelection, getCorrectOptionIds, isCorrectSelection } from './helpers';

export type AnswerMap = Record<string, string[]>;

/** Fully correct count + ids of questions answered partially right (multi-select, nothing wrong picked). */
export function scoreAnswers(questions: Question[], answers: AnswerMap): { score: number; partialAnswerIds: string[] } {
  let score = 0;
  const partialAnswerIds: string[] = [];
  for (const q of questions) {
    const selected = answers[q.id] ?? [];
    const correctIds = getCorrectOptionIds(q.options);
    if (isCorrectSelection(selected, correctIds)) score += 1;
    if (evaluateSelection(selected, correctIds) === 'partial') partialAnswerIds.push(q.id);
  }
  return { score, partialAnswerIds };
}

/**
 * Rezidențiat scoring: +1 per fully correct question, -0.25 per wrong option selected,
 * unanswered questions are neutral. Net total is rounded to 2 decimals and clamped at 0.
 */
export function penalizedScore(questions: Question[], answers: AnswerMap): number {
  let net = 0;
  for (const q of questions) {
    const selected = answers[q.id] ?? [];
    if (selected.length === 0) continue;
    const correctIds = getCorrectOptionIds(q.options);
    if (isCorrectSelection(selected, correctIds)) {
      net += 1;
    } else {
      net -= selected.filter((id) => !correctIds.includes(id)).length * 0.25;
    }
  }
  return Math.max(0, Math.round(net * 100) / 100);
}
