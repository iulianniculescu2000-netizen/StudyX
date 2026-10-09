import { isFlashcardDeck } from './deckKind';
import { isFolderSessionQuiz } from './rezidentiatOverview';
import { normalizeSearchText } from './searchText';
import type { Question, QuestionStat, Quiz, QuizSession } from '../types';

/**
 * Modul „aproape de examen”: o sesiune pentru ultimele săptămâni, fără material nou de parcurs.
 * Conține doar (1) întrebările scadente, (2) cele mai greșite și (3) lacunele de acoperire (întrebări
 * încă nevăzute din seturile cu acoperire mică). Funcții pure: nu citesc niciun store.
 */

/** `recovery` ține sesiunea în afara Caietului de erori și a simulărilor; `crunch` o face recognoscibilă. */
export const CRUNCH_TAGS = ['recovery', 'crunch'] as const;
export const CRUNCH_QUIZ_ID = 'crunch-session';
export const CRUNCH_MINUTE_OPTIONS = [15, 30, 60] as const;
export const DEFAULT_SECONDS_PER_QUESTION = 45;
const MIN_SECONDS = 15;
const MAX_SECONDS = 150;
const MIN_SAMPLES = 20;
/** Un set cu acoperire sub acest prag are „lacune”. */
export const COVERAGE_GAP_THRESHOLD = 0.7;
/** Cotele de pornire (due, greșite, lacune); ce rămâne nefolosit trece la următoarea categorie, în ordinea priorității. */
const QUOTAS = { due: 0.5, missed: 0.3, gaps: 0.2 } as const;
/** Începând de la câte zile până la examen apare automat cardul de pe Panou. */
export const CRUNCH_AUTO_DAYS = 30;

const GENERATED_TAGS = ['recovery', 'adaptive-exam', 'mistake-bank', 'exam-simulation'];

export type CrunchBucket = 'due' | 'missed' | 'gaps';
export const BUCKET_ORDER: CrunchBucket[] = ['due', 'missed', 'gaps'];

export interface CrunchCandidate {
  bucket: CrunchBucket;
  quizId: string;
  quizTitle: string;
  question: Question;
}

export interface CrunchPool {
  due: CrunchCandidate[];
  missed: CrunchCandidate[];
  gaps: CrunchCandidate[];
}

export interface CrunchSelection {
  items: CrunchCandidate[];
  counts: Record<CrunchBucket, number>;
}

const isEligibleQuiz = (quiz: Quiz) =>
  !quiz.archived
  && quiz.questions.length > 0
  && !isFlashcardDeck(quiz)
  && !isFolderSessionQuiz(quiz)
  && !(quiz.tags ?? []).some((tag) => GENERATED_TAGS.includes(tag) || tag === 'crunch');

/** Aceeași întrebare scrisă în două seturi (bănci duplicate) trebuie să apară o singură dată. */
export function questionFingerprint(question: Question): string {
  const correct = question.options.filter((option) => option.isCorrect).map((option) => option.text).join(' ');
  return normalizeSearchText(`${question.text} ${correct}`)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 180);
}

interface CombinedStat {
  attempts: number;
  wrong: number;
  /** Cea mai veche scadență > 0, sau 0 dacă niciuna. */
  nextReview: number;
  retired: boolean;
}

/** Statisticile aceleiași întrebări din setul real și din sesiunile combinate („mix-…”) se adună. */
function combineStats(stats: Record<string, QuestionStat>, quizzes: Quiz[]): Map<string, CombinedStat> {
  const eligible = new Set(quizzes.filter((quiz) => isEligibleQuiz(quiz) || isFolderSessionQuiz(quiz)).map((quiz) => quiz.id));
  const out = new Map<string, CombinedStat>();
  for (const stat of Object.values(stats)) {
    if (!stat || !eligible.has(stat.quizId)) continue;
    const entry = out.get(stat.questionId) ?? { attempts: 0, wrong: 0, nextReview: 0, retired: false };
    entry.attempts += stat.timesCorrect + stat.timesWrong;
    entry.wrong += stat.timesWrong;
    if (stat.nextReview > 0 && (entry.nextReview === 0 || stat.nextReview < entry.nextReview)) entry.nextReview = stat.nextReview;
    if (stat.retired) entry.retired = true;
    out.set(stat.questionId, entry);
  }
  return out;
}

/**
 * Cele trei găleți, fără duplicate între ele (prioritate: scadente > greșite > lacune) și fără
 * duplicate de conținut între seturi. Fiecare gălată e deja ordonată de la cel mai urgent.
 */
