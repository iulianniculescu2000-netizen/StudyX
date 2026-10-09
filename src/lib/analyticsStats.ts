/**
 * Cifrele din Perspective AI, toate calculate din răspunsurile reale ale utilizatorului. Funcții pure:
 * primesc datele (și `now`) ca argumente, nu citesc store-uri și nu apelează Date.now().
 *
 * Nu există un model de „scor prezis": grilele din bancă nu sunt calibrate pe examen. Ce se poate spune
 * onest e acuratețea pe grilele rezolvate, cu un interval de nesiguranță care se strânge pe măsură ce
 * se adună întrebări distincte rezolvate.
 */
import type { Question, QuestionStat, Quiz, QuizSession } from '../types';
import { isFlashcardDeck } from './deckKind';

/* ───────────────────────── Interval de nesiguranță ───────────────────────── */

export interface Interval { lo: number; hi: number }

/** Intervalul Wilson 95% pentru k reușite din n, în procente rotunjite. n = 0 nu are interval. */
export function wilson(k: number, n: number): Interval | null {
  if (!(n > 0)) return null;
  const z = 1.96;
  const z2 = z * z;
  const p = Math.min(1, Math.max(0, k / n));
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    lo: Math.max(0, Math.round((center - margin) * 100)),
    hi: Math.min(100, Math.round((center + margin) * 100)),
  };
}

export type ConfidenceLevel = 'none' | 'low' | 'medium' | 'high';

export const MIN_QUESTIONS_FOR_ESTIMATE = 10;

/** Cât de multă încredere merită estimarea, după numărul de întrebări DISTINCTE rezolvate (nu de încercări). */
export function confidenceLevel(distinctQuestions: number): ConfidenceLevel {
  if (distinctQuestions < MIN_QUESTIONS_FOR_ESTIMATE) return 'none';
  if (distinctQuestions < 30) return 'low';
  if (distinctQuestions < 100) return 'medium';
  return 'high';
}

export const CONFIDENCE_LABEL: Record<Exclude<ConfidenceLevel, 'none'>, string> = {
  low: 'Date puține',
  medium: 'Date moderate',
  high: 'Date suficiente',
};

/* ───────────────────────── Estimarea de pregătire ───────────────────────── */

/** Seturi făcute de aplicație din greșelile tale sau pentru simulări: aceleași întrebări, altă formă. */
const DERIVED_SET_TAGS = ['mistake-bank', 'adaptive-exam'];

/**
 * Un set care contează ca „grile” în cifre: nu e pachet de flashcarduri, nu e arhivat și nu e un set
 * derivat (banca de greșeli, examenul adaptiv). Sesiunile combinate rămân, dar întrebările lor se numără o singură dată.
 */
export function countsAsGrile(quiz: Pick<Quiz, 'kind' | 'tags' | 'questions' | 'archived'>): boolean {
  if (quiz.archived) return false;
  if ((quiz.tags ?? []).some((tag) => DERIVED_SET_TAGS.includes(tag.toLowerCase()))) return false;
  return !isFlashcardDeck(quiz);
}

/** Id-urile întrebărilor din grile (vezi `countsAsGrile`); o întrebare dintr-o sesiune combinată se numără o singură dată. */
export function distinctQuestionIds(quizzes: Quiz[]): Set<string> {
  const ids = new Set<string>();
  for (const quiz of quizzes) {
    if (!countsAsGrile(quiz)) continue;
    for (const question of quiz.questions) ids.add(question.id);
  }
  return ids;
}

export interface Readiness {
  /** Întrebări distincte cu cel puțin o încercare. */
  answered: number;
  /** Întrebări distincte în toate grilele. */
  total: number;
  /** Încercări însumate (repetările nu cresc încrederea, dar se arată). */
  attempts: number;
  /** Acuratețe medie pe întrebare distinctă, 0–100. */
  accuracy: number;
  interval: Interval | null;
  level: ConfidenceLevel;
  /** True de la 100 de întrebări distincte: nivelul cel mai de sus de încredere. */
  sufficient: boolean;
  /** answered / total, 0–100. */
  coverage: number;
}

/**
 * Acuratețea pe grilele rezolvate: pentru fiecare întrebare cu ≥1 încercare p_q = corecte / încercări,
 * apoi media peste întrebările distincte. Intervalul folosește numărul de întrebări distincte (m),
 * ca repetarea aceleiași întrebări să nu creeze încredere falsă.
 */
