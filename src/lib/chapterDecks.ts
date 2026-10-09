/**
 * Pachete de flashcarduri pe capitole. Un pachet mare (ex. „Kumar - Concepte Cheie”, ~550 de carduri) se
 * împarte după `category` + `sourceBook` de pe fiecare card, folosind capitolele din `curriculum.ts`
 * (aceeași listă ca în Organizare). Contractul pachetelor de capitol:
 *  - `kind: 'flashcard'`, `tags: ['rezidentiat', 'chapter:<index>', 'book:<K|L|S>']`;
 *  - titlul `<număr>. <titlu capitol>`; folderul `Rezidențiat / Flashcarduri / <Carte>`;
 *  - id determinist `<idSursă>--ch<index>` (cardurile fără capitol merg în `<idSursă>--alte`, fără tag `chapter:`).
 * Istoricul de studiu e cheiat `${quizId}:${questionId}`, deci la împărțire intrările vechi se COPIAZĂ pe
 * cheile noi (cele vechi rămân cu istoricul, dar fără dată de repetare, ca să nu se numere de două ori), iar pachetul-sursă e arhivat, nu șters: `undoChapterSplit` îl readuce.
 */
import { BOOK_NAMES, BOOK_SHORT, bookOfSourceName, chapterForLabel, curriculumChapters, type BookCode, type CurriculumChapter } from './curriculum';
import { isFlashcardDeck } from './deckKind';
import { mergeBuiltInDeck } from './rezidentiatFlashcards';
import { findOrCreateRezidentiatQuizRoot } from './rezidentiatRoot';
import { fold } from './organizare/format';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import type { Question, QuestionStat, Quiz } from '../types';

export const CHAPTER_FOLDER_NAME = 'Flashcarduri';
export const REZIDENTIAT_TAG = 'rezidentiat';
/** Câte carduri trebuie să aibă capitol, cel puțin, ca un pachet să fie oferit pentru împărțire. */
const MIN_RECOGNIZED = 5;

type CardQuestion = Question & { category?: string; sourceBook?: string };

export interface ChapterGroup {
  /** Capitolul din plan, sau null pentru „Alte”. */
  chapter: CurriculumChapter | null;
  book: BookCode | null;
  id: string;
  title: string;
  questions: Question[];
}

export interface ChapterSplitPlan {
  sourceId: string;
  sourceTitle: string;
  total: number;
  /** Carduri cu capitol potrivit. */
  assigned: number;
  /** Carduri rămase la „Alte”. */
  other: number;
  chapterCount: number;
  groups: ChapterGroup[];
  /** Destule carduri recunoscute ca să merite oferit utilizatorului. */
  splittable: boolean;
}

export interface ChapterSplitResult {
  created: number;
  updated: number;
  copiedStats: number;
  archivedSource: boolean;
  deckIds: string[];
}

export function chapterDeckId(sourceId: string, chapterIndex: number): string {
  return `${sourceId}--ch${chapterIndex}`;
}

export function otherDeckId(sourceId: string): string {
  return `${sourceId}--alte`;
}

/** Capitolul și cartea de pe tagurile unui pachet de capitol, sau null. */
export function chapterOfDeck(quiz: Pick<Quiz, 'tags'>): { index: number; book: BookCode } | null {
  let index = -1;
  let book: BookCode | null = null;
  for (const tag of quiz.tags ?? []) {
    const chapter = /^chapter:(\d+)$/.exec(tag);
    if (chapter) index = Number(chapter[1]);
    const code = /^book:([KLS])$/.exec(tag);
    if (code) book = code[1] as BookCode;
  }
  return index >= 0 && book ? { index, book } : null;
}

export function isChapterDeck(quiz: Pick<Quiz, 'tags'>): boolean {
  return (quiz.tags ?? []).some((tag) => /^chapter:\d+$/.test(tag) || tag === 'chapter-other');
}

/**
 * Împarte cardurile unui pachet pe capitole. Pură: nu atinge store-urile.
 * Un card fără `category` sau cu o categorie necunoscută merge la „Alte”.
 */
