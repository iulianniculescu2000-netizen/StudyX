/**
 * Coada „Repetă” peste mai multe pachete: cardurile restante (nextReview ≤ acum) din pachetele alese,
 * cele mai întârziate primele, întrețesute pe capitole ca un capitol mare să nu acapareze sesiunea.
 * Pură: nu atinge store-urile, deci coada se reconstruiește oricând din ele (refresh / înapoi în browser).
 */
import type { Folder, Question, QuestionStat, Quiz } from '../types';
import { chapterOfDeck } from './chapterDecks';
import { curriculumChapters } from './curriculum';
import { isFlashcardDeck } from './deckKind';
import { folderSubtreeIds } from './flashcardGroups';
import { playableQuestions } from './bankDedup';

/** Id-urile speciale ale rutei /flashcards/session/:id care pornesc o sesiune peste mai multe pachete. */
export const isDueSessionId = (id: string | undefined): boolean => id === 'due' || id === 'due-group';

/** Câte carduri restante intră într-o sesiune; restul se continuă cu „Continuă”. */
export const DUE_SESSION_CAP = 50;
/** Câte carduri noi se adaugă când e bifat „și cardurile noi”. */
export const DUE_NEW_DEFAULT = 10;

export interface DueQueueItem {
  question: Question;
  quiz: Quiz;
  /** Cheia reală în statistici: `${quiz.id}:${question.id}`, niciodată un id virtual. */
  statKey: string;
  isNew: boolean;
  /** Cât de întârziat e cardul, în ms (0 pentru carduri noi). */
  overdueMs: number;
  groupKey: string;
  /** „Cap. 8 · Cardiologie” sau titlul pachetului când nu e de capitol. */
  groupLabel: string;
}

export interface DueQueueOptions {
  quizzes: ReadonlyArray<Quiz>;
  stats: Readonly<Record<string, QuestionStat | undefined>>;
  now: number;
  /** Doar aceste pachete (id-uri); lipsă = toate. */
  deckIds?: ReadonlyArray<string> | null;
  /** Doar pachetele dintr-un folder și subfolderele lui. */
  folderId?: string | null;
  folders?: ReadonlyArray<Pick<Folder, 'id' | 'parentId'>>;
  /** Maxim de carduri restante în sesiune (implicit `DUE_SESSION_CAP`; Infinity = fără limită). */
  cap?: number;
  /** Maxim de carduri noi adăugate după cele restante (0 = fără). */
  includeNew?: number;
}

export interface DueQueue {
  items: DueQueueItem[];
  /** Restantele din selecție, înainte de limită. */
  totalDue: number;
  /** Cardurile noi (nevăzute) din selecție, înainte de limită. */
  totalNew: number;
  /** Câte restante au rămas în afara acestei sesiuni din cauza limitei. */
  remainingDue: number;
}

export function groupOfDeck(quiz: Quiz): { key: string; label: string } {
  const info = chapterOfDeck(quiz);
  const chapter = info ? curriculumChapters()[info.index] : undefined;
  if (info && chapter) return { key: `ch:${info.book}:${info.index}`, label: `Cap. ${chapter.number} · ${chapter.title}` };
  return { key: `deck:${quiz.id}`, label: quiz.title };
}

/** Round-robin peste grupuri (fiecare listă își păstrează ordinea). */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i += 1) for (const list of lists) if (i < list.length) out.push(list[i]);
  return out;
}