export function collectCrunchPool(
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
  now: number = Date.now(),
): CrunchPool {
  const combined = combineStats(stats, quizzes);
  const seen = new Set<string>();
  const pool: CrunchPool = { due: [], missed: [], gaps: [] };
  const dueScored: { c: CrunchCandidate; score: number }[] = [];
  const missedScored: { c: CrunchCandidate; score: number }[] = [];
  const unseenBySet: { coverage: number; items: CrunchCandidate[] }[] = [];

  for (const quiz of quizzes) {
    if (!isEligibleQuiz(quiz)) continue;
    let seenCount = 0;
    const unseen: CrunchCandidate[] = [];
    const counted = new Set<string>();
    for (const question of quiz.questions) {
      const stat = combined.get(question.id);
      if (stat?.retired) continue;
      const fingerprint = questionFingerprint(question);
      if (seen.has(fingerprint) || counted.has(fingerprint)) continue;
      counted.add(fingerprint);
      const attempts = stat?.attempts ?? 0;
      if (attempts > 0) seenCount++;
      const make = (bucket: CrunchBucket): CrunchCandidate => ({ bucket, quizId: quiz.id, quizTitle: quiz.title, question });

      if (stat && stat.nextReview > 0 && stat.nextReview <= now) {
        seen.add(fingerprint);
        // Cele mai întârziate primele; la egalitate, cele greșite des.
        dueScored.push({ c: make('due'), score: (now - stat.nextReview) / 86_400_000 + stat.wrong * 0.5 });
      } else if (stat && attempts > 0 && (stat.wrong >= 2 || (stat.wrong >= 1 && (attempts - stat.wrong) / attempts < 0.5))) {
        seen.add(fingerprint);
        missedScored.push({ c: make('missed'), score: stat.wrong * 1 + (1 - (attempts - stat.wrong) / attempts) * 3 });
      } else if (attempts === 0) {
        unseen.push(make('gaps'));
      }
    }
    const total = counted.size;
    const coverage = total > 0 ? seenCount / total : 1;
    if (unseen.length > 0 && coverage < COVERAGE_GAP_THRESHOLD) unseenBySet.push({ coverage, items: unseen });
  }

  pool.due = dueScored.sort((a, b) => b.score - a.score).map((entry) => entry.c);
  pool.missed = missedScored.sort((a, b) => b.score - a.score).map((entry) => entry.c);

  // Lacunele: seturile cele mai puțin acoperite primele, dar pe rând (round-robin), ca să nu iasă
  // o sesiune dintr-un singur capitol.
  unseenBySet.sort((a, b) => a.coverage - b.coverage);
  for (let round = 0; ; round++) {
    let added = false;
    for (const set of unseenBySet) {
      const candidate = set.items[round];
      if (!candidate) continue;
      const fingerprint = questionFingerprint(candidate.question);
      added = true;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      pool.gaps.push(candidate);
    }
    if (!added) break;
  }
  return pool;
}

/** Secundele medii pe întrebare din istoricul sesiunilor (mediană, ca un răspuns uitat deschis să nu strice media). */
export function avgSecondsPerQuestion(sessions: Pick<QuizSession, 'timePerQuestion' | 'startedAt' | 'finishedAt' | 'total'>[]): number {
  const samples: number[] = [];
  for (const session of sessions.slice(-60)) {
    const times = Object.values(session.timePerQuestion ?? {}).filter((value) => value > 0 && value < 600);
    if (times.length > 0) { samples.push(...times); continue; }
    if (session.finishedAt && session.total >= 5) {
      const perQuestion = (session.finishedAt - session.startedAt) / 1000 / session.total;
      if (perQuestion > 0 && perQuestion < 600) samples.push(perQuestion);
    }
  }
  if (samples.length < MIN_SAMPLES) return DEFAULT_SECONDS_PER_QUESTION;
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(median)));
}

export const questionsForMinutes = (minutes: number, secondsPerQuestion: number): number =>
  Math.max(1, Math.floor((minutes * 60) / Math.max(secondsPerQuestion, 1)));

/** Alege cel mult `size` întrebări: cote 50/30/20, iar ce rămâne neocupat trece la următoarea categorie. */
export function selectCrunch(pool: CrunchPool, size: number): CrunchSelection {
  const taken: Record<CrunchBucket, CrunchCandidate[]> = { due: [], missed: [], gaps: [] };
  const total = () => taken.due.length + taken.missed.length + taken.gaps.length;
  const take = (bucket: CrunchBucket, limit: number) => {
    const room = Math.min(limit, size - total(), pool[bucket].length - taken[bucket].length);
    if (room > 0) taken[bucket].push(...pool[bucket].slice(taken[bucket].length, taken[bucket].length + room));
  };
  for (const bucket of BUCKET_ORDER) take(bucket, Math.ceil(size * QUOTAS[bucket]));
  for (const bucket of BUCKET_ORDER) take(bucket, size);
  return {
    items: BUCKET_ORDER.flatMap((bucket) => taken[bucket]),
    counts: { due: taken.due.length, missed: taken.missed.length, gaps: taken.gaps.length },
  };
}

export interface CrunchOption {
  minutes: number;
  size: number;
  counts: Record<CrunchBucket, number>;
}

/** Ce primește utilizatorul la 15/30/60 de minute, cu ritmul lui de lucru. */
export function crunchOptions(pool: CrunchPool, secondsPerQuestion: number): CrunchOption[] {
  return CRUNCH_MINUTE_OPTIONS.map((minutes) => {
    const selection = selectCrunch(pool, questionsForMinutes(minutes, secondsPerQuestion));
    return { minutes, size: selection.items.length, counts: selection.counts };
  });
}

/** Sesiunea de joc. Întrebările își păstrează id-urile (răspunsurile scadente se leagă de aceleași întrebări); setul e marcat ca generat. */
export function buildCrunchQuiz(pool: CrunchPool, minutes: number, secondsPerQuestion: number, now: number = Date.now()): Quiz | null {
  const selection = selectCrunch(pool, questionsForMinutes(minutes, secondsPerQuestion));
  if (selection.items.length === 0) return null;
  const { due, missed, gaps } = selection.counts;
  return {
    id: CRUNCH_QUIZ_ID,
    title: `Aproape de examen · ${minutes} min`,
    description: `${due} scadente, ${missed} greșite des, ${gaps} lacune. Fără material nou.`,
    emoji: '⏳',
    color: 'red',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: true,
    shuffleAnswers: false,
    tags: [...CRUNCH_TAGS],
    questions: selection.items.map((item) => ({ ...item.question, options: item.question.options.map((option) => ({ ...option })) })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Cardul de pe Panou apare automat când examenul e în cel mult 30 de zile, sau când utilizatorul îl activează. */
export function shouldShowCrunch(daysLeft: number | null, passed: boolean, enabled: boolean): boolean {
  if (enabled) return true;
  return daysLeft !== null && !passed && daysLeft <= CRUNCH_AUTO_DAYS;
}
