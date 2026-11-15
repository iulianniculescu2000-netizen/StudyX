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
 *
 * Al doilea model: când există cheie și la alt furnizor decât cel care tocmai a generat grilele, verificarea
 * rulează acolo (un model care își verifică propria grilă repetă aceeași greșeală). Dacă acel furnizor nu
 * răspunde, verificarea cade pe lanțul obișnuit, ca până acum.
 */
import type { Question } from '../types';
import { getLastServedModel, groqRequest } from '../lib/groq';
import { getConfiguredProviderModels, useAIStore } from '../store/aiStore';
import { useAIUsageStore } from '../store/aiUsageStore';
import { pickVerifier, type CloudModelRef } from '../lib/ai/crossCheck';
import { validateJson } from './validator';
import { VERIFIER_MATERIAL_RULE } from './promptKit';

export interface MedicalJudgeResult {
  questions: Question[];
  flaggedCount: number;
  /** Short reasons for dropped questions, for surfacing to the user. */
  flaggedReasons: string[];
  /** `true` doar când verificatorul chiar a dat verdicte; `false`/absent = grilele au trecut neverificate (fără cheie, eroare, răspuns gol). */
  checked?: boolean;
}

interface JudgeVerdict {
  i: number;
  correct: boolean;
  reason?: string;
  /** Literele distractorilor evident implauzibili (absurzi, din altă clasă de lucruri, imposibili pentru cine știe jumătate din subiect). */
  weak?: string[];
}

/** De la acest număr de distractori implauzibili, grila cade: ceilalți nu mai sunt o alegere reală (agentul „plauzibilitate”). */
export const WEAK_DISTRACTORS_TO_DROP = 2;

interface JudgeResponse {
  verdicts?: JudgeVerdict[];
}

const MAX_GROUNDING_CHARS = 6000;
/** Above this, the review prompt itself gets unwieldy; split isn't worth it for a quality pass. */
const MAX_QUESTIONS_PER_CALL = 25;
/**
 * Bugetul de răspuns. Modelele de raționament (gpt-oss) își consumă tokenii pe gândire înainte de JSON: cu vechiul
 * buget (300 + 60/grilă) răspunsul venea gol („finish: length”, 418 din 420 tokeni pe gândire, văzut live la
 * 14 nov 2026), JSON-ul lipsea și verificarea lăsa să treacă tot, în tăcere.
 */
export function judgeMaxTokens(questionCount: number, attempt = 0): number {
  return Math.min(8000, (1500 + questionCount * 300) * (attempt + 1));
}

/** Câți dintre distractorii (variante nemarcate) a numit judecătorul ca implauzibili; literele inexistente sau ale cheii nu contează. */
export function weakDistractorCount(question: Question, verdict: Pick<JudgeVerdict, 'weak'> | undefined): number {
  if (!verdict || !Array.isArray(verdict.weak)) return 0;
  const picked = new Set(verdict.weak.map((w) => String(w).trim().toLowerCase().slice(0, 1)));
  return question.options.filter((option, index) => !option.isCorrect && picked.has(letterFor(index))).length;
}

function letterFor(index: number): string {
  return String.fromCharCode(97 + index);
}

function formatQuestionForReview(question: Question, index: number): string {
  const options = question.options
    .map((option, i) => `${letterFor(i)}) ${option.text}${option.isCorrect ? '  [MARCAT CORECT]' : ''}`)
    .join('\n');
  return `[${index}] Enunț: ${question.text}\nVariante:\n${options}`;
}

