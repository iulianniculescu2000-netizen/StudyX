/**
 * Prognoza de scor din Perspective AI: ce acuratețe te poți aștepta să ai la examen, pe materie și în total,
 * ca INTERVAL (nu un număr fals de precis) cu o etichetă de încredere. Funcții pure: primesc datele și `now`.
 *
 * Ce intră în estimare, pe capitol (folderul de specialitate din Rezidențiat, sau categoria setului):
 *  - acuratețea pe grilele rezolvate, trasă spre media de 65% cu greutatea a 4 grile (puține răspunsuri => aproape de medie);
 *  - acoperirea: grilele nerezolvate se estimează la 40% (presupunere), deci cine a văzut puțin nu primește un scor mare;
 *  - uitarea: o grilă scadentă la recapitulare (SM-2) pierde din reținere cu cât e mai întârziată (până la jumătate);
 *  - trendul: ultimele 14 zile față de cele 14 dinainte, cel mult ±4 puncte și doar cu destule grile în ambele ferestre.
 * Se ignoră istoricul „retras” (copiat pe pachetele de capitol), seturile arhivate, derivate sau combinate și
 * grilele duplicate (același id sau același enunț): o grilă contează o singură dată.
 *
 * Nu e scorul oficial: banca nu e calibrată pe examen. Intervalul include și o incertitudine fixă de transfer bancă -> examen.
 */
import type { Folder, QuestionStat, Quiz, QuizSession } from '../types';
import { countsAsGrile, isGenericTag, DAY_MS } from './analyticsStats';
import { findDuplicatesCached, memberKey } from './bankDedup';

/* ───────────────────────── Presupuneri (toate vizibile în interfață) ───────────────────────── */

export const PRIOR_ACCURACY = 0.65;
/** Greutatea mediei de 65% în acuratețea unui capitol, în „grile”: sub ~10 grile rezolvate estimarea rămâne aproape de medie. */
export const PRIOR_WEIGHT_QUESTIONS = 4;
/** Cât se presupune că ai nimeri la o grilă pe care nu ai rezolvat-o încă. */
export const UNSEEN_ACCURACY = 0.4;
/** Incertitudinea (abatere standard) asupra grilelor nerezolvate. */
const UNSEEN_SE = 0.12;
/** Incertitudinea fixă a trecerii de la bancă la examenul real. */
const TRANSFER_SE = 0.04;
/** Interval de ~80%. */
const Z = 1.28;
const MAX_FORGET = 0.5;
const MAX_TREND_POINTS = 4;
const TREND_WINDOW_DAYS = 14;
const MIN_TREND_QUESTIONS = 15;

export const EXAM_QUESTIONS = 200;
export const WRONG_PENALTY = 0.25;

export const FEW_DATA_BELOW = 30;
export const ENOUGH_DATA_FROM = 40;
/** Sub această acoperire (%) estimarea rămâne „medie” oricâte grile ai rezolvat: restul e presupunere. */
export const ENOUGH_COVERAGE = 25;

export type ForecastConfidence = 'few' | 'some' | 'enough';
export const FORECAST_CONFIDENCE_LABEL: Record<ForecastConfidence, string> = {
  few: 'Date insuficiente',
  some: 'Încredere medie',
  enough: 'Încredere bună',
};

export function forecastConfidence(answered: number, coveragePct: number = 100): ForecastConfidence {
  if (answered < FEW_DATA_BELOW) return 'few';
  return answered < ENOUGH_DATA_FROM || coveragePct < ENOUGH_COVERAGE ? 'some' : 'enough';
}

/* ───────────────────────── Tipuri ───────────────────────── */

export interface ForecastRange {
  /** Procente rotunjite, 0–100. */
  low: number;
  mid: number;
  high: number;
}

export interface NetScoreRange {
  low: number;
  mid: number;
  high: number;
}

