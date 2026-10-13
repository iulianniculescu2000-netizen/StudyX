import type { QuestionStat, Quiz } from '../types';
import { isFlashcardDeck } from './deckKind';
import { isFolderSessionQuiz } from './rezidentiatOverview';

export interface TopicMastery {
  topic: string;
  /** 0–100: acuratețe netezită, scăzută ușor cu timpul scurs de la ultima întâlnire. */
  mastery: number;
  /** Răspunsuri numărate (corecte + greșite). */
  answered: number;
  wrong: number;
  /** Ultimul răspuns pe subiect (ms); 0 dacă lipsește. */
  lastSeen: number;
  daysSince: number;
}

export type FocusKind = 'weak' | 'stale';

export interface StudyFocusItem {
  kind: FocusKind;
  topic: TopicMastery;
}

/** Sesiunile generate refac întrebări deja numărate la sursă: nu intră în stăpânire. */
const GENERATED_TAGS = ['recovery', 'adaptive-exam', 'mistake-bank', 'exam-simulation'];
/** Excepție: „Exersarea țintită” are răspunsuri proprii, care trebuie să miște scorul subiectului. */
export const TOPIC_PRACTICE_TAG = 'topic-practice';

/**
 * „Exersare: …” și „Grile noi: …” sunt mijloace de a exersa un subiect, nu grile ale studentului: se ascund din listele
 * de grile și din contoare, dar răspunsurile lor rămân în stăpânirea subiectului.
 */
export const isTopicPracticeQuiz = (quiz: Pick<Quiz, 'tags'>): boolean => (quiz.tags ?? []).includes(TOPIC_PRACTICE_TAG);
const STRUCTURE_TAG = /^(chapter|book):/;
const DAY_MS = 86_400_000;

/** Sub acest număr de răspunsuri, scorul ar fi zgomot: subiectul nu intră în clasament. */
export const MIN_ANSWERS = 3;
/** Sub acest prag un subiect e „de întărit”. */
export const WEAK_BELOW = 65;
/** Un subiect stăpânit, neatins de atâtea zile, e „de reîmprospătat”. */
export const STALE_AFTER_DAYS = 7;
/** După atâtea zile penalizarea de uitare ajunge la maxim. */
const FORGET_FULL_DAYS = 30;
const FORGET_MAX = 0.25;

function topicsOf(quiz: Quiz, tags: string[] | undefined): string[] {
  const own = (tags ?? []).filter((tag) => !STRUCTURE_TAG.test(tag));
  if (own.length > 0) return own;
  const category = quiz.category?.trim();
  return category ? [category] : [];
}

/** Grilele care contează pentru stăpânire: nu flashcarduri, nu pachete arhivate, nu sesiuni generate (în afară de exersarea țintită). */
export function countsForMastery(quiz: Quiz): boolean {
  if (quiz.archived || isFlashcardDeck(quiz) || isFolderSessionQuiz(quiz)) return false;
  const tags = quiz.tags ?? [];
  return tags.includes(TOPIC_PRACTICE_TAG) || !tags.some((tag) => GENERATED_TAGS.includes(tag));
}

/** Subiectele unei întrebări: etichetele ei, apoi cele ale pachetului, apoi categoria pachetului. */
export function questionTopics(quiz: Quiz, question: Quiz['questions'][number]): string[] {
  const quizTags = (quiz.tags ?? []).filter((tag) => !STRUCTURE_TAG.test(tag));
  return topicsOf(quiz, question.tags?.length ? question.tags : quizTags);
}

/** Stăpânirea fiecărui subiect, din aceleași statistici pe întrebare ca restul aplicației. */
export function computeTopicMastery(
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
  now: number = Date.now(),
): TopicMastery[] {
  const acc = new Map<string, { correct: number; wrong: number; lastSeen: number }>();

  for (const quiz of quizzes) {
    if (!countsForMastery(quiz)) continue;

    for (const question of quiz.questions) {
      const stat = stats[`${quiz.id}:${question.id}`];
      if (!stat || stat.retired) continue;
      const total = stat.timesCorrect + stat.timesWrong;
      if (total <= 0) continue;
      for (const topic of questionTopics(quiz, question)) {
        const row = acc.get(topic) ?? { correct: 0, wrong: 0, lastSeen: 0 };
        row.correct += stat.timesCorrect;
        row.wrong += stat.timesWrong;
        row.lastSeen = Math.max(row.lastSeen, stat.lastSeen || 0);
        acc.set(topic, row);
      }
    }
  }

  const out: TopicMastery[] = [];
  for (const [topic, row] of acc) {
    const answered = row.correct + row.wrong;
    const daysSince = row.lastSeen > 0 ? Math.max(0, Math.floor((now - row.lastSeen) / DAY_MS)) : 0;
    const smoothed = (row.correct + 1) / (answered + 2);
    const forgetting = FORGET_MAX * Math.min(1, daysSince / FORGET_FULL_DAYS);
    out.push({
      topic,
      mastery: Math.round(100 * smoothed * (1 - forgetting)),
      answered,
      wrong: row.wrong,
      lastSeen: row.lastSeen,
      daysSince,
    });
  }
  return out;
}

/**
 * Ce merită făcut azi: cele mai slabe subiecte, apoi cele stăpânite dar neatinse de mult.
 * Subiectele cu prea puține răspunsuri sunt ignorate, ca să nu propunem după un singur răspuns greșit.
 */
export function pickStudyFocus(topics: TopicMastery[], limit = 3): StudyFocusItem[] {
  const eligible = topics.filter((t) => t.answered >= MIN_ANSWERS);
  const weak = eligible
    .filter((t) => t.mastery < WEAK_BELOW && t.wrong > 0)
    .sort((a, b) => a.mastery - b.mastery || b.wrong - a.wrong || a.topic.localeCompare(b.topic, 'ro'))
    .map((topic): StudyFocusItem => ({ kind: 'weak', topic }));
  const stale = eligible
    .filter((t) => t.mastery >= WEAK_BELOW && t.daysSince >= STALE_AFTER_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince || a.topic.localeCompare(b.topic, 'ro'))
    .map((topic): StudyFocusItem => ({ kind: 'stale', topic }));
  // Cel mult două subiecte slabe, ca ultimul loc să rămână pentru reîmprospătare când există.
  const picked = weak.slice(0, Math.max(1, limit - (stale.length > 0 ? 1 : 0)));
  return [...picked, ...stale].slice(0, limit);
}