function buildJudgePrompt(questions: Question[], groundingText: string | undefined, plausibility = false): string {
  const lines = [
    'Ești medic examinator senior. Verifici RIGID corectitudinea medicală a unor grile deja generate, ÎNAINTE ca un student să le vadă. NU genera conținut nou, NU reformula — doar verifică.',
    VERIFIER_MATERIAL_RULE,
    'Pentru fiecare întrebare, decide dacă varianta/variantele marcate [MARCAT CORECT] sunt cu adevărat răspunsul la enunț din punct de vedere medical (mecanism, criterii de diagnostic, valori de referință, indicații, contraindicații).',
    'La enunțurile negative („NU”, „FALS”, „incorectă”, „cu excepția”) varianta marcată trebuie să fie excepția, adică afirmația falsă; nu o respinge pentru că e falsă.',
    'Verifică și variantele NEMARCATE: dacă una dintre ele este, fără dubiu, un răspuns la fel de corect ca cel marcat (grila ar avea un răspuns corect în plus față de cheie), întrebarea e greșită.',
    groundingText
      ? `Ai la dispoziție și sursa din care au fost generate (curs) — folosește-o ca referință principală când e relevantă:\n"""\n${groundingText.slice(0, MAX_GROUNDING_CHARS)}\n"""`
      : 'Nu ai o sursă atașată — verifică pe baza cunoștințelor medicale general acceptate și STABILE.',
    plausibility && 'PLAUZIBILITATE: pentru variantele NEMARCATE, trece în "weak" literele celor evident implauzibile: absurde, din altă clasă de lucruri decât cere enunțul sau pe care nu le-ar alege nimeni care știe jumătate din subiect. Un distractor adevărat la o entitate vecină, sau o inversare de un cuvânt, e bun. Lasă "weak" gol când nu ești sigur.',
    'Marchează "correct": false DOAR când ești sigur că varianta marcată e greșită sau clar depășită medical, ori că o variantă nemarcată e și ea corectă — NU pentru ambiguități minore de formulare, stil, sau interpretări la limită unde ambele tabere au dreptate.',
    '',
    questions.map((q, i) => formatQuestionForReview(q, i)).join('\n\n'),
    '',
    `Răspunde STRICT cu JSON, fără text în plus, cu exact ${questions.length} intrări în "verdicts" (una per index de mai sus):`,
    '{"verdicts":[{"i":0,"correct":true},{"i":1,"correct":false,"reason":"1 propoziție în limba română, ce e greșit medical"}]}',
    plausibility && 'La plauzibilitate, o intrare poate avea și "weak": de exemplu {"i":2,"correct":true,"weak":["c","e"]}.',
  ];
  return lines.filter((line): line is string => typeof line === 'string').join('\n');
}

/**
 * Un furnizor cu cheie, diferit de cel care a servit ultima cerere (generarea). Null când nu se știe cine a generat
 * sau când nu există a doua cheie: atunci verificarea merge pe lanțul obișnuit.
 */
export function pickJudgeModel(): CloudModelRef | null {
  try {
    const producer = getLastServedModel();
    if (!producer) return null;
    return pickVerifier(producer, getConfiguredProviderModels(useAIStore.getState()), useAIUsageStore.getState().windows);
  } catch {
    return null;
  }
}

/**
 * Reviews one batch of already-generated questions and drops any the judge is
 * confident are medically wrong. `groundingText` is the same course text (or
 * empty for freeform-topic generation) the generator itself used, so the judge
 * checks against the same ground truth rather than an unrelated one.
 */
export interface JudgeOptions {
  /**
   * Verificatorul „orb”: după judecător, același lot e rezolvat de un model care NU vede cheia; grila al cărei răspuns diferă
   * de cheie e scoasă (cum cere proiectul Grile rezidențiat: o grilă intră doar dacă un verificator fără cheie ajunge singur
   * la același răspuns). Un apel în plus pe lot, pe alt furnizor când există a doua cheie. Oprit implicit.
   */
  blind?: boolean;
  /** Plauzibilitatea distractorilor (agentul „plauzibilitate”): judecătorul numește distractorii implauzibili, iar grila cu doi dintre ei cade. Doar la Rezidențiat. */
  plausibility?: boolean;
}