export function buildDueQueue(options: DueQueueOptions): DueQueue {
  const { quizzes, stats, now, deckIds, folderId, folders = [], cap = DUE_SESSION_CAP, includeNew = 0 } = options;
  const wanted = deckIds ? new Set(deckIds) : null;
  const folderScope = folderId ? folderSubtreeIds(folderId, folders) : null;

  const dueByGroup = new Map<string, DueQueueItem[]>();
  const newByGroup = new Map<string, DueQueueItem[]>();
  let totalDue = 0;
  let totalNew = 0;

  for (const quiz of quizzes) {
    if (quiz.archived || quiz.questions.length === 0 || !isFlashcardDeck(quiz)) continue;
    if (wanted && !wanted.has(quiz.id)) continue;
    if (folderScope && !(quiz.folderId && folderScope.has(quiz.folderId))) continue;
    const { key: groupKey, label: groupLabel } = groupOfDeck(quiz);
    for (const question of playableQuestions(quiz)) {
      const statKey = `${quiz.id}:${question.id}`;
      const stat = stats[statKey];
      if (stat?.retired) continue;
      const base = { question, quiz, statKey, groupKey, groupLabel };
      if (!stat) {
        totalNew += 1;
        const list = newByGroup.get(groupKey) ?? [];
        list.push({ ...base, isNew: true, overdueMs: 0 });
        newByGroup.set(groupKey, list);
      } else if (stat.nextReview > 0 && stat.nextReview <= now) {
        totalDue += 1;
        const list = dueByGroup.get(groupKey) ?? [];
        list.push({ ...base, isNew: false, overdueMs: now - stat.nextReview });
        dueByGroup.set(groupKey, list);
      }
    }
  }

  // În grup: cele mai întârziate primele (sortarea e stabilă, deci egalitățile păstrează ordinea din pachet).
  const dueLists = [...dueByGroup.values()].map((list) => list.sort((a, b) => b.overdueMs - a.overdueMs));
  // Grupurile cu cel mai întârziat card încep runda.
  dueLists.sort((a, b) => b[0].overdueMs - a[0].overdueMs);
  const due = interleave(dueLists).slice(0, Math.max(0, cap));

  const fresh = includeNew > 0 ? interleave([...newByGroup.values()]).slice(0, includeNew) : [];
  return { items: [...due, ...fresh], totalDue, totalNew, remainingDue: totalDue - due.length };
}

/** Ruta sesiunii peste mai multe pachete. */
export function dueSessionPath(deckIds: ReadonlyArray<string>): string {
  const params = new URLSearchParams();
  const ids = [...new Set(deckIds)];
  if (ids.length > 0) params.set('ids', ids.join(','));
  const query = params.toString();
  return `/flashcards/session/due${query ? `?${query}` : ''}`;
}

export function dueGroupPath(folderId: string): string {
  return `/flashcards/session/due-group?${new URLSearchParams({ group: folderId }).toString()}`;
}

export interface DueSessionSelection {
  deckIds: string[] | null;
  folderId: string | null;
  includeNew: number;
}

/** Selecția din query string (`?ids=a,b`, `?group=<folder>`, `?new=10`). */
export function parseDueSelection(params: URLSearchParams): DueSessionSelection {
  const ids = (params.get('ids') ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  const newCount = Number(params.get('new'));
  return {
    deckIds: ids.length > 0 ? ids : null,
    folderId: params.get('group') || null,
    includeNew: Number.isFinite(newCount) && newCount > 0 ? Math.min(Math.floor(newCount), 200) : 0,
  };
}

export interface ChapterTally {
  groupKey: string;
  label: string;
  cards: number;
  hard: number;
  good: number;
  easy: number;
}

/** Rezumatul sesiunii pe capitole, în ordinea în care au apărut. */
export function tallyByGroup(
  items: ReadonlyArray<{ groupKey?: string; groupLabel?: string }>,
  ratings: ReadonlyArray<'hard' | 'good' | 'easy'>,
): ChapterTally[] {
  const map = new Map<string, ChapterTally>();
  ratings.forEach((rating, index) => {
    const item = items[index];
    if (!item?.groupKey) return;
    const row = map.get(item.groupKey) ?? { groupKey: item.groupKey, label: item.groupLabel ?? '', cards: 0, hard: 0, good: 0, easy: 0 };
    row.cards += 1;
    row[rating] += 1;
    map.set(item.groupKey, row);
  });
  return [...map.values()];
}