export function readiness(questionStats: Record<string, QuestionStat>, knownQuestionIds: ReadonlySet<string>): Readiness {
  const perQuestion = new Map<string, { correct: number; wrong: number }>();
  for (const stat of Object.values(questionStats)) {
    // Istoricul retras (copiat pe pachetele de capitol) ar număra aceeași grilă de două ori.
    if (stat.retired || !knownQuestionIds.has(stat.questionId)) continue;
    const right = Number(stat.timesCorrect);
    const wrong = Number(stat.timesWrong);
    if (!Number.isFinite(right) || !Number.isFinite(wrong) || right < 0 || wrong < 0) continue;
    if (!(right + wrong > 0)) continue;
    const current = perQuestion.get(stat.questionId) ?? { correct: 0, wrong: 0 };
    current.correct += right;
    current.wrong += wrong;
    perQuestion.set(stat.questionId, current);
  }

  const m = perQuestion.size;
  let attempts = 0;
  let sum = 0;
  for (const { correct, wrong } of perQuestion.values()) {
    attempts += correct + wrong;
    sum += correct / (correct + wrong);
  }
  const p = m > 0 && Number.isFinite(sum) ? sum / m : 0;
  const total = knownQuestionIds.size;
  return {
    answered: m,
    total,
    attempts,
    accuracy: Math.round(p * 100),
    interval: wilson(Math.round(p * m), m),
    level: confidenceLevel(m),
    sufficient: confidenceLevel(m) === 'high',
    coverage: total > 0 ? Math.min(100, Math.round((m / total) * 100)) : 0,
  };
}

/** Grile/zi necesare până la examen. Fără examen (null) nu există ritm necesar; în ziua examenului rămân toate. */
export function neededPerDay(unsolved: number, daysLeft: number | null): number | null {
  if (daysLeft === null) return null;
  return Math.ceil(Math.max(0, unsolved) / Math.max(1, daysLeft));
}

/* ───────────────────────── Topicuri ───────────────────────── */

export const MIN_TOPIC_N = 5;
export const STRONG_TOPIC_N = 10;
export const TARGET_ACCURACY = 85;
export const STRONG_ACCURACY = 80;
const PRIOR_MEAN = 65;
const PRIOR_WEIGHT = 4;
const WEAK_BELOW = 70;

/** Etichete tehnice puse de aplicație (cum a fost făcut un set, nu despre ce e vorba). */
const TECHNICAL_LABELS = new Set([
  'ai', 'chat', 'remediere', 'greseli', 'pdf', 'ai-studio', 'chapter-pack', 'document-pack', 'mistake-bank',
  'recovery', 'weakness', 'adaptive-exam', 'simulation', 'plan-examen', 'anki-import',
  'flashcard', 'flashcards', 'deck', 'anki', 'atlas', 'foto', 'quiz', 'import', 'imported', 'visual', 'image',
]);
const FILE_NAME = /\.(pdf|docx?|pptx?|txt|md|epub|csv|json|apkg|png|jpe?g)$/i;
const plain = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Etichete care spun de unde vine un set, nu despre ce e vorba: nu sunt topicuri (marcajele rezidențiatului, etichetele tehnice, numele de fișier). */
export function isGenericTag(tag: string): boolean {
  if (tag === 'rezidentiat' || tag.startsWith('rezidentiat-bank:') || tag.startsWith('folder-session:')) return true;
  const label = plain(tag);
  return label === '' || TECHNICAL_LABELS.has(label) || FILE_NAME.test(label);
}

/**
 * Topicul/topicurile unei întrebări, în ordine: etichetele întrebării; numele folderului; categoria setului.
 * Etichetele setului nu sunt sursă de topic (sunt aproape toate tehnice: un set generat din chat ar apărea ca „ai”).
 * Categoria care e ea însăși un termen tehnic sau un nume de fișier se ignoră.
 */
export function topicsOfQuestion(quiz: Pick<Quiz, 'folderId' | 'category'>, question: Pick<Question, 'tags'>, folderNameById: ReadonlyMap<string, string>): string[] {
  const own = (question.tags ?? []).filter((tag) => typeof tag === 'string' && !isGenericTag(tag)).map((tag) => tag.trim());
  if (own.length > 0) return own;
  const folderName = quiz.folderId ? folderNameById.get(quiz.folderId)?.trim() : '';
  if (folderName) return [folderName];
  const category = quiz.category?.trim();
  return category && !isGenericTag(category) ? [category] : [];
}