export async function verifyQuestionsMedically(
  questions: Question[],
  groundingText: string | undefined,
  options: JudgeOptions = {},
): Promise<MedicalJudgeResult> {
  const passthrough: MedicalJudgeResult = { questions, flaggedCount: 0, flaggedReasons: [] };
  if (questions.length === 0) return passthrough;

  // A batch bigger than the cap is reviewed in slices so the prompt stays
  // manageable and one bad slice doesn't sink questions it never looked at.
  if (questions.length > MAX_QUESTIONS_PER_CALL) {
    const mid = Math.ceil(questions.length / 2);
    const [first, second] = await Promise.all([
      verifyQuestionsMedically(questions.slice(0, mid), groundingText, options),
      verifyQuestionsMedically(questions.slice(mid), groundingText, options),
    ]);
    return {
      questions: [...first.questions, ...second.questions],
      flaggedCount: first.flaggedCount + second.flaggedCount,
      flaggedReasons: [...first.flaggedReasons, ...second.flaggedReasons],
      checked: Boolean(first.checked && second.checked),
    };
  }

  const other = pickJudgeModel();
  const ask = async (attempt: number): Promise<JudgeResponse | null> => {
    const request = {
      task: 'analysis' as const,
      messages: [{ role: 'user' as const, content: buildJudgePrompt(questions, groundingText, options.plausibility) }],
      temperature: 0,
      maxTokens: judgeMaxTokens(questions.length, attempt),
      skipLibraryContext: true,
    };
    const raw = other
      ? await groqRequest({ ...request, only: other }).catch(() => groqRequest(request))
      : await groqRequest(request);
    const parsed = validateJson<JudgeResponse>(raw);
    return parsed.ok && Array.isArray(parsed.value?.verdicts) ? parsed.value : null;
  };

  let response: JudgeResponse | null;
  try {
    // Răspuns gol sau tăiat: o singură reîncercare, cu buget dublu.
    response = (await ask(0)) ?? (await ask(1));
  } catch {
    return passthrough;
  }
  if (!response?.verdicts) return passthrough;

  const verdictByIndex = new Map<number, JudgeVerdict>();
  for (const verdict of response.verdicts) {
    if (verdict && typeof verdict.i === 'number') verdictByIndex.set(verdict.i, verdict);
  }

  const kept: Question[] = [];
  const flaggedReasons: string[] = [];
  questions.forEach((question, index) => {
    const verdict = verdictByIndex.get(index);
    // No verdict for this index (model skipped it) → keep it. The judge can
    // only remove questions it explicitly reviewed and rejected.
    if (!verdict || verdict.correct !== false) {
      const weak = options.plausibility ? weakDistractorCount(question, verdict) : 0;
      if (weak >= WEAK_DISTRACTORS_TO_DROP) {
        flaggedReasons.push(`Grila „${question.text.slice(0, 60)}” are ${weak} distractori implauzibili, deci nu e o alegere reală.`);
        return;
      }
      kept.push(question);
      return;
    }
    flaggedReasons.push(verdict.reason?.trim() || `Întrebarea „${question.text.slice(0, 60)}…" a fost respinsă de verificarea medicală.`);
  });

  // Refuse to trust a pass that flagged everything — far more likely a prompt/
  // parsing mismatch (e.g. the model answered about the wrong batch) than every
  // single generated question being wrong.
  if (kept.length === 0 && questions.length > 1) return passthrough;

  const judged: MedicalJudgeResult = { questions: kept, flaggedCount: questions.length - kept.length, flaggedReasons, checked: true };
  if (!options.blind) return judged;

  const blind = await blindVerify(kept, groundingText);
  return {
    questions: blind.questions,
    flaggedCount: judged.flaggedCount + blind.flaggedCount,
    flaggedReasons: [...judged.flaggedReasons, ...blind.flaggedReasons],
    checked: true,
  };
}

interface BlindAnswer {
  i: number;
  picks: string[];
}

interface BlindResponse {
  answers?: BlindAnswer[];
}