export interface UnitForecast extends ForecastRange {
  key: string;
  /** Capitolul: specialitatea din Rezidențiat sau categoria setului. */
  label: string;
  /** Materia: disciplina din Rezidențiat sau categoria setului. */
  discipline: string;
  questions: number;
  answered: number;
  /** answered / questions, 0–100. */
  coverage: number;
  /** Acuratețea trasă spre medie pe grilele rezolvate, 0–100 (null fără nicio grilă rezolvată). */
  accuracy: number | null;
  due: number;
  /** Puncte procentuale, ultimele 14 zile față de cele 14 dinainte; null fără destule date. */
  trend: number | null;
  confidence: ForecastConfidence;
  /** Câte puncte procentuale ar urca prognoza generală dacă studiezi capitolul (acoperire, scadente, greșeli). */
  lift: number;
  /** Setul cu care merită început în capitol. */
  quizId: string | null;
  /** Greutatea în total: grilele capitolului din toate grilele. */
  weight: number;
  /** Intern, în intervalul 0–1. */
  centre: number;
  se: number;
}

export interface DisciplineForecast extends ForecastRange {
  name: string;
  questions: number;
  answered: number;
  coverage: number;
  confidence: ForecastConfidence;
  due: number;
  weight: number;
  units: UnitForecast[];
}

export interface ScoreForecast extends ForecastRange {
  questions: number;
  answered: number;
  coverage: number;
  due: number;
  confidence: ForecastConfidence;
  trend: number | null;
  /** Scorul net estimat la un examen de 200 de grile, cu penalizare. */
  net: NetScoreRange;
  disciplines: DisciplineForecast[];
  /** Primele 3 capitole care ridică cel mai mult prognoza. */
  top: UnitForecast[];
}

export interface ForecastInput {
  quizzes: readonly Quiz[];
  questionStats: Record<string, QuestionStat>;
  sessions: readonly QuizSession[];
  folders: readonly Pick<Folder, 'id' | 'name' | 'parentId'>[];
  now: number;
}

/* ───────────────────────── Scor net ───────────────────────── */

/** Scorul net la `n` grile, cu +1 corect și −0,25 greșit, presupunând că răspunzi la toate. */
export function netScore(accuracyPct: number, n: number = EXAM_QUESTIONS): number {
  const a = Math.min(1, Math.max(0, accuracyPct / 100));
  return n * (a - WRONG_PENALTY * (1 - a));
}

function netRange(range: ForecastRange): NetScoreRange {
  return {
    low: Math.round(netScore(range.low)),
    mid: Math.round(netScore(range.mid)),
    high: Math.round(netScore(range.high)),
  };
}

/* ───────────────────────── Grupare pe materii ───────────────────────── */

const plain = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Același test ca `isRezidentiatRootFolder` (rezidentiatRoot.ts), repetat ca modulul să rămână fără importuri de store-uri. */
const isRootFolder = (folder: Pick<Folder, 'name' | 'parentId'>) => !folder.parentId && plain(folder.name) === plain('Rezidențiat');

const isSessionQuiz = (quiz: Pick<Quiz, 'id' | 'tags'>) =>
  quiz.id.startsWith('mix-') || (quiz.tags ?? []).some((tag) => tag.startsWith('folder-session:'));

interface Placement { discipline: string; chapter: string }

function placementOf(quiz: Pick<Quiz, 'folderId' | 'category'>, folders: ReadonlyMap<string, Pick<Folder, 'id' | 'name' | 'parentId'>>): Placement {
  const chain: Pick<Folder, 'id' | 'name' | 'parentId'>[] = [];
  const seen = new Set<string>();
  let current = quiz.folderId ? folders.get(quiz.folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? folders.get(current.parentId) : undefined;
  }
  if (chain.length > 0 && isRootFolder(chain[0]) && chain.length >= 2) {
    const discipline = chain[1].name.trim();
    return { discipline, chapter: chain.length >= 3 ? chain[2].name.trim() : 'Alte grile' };
  }
  const category = (quiz.category ?? '').trim();
  const own = category && !isGenericTag(category) ? category : '';
  const folderName = chain.length > 0 ? chain[chain.length - 1].name.trim() : '';
  const name = own || folderName || 'Fără materie';
  return { discipline: name, chapter: name };
}

/* ───────────────────────── Calculul ───────────────────────── */

interface QuestionAcc {
  unit: string;
  quizId: string;
  correct: number;
  wrong: number;
  lastSeen: number;
  nextReview: number;
  interval: number;
}

interface UnitAcc {
  key: string;
  label: string;
  discipline: string;
  questions: number;
  /** Pentru alegerea setului de început: grile nerezolvate / acuratețea pe set. */
  byQuiz: Map<string, { total: number; answered: number; correct: number; attempts: number }>;
  answeredList: { rate: number; due: boolean; overdueDays: number; interval: number }[];
}

