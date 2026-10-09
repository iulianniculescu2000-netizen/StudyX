import type { Quiz, Question } from '../types';
import { isFolderSessionQuiz } from './rezidentiatOverview';
import { isRezidentiatQuiz } from './rezidentiatBank';

export const EXAM_SIM_TAG = 'exam-simulation';
export const DISCIPLINE_TAG_PREFIX = 'disc:';
export const EXAM_SIZES = [50, 100, 200] as const;

/** Minute alocate: 1,2 minute pe întrebare (200 de grile → 4 ore). */
export const examMinutesFor = (count: number) => Math.round(count * 1.2);

export interface ExamLengthOption {
  /** Numărul efectiv de grile al simulării. */
  count: number;
  /** Mărimea cerută (50/100/200) pe care o reprezintă. */
  size: number;
  /** Banca are mai puține grile decât `size`: simularea le ia pe toate. */
  partial: boolean;
}

/** Opțiunile de lungime distincte pentru `available` grile: mărimile care s-ar reduce la același număr se contopesc. */
export function examLengthOptions(available: number): ExamLengthOption[] {
  const out: ExamLengthOption[] = [];
  for (const size of EXAM_SIZES) {
    const count = Math.min(size, available);
    if (count > 0 && !out.some((option) => option.count === count)) out.push({ count, size, partial: count < size });
  }
  return out;
}

const GENERATED_TAGS = ['recovery', 'adaptive-exam', 'mistake-bank', EXAM_SIM_TAG];

const plain = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160);

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** Seturile din care se poate extrage o simulare: grile reale, fără sesiuni generate, arhivate sau flashcarduri. */
export function examSourceQuizzes(quizzes: Quiz[]): Quiz[] {
  const eligible = quizzes.filter(
    (quiz) => !quiz.archived && quiz.kind !== 'flashcard' && !isFolderSessionQuiz(quiz)
      && !(quiz.tags ?? []).some((tag) => GENERATED_TAGS.includes(tag)) && quiz.questions.length > 0,
  );
  const bank = eligible.filter(isRezidentiatQuiz);
  return bank.length > 0 ? bank : eligible;
}

export function examDisciplines(quizzes: Quiz[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const quiz of examSourceQuizzes(quizzes)) {
    const name = quiz.category?.trim() || 'Altele';
    counts.set(name, (counts.get(name) ?? 0) + quiz.questions.length);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ro'));
}

export interface ExamSimulation {
  quiz: Quiz;
  minutes: number;
}

/**
 * Simulare completă: `count` întrebări alese la întâmplare, fără dubluri de text, punctaj cu penalizare.
 * Fiecare întrebare primește tag-ul `disc:<disciplină>` pentru raportul de la final. `random` poate fi înlocuit în teste.
 */
export function buildExamSimulation(
  quizzes: Quiz[],
  count: number,
  options: { discipline?: string | null; random?: () => number } = {},
): ExamSimulation | null {
  const random = options.random ?? Math.random;
  const pool: { question: Question; discipline: string }[] = [];
  const seen = new Set<string>();
  for (const quiz of examSourceQuizzes(quizzes)) {
    const discipline = quiz.category?.trim() || 'Altele';
    if (options.discipline && discipline !== options.discipline) continue;
    for (const question of quiz.questions) {
      const fingerprint = plain(question.text);
      if (!fingerprint || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      pool.push({ question, discipline });
    }
  }
  if (pool.length === 0) return null;

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, count);

  const quiz: Quiz = {
    id: uid(),
    title: `Simulare de examen · ${picked.length} grile`,
    description: 'Simulare cronometrată, cu punctaj cu penalizare.',
    emoji: '🎓',
    color: 'purple',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: false,
    shuffleAnswers: true,
    penaltyMode: true,
    tags: [EXAM_SIM_TAG, 'simulation'],
    questions: picked.map(({ question, discipline }) => ({
      ...question,
      id: uid(),
      options: question.options.map((option) => ({ ...option, id: uid() })),
      tags: [...(question.tags ?? []), `${DISCIPLINE_TAG_PREFIX}${discipline}`],
    })),
    createdAt: Date.now(),
  };
  return { quiz, minutes: examMinutesFor(picked.length) };
}

export interface DisciplineResult {
  discipline: string;
  correct: number;
  total: number;
  /** 0–100 */
  percent: number;
}

/** Rezultatul pe discipline, cele mai slabe întâi. `isCorrect` hotărăște pentru fiecare întrebare. */
export function disciplineBreakdown(questions: Question[], isCorrect: (question: Question) => boolean): DisciplineResult[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const question of questions) {
    const tag = (question.tags ?? []).find((t) => t.startsWith(DISCIPLINE_TAG_PREFIX));
    if (!tag) continue;
    const discipline = tag.slice(DISCIPLINE_TAG_PREFIX.length);
    const row = map.get(discipline) ?? { correct: 0, total: 0 };
    row.total += 1;
    if (isCorrect(question)) row.correct += 1;
    map.set(discipline, row);
  }
  return [...map.entries()]
    .map(([discipline, { correct, total }]) => ({ discipline, correct, total, percent: Math.round((correct / total) * 100) }))
    .sort((a, b) => a.percent - b.percent || b.total - a.total);
}
