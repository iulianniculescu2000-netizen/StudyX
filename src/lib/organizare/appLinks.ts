/**
 * Where the plan meets the rest of the app: a topic leads to the quizzes of its specialty,
 * and the quizzes solved today can fill in the daily log.
 */
import type { Quiz, QuizSession } from '../../types';
import { chapterForLabel, type CurriculumChapter } from '../curriculum';
import { isFlashcardDeck } from '../deckKind';
import type { RezidentiatOverview } from '../rezidentiatOverview';
import { toDay } from './engine';
import { fold } from './format';
import type { Topic } from './types';


/**
 * The Rezidențiat page for a topic's specialty (or discipline), when the quiz banks are imported.
 * A topic lives under "Capitole/Medicina Interna/Cardiologie/…": the deepest folder name that
 * matches a specialty wins, then a discipline.
 */
export function specialtyHref(overview: RezidentiatOverview, topic: Pick<Topic, 'folder'>): string | null {
  const parts = topic.folder.split('/').slice(1).map((part) => fold(part).trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    for (const discipline of overview.disciplines) {
      const specialty = discipline.specialties.find((s) => !s.loose && fold(s.name).trim() === parts[i]);
      if (specialty) return `/rezidentiat/${discipline.folder.id}?s=${specialty.folder.id}`;
    }
    const discipline = overview.disciplines.find((d) => fold(d.folder.name).trim() === parts[i]);
    if (discipline) return `/rezidentiat/${discipline.folder.id}`;
  }
  return null;
}

/**
 * Link to Organizare opened at a plan chapter: `c` = chapter (group) index in the plan, 0-based (the same index
 * as `CurriculumChapter.index`); `topic` = optional `Topic.index` inside that chapter. `phase` selects the pass (`f`).
 * Organizare validates both against the plan, opens/scrolls/highlights the target, then drops the params.
 */
export function organizareChapterHref(chapter: number, opts: { topic?: number; phase?: number } = {}): string {
  const q = new URLSearchParams({ t: 'topicuri' });
  if (opts.phase && opts.phase >= 1 && opts.phase <= 4) q.set('f', String(opts.phase));
  q.set('c', String(chapter));
  if (opts.topic !== undefined) q.set('topic', String(opts.topic));
  return `/rezidentiat/organizare?${q.toString()}`;
}

const MAX_SESSION_HOURS = 3;

export interface QuizDay {
  /** Finished quiz sessions that day. */
  sessions: number;
  /** Questions answered / answered correctly. */
  g: number;
  ok: number;
  /** Time spent in those sessions, in hours (each session counted for at most three). */
  hours: number;
}

/** What the student solved in the app on a given day (YYYY-MM-DD, local time). */
export function quizzesOnDay(sessions: QuizSession[], day: string): QuizDay {
  const out: QuizDay = { sessions: 0, g: 0, ok: 0, hours: 0 };
  for (const s of sessions) {
    if (!s.finishedAt || s.total <= 0 || toDay(new Date(s.finishedAt)) !== day) continue;
    out.sessions += 1;
    out.g += s.total;
    out.ok += Math.min(s.total, Math.max(0, Math.round(s.score)));
    out.hours += Math.min(MAX_SESSION_HOURS, Math.max(0, (s.finishedAt - s.startedAt) / 3_600_000));
  }
  out.hours = Math.round(out.hours * 4) / 4;
  return out;
}

// ── Curriculum chapters: where a chapter leads in the rest of the app ───────────────────────────────

/**
 * Link formats (the pages read these; keep them in step):
 *  - flashcards of a chapter: `/rezidentiat/flashcarduri?chapter=<index>` (index = `CurriculumChapter.index`, 0–38);
 *  - the book / chapter in the Rezidențiat page: `/rezidentiat?book=<K|L|S>&chapter=<index>`.
 * Chapter flashcard decks carry the tags `['rezidentiat', 'chapter:<index>', 'book:<K|L|S>']`.
 */
export function chapterFlashcardsHref(chapter: Pick<CurriculumChapter, 'index'>): string {
  return `/rezidentiat/flashcarduri?chapter=${chapter.index}`;
}

export function chapterBookHref(chapter: Pick<CurriculumChapter, 'index' | 'book'>): string {
  return `/rezidentiat?book=${chapter.book}&chapter=${chapter.index}`;
}

/** The chapter index in a deck's `chapter:<index>` tag, or null. */
function chapterTag(quiz: Pick<Quiz, 'tags'>): number | null {
  for (const tag of quiz.tags ?? []) {
    const match = /^chapter:(\d+)$/.exec(tag);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * How many flashcards the student has for a chapter: the cards of decks tagged `chapter:<index>` and, for decks
 * without that tag, the cards of decks whose category is this chapter (`chapterForLabel`). Archived decks do not count.
 */
export function chapterCardCount(quizzes: Quiz[], chapter: Pick<CurriculumChapter, 'index' | 'book'>): number {
  let total = 0;
  for (const quiz of quizzes) {
    if (quiz.archived || !isFlashcardDeck(quiz)) continue;
    const tagged = chapterTag(quiz);
    if (tagged !== null) {
      if (tagged === chapter.index) total += quiz.questions.length;
    } else if (quiz.category && chapterForLabel(quiz.category, chapter.book)?.index === chapter.index) {
      total += quiz.questions.length;
    }
  }
  return total;
}
