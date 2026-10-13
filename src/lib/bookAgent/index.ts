/**
 * Agentul „Vezi în carte”: ia o grilă și duce studentul la pasajul din manual care o susține.
 *   1. înțelege   — termeni din dicționarul medical + localizatorul AI (abrevieri desfăcute, sinonime, cartea probabilă)
 *   2. caută      — BM25 în paginile curate ale cărților incluse, cu acei termeni
 *   3. judecă     — AI-ul alege pasajul care afirmă răspunsul corect și marchează propozițiile (răspuns / enunț / de ce nu celelalte)
 *   4. verifică   — citatele se caută identic în text; ce nu există se aruncă; „none” înseamnă că nu se arată nimic
 * Fără AI (fără cheie, rețea, limită) rămâne pasul 2, cu cel mai bun candidat doar dacă scorul e mare.
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

/** Fără AI nu avem cine să respingă o potrivire slabă: se arată doar un candidat cu scor mare (altfel „nu am găsit”). */
export const FALLBACK_MIN_SCORE = 22;
/** Câți candidați vede judecătorul (promptul rămâne sub limita de ~8K tokeni pe minut a planurilor gratuite). */
const MAX_CANDIDATES = 4;

/** Ce pas întreabă: localizatorul e un ajutor (se poate renunța la el), judecătorul decide pasajul. */
export type AgentCall = 'locate' | 'judge';

/** Întreabă modelul (prompt → text). Înlocuibil în teste; în aplicație pune o limită de timp pe fiecare pas. */
export type AgentAsk = (prompt: string, call: AgentCall) => Promise<string>;

export interface RunOptions {
  onStep?: (step: AgentStep) => void;
}

async function locate(query: PassageQuery, ask: AgentAsk): Promise<LocatorPlan | null> {
  try {
    return parseLocatorPlan(await ask(buildLocatorPrompt(query), 'locate'));
  } catch {
    return null;
  }
}

/** Candidații pentru o grilă, cu termenii dicționarului medical și (dacă merge) ai localizatorului; cartea probabilă are întâietate la egalitate. */
export async function gatherCandidates(query: PassageQuery, plan: LocatorPlan | null): Promise<PassageCandidate[]> {
  const dictionary = expandMedicalQuery(`${query.question} ${query.answer}`).phrases;
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

export async function runBookAgent(query: PassageQuery, ask: AgentAsk, options: RunOptions = {}): Promise<BookPassage | null> {
  options.onStep?.('understand');
  const plan = await locate(query, ask);
  options.onStep?.('search');
  const candidates = await gatherCandidates(query, plan);
  if (candidates.length === 0) return null;
  options.onStep?.('judge');
  try {
    const selection = parseJudgeSelection(await ask(buildJudgePrompt(query, candidates), 'judge'));
    if (selection) return applyJudgeSelection(candidates, selection);
  } catch {
    /* fără cheie, rețea sau limită: rămâne cel mai bun candidat, dacă scorul îl justifică */
  }
  return candidates[0].score >= FALLBACK_MIN_SCORE ? passageFromCandidate(candidates[0]) : null;
}