export interface TopicStat {
  topic: string;
  correct: number;
  /** Încercări. */
  total: number;
  /** Acuratețe brută, procente rotunjite. */
  accuracy: number;
  /** Acuratețe trasă spre media 65 (pondere 4), ca un singur răspuns greșit să nu pară un tipar. Procente cu o zecimală. */
  shrunk: number;
}

/** Rata de reușită trasă spre media 65 (pondere 4), 0–1: o singură încercare nu bate un tipar de 20. */
export const shrunkRate = (correct: number, total: number) =>
  (correct + (PRIOR_WEIGHT * PRIOR_MEAN) / 100) / (total + PRIOR_WEIGHT);

const shrunkPct = (correct: number, total: number) => Math.round(shrunkRate(correct, total) * 1000) / 10;

/** Acuratețea pe topicuri, fără etichetele generice (`rezidentiat`, `rezidentiat-bank:*`, `folder-session:*`). Pachetele de flashcarduri nu intră. */
export function analyticsTopicStats(
  quizzes: Quiz[],
  questionStats: Record<string, QuestionStat>,
  folderNameById: ReadonlyMap<string, string>,
): TopicStat[] {
  const acc = new Map<string, { correct: number; total: number }>();
  for (const quiz of quizzes) {
    if (!countsAsGrile(quiz)) continue;
    for (const question of quiz.questions) {
      const stat = questionStats[`${quiz.id}:${question.id}`];
      if (!stat) continue;
      const attempts = stat.timesCorrect + stat.timesWrong;
      if (attempts <= 0) continue;
      for (const topic of topicsOfQuestion(quiz, question, folderNameById)) {
        const entry = acc.get(topic) ?? { correct: 0, total: 0 };
        entry.correct += stat.timesCorrect;
        entry.total += attempts;
        acc.set(topic, entry);
      }
    }
  }
  return [...acc.entries()].map(([topic, { correct, total }]) => ({
    topic,
    correct,
    total,
    accuracy: Math.round((correct / total) * 100),
    shrunk: shrunkPct(correct, total),
  }));
}

export interface TopicBuckets {
  /** n ≥ 5 și acuratețea trasă sub 70%; cele mai slabe întâi. */
  weak: TopicStat[];
  /** n ≥ 10 și acuratețe ≥ 80%; cele mai bune întâi. */
  strong: TopicStat[];
  /** Topicuri cu sub 5 încercări: nu se evaluează. */
  unrated: number;
}

const isStrong = (t: TopicStat) => t.total >= STRONG_TOPIC_N && t.accuracy >= STRONG_ACCURACY;

export function classifyTopics(topics: TopicStat[]): TopicBuckets {
  const weak = topics
    .filter((t) => t.total >= MIN_TOPIC_N && t.shrunk < WEAK_BELOW)
    .sort((a, b) => a.shrunk - b.shrunk || b.total - a.total);
  const strong = topics
    .filter((t) => isStrong(t))
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  return { weak, strong, unrated: topics.filter((t) => t.total < MIN_TOPIC_N).length };
}

export type TopicTrend = 'improving' | 'declining' | 'stable';

export const MIN_TREND_RESULTS = 8;
const TREND_STEP = 0.34;

/**
 * Trendul dintr-un topic după ultimele rezultate (cel mult 10, de la cel mai vechi): prima jumătate față de a doua.
 * Sub 8 rezultate nu se arată trend; schimbarea trebuie să fie de cel puțin 0,34 ca să conteze.
 */
export function topicTrend(recent: readonly boolean[] | null | undefined): TopicTrend | null {
  if (!Array.isArray(recent) || recent.length < MIN_TREND_RESULTS) return null;
  const mid = Math.floor(recent.length / 2);
  const rate = (part: readonly boolean[]) => part.filter(Boolean).length / part.length;
  const delta = rate(recent.slice(mid)) - rate(recent.slice(0, mid));
  if (delta >= TREND_STEP) return 'improving';
  if (delta <= -TREND_STEP) return 'declining';
  return 'stable';
}

export type GapPriority = 'mare' | 'medie' | 'mica';

/** Prioritatea după distanța față de ținta orientativă de 85%. */
export function gapPriority(accuracy: number): GapPriority {
  const gap = TARGET_ACCURACY - accuracy;
  if (gap >= 30) return 'mare';
  if (gap >= 15) return 'medie';
  return 'mica';
}

