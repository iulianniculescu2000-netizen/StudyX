import type { Quiz } from '../types';
import { BOOK_NAMES, BOOK_SHORT, chapterForLabel, chaptersOfBook, type BookCode, type CurriculumChapter } from './curriculum';
import { disciplineKey, type RezidentiatOverview, type SpecialtyOverview } from './rezidentiatOverview';

/** Cărțile care au foldere în „Banca de grile”, în ordinea afișării. */
export const BANK_BOOKS: BookCode[] = ['K', 'L'];

export interface BankChapter {
  chapter: CurriculumChapter;
  /** Specialitățile (folderele) ale căror seturi aparțin capitolului. */
  specialties: SpecialtyOverview[];
  quizzes: Quiz[];
  questionCount: number;
  answered: number;
  progress: number;
}

export interface BankBook {
  code: BookCode;
  name: string;
  short: string;
  chapters: BankChapter[];
  quizCount: number;
  questionCount: number;
  answered: number;
  progress: number;
}

export interface BankTree {
  books: BankBook[];
  /** Seturi care nu se leagă de un capitol din Kumar sau Lawrence: rămân la îndemână, nu dispar. */
  other: SpecialtyOverview[];
  questionCount: number;
  answered: number;
  progress: number;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Cartea unei discipline din bancă: Medicină internă → Kumar, Chirurgie → Lawrence; alte discipline nu au carte. */
function bookOfDiscipline(name: string): BookCode | null {
  const key = disciplineKey(name);
  if (key === 'medicina-interna') return 'K';
  if (key === 'chirurgie') return 'L';
  return null;
}

/**
 * Așază banca de grile pe cărți și capitole: fiecare specialitate se leagă de capitolul cărții ei (după numele specialității,
 * cu aceeași potrivire ca la flashcarduri). Ce nu se leagă clar rămâne în „other”, ca nicio grilă să nu iasă din vedere.
 */
export function buildBankTree(overview: RezidentiatOverview): BankTree {
  const placed = new Map<number, BankChapter>();
  const other: SpecialtyOverview[] = [];

  for (const discipline of overview.disciplines) {
    const book = bookOfDiscipline(discipline.folder.name);
    for (const specialty of discipline.specialties) {
      const chapter = book && !specialty.loose ? chapterForLabel(specialty.name, book) : null;
      if (!chapter || !BANK_BOOKS.includes(chapter.book)) {
        other.push(specialty);
        continue;
      }
      let node = placed.get(chapter.index);
      if (!node) {
        node = { chapter, specialties: [], quizzes: [], questionCount: 0, answered: 0, progress: 0 };
        placed.set(chapter.index, node);
      }
      node.specialties.push(specialty);
      node.quizzes.push(...specialty.quizzes);
      node.questionCount += specialty.questionCount;
      node.answered += specialty.answered;
    }
  }

  const books: BankBook[] = [];
  for (const code of BANK_BOOKS) {
    const chapters = chaptersOfBook(code)
      .map((chapter) => placed.get(chapter.index))
      .filter((node): node is BankChapter => !!node)
      .map((node) => ({ ...node, progress: percent(node.answered, node.questionCount) }));
    if (chapters.length === 0) continue;
    const questionCount = chapters.reduce((sum, node) => sum + node.questionCount, 0);
    const answered = chapters.reduce((sum, node) => sum + node.answered, 0);
    books.push({
      code,
      name: BOOK_NAMES[code],
      short: BOOK_SHORT[code],
      chapters,
      quizCount: chapters.reduce((sum, node) => sum + node.quizzes.length, 0),
      questionCount,
      answered,
      progress: percent(answered, questionCount),
    });
  }

  const questionCount = books.reduce((sum, book) => sum + book.questionCount, 0) + other.reduce((sum, s) => sum + s.questionCount, 0);
  const answered = books.reduce((sum, book) => sum + book.answered, 0) + other.reduce((sum, s) => sum + s.answered, 0);
  return { books, other, questionCount, answered, progress: percent(answered, questionCount) };
}
