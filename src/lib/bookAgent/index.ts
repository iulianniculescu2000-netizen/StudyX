/**
 * Agentul „Vezi în carte”: ia o grilă și duce studentul la pasajul din manual care o susține.
 *   1. înțelege   — termeni din dicționarul medical + localizatorul AI (abrevieri desfăcute, sinonime, cartea probabilă)
 *   2. caută      — BM25 în paginile curate ale cărților incluse, cu acei termeni
 *   3. judecă     — AI-ul alege pasajul care afirmă răspunsul corect și marchează propozițiile (răspuns / enunț / de ce nu celelalte)
 *   4. verifică   — citatele se caută identic în text; ce nu există se aruncă; „none” înseamnă că nu se arată nimic
 * Fără AI (fără cheie, rețea, limită) rămâne pasul 2: cel mai bun candidat se arată marcat „fără verificare AI” doar dacă potrivirea e
 * clară (scor mare, sau scor mediu cu enunțul acoperit și legătură cu răspunsul/variantele). Dacă AI-ul n-a fost disponibil, rezultatul
 * o spune (`aiProblem`), ca interfața să nu pretindă că „cartea nu are pasajul”.
 */
import { expandMedicalQuery } from '../../ai/medicalSynonyms';
import { rangesOfChapters } from '../bookKnowledge';
import { findPassageCandidates, passageFromCandidate, type BookPassage, type PassageCandidate, type PassageQuery } from '../bookPassage';
import { buildJudgePrompt, buildLocatorPrompt } from './prompts';
import { applyJudgeSelection, parseJudgeSelection, parseLocatorPlan, type LocatorPlan } from './judge';

export type AgentStep = 'understand' | 'search' | 'judge';

export const AGENT_STEP_LABEL: Record<AgentStep, string> = {
  understand: 'Înțeleg grila…',
  search: 'Caut în cărți…',
  judge: 'Verific pasajul…',
};

/** Fără AI nu avem cine să respingă o potrivire slabă: un candidat izolat se arată doar cu scor mare. */
export const FALLBACK_MIN_SCORE = 22;
/** Scor minim pentru o potrivire locală „clară”, dacă enunțul e acoperit și există legătură cu răspunsul sau variantele. */
export const LOCAL_MIN_SCORE = 8;
export const LOCAL_MIN_COVERAGE = 0.5;
/** Cel mai specific cuvânt al enunțului găsit în pasaj trebuie să fie destul de rar în cărți (IDF). */
export const LOCAL_MIN_TOP_IDF = 2.8;
/** Câți candidați vede judecătorul (promptul rămâne sub limita de ~8K tokeni pe minut a planurilor gratuite). */
const MAX_CANDIDATES = 4;
/** O a doua încercare doar dacă prima a eșuat repede (429, rețea); un model care tace nu se mai așteaptă o dată. */
const RETRY_DELAY_MS = 1500;
const RETRY_ONLY_IF_FAILED_WITHIN_MS = 8000;
const TOTAL_BUDGET_MS = 45_000;

/** Ce pas întreabă: localizatorul e un ajutor (se poate renunța la el), judecătorul decide pasajul. */
export type AgentCall = 'locate' | 'judge';

/** Întreabă modelul (prompt → text). Înlocuibil în teste; în aplicație pune o limită de timp pe fiecare pas. */
export type AgentAsk = (prompt: string, call: AgentCall) => Promise<string>;

/** De ce n-a putut AI-ul verifica: limită de cereri (429) sau altă cauză (rețea, timp depășit, răspuns neinteligibil). */
export type AiProblem = 'rate-limit' | 'unavailable';

export interface RunOptions {
  onStep?: (step: AgentStep) => void;
  /** Înlocuibile în teste. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface AgentOutcome {
  passage: BookPassage | null;
  /** Setat când judecătorul AI n-a răspuns util: pasajul (dacă există) e doar o potrivire locală. */
  aiProblem: AiProblem | null;
}