export interface KnowledgeGapItem {
  topic: string;
  accuracy: number;
  attempts: number;
  /** Puncte procentuale până la ținta de 85%. */
  gap: number;
  priority: GapPriority;
  trend: TopicTrend | null;
}

/** Golurile: topicuri evaluate (n ≥ 5) sub ținta orientativă, cele mai slabe întâi. Un topic „tare” nu e și gol. */
export function buildGaps(topics: TopicStat[], trendOf: (topic: string) => TopicTrend | null = () => null, limit = 8): KnowledgeGapItem[] {
  return topics
    .filter((t) => t.total >= MIN_TOPIC_N && t.accuracy < TARGET_ACCURACY && !isStrong(t))
    .sort((a, b) => a.shrunk - b.shrunk || b.total - a.total)
    .slice(0, limit)
    .map((t) => ({
      topic: t.topic,
      accuracy: t.accuracy,
      attempts: t.total,
      gap: TARGET_ACCURACY - t.accuracy,
      priority: gapPriority(t.accuracy),
      trend: trendOf(t.topic),
    }));
}

/* ───────────────────────── Perioada de analiză ───────────────────────── */

export const DAY_MS = 86_400_000;
/** Sub atâtea grile într-o fereastră nu se arată acuratețea ei. */
export const MIN_WINDOW_QUESTIONS = 10;
/** Diferența față de fereastra anterioară se arată doar dacă ambele ferestre au cel puțin atâtea grile. */
export const MIN_DELTA_QUESTIONS = 30;

/** Perioadele de analiză: eticheta din control și titlul cardurilor filtrate pe perioadă. */
export const PERIODS = [
  { days: 7, label: '7 zile', span: 'În ultimele 7 zile' },
  { days: 30, label: '30 de zile', span: 'În ultimele 30 de zile' },
  { days: 180, label: '6 luni', span: 'În ultimele 6 luni' },
] as const;
export type PeriodDays = (typeof PERIODS)[number]['days'];
export const DEFAULT_PERIOD: PeriodDays = 30;

export interface WindowAgg {
  sessions: number;
  solved: number;
  correct: number;
  /** Procente rotunjite; null sub 10 grile rezolvate în fereastră (prea puține ca să spună ceva). */
  accuracy: number | null;
  /** Procente nerotunjite (null când nu s-a rezolvat nimic), pentru diferența dintre ferestre. */
  rawAccuracy: number | null;
}

export interface WindowComparison {
  current: WindowAgg;
  previous: WindowAgg;
  /** Puncte procentuale față de fereastra anterioară; null dacă oricare are sub 30 de grile. Rotunjită ca în dashboardTrends. */
  delta: number | null;
}

function aggregate(sessions: QuizSession[], from: number, to: number): WindowAgg {
  let count = 0;
  let solved = 0;
  let correct = 0;
  for (const session of sessions) {
    const at = session.finishedAt;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    if (at < from || at >= to) continue;
    if (!(session.total > 0)) continue;
    count += 1;
    solved += session.total;
    correct += Math.min(session.total, Math.max(0, session.score));
  }
  const rawAccuracy = solved > 0 ? (correct / solved) * 100 : null;
  return {
    sessions: count,
    solved,
    correct,
    accuracy: rawAccuracy !== null && solved >= MIN_WINDOW_QUESTIONS ? Math.round(rawAccuracy) : null,
    rawAccuracy,
  };
}

/** Sesiunile terminate în [now − days·zi, now) față de cele din fereastra anterioară, de aceeași lungime. Sesiunile nefinalizate se ignoră. */
export function windowStats(sessions: QuizSession[], now: number, days: number): WindowComparison {
  const span = days * DAY_MS;
  const current = aggregate(sessions, now - span, now);
  const previous = aggregate(sessions, now - 2 * span, now - span);
  const delta = current.solved >= MIN_DELTA_QUESTIONS && previous.solved >= MIN_DELTA_QUESTIONS
    && current.rawAccuracy !== null && previous.rawAccuracy !== null
    ? Math.round(current.rawAccuracy - previous.rawAccuracy)
    : null;
  return { current, previous, delta };
}