const textKey = (text: string) => plain(text).replace(/\s+/g, ' ');

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function forgetFactor(overdueDays: number, interval: number): number {
  return Math.min(MAX_FORGET, 0.15 + 0.35 * Math.min(1, Math.max(0, overdueDays) / Math.max(7, interval)));
}

/** Acuratețea unui capitol: media pe grile (fiecare trasă spre medie), apoi trasă spre medie cu greutatea a 4 grile. */
function seenAccuracy(rates: readonly number[]): number {
  const sum = rates.reduce((a, b) => a + b, 0);
  return (sum + PRIOR_WEIGHT_QUESTIONS * PRIOR_ACCURACY) / (rates.length + PRIOR_WEIGHT_QUESTIONS);
}

interface Estimate { centre: number; se: number; accuracy: number; coverage: number }

function estimateUnit(acc: UnitAcc, trendPoints: number | null): Estimate & { due: number } {
  const answered = acc.answeredList.length;
  const coverage = acc.questions > 0 ? answered / acc.questions : 0;
  const effective = acc.answeredList.map((q) => {
    if (!q.due) return q.rate;
    const f = forgetFactor(q.overdueDays, q.interval);
    return q.rate * (1 - f) + UNSEEN_ACCURACY * f;
  });
  const accuracy = seenAccuracy(effective);
  const trend = trendPoints === null ? 0 : Math.max(-MAX_TREND_POINTS, Math.min(MAX_TREND_POINTS, trendPoints * 0.25)) / 100;
  const centre = clamp01(coverage * clamp01(accuracy + trend) + (1 - coverage) * UNSEEN_ACCURACY);
  const seSeen = Math.sqrt((accuracy * (1 - accuracy)) / (answered + PRIOR_WEIGHT_QUESTIONS));
  const se = Math.sqrt((coverage * seSeen) ** 2 + ((1 - coverage) * UNSEEN_SE) ** 2);
  return { centre, se, accuracy, coverage, due: acc.answeredList.filter((q) => q.due).length };
}

/** Câte puncte ar câștiga capitolul dacă l-ai studia: grilele nevăzute ajung la acuratețea ta, scadentele se reîmprospătează, greșelile se corectează pe sfert. */
function scenarioCentre(acc: UnitAcc, est: Estimate): number {
  const fresh = seenAccuracy(acc.answeredList.map((q) => q.rate));
  const improved = fresh < 0.9 ? fresh + 0.25 * (0.9 - fresh) : fresh;
  const target = Math.max(improved, est.accuracy, UNSEEN_ACCURACY);
  return clamp01(Math.max(target, est.centre));
}

function rangeOf(centre: number, se: number): ForecastRange {
  const margin = Z * Math.sqrt(se * se + TRANSFER_SE * TRANSFER_SE);
  return {
    low: Math.round(clamp01(centre - margin) * 100),
    mid: Math.round(clamp01(centre) * 100),
    high: Math.round(clamp01(centre + margin) * 100),
  };
}

function windowTrend(sessions: readonly QuizSession[], now: number, include: (s: QuizSession) => boolean): number | null {
  const span = TREND_WINDOW_DAYS * DAY_MS;
  const agg = (from: number, to: number) => {
    let total = 0;
    let correct = 0;
    for (const s of sessions) {
      const at = s.finishedAt;
      if (typeof at !== 'number' || !Number.isFinite(at) || at < from || at >= to || !(s.total > 0) || !include(s)) continue;
      total += s.total;
      correct += Math.min(s.total, Math.max(0, s.score));
    }
    return { total, rate: total > 0 ? correct / total : 0 };
  };
  const current = agg(now - span, now);
  const previous = agg(now - 2 * span, now - span);
  if (current.total < MIN_TREND_QUESTIONS || previous.total < MIN_TREND_QUESTIONS) return null;
  return Math.round((current.rate - previous.rate) * 100);
}

function combine(units: readonly { weight: number; centre: number; se: number }[]): { centre: number; se: number } {
  let centre = 0;
  let variance = 0;
  for (const u of units) {
    centre += u.weight * u.centre;
    variance += (u.weight * u.se) ** 2;
  }
  return { centre, se: Math.sqrt(variance) };
}

