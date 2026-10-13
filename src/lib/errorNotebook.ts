import type { Question, QuestionStat, Quiz } from '../types';
import { isFolderSessionQuiz } from './rezidentiatOverview';
import { matchesQuery } from './searchText';

export interface ErrorEntry {
  key: string;
  quiz: Quiz;
  question: Question;
  stat: QuestionStat;
  wrong: number;
  total: number;
  /** 0–100 */
  accuracy: number;
  /** Greșeala e „închisă” după 3 răspunsuri corecte la rând. */
  mastered: boolean;
}

export interface ErrorGroup {
  category: string;
  entries: ErrorEntry[];
  wrong: number;
}

export type ErrorSort = 'wrong' | 'recent' | 'accuracy';

/** Sesiunile generate automat (recuperare, simulare, caiet de greșeli) refac întrebări deja numărate la sursă. */
const GENERATED_TAGS = ['recovery', 'adaptive-exam', 'mistake-bank', 'exam-simulation'];
const isGeneratedQuiz = (quiz: Pick<Quiz, 'tags'>) => (quiz.tags ?? []).some((tag) => GENERATED_TAGS.includes(tag));

export const MASTERED_STREAK = 3;

export function buildErrorEntries(
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
  options: { includeMastered?: boolean } = {},
): ErrorEntry[] {
  const entries: ErrorEntry[] = [];
  for (const quiz of quizzes) {
    if (quiz.archived || quiz.kind === 'flashcard' || isFolderSessionQuiz(quiz) || isGeneratedQuiz(quiz)) continue;
    for (const question of quiz.questions) {
      const key = `${quiz.id}:${question.id}`;
      const stat = stats[key];
      if (!stat || stat.retired || stat.timesWrong <= 0) continue;
      const total = stat.timesCorrect + stat.timesWrong;
      const mastered = (stat.consecutiveCorrect ?? 0) >= MASTERED_STREAK;
      if (mastered && !options.includeMastered) continue;
      entries.push({
        key,
        quiz,
        question,
        stat,
        wrong: stat.timesWrong,
        total,
        accuracy: Math.round((stat.timesCorrect / total) * 100),
        mastered,
      });
    }
  }
  return entries;
}

const sorters: Record<ErrorSort, (a: ErrorEntry, b: ErrorEntry) => number> = {
  wrong: (a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy,
  recent: (a, b) => b.stat.lastSeen - a.stat.lastSeen,
  accuracy: (a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong,
};

export function filterErrorEntries(entries: ErrorEntry[], search: string): ErrorEntry[] {
  if (!search.trim()) return entries;
  return entries.filter((entry) =>
    matchesQuery(`${entry.question.text} ${entry.quiz.title} ${entry.quiz.category ?? ''}`, search)
  );
}

export function groupErrors(entries: ErrorEntry[], sort: ErrorSort = 'wrong'): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const entry of entries) {
    const category = entry.quiz.category?.trim() || 'Altele';
    const group = groups.get(category) ?? { category, entries: [], wrong: 0 };
    group.entries.push(entry);
    group.wrong += entry.wrong;
    groups.set(category, group);
  }
  const list = [...groups.values()];
  for (const group of list) group.entries.sort(sorters[sort]);
  return list.sort((a, b) => b.wrong - a.wrong || a.category.localeCompare(b.category, 'ro'));
}

/** O sesiune nouă din greșelile alese: întrebări clonate, cu tag-ul `mistake-bank` ca să nu dubleze statisticile. */
export function buildErrorPracticeQuiz(entries: ErrorEntry[], limit = 20): Quiz | null {
  const picked = entries.slice(0, limit);
  if (picked.length === 0) return null;
  const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return {
    id: uid(),
    title: 'Caiet de erori',
    description: 'Întrebările la care ai greșit, repetate.',
    emoji: '📕',
    color: 'red',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: true,
    shuffleAnswers: true,
    tags: ['mistake-bank', 'recovery'],
    questions: picked.map(({ question }) => ({
      ...question,
      id: uid(),
      options: question.options.map((option) => ({ ...option, id: uid() })),
    })),
    createdAt: Date.now(),
  };
}
