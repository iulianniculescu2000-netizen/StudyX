/**
 * Second-pass medical correctness check for AI-generated questions.
 *
 * `sanitizeGeneratedQuestions` (AIEngine.ts) and `examConformance.ts` both only
 * check FORM — is there a correct option, does it look like a real exam item —
 * never whether the marked-correct answer is actually medically true. A model
 * that generates a fluent, well-formed question with a wrong answer sails
 * straight through both. This asks a second, low-temperature model pass to
 * review the batch as a strict examiner before it ever reaches the student.
 *
 * Deliberately drop-only: a flagged question is removed, never "corrected" —
 * having a second guess silently overwrite the marked answer risks replacing
 * one confidently-wrong answer with another. Fewer, trustworthy questions beat
 * more, unverified ones.
 *
 * Fails open everywhere: no key, a network error, a malformed response, or a
 * mismatched verdict count all result in the original questions passing
 * through unchanged. A broken judge must never be the reason a generation
 * comes back empty — it can only ever remove questions it is confident about.
 */
import type { Question } from '../types';
import { groqRequest } from '../lib/groq';
import { validateJson } from './validator';

export interface MedicalJudgeResult {
  questions: Question[];
  flaggedCount: number;
  /** Short reasons for dropped questions, for surfacing to the user. */
  flaggedReasons: string[];
}

interface JudgeVerdict {
  i: number;
  correct: boolean;
  reason?: string;
}

interface JudgeResponse {
  verdicts?: JudgeVerdict[];
}

const MAX_GROUNDING_CHARS = 6000;
/** Above this, the review prompt itself gets unwieldy; split isn't worth it for a quality pass. */
const MAX_QUESTIONS_PER_CALL = 25;

function letterFor(index: number): string {
  return String.fromCharCode(97 + index);
}

function formatQuestionForReview(question: Question, index: number): string {
  const options = question.options
    .map((option, i) => `${letterFor(i)}) ${option.text}${option.isCorrect ? '  [MARCAT CORECT]' : ''}`)
    .join('\n');
  return `[${index}] Enunț: ${question.text}\nVariante:\n${options}`;
}

function buildJudgePrompt(questions: Question[], groundingText: string | undefined): string {
  const lines = [
    'Ești medic examinator senior. Verifici RIGID corectitudinea medicală a unor grile deja generate, ÎNAINTE ca un student să le vadă. NU genera conținut nou, NU reformula — doar verifică.',
    'Pentru fiecare întrebare, decide dacă varianta/variantele marcate [MARCAT CORECT] sunt cu adevărat corecte din punct de vedere medical (mecanism, criterii de diagnostic, valori de referință, indicații, contraindicații).',
    groundingText
      ? `Ai la dispoziție și sursa din care au fost generate (curs) — folosește-o ca referință principală când e relevantă:\n"""\n${groundingText.slice(0, MAX_GROUNDING_CHARS)}\n"""`
      : 'Nu ai o sursă atașată — verifică pe baza cunoștințelor medicale general acceptate și STABILE.',
    'Marchează "correct": false DOAR când ești sigur că varianta marcată e greșită sau clar depășită medical — NU pentru ambiguități minore de formulare, stil, sau interpretări la limită unde ambele tabere au dreptate.',
    '',
    questions.map((q, i) => formatQuestionForReview(q, i)).join('\n\n'),
    '',
    `Răspunde STRICT cu JSON, fără text în plus, cu exact ${questions.length} intrări în "verdicts" (una per index de mai sus):`,
    '{"verdicts":[{"i":0,"correct":true},{"i":1,"correct":false,"reason":"1 propoziție, ce e greșit medical"}]}',
  ];
  return lines.join('\n');
}

/**
 * Reviews one batch of already-generated questions and drops any the judge is
 * confident are medically wrong. `groundingText` is the same course text (or
 * empty for freeform-topic generation) the generator itself used, so the judge
 * checks against the same ground truth rather than an unrelated one.
 */
export async function verifyQuestionsMedically(
  questions: Question[],
  groundingText: string | undefined,
): Promise<MedicalJudgeResult> {
  const passthrough: MedicalJudgeResult = { questions, flaggedCount: 0, flaggedReasons: [] };
  if (questions.length === 0) return passthrough;

  // A batch bigger than the cap is reviewed in slices so the prompt stays
  // manageable and one bad slice doesn't sink questions it never looked at.
  if (questions.length > MAX_QUESTIONS_PER_CALL) {
    const mid = Math.ceil(questions.length / 2);
    const [first, second] = await Promise.all([
      verifyQuestionsMedically(questions.slice(0, mid), groundingText),
      verifyQuestionsMedically(questions.slice(mid), groundingText),
    ]);
    return {
      questions: [...first.questions, ...second.questions],
      flaggedCount: first.flaggedCount + second.flaggedCount,
      flaggedReasons: [...first.flaggedReasons, ...second.flaggedReasons],
    };
  }

  let raw: string;
  try {
    raw = await groqRequest({
      task: 'analysis',
      messages: [{ role: 'user', content: buildJudgePrompt(questions, groundingText) }],
      temperature: 0,
      maxTokens: Math.min(2200, 300 + questions.length * 60),
      skipLibraryContext: true,
    });
  } catch {
    return passthrough;
  }

  const parsed = validateJson<JudgeResponse>(raw);
  if (!parsed.ok || !Array.isArray(parsed.value?.verdicts)) return passthrough;

  const verdictByIndex = new Map<number, JudgeVerdict>();
  for (const verdict of parsed.value.verdicts) {
    if (verdict && typeof verdict.i === 'number') verdictByIndex.set(verdict.i, verdict);
  }

  const kept: Question[] = [];
  const flaggedReasons: string[] = [];
  questions.forEach((question, index) => {
    const verdict = verdictByIndex.get(index);
    // No verdict for this index (model skipped it) → keep it. The judge can
    // only remove questions it explicitly reviewed and rejected.
    if (!verdict || verdict.correct !== false) {
      kept.push(question);
      return;
    }
    flaggedReasons.push(verdict.reason?.trim() || `Întrebarea „${question.text.slice(0, 60)}…" a fost respinsă de verificarea medicală.`);
  });

  // Refuse to trust a pass that flagged everything — far more likely a prompt/
  // parsing mismatch (e.g. the model answered about the wrong batch) than every
  // single generated question being wrong.
  if (kept.length === 0 && questions.length > 1) return passthrough;

  return { questions: kept, flaggedCount: questions.length - kept.length, flaggedReasons };
}
