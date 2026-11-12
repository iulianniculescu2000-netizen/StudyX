import type { Question, Quiz, QuizSession } from '../types';
import { CHAPTER_TAG_PREFIX, EXAM_SIM_TAG, examMinutesFor, isMultipleChoiceQuestion } from './examSimulation';

type Answers = Record<string, string[]>;

const correctIds = (question: Question) => question.options.filter((option) => option.isCorrect).map((option) => option.id);

/** Puncte nete pentru o întrebare: +1 corect complet, −0,25 per opțiune greșită bifată, 0 fără răspuns. */
export function questionPoints(question: Question, selected: string[]): number {
  if (selected.length === 0) return 0;
  const right = correctIds(question);
  const full = selected.length === right.length && right.every((id) => selected.includes(id));
  if (full) return 1;
  const wrong = selected.filter((id) => !right.includes(id)).length;
  return wrong === 0 ? 0 : -0.25 * wrong;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface ExamTotals {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  unanswered: number;
  /** Punctaj net, minim 0 (ca în scorul Rezidențiat). */
  net: number;
  /** net / total, 0–100 */
  percent: number;
}

export function examTotals(questions: Question[], answers: Answers | undefined): ExamTotals {
  let net = 0;
  let correct = 0;
  let answered = 0;
  for (const question of questions) {
    const selected = answers?.[question.id] ?? [];
    if (selected.length === 0) continue;
    answered += 1;
    const points = questionPoints(question, selected);
    net += points;
    if (points === 1) correct += 1;
  }
  const total = questions.length;
  const clamped = Math.max(0, round2(net));
  return { total, answered, correct, wrong: answered - correct, unanswered: total - answered, net: clamped, percent: total > 0 ? Math.round((clamped / total) * 100) : 0 };
}

export interface GroupResult {
  label: string;
  total: number;
  answered: number;
  correct: number;
  /** Punctaj net (poate fi negativ pe un capitol). */
  net: number;
  /** Corecte din cele la care s-a răspuns, 0–100; null dacă nu s-a răspuns la nimic. */
  accuracy: number | null;
}

function groupBy(questions: Question[], answers: Answers | undefined, labelOf: (question: Question) => string | null): GroupResult[] {
  const map = new Map<string, GroupResult>();
  for (const question of questions) {
    const label = labelOf(question);
    if (!label) continue;
    const row = map.get(label) ?? { label, total: 0, answered: 0, correct: 0, net: 0, accuracy: null };
    row.total += 1;
    const selected = answers?.[question.id] ?? [];
    if (selected.length > 0) {
      row.answered += 1;
      const points = questionPoints(question, selected);
      row.net = round2(row.net + points);
      if (points === 1) row.correct += 1;
    }
    map.set(label, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, accuracy: row.answered > 0 ? Math.round((row.correct / row.answered) * 100) : null }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.total - a.total || a.label.localeCompare(b.label, 'ro'));
}

/** Rezultat pe capitole (setul sursă al fiecărei grile), cele mai slabe întâi; capitolele fără răspuns la urmă nu apar ca 0%. */
export function chapterBreakdown(questions: Question[], answers: Answers | undefined): GroupResult[] {
  return groupBy(questions, answers, (question) => {
    const tag = (question.tags ?? []).find((t) => t.startsWith(CHAPTER_TAG_PREFIX));
    return tag ? tag.slice(CHAPTER_TAG_PREFIX.length) : null;
  });
}

/** CS (un singur răspuns) față de CM (mai multe răspunsuri). */
export function kindBreakdown(questions: Question[], answers: Answers | undefined): GroupResult[] {
  return groupBy(questions, answers, (question) => (isMultipleChoiceQuestion(question) ? 'CM' : 'CS')).sort((a, b) => a.label.localeCompare(b.label));
}

export interface PreviousSimulation {
  sessionId: string;
  at: number;
  total: number;
  percent: number;
  net: number;
}

/** Simulările anterioare terminate (cele mai noi întâi), fără sesiunea curentă; exclude simulările fără grile. */
export function previousSimulations(quizzes: Quiz[], sessions: QuizSession[], currentSessionId: string, limit = 5): PreviousSimulation[] {
  const simIds = new Set(quizzes.filter((quiz) => quiz.tags?.includes(EXAM_SIM_TAG)).map((quiz) => quiz.id));
  return sessions
    .filter((session) => simIds.has(session.quizId) && session.id !== currentSessionId && session.finishedAt && session.total > 0)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, limit)
    .map((session) => {
      const net = session.penalizedScore ?? session.score;
      return { sessionId: session.id, at: session.finishedAt ?? session.startedAt, total: session.total, net, percent: Math.round((net / session.total) * 100) };
    });
}

export interface ComparisonResult {
  previous: PreviousSimulation[];
  /** Media procentelor anterioare. */
  average: number;
  /** Procentul curent minus media anterioară, în puncte procentuale. */
  delta: number;
  /** Procentul curent minus ultima simulare. */
  deltaLast: number;
}

export function compareWithPrevious(currentPercent: number, previous: PreviousSimulation[]): ComparisonResult | null {
  if (previous.length === 0) return null;
  const average = Math.round(previous.reduce((sum, item) => sum + item.percent, 0) / previous.length);
  return { previous, average, delta: currentPercent - average, deltaLast: currentPercent - previous[0].percent };
}

export interface PaceEstimate {
  /** Punctaj net estimat pe tot setul, dacă ritmul de acuratețe se păstra. */
  low: number;
  mid: number;
  high: number;
  max: number;
  /** Secunde pe grilă la care ai lucrat și cele disponibile. */
  secondsPerQuestion: number;
  secondsAvailable: number;
  answered: number;
  unanswered: number;
}

/**
 * Estimare orientativă, nu predicție: extinde punctajul net pe grilele rămase fără răspuns cu media celor la care ai răspuns.
 * Intervalul (~80%) vine din împrăștierea punctelor pe grilă; la puține răspunsuri (<10) nu se dă nicio estimare.
 * Întoarce null dacă ai răspuns la toate (scorul e deja cel real) sau nu există date suficiente.
 */
export function paceEstimate(questions: Question[], answers: Answers | undefined, durationSeconds: number): PaceEstimate | null {
  const points: number[] = [];
  for (const question of questions) {
    const selected = answers?.[question.id] ?? [];
    if (selected.length > 0) points.push(questionPoints(question, selected));
  }
  const n = points.length;
  const total = questions.length;
  const unanswered = total - n;
  if (n < 10 || unanswered <= 0) return null;
  const mean = points.reduce((sum, value) => sum + value, 0) / n;
  const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const known = points.reduce((sum, value) => sum + value, 0);
  const spread = 1.28 * Math.sqrt(unanswered * variance + (unanswered * unanswered * variance) / n);
  const clamp = (value: number) => Math.min(total, Math.max(0, round2(value)));
  const mid = known + unanswered * mean;
  return {
    low: clamp(mid - spread),
    mid: clamp(mid),
    high: clamp(mid + spread),
    max: total,
    secondsPerQuestion: Math.round(durationSeconds / n),
    secondsAvailable: Math.round((examMinutesFor(total) * 60) / total),
    answered: n,
    unanswered,
  };
}