export const classifyAiError = (error: unknown): AiProblem => {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /429|rate.?limit|too many|quota|resource_exhausted|limit[aă] de cereri|prea multe cereri|cerer/i.test(text) ? 'rate-limit' : 'unavailable';
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** O potrivire locală (fără AI) destul de clară ca să fie arătată, marcată „fără verificare AI”. */
export function isClearLocalMatch(candidate: PassageCandidate): boolean {
  if (candidate.score >= FALLBACK_MIN_SCORE) return true;
  if (candidate.score < LOCAL_MIN_SCORE) return false;
  // Un enunț fără niciun cuvânt specific („mecanismul de acțiune în organism”) se potrivește cu orice pagină: nu e o dovadă.
  if (candidate.topIdf < LOCAL_MIN_TOP_IDF) return false;
  // Legătura cu răspunsul (un cuvânt al lui) sau cu variantele (două cuvinte; în „cu excepția” ele sunt afirmațiile adevărate).
  const linked = candidate.sharedAnswer > 0 || candidate.sharedOptions >= 2;
  const covered = candidate.coverage >= LOCAL_MIN_COVERAGE || candidate.anchored;
  return (covered && linked) || (candidate.anchored && candidate.coverage >= 0.75 && candidate.score >= 15);
}

interface Asker {
  /** Răspunsul modelului, cu o singură reîncercare după eșec rapid; aruncă dacă și a doua a eșuat sau nu mai e timp. */
  (prompt: string, call: AgentCall): Promise<string>;
}

function withRetry(ask: AgentAsk, options: RunOptions, startedAt: number): Asker {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  return async (prompt, call) => {
    const begun = now();
    try {
      return await ask(prompt, call);
    } catch (error) {
      const failedFast = now() - begun < RETRY_ONLY_IF_FAILED_WITHIN_MS;
      if (!failedFast || now() - startedAt + RETRY_DELAY_MS > TOTAL_BUDGET_MS) throw error;
      await sleep(RETRY_DELAY_MS);
      return ask(prompt, call);
    }
  };
}

async function locate(query: PassageQuery, ask: Asker): Promise<{ plan: LocatorPlan | null; problem: AiProblem | null }> {
  try {
    return { plan: parseLocatorPlan(await ask(buildLocatorPrompt(query), 'locate')), problem: null };
  } catch (error) {
    return { plan: null, problem: classifyAiError(error) };
  }
}

/**
 * Candidații pentru o grilă. Dicționarul medical dă termenii în orice caz; planul localizatorului (dacă a răspuns) adaugă
 * sinonime, cartea probabilă și capitolele. Răspunsul corect și variantele greșite intră în căutare direct în `findPassageCandidates`.
 */
export async function gatherCandidates(query: PassageQuery, plan: LocatorPlan | null): Promise<PassageCandidate[]> {
  const dictionary = expandMedicalQuery(`${query.question} ${query.answer} ${(query.wrongAnswers ?? []).join(' ')}`).phrases;
  const extraTerms = [...(query.extraTerms ?? []), ...dictionary, ...(plan?.terms ?? []), ...(plan?.topic ? [plan.topic] : [])];
  const focus = rangesOfChapters(plan?.chapters ?? []).map(({ book, first, last }) => ({ book, first, last }));
  const candidates = await findPassageCandidates({ ...query, extraTerms, focus: [...(query.focus ?? []), ...focus] }, 4);
  if (!plan?.book) return candidates.slice(0, MAX_CANDIDATES);
  // Cartea indicată de localizator trece înainte, fără să elimine ce e mai bine potrivit în altă carte.
  const preferred = candidates.filter((candidate) => candidate.paras[0].book === plan.book);
  const rest = candidates.filter((candidate) => candidate.paras[0].book !== plan.book);
  const first = candidates[0];
  const bestIsOther = first && first.paras[0].book !== plan.book && preferred[0] && preferred[0].score < first.score * 0.8;
  return (bestIsOther ? [first, ...preferred, ...rest.filter((c) => c !== first)] : [...preferred, ...rest]).slice(0, MAX_CANDIDATES);
}

export async function runBookAgentDetailed(query: PassageQuery, ask: AgentAsk, options: RunOptions = {}): Promise<AgentOutcome> {
  const startedAt = (options.now ?? Date.now)();
  const askWithRetry = withRetry(ask, options, startedAt);
  options.onStep?.('understand');
  const { plan, problem: locatorProblem } = await locate(query, askWithRetry);
  options.onStep?.('search');
  const candidates = await gatherCandidates(query, plan);
  // Nimic local: dacă și localizatorul a căzut, „nu am găsit” ar putea fi nedrept (termenii lui ar fi putut ajuta).
  if (candidates.length === 0) return { passage: null, aiProblem: locatorProblem };
  options.onStep?.('judge');
  let aiProblem: AiProblem | null = null;
  try {
    const selection = parseJudgeSelection(await askWithRetry(buildJudgePrompt(query, candidates), 'judge'));
    if (selection) return { passage: applyJudgeSelection(candidates, selection), aiProblem: null };
    aiProblem = 'unavailable'; // răspuns care nu e JSON valid
  } catch (error) {
    aiProblem = classifyAiError(error);
  }
  // Judecătorul n-a putut verifica: cel mai bun candidat, doar dacă potrivirea e clară, fără evidențieri inventate.
  const local = candidates.find(isClearLocalMatch);
  return { passage: local ? passageFromCandidate(local) : null, aiProblem };
}

export async function runBookAgent(query: PassageQuery, ask: AgentAsk, options: RunOptions = {}): Promise<BookPassage | null> {
  return (await runBookAgentDetailed(query, ask, options)).passage;
}