export function planChapterSplit(quiz: Pick<Quiz, 'id' | 'title' | 'questions'>): ChapterSplitPlan {
  const byChapter = new Map<number, Question[]>();
  const other: Question[] = [];
  const cache = new Map<string, CurriculumChapter | null>();
  const otherBooks = new Map<BookCode, number>();

  for (const question of quiz.questions as CardQuestion[]) {
    const book = (question.sourceBook ? bookOfSourceName(question.sourceBook) : null);
    const key = `${book ?? ''}|${question.category ?? ''}`;
    let chapter = cache.get(key);
    if (chapter === undefined) {
      chapter = question.category ? chapterForLabel(question.category, book) : null;
      cache.set(key, chapter);
    }
    if (chapter) {
      const list = byChapter.get(chapter.index) ?? [];
      list.push(question);
      byChapter.set(chapter.index, list);
    } else {
      other.push(question);
      if (book) otherBooks.set(book, (otherBooks.get(book) ?? 0) + 1);
    }
  }

  const chapters = curriculumChapters();
  const groups: ChapterGroup[] = [...byChapter.keys()]
    .sort((a, b) => a - b)
    .map((index) => ({
      chapter: chapters[index],
      book: chapters[index].book,
      id: chapterDeckId(quiz.id, index),
      title: `${chapters[index].number}. ${chapters[index].title}`,
      questions: byChapter.get(index) ?? [],
    }));

  if (other.length > 0) {
    const dominant = [...otherBooks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    groups.push({ chapter: null, book: dominant, id: otherDeckId(quiz.id), title: `Alte · ${quiz.title}`, questions: other });
  }

  const total = quiz.questions.length;
  const assigned = total - other.length;
  return {
    sourceId: quiz.id,
    sourceTitle: quiz.title,
    total,
    assigned,
    other: other.length,
    chapterCount: byChapter.size,
    groups,
    splittable: assigned >= MIN_RECOGNIZED && assigned * 2 >= total,
  };
}

/** Pachetul-sursă a fost deja împărțit (arhivat, cu pachete de capitol după el). */
export function isSplitDone(quizzes: Pick<Quiz, 'id' | 'archived'>[], sourceId: string): boolean {
  const source = quizzes.find((quiz) => quiz.id === sourceId);
  return !!source?.archived && quizzes.some((quiz) => quiz.id.startsWith(`${sourceId}--`));
}

/** Pachetele de flashcarduri care pot fi împărțite pe capitole (încă nesplit, cu categorii recunoscute). */
export function findSplittableDecks(quizzes: Quiz[]): ChapterSplitPlan[] {
  const plans: ChapterSplitPlan[] = [];
  for (const quiz of quizzes) {
    if (quiz.archived || quiz.questions.length === 0 || isChapterDeck(quiz) || !isFlashcardDeck(quiz)) continue;
    if (!(quiz.questions[0] as CardQuestion).category) continue;
    if (quizzes.some((other) => other.id.startsWith(`${quiz.id}--`))) continue;
    const plan = planChapterSplit(quiz);
    if (plan.splittable) plans.push(plan);
  }
  return plans;
}

function findOrCreateChild(parentId: string, name: string, emoji: string, color: 'purple' | 'blue'): string {
  const { folders, addFolder } = useFolderStore.getState();
  const wanted = fold(name);
  const existing = folders.find((folder) => folder.parentId === parentId && fold(folder.name) === wanted);
  return existing ? existing.id : addFolder(name, emoji, color, parentId);
}

/** `Rezidențiat / Flashcarduri / <Carte>`; creează ce lipsește. */
export function findOrCreateChapterFolder(book: BookCode): string {
  const root = findOrCreateRezidentiatQuizRoot();
  const flashcards = findOrCreateChild(root.id, CHAPTER_FOLDER_NAME, '🃏', 'purple');
  return findOrCreateChild(flashcards, BOOK_SHORT[book], '📘', 'blue');
}

function buildDeck(source: Quiz, group: ChapterGroup, folderId: string | null): Quiz {
  const book = group.book;
  const tags = group.chapter
    ? [REZIDENTIAT_TAG, `chapter:${group.chapter.index}`, `book:${group.chapter.book}`]
    : [REZIDENTIAT_TAG, 'chapter-other', ...(book ? [`book:${book}`] : [])];
  const description = group.chapter
    ? `${group.questions.length} carduri · ${BOOK_NAMES[group.chapter.book]}, capitolul ${group.chapter.number}.`
    : `${group.questions.length} carduri fără capitol recunoscut din „${source.title}”.`;
  return {
    id: group.id,
    title: group.title,
    description,
    emoji: source.emoji,
    category: source.category,
    kind: 'flashcard',
    folderId,
    questions: group.questions,
    createdAt: source.createdAt,
    color: source.color,
    shuffleQuestions: source.shuffleQuestions,
    shuffleAnswers: source.shuffleAnswers,
    tags,
  };
}

/**
 * Creează (sau completează) pachetele de capitol ale lui `source`, copiază istoricul de studiu pe cheile
 * noi și, dacă `source` e în store, îl arhivează. Idempotentă: a doua rulare nu duplică nimic.
 * `source` poate fi și un pachet încă neadăugat în store (utilizator nou): atunci nu se arhivează nimic.
 */
export function applyChapterSplit(source: Quiz, options: { plan?: ChapterSplitPlan } = {}): ChapterSplitResult {
  const plan = options.plan ?? planChapterSplit(source);
  const quizStore = useQuizStore.getState();
  const stats = useStatsStore.getState().questionStats;
  const hasHistory = (deckId: string) => (questionId: string) => `${deckId}:${questionId}` in useStatsStore.getState().questionStats;

  const folderByBook = new Map<BookCode, string>();
  const folderFor = (book: BookCode | null): string | null => {
    if (!book) return source.folderId ?? null;
    let id = folderByBook.get(book);
    if (!id) {
      id = findOrCreateChapterFolder(book);
      folderByBook.set(book, id);
    }
    return id;
  };

  let created = 0;
  let updated = 0;
  const copied: Record<string, QuestionStat> = {};
  /** Intrările vechi, scoase din coada de repetare ca să nu fie numărate de două ori (istoricul rămâne). */
  const retired: Record<string, QuestionStat> = {};
  const deckIds: string[] = [];

  for (const group of plan.groups) {
    deckIds.push(group.id);
    const existing = useQuizStore.getState().quizzes.find((quiz) => quiz.id === group.id);
    if (existing) {
      const merged = mergeBuiltInDeck(existing.questions, group.questions, hasHistory(group.id));
      const changed = merged.length !== existing.questions.length || merged.some((q, i) => {
        const before = existing.questions[i];
        return before.id !== q.id || before.text !== q.text || before.options[0]?.text !== q.options[0]?.text;
      });
      if (changed) {
        quizStore.updateQuiz(group.id, { questions: merged });
        updated += 1;
      }
    } else {
      quizStore.addQuiz(buildDeck(source, group, folderFor(group.book)));
      created += 1;
    }
    for (const question of group.questions) {
      const oldKey = `${source.id}:${question.id}`;
      const newKey = `${group.id}:${question.id}`;
      if (stats[oldKey] && !stats[newKey]) {
        copied[newKey] = { ...stats[oldKey], quizId: group.id };
        retired[oldKey] = { ...stats[oldKey], nextReview: 0, retired: true };
      }
    }
  }

  const copiedStats = Object.keys(copied).length;
  if (copiedStats > 0) {
    useStatsStore.setState((state) => ({ questionStats: { ...state.questionStats, ...copied, ...retired } }));
  }

  let archivedSource = false;
  const inStore = useQuizStore.getState().quizzes.find((quiz) => quiz.id === source.id);
  if (inStore && !inStore.archived) {
    quizStore.updateQuiz(source.id, { archived: true });
    archivedSource = true;
  }
  return { created, updated, copiedStats, archivedSource, deckIds };
}

export interface ChapterUndoResult {
  restored: boolean;
  removedDecks: number;
  copiedBack: number;
}

/**
 * Anulează împărțirea: aduce înapoi pachetul-sursă, trece înapoi progresul făcut între timp în pachetele de
 * capitol (doar dacă e mai nou decât cel vechi) și șterge pachetele de capitol. Fără sursă în store nu face nimic.
 */
export function undoChapterSplit(sourceId: string): ChapterUndoResult {
  const quizStore = useQuizStore.getState();
  const source = quizStore.quizzes.find((quiz) => quiz.id === sourceId);
  const decks = quizStore.quizzes.filter((quiz) => quiz.id.startsWith(`${sourceId}--`));
  if (!source || decks.length === 0) return { restored: false, removedDecks: 0, copiedBack: 0 };

  const stats = useStatsStore.getState().questionStats;
  const next: Record<string, QuestionStat> = { ...stats };
  let copiedBack = 0;
  for (const deck of decks) {
    for (const question of deck.questions) {
      const chapterKey = `${deck.id}:${question.id}`;
      const chapterStat = stats[chapterKey];
      if (!chapterStat) continue;
      // Pachetul de capitol are copia istoricului vechi plus ce s-a învățat de atunci: el are prioritate.
      next[`${sourceId}:${question.id}`] = { ...chapterStat, quizId: sourceId };
      copiedBack += 1;
      delete next[chapterKey];
    }
  }
  useStatsStore.setState({ questionStats: next });

  for (const deck of decks) quizStore.deleteQuiz(deck.id, { keepImages: true });
  quizStore.updateQuiz(sourceId, { archived: false });
  return { restored: true, removedDecks: decks.length, copiedBack };
}

/* ───────────── Vedere „Pe capitole” ───────────── */

export interface ChapterRow {
  chapter: CurriculumChapter;
  decks: Quiz[];
  /** Pachetul care se deschide la „Începe”: cel cu cele mai multe carduri restante, apoi cel mai mare. */
  main: Quiz;
  total: number;
  seen: number;
  due: number;
  mastered: number;
}

export interface BookSection {
  book: BookCode;
  rows: ChapterRow[];
  total: number;
  due: number;
  mastered: number;
}

function isMastered(stat: QuestionStat | undefined): boolean {
  return !!stat && stat.timesCorrect >= 3 && stat.timesCorrect / (stat.timesCorrect + stat.timesWrong) >= 0.8;
}

/** Pachetele de capitol, grupate pe cărți și capitole, cu progresul din statistici. Arhivatele nu intră. */
export function summarizeChapterDecks(
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
  now: number,
): BookSection[] {
  const byChapter = new Map<number, Quiz[]>();
  for (const quiz of quizzes) {
    if (quiz.archived || quiz.questions.length === 0) continue;
    const info = chapterOfDeck(quiz);
    if (!info) continue;
    const list = byChapter.get(info.index) ?? [];
    list.push(quiz);
    byChapter.set(info.index, list);
  }

  const chapters = curriculumChapters();
  const sections = new Map<BookCode, BookSection>();
  for (const index of [...byChapter.keys()].sort((a, b) => a - b)) {
    const chapter = chapters[index];
    if (!chapter) continue;
    const decks = byChapter.get(index) ?? [];
    let total = 0;
    let seen = 0;
    let due = 0;
    let mastered = 0;
    const dueByDeck = new Map<string, number>();
    for (const deck of decks) {
      total += deck.questions.length;
      let deckDue = 0;
      for (const question of deck.questions) {
        const stat = stats[`${deck.id}:${question.id}`];
        if (!stat) continue;
        seen += 1;
        if (stat.nextReview > 0 && stat.nextReview <= now) deckDue += 1;
        if (isMastered(stat)) mastered += 1;
      }
      due += deckDue;
      dueByDeck.set(deck.id, deckDue);
    }
    const main = [...decks].sort(
      (a, b) => (dueByDeck.get(b.id) ?? 0) - (dueByDeck.get(a.id) ?? 0) || b.questions.length - a.questions.length,
    )[0];
    const section = sections.get(chapter.book) ?? { book: chapter.book, rows: [], total: 0, due: 0, mastered: 0 };
    section.rows.push({ chapter, decks, main, total, seen, due, mastered });
    section.total += total;
    section.due += due;
    section.mastered += mastered;
    sections.set(chapter.book, section);
  }

  const order: BookCode[] = ['K', 'L', 'S'];
  return order.flatMap((book) => (sections.has(book) ? [sections.get(book)!] : []));
}