export function buildBlindPrompt(questions: Question[], groundingText: string | undefined): string {
  const body = questions
    .map((q, index) => `[${index}] Enunț: ${q.text}\nVariante:\n${q.options.map((o, i) => `${letterFor(i)}) ${o.text}`).join('\n')}`)
    .join('\n\n');
  return [
    'Ești rezident care rezolvă grile de Rezidențiat. Nu ți se spune care variante sunt corecte: le alegi TU, singur, din cunoștințe și din sursă.',
    VERIFIER_MATERIAL_RULE,
    'La fiecare grilă pot fi corecte una sau mai multe variante (între una și patru). La enunțurile negative („NU”, „FALS”, „incorectă”, „cu excepția”) alegi afirmația falsă.',
    groundingText
      ? `Sursa din care au fost făcute grilele (referința principală, dacă e relevantă):\n"""\n${groundingText.slice(0, MAX_GROUNDING_CHARS)}\n"""`
      : 'Nu ai o sursă atașată: rezolvă din cunoștințe medicale general acceptate și stabile.',
    '',
    body,
    '',
    `Răspunde STRICT cu JSON, fără text în plus, cu exact ${questions.length} intrări în "answers", literele alese cu minusculă:`,
    '{"answers":[{"i":0,"picks":["a"]},{"i":1,"picks":["b","d"]}]}',
  ].join('\n');
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Rezolvă lotul fără cheie și scoate grilele la care răspunsul diferă. Deschis la erori: fără răspuns, cu un răspuns
 * necitibil sau fără intrare pentru o grilă, grilele rămân; nu golește niciodată tot lotul.
 */
export async function blindVerify(questions: Question[], groundingText: string | undefined): Promise<MedicalJudgeResult> {
  const passthrough: MedicalJudgeResult = { questions, flaggedCount: 0, flaggedReasons: [] };
  if (questions.length === 0 || questions.length > MAX_QUESTIONS_PER_CALL) return passthrough;

  const other = pickJudgeModel();
  const ask = async (attempt: number): Promise<BlindResponse | null> => {
    const request = {
      task: 'analysis' as const,
      messages: [{ role: 'user' as const, content: buildBlindPrompt(questions, groundingText) }],
      temperature: 0,
      maxTokens: judgeMaxTokens(questions.length, attempt),
      skipLibraryContext: true,
    };
    const raw = other
      ? await groqRequest({ ...request, only: other }).catch(() => groqRequest(request))
      : await groqRequest(request);
    const parsed = validateJson<BlindResponse>(raw);
    return parsed.ok && Array.isArray(parsed.value?.answers) ? parsed.value : null;
  };

  let response: BlindResponse | null;
  try {
    response = (await ask(0)) ?? (await ask(1));
  } catch {
    return passthrough;
  }
  if (!response?.answers) return passthrough;

  const picksByIndex = new Map<number, string[]>();
  for (const answer of response.answers) {
    if (answer && typeof answer.i === 'number' && Array.isArray(answer.picks)) {
      picksByIndex.set(answer.i, answer.picks.map((p) => String(p).trim().toLowerCase().slice(0, 1)).filter(Boolean).sort());
    }
  }

  const kept: Question[] = [];
  const reasons: string[] = [];
  questions.forEach((question, index) => {
    const picks = picksByIndex.get(index);
    if (!picks || picks.length === 0) {
      kept.push(question);
      return;
    }
    const key = question.options.flatMap((o, i) => (o.isCorrect ? [letterFor(i)] : [])).sort();
    if (sameSet(picks, key)) {
      kept.push(question);
      return;
    }
    reasons.push(`Verificatorul independent a ales altceva decât cheia la „${question.text.slice(0, 60)}”.`);
  });

  // Dacă ar pica tot lotul, e mai probabil o nepotrivire de format decât un lot întreg greșit.
  if (kept.length === 0 && questions.length > 1) return passthrough;
  return { questions: kept, flaggedCount: questions.length - kept.length, flaggedReasons: reasons, checked: true };
}
