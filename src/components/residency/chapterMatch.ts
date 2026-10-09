/**
 * Logica pură care leagă capitolele din plan (`lib/curriculum`) de restul aplicației: capitolele
 * indexate din bibliotecă, flashcardurile/grilele și progresul din Organizare. Fără React, ca să se testeze ușor.
 */
import {
  bookOfSourceName,
  chapterForHeading,
  chapterForLabel,
  chapterTopics,
  type BookCode,
  type CurriculumChapter,
} from '../../lib/curriculum';
import { statusOf } from '../../lib/organizare/engine';
import { specialtyHref } from '../../lib/organizare/appLinks';
import type { PlanState } from '../../lib/organizare/types';
import type { RezidentiatOverview } from '../../lib/rezidentiatOverview';
import type { SourceChapter } from '../../lib/ai/chapterGrouping';
import type { Quiz, QuestionStat } from '../../types';

/**
 * Pentru fiecare capitol din plan, capitolul indexat din carte care îi corespunde (cel cu cele mai multe
 * fragmente când mai multe titluri duc la același capitol). Ce nu se potrivește lipsește din hartă:
 * textul acelui capitol e „indisponibil”, nu ghicit.
 */
export function matchIndexedChapters(book: BookCode, indexed: SourceChapter[]): Map<number, SourceChapter> {
  const out = new Map<number, SourceChapter>();
  for (const heading of indexed) {
    const chapter = chapterForHeading(heading.heading, book);
    if (!chapter || chapter.book !== book) continue;
    const current = out.get(chapter.index);
    if (!current || heading.chunkCount > current.chunkCount) out.set(chapter.index, heading);
  }
  return out;
}

const CHAPTER_TAG = /^chapter:(\d+)$/;
const BOOK_TAG = /^book:([KLS])$/;
const FIXED_TAGS = new Set(['ai-studio', 'chapter-pack', 'flashcard', 'rezidentiat']);

function bookOfQuiz(quiz: Quiz): BookCode | null {
  for (const tag of quiz.tags ?? []) {
    const match = BOOK_TAG.exec(tag);
    if (match) return match[1] as BookCode;
  }
  return null;
}

/**
 * Capitolul unui set: eticheta `chapter:<index>`, apoi pachetele generate din capitol (`chapter-pack` + numele
 * sursei + titlul), apoi, doar pentru flashcarduri, `category` legat prin `chapterForLabel` (pachete încă nesplite).
 */
export function quizChapterIndex(quiz: Quiz): number | null {
  const tags = quiz.tags ?? [];
  for (const tag of tags) {
    const match = CHAPTER_TAG.exec(tag);
    if (match) return Number(match[1]);
  }
  if (tags.includes('chapter-pack')) {
    const source = tags.find((tag) => bookOfSourceName(tag) !== null);
    const heading = [...tags].reverse().find((tag) => tag !== source && !FIXED_TAGS.has(tag) && !BOOK_TAG.test(tag));
    if (source && heading) {
      const chapter = chapterForHeading(heading, bookOfSourceName(source));
      if (chapter) return chapter.index;
    }
  }
  if (quiz.kind === 'flashcard' && quiz.category) return chapterForLabel(quiz.category, bookOfQuiz(quiz))?.index ?? null;
  return null;
}

export interface ChapterCounts {
  cards: number;
  /** Carduri cu repetarea scadentă acum. */
  due: number;
  /** Grile din seturile legate explicit de capitol (cele generate din carte). */
  grile: number;
}

const EMPTY_COUNTS: ChapterCounts = { cards: 0, due: 0, grile: 0 };
export const countsOf = (counts: Map<number, ChapterCounts>, index: number): ChapterCounts => counts.get(index) ?? EMPTY_COUNTS;

export function chapterCounts(quizzes: Quiz[], questionStats: Record<string, QuestionStat>, now: number): Map<number, ChapterCounts> {
  const out = new Map<number, ChapterCounts>();
  for (const quiz of quizzes) {
    if (quiz.archived) continue;
    const index = quizChapterIndex(quiz);
    if (index === null) continue;
    const entry = out.get(index) ?? { cards: 0, due: 0, grile: 0 };
    if (quiz.kind === 'flashcard') {
      entry.cards += quiz.questions.length;
      for (const question of quiz.questions) {
        const stat = questionStats[`${quiz.id}:${question.id}`];
        if (stat && stat.nextReview > 0 && stat.nextReview <= now) entry.due += 1;
      }
    } else {
      entry.grile += quiz.questions.length;
    }
    out.set(index, entry);
  }
  return out;
}

export interface ChapterProgress {
  done: number;
  inProgress: number;
  total: number;
  /** 0–100, după topicurile terminate. */
  percent: number;
}

/** Progresul capitolului în trecerea `phase` din Organizare. */
export function chapterProgress(chapter: CurriculumChapter, state: PlanState, phase: number): ChapterProgress {
  let done = 0;
  let inProgress = 0;
  for (const topic of chapterTopics(chapter)) {
    const status = statusOf(state, phase, topic.index);
    if (status === 2) done += 1;
    else if (status === 1) inProgress += 1;
  }
  const total = chapter.topicIndexes.length;
  return { done, inProgress, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/** Grilele din banca importată pentru specialitatea capitolului (aceeași potrivire ca „Grilele din aplicație” din Organizare). */
export function bankForChapter(overview: RezidentiatOverview, chapter: CurriculumChapter): { href: string; count: number } | null {
  let href: string | null = null;
  const seen = new Set<string>();
  let count = 0;
  for (const topic of chapterTopics(chapter)) {
    const target = specialtyHref(overview, topic);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    href ??= target;
    const specialtyId = /[?&]s=([^&]+)/.exec(target)?.[1];
    const disciplineId = /\/rezidentiat\/([^?]+)/.exec(target)?.[1];
    const discipline = overview.disciplines.find((d) => d.folder.id === disciplineId);
    if (!discipline) continue;
    count += specialtyId
      ? discipline.specialties.find((s) => s.folder.id === specialtyId)?.questionCount ?? 0
      : discipline.questionCount;
  }
  return href ? { href, count } : null;
}