export interface Pace {
  /** Grile pe zi, numărate în sesiuni (cu repetări). */
  perDay: number;
  /** Zilele pe care s-a făcut media: cel mult `maxDays`, dar nu mai mult decât de la prima sesiune. */
  days: number;
  solved: number;
}

/**
 * Grile pe zi în sesiunile terminate din ultimele `maxDays` zile. Dacă prima sesiune e mai recentă, se împarte
 * la zilele scurse de atunci (altfel cine abia a început ar părea mai lent decât e). Fără nicio sesiune: null.
 * Numără grile rezolvate în sesiuni, cu repetări, deci nu e comparabil 1:1 cu „ritmul necesar” (care numără grile distincte).
 */
export function dailyPace(sessions: QuizSession[], now: number, maxDays = 14): Pace | null {
  let first = Infinity;
  for (const session of sessions) {
    const at = session.finishedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at >= now || !(session.total > 0)) continue;
    first = Math.min(first, at);
  }
  if (!Number.isFinite(first)) return null;
  const days = Math.min(maxDays, Math.max(1, Math.ceil((now - first) / DAY_MS)));
  const { solved } = aggregate(sessions, now - days * DAY_MS, now);
  return { perDay: solved / days, days, solved };
}

const SUMMARY_FRESH_MS = 36 * 3_600_000;

/** Câte zile are rezumatul planului dacă e mai vechi de 36 de ore; null dacă e proaspăt sau fără dată. */
export function summaryAgeDays(ts: unknown, now: number): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null;
  const age = now - ts;
  return age > SUMMARY_FRESH_MS ? Math.max(1, Math.floor(age / DAY_MS)) : null;
}

/** „1 zi”, „5 zile”, „25 de zile”: de la 20 în sus (și la sute rotunde) se intercalează „de”. */
export function roCount(n: number, one: string, many: string): string {
  const text = n.toLocaleString('ro-RO');
  if (n === 1) return `${text} ${one}`;
  const de = n !== 0 && (n % 100 === 0 || n % 100 >= 20) ? 'de ' : '';
  return `${text} ${de}${many}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Prima zi (YYYY-MM-DD, locală) a ferestrei care se termină azi și are `days` zile. */
export function windowStartDay(now: number, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - (days - 1));
  return dayKey(d);
}

/** Zilele de studiu (din serie) care cad în fereastră. */
export function studyDaysInWindow(studyDates: readonly string[], now: number, days: number): number {
  const from = windowStartDay(now, days);
  const to = dayKey(new Date(now));
  return new Set(studyDates.filter((d) => typeof d === 'string' && d >= from && d <= to)).size;
}

export interface LoggedDay { h: number; g: number; ok: number }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** Jurnalul zilnic din Organizare, citit defensiv (starea poate fi goală, veche sau importată). */
export function readLoggedDays(organizareState: unknown): Record<string, LoggedDay> {
  if (!organizareState || typeof organizareState !== 'object') return {};
  const log = (organizareState as { log?: unknown }).log;
  if (!log || typeof log !== 'object') return {};
  const out: Record<string, LoggedDay> = {};
  for (const [day, raw] of Object.entries(log as Record<string, unknown>)) {
    if (!DAY_RE.test(day) || !raw || typeof raw !== 'object') continue;
    const entry = raw as { h?: unknown; g?: unknown; ok?: unknown };
    out[day] = { h: num(entry.h), g: num(entry.g), ok: num(entry.ok) };
  }
  return out;
}

export interface LoggedWindow {
  /** Zile cu intrare în jurnal. */
  entries: number;
  hours: number;
  solved: number;
  correct: number;
}

export function loggedWindow(log: Record<string, LoggedDay>, now: number, days: number): LoggedWindow {
  const from = windowStartDay(now, days);
  const to = dayKey(new Date(now));
  const out: LoggedWindow = { entries: 0, hours: 0, solved: 0, correct: 0 };
  for (const [day, entry] of Object.entries(log)) {
    if (day < from || day > to) continue;
    out.entries += 1;
    out.hours += entry.h;
    out.solved += entry.g;
    out.correct += entry.ok;
  }
  return out;
}

/** Greșelile păstrate în profil (cel mult 12) care cad în fereastră. */
export function mistakesInWindow(mistakes: readonly { timestamp: number }[], now: number, days: number): number {
  const from = now - days * DAY_MS;
  return mistakes.filter((m) => typeof m.timestamp === 'number' && m.timestamp >= from && m.timestamp < now).length;
}