export function buildScoreForecast(input: ForecastInput): ScoreForecast {
  const { quizzes, questionStats, sessions, now } = input;
  const folders = new Map(input.folders.map((folder) => [folder.id, folder]));

  // 1. Grilele distincte, fiecare în capitolul primului set care o conține.
  const units = new Map<string, UnitAcc>();
  const byId = new Map<string, string>(); // questionId -> id canonic
  const byText = new Map<string, string>(); // enunț -> id canonic
  const canon = new Map<string, QuestionAcc>();
  const unitOfQuiz = new Map<string, string>();
  // Aceeași regulă ca în Rezidențiat: copiile redundante dintr-un grup de dubluri și grilele ascunse nu se numără;
  // răspunsurile date unei copii se atribuie grilei primare.
  const eligibleQuizzes = quizzes.filter((quiz) => countsAsGrile(quiz) && !isSessionQuiz(quiz));
  const dupReport = findDuplicatesCached(eligibleQuizzes);
  const redundantKeys = new Set<string>();
  const aliasOf = new Map<string, string>(); // questionId copie -> questionId primar
  for (const group of dupReport.groups) {
    const primaryKey = memberKey(group.primary.quizId, group.primary.questionId);
    for (const member of group.members) {
      const key = memberKey(member.quizId, member.questionId);
      if (key === primaryKey) continue;
      redundantKeys.add(key);
      aliasOf.set(member.questionId, group.primary.questionId);
    }
  }
  for (const quiz of quizzes) {
    if (!countsAsGrile(quiz) || isSessionQuiz(quiz)) continue;
    const place = placementOf(quiz, folders);
    const key = `${place.discipline}\u0000${place.chapter}`;
    unitOfQuiz.set(quiz.id, key);
    let unit = units.get(key);
    if (!unit) {
      unit = { key, label: place.chapter, discipline: place.discipline, questions: 0, byQuiz: new Map(), answeredList: [] };
      units.set(key, unit);
    }
    for (const question of quiz.questions) {
      const qKey = memberKey(quiz.id, question.id);
      if (redundantKeys.has(qKey) || (question.hidden && !dupReport.groupOf.has(qKey))) continue;
      const text = textKey(question.text ?? '');
      const known = byId.get(question.id) ?? (text ? byText.get(text) : undefined);
      if (known) {
        byId.set(question.id, known);
        continue;
      }
      byId.set(question.id, question.id);
      if (text) byText.set(text, question.id);
      canon.set(question.id, { unit: key, quizId: quiz.id, correct: 0, wrong: 0, lastSeen: 0, nextReview: 0, interval: 0 });
      unit.questions += 1;
      const row = unit.byQuiz.get(quiz.id) ?? { total: 0, answered: 0, correct: 0, attempts: 0 };
      row.total += 1;
      unit.byQuiz.set(quiz.id, row);
    }
  }

  // 2. Istoricul: fără cel retras; încercările aceleiași grile din mai multe seturi se adună pe grila canonică.
  for (const stat of Object.values(questionStats)) {
    if (!stat || stat.retired) continue;
    const id = byId.get(stat.questionId) ?? byId.get(aliasOf.get(stat.questionId) ?? '');
    const q = id ? canon.get(id) : undefined;
    if (!q) continue;
    const right = Number(stat.timesCorrect);
    const wrong = Number(stat.timesWrong);
    if (!Number.isFinite(right) || !Number.isFinite(wrong) || right < 0 || wrong < 0 || !(right + wrong > 0)) continue;
    q.correct += right;
    q.wrong += wrong;
    if ((stat.lastSeen ?? 0) >= q.lastSeen) {
      q.lastSeen = stat.lastSeen ?? 0;
      q.nextReview = stat.nextReview ?? 0;
      q.interval = stat.interval ?? 0;
    }
  }
  for (const q of canon.values()) {
    const attempts = q.correct + q.wrong;
    if (attempts <= 0) continue;
    const unit = units.get(q.unit)!;
    // Aceeași tragere spre medie pe grilă ca la capitol, cu greutatea a 2 încercări.
    const rate = (q.correct + 2 * PRIOR_ACCURACY) / (attempts + 2);
    const due = q.nextReview > 0 && q.nextReview <= now;
    unit.answeredList.push({ rate, due, overdueDays: due ? (now - q.nextReview) / DAY_MS : 0, interval: q.interval });
    const row = unit.byQuiz.get(q.quizId);
    if (row) {
      row.answered += 1;
      row.correct += q.correct;
      row.attempts += attempts;
    }
  }

  // 3. Prognoza pe capitole.
  const totalQuestions = [...units.values()].reduce((sum, unit) => sum + unit.questions, 0);
  const trendByUnit = new Map<string, number | null>();
  for (const unit of units.values()) {
    trendByUnit.set(unit.key, windowTrend(sessions, now, (s) => unitOfQuiz.get(s.quizId) === unit.key));
  }
  const prepared = [...units.values()].filter((unit) => unit.questions > 0).map((unit) => {
    const trend = trendByUnit.get(unit.key) ?? null;
    const est = estimateUnit(unit, trend);
    const weight = totalQuestions > 0 ? unit.questions / totalQuestions : 0;
    return { unit, est, trend, weight };
  });

  const unitForecasts: UnitForecast[] = prepared.map(({ unit, est, trend, weight }) => {
    const range = rangeOf(est.centre, est.se);
    const answered = unit.answeredList.length;
    const lift = Math.max(0, weight * (scenarioCentre(unit, est) - est.centre) * 100);
    let quizId: string | null = null;
    let best = -Infinity;
    for (const [id, row] of unit.byQuiz) {
      const unseen = row.total - row.answered;
      const miss = row.attempts > 0 ? 1 - row.correct / row.attempts : 0;
      const score = unseen + miss * row.answered;
      if (score > best) { best = score; quizId = id; }
    }
    return {
      key: unit.key,
      label: unit.label,
      discipline: unit.discipline,
      questions: unit.questions,
      answered,
      coverage: Math.round(est.coverage * 100),
      accuracy: answered > 0 ? Math.round(est.accuracy * 100) : null,
      due: est.due,
      trend,
      confidence: forecastConfidence(answered, est.coverage * 100),
      lift: Math.round(lift * 10) / 10,
      quizId,
      weight,
      centre: est.centre,
      se: est.se,
      ...range,
    };
  });

  // 4. Pe materii și în total.
  const byDiscipline = new Map<string, UnitForecast[]>();
  for (const unit of unitForecasts) {
    const list = byDiscipline.get(unit.discipline) ?? [];
    list.push(unit);
    byDiscipline.set(unit.discipline, list);
  }
  const disciplines: DisciplineForecast[] = [...byDiscipline.entries()].map(([name, list]) => {
    const questions = list.reduce((s, u) => s + u.questions, 0);
    const answered = list.reduce((s, u) => s + u.answered, 0);
    const { centre, se } = combine(list.map((u) => ({ weight: questions > 0 ? u.questions / questions : 0, centre: u.centre, se: u.se })));
    return {
      name,
      questions,
      answered,
      coverage: questions > 0 ? Math.round((answered / questions) * 100) : 0,
      confidence: forecastConfidence(answered, questions > 0 ? (answered / questions) * 100 : 0),
      due: list.reduce((s, u) => s + u.due, 0),
      weight: totalQuestions > 0 ? questions / totalQuestions : 0,
      units: [...list].sort((a, b) => b.lift - a.lift || b.questions - a.questions),
      ...rangeOf(centre, se),
    };
  }).sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name, 'ro'));

  const overall = combine(unitForecasts.map((u) => ({ weight: u.weight, centre: u.centre, se: u.se })));
  const range = totalQuestions > 0 ? rangeOf(overall.centre, overall.se) : { low: 0, mid: 0, high: 0 };
  const answeredTotal = unitForecasts.reduce((s, u) => s + u.answered, 0);

  const top = unitForecasts
    .filter((u) => u.lift >= 0.1)
    .sort((a, b) => b.lift - a.lift || b.questions - a.questions || a.label.localeCompare(b.label, 'ro'))
    .slice(0, 3);

  return {
    ...range,
    questions: totalQuestions,
    answered: answeredTotal,
    coverage: totalQuestions > 0 ? Math.round((answeredTotal / totalQuestions) * 100) : 0,
    due: unitForecasts.reduce((s, u) => s + u.due, 0),
    confidence: forecastConfidence(answeredTotal, totalQuestions > 0 ? (answeredTotal / totalQuestions) * 100 : 0),
    trend: windowTrend(sessions, now, () => true),
    net: netRange(range),
    disciplines,
    top,
  };
}
