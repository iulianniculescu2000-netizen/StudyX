import { type AgentActionType } from './types';

export const QUESTION_CONFIRM_THRESHOLD = 80;
// Freeform-topic generation (no matched library course — the model's own
// medical knowledge, not grounded in the user's material) is the case most
// likely to run on a misheard/misread subject. A large batch there is already
// near the per-request maximum, so it never trips the blanket 80-question
// threshold above — this catches it separately, before tokens are spent on
// possibly the wrong topic.
export const TOPIC_CONFIRM_THRESHOLD = 30;
export const DESTRUCTIVE_ACTIONS: AgentActionType[] = ['delete_quiz', 'delete_folder'];

/**
 * Deterministic extraction of quiz counts + question type straight from the
 * user's wording. The LLM planner is unreliable at counting ("3 grile" became
 * "3×10"), so we override its numbers whenever the phrasing is unambiguous.
 *
 * Rules:
 *  - "N grile/întrebări" with NO pack word  → questionsPerPack=N, packCount=1
 *  - "N seturi/pachete"                     → packCount=N
 *  - "N seturi a câte M (grile)"            → packCount=N, questionsPerPack=M
 *  - numbers attached to a name ("Cursul 1") are ignored (not before a keyword)
 */
export interface QuizIntentOverride {
  packCount?: number;
  questionsPerPack?: number;
  questionType?: 'single' | 'multiple';
}

export function extractQuizIntent(command: string): QuizIntentOverride {
  const norm = command
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const result: QuizIntentOverride = {};

  const questionWord = '(?:grile|grila|intrebari|intrebare|quiz)';
  const packWord = '(?:seturi|set|pachete|pachet|batch)';

  const packMatch = norm.match(new RegExp(`(\\d+)\\s+(?:de\\s+)?${packWord}`));
  const perPackMatch = norm.match(/a\s+c(?:a|i)?te\s+(\d+)/);
  const questionMatch = norm.match(new RegExp(`(\\d+)\\s+(?:de\\s+)?${questionWord}`));

  const packCount = packMatch ? Number(packMatch[1]) : null;
  const perPack = perPackMatch ? Number(perPackMatch[1]) : null;
  const questionCount = questionMatch ? Number(questionMatch[1]) : null;

  if (packCount && perPack) {
    result.packCount = packCount;
    result.questionsPerPack = perPack;
  } else if (packCount && questionCount) {
    result.packCount = packCount;
    result.questionsPerPack = questionCount;
  } else if (packCount) {
    result.packCount = packCount;
  } else if (questionCount) {
    // "N grile" with no pack word → exactly N questions in a single set.
    result.packCount = 1;
    result.questionsPerPack = questionCount;
  } else if (perPack) {
    result.questionsPerPack = perPack;
  }

  if (/complement\s+multipl|raspuns(?:uri)?\s+multipl|mai multe raspunsuri (?:corecte)?|multiple? (?:corecte|raspunsuri)/.test(norm)) {
    result.questionType = 'multiple';
  } else if (/complement\s+simpl|un singur raspuns|raspuns unic/.test(norm)) {
    result.questionType = 'single';
  }

  return result;
}
