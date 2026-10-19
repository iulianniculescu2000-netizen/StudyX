/**
 * Sursa unică pentru „capitolele” de rezidențiat. Împărțirea vine din planul din Organizare
 * (`plan.json`: 39 de capitole în 3 cărți, fiecare cu topicurile lui), iar tot restul aplicației
 * (cărțile din Rezidențiat, flashcardurile, grilele, chatul AI) o folosește pe aceasta în loc să-și
 * facă propria listă.
 */
import raw from '../data/organizare/plan.json';
import { normalizePlan } from './organizare/engine';
import { fold, withoutNumber } from './organizare/format';
import type { Plan, RawPlan, Topic } from './organizare/types';
import { parsePageRange } from './bookPages';

export type BookCode = 'K' | 'L' | 'S';

export const BOOK_NAMES: Record<BookCode, string> = {
  K: 'Kumar și Clark – Medicină Clinică',
  L: 'Lawrence – Chirurgie',
  S: 'Sinopsis de medicină',
};

/** Numele scurt, cum apare în chip-uri și în etichetele cardurilor. */
export const BOOK_SHORT: Record<BookCode, string> = { K: 'Kumar', L: 'Lawrence', S: 'Sinopsis' };

export interface CurriculumChapter {
  /** Poziția în plan (0–38); aceeași cu `Topic.group`. */
  index: number;
  /** Numărul din plan, 1–39. */
  number: number;
  book: BookCode;
  /** Titlul fără număr, ex. „Sepsisul și tratamentul infecțiilor bacteriene”. */
  title: string;
  /** Titlul cu număr, exact ca în plan. */
  label: string;
  /** Topicurile (indici în `plan.topics`). */
  topicIndexes: number[];
  pages: number;
  /** Grile estimate pentru capitol, din plan. */
  quizzes: number;
  /** Folderul de pe disc al capitolului („Capitole/ATI/Sepsis”), dacă planul îl spune. */
  folder: string;
}

let cachedPlan: Plan | null = null;
let cachedChapters: CurriculumChapter[] | null = null;

/** Planul de bază livrat cu aplicația (nu cel modificat de utilizator în Organizare). */
export function basePlan(): Plan {
  if (!cachedPlan) cachedPlan = normalizePlan(raw as unknown as RawPlan);
  return cachedPlan;
}

export function curriculumChapters(): CurriculumChapter[] {
  if (cachedChapters) return cachedChapters;
  const plan = basePlan();
  cachedChapters = plan.groups.map((label, index) => {
    const topics = plan.topics.filter((topic) => topic.group === index);
    return {
      index,
      number: index + 1,
      book: topics[0]?.book ?? 'K',
      title: withoutNumber(label),
      label,
      topicIndexes: topics.map((topic) => topic.index),
      pages: topics.reduce((sum, topic) => sum + topic.pages, 0),
      quizzes: topics.reduce((sum, topic) => sum + topic.quizzes, 0),
      folder: topics[0]?.folder ?? '',
    };
  });
  return cachedChapters;
}

export function chaptersOfBook(book: BookCode): CurriculumChapter[] {
  return curriculumChapters().filter((chapter) => chapter.book === book);
}

export function chapterTopics(chapter: CurriculumChapter): Topic[] {
  const plan = basePlan();
  return chapter.topicIndexes.map((i) => plan.topics[i]);
}

/** Cartea unui nume de sursă din bibliotecă („Kumar.pdf”, „Lawrence 2024”…), sau null. */
export function bookOfSourceName(name: string): BookCode | null {
  const text = fold(name);
  if (text.includes('kumar') || text.includes('clark')) return 'K';
  if (text.includes('lawrence')) return 'L';
  if (text.includes('sinopsis')) return 'S';
  return null;
}

const topicRangesByBook = new Map<BookCode, Array<{ first: number; last: number; title: string }>>();

/**
 * Subiectele din plan care acoperă paginile [first, last] ale unei cărți de bază (pagini din PDF-ul inclus), fără numerotare:
 * Kumar 56 → „Anemia microcitară (deficit de fier)”. Căutarea le folosește ca titlu de secțiune al fragmentului.
 */
export function topicTitlesForPages(book: BookCode, first: number, last: number = first): string[] {
  let ranges = topicRangesByBook.get(book);
  if (!ranges) {
    ranges = basePlan().topics
      .filter((topic) => topic.book === book)
      .map((topic) => ({ range: parsePageRange(topic.pdf), title: withoutNumber(topic.name) }))
      .filter((entry): entry is { range: NonNullable<typeof entry.range>; title: string } => !!entry.range && !!entry.title)
      .map((entry) => ({ first: entry.range.first, last: entry.range.last, title: entry.title }));
    topicRangesByBook.set(book, ranges);
  }
  const titles: string[] = [];
  for (const range of ranges) {
    if (range.first <= last && range.last >= first && !titles.includes(range.title)) titles.push(range.title);
  }
  return titles;
}

/** Denumiri scurte folosite în cardurile existente → numărul capitolului din plan (index). */
const CATEGORY_ALIASES: Array<[string, number]> = [
  ['sepsis', 0],
  ['infectii bacteriene', 0],
  ['echilibru hidro', 1],
  // Titlul curent tipărit pe paginile capitolului 9 din Kumar diferă de cel din cuprins.
  ['echilibrul apei', 1],
  ['acido-bazic', 1],
  ['hidroelectrolitic', 1],
  ['terapie intensiva', 2],
  ['hematologie', 3],
  ['reumatologie', 4],
  ['endocrinologie', 5],
  ['diabet', 6],
  ['neurologie', 7],
  ['pneumologie', 8],
  ['tromboembolica', 9],
  ['tromboembolism', 9],
  ['cardiologie', 10],
  ['hipertensiune', 11],
  ['gastroenterologie', 12],
  ['hepatic', 13],
  ['hepatice', 13],
  ['renale', 14],
  ['renal', 14],
  ['tract urinar', 14],
  ['hiv', 15],
  ['transmisibil', 15],
  ['perioperator', 16],
  ['sangerari chirurgicale', 17],
  ['infectiile chirurgicale', 18],
  ['infectii chirurgicale', 18],
  ['traumatologie', 19],
  ['arsur', 20],
  ['hernii', 21],
  ['esofag', 22],
  ['stomac', 23],
  ['duoden', 23],
  ['intestin', 24],
  ['apendic', 24],
  ['colon', 25],
  ['rect', 25],
  ['cai biliare', 26],
  ['biliar', 26],
  ['pancreas', 27],
  ['ficatul si splina', 28],
  ['splina', 28],
  ['vascular', 29],
  ['orl', 30],
  ['otorinolaringologie', 30],
  ['ortopedi', 31],
  ['urologie', 32],
  ['dermatologie', 33],
  ['pediatrie', 34],
  ['ginecolog', 35],
  ['mamar', 35],
  ['obstetric', 36],
  ['psihic', 37],
  ['epidemiologie', 38],
  ['etica', 38],
];

const STOPWORDS = new Set(['si', 'ale', 'al', 'de', 'la', 'in', 'cu', 'a', 'pe', 'pentru', 'bolile', 'boala', 'bolilor']);

function tokens(text: string): string[] {
  return fold(text).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Capitolul din plan pentru o etichetă liberă (ex. `category` de pe un flashcard: „Diabet zaharat”,
 * „Infecția HIV”). Întâi un titlu aproape identic, apoi aliasurile, apoi potrivirea pe cuvinte.
 * `book` restrânge căutarea când se știe (ex. `sourceBook` de pe card).
 */
export function chapterForLabel(label: string, book?: BookCode | null): CurriculumChapter | null {
  const text = fold(label).trim();
  if (!text) return null;
  const all = curriculumChapters();
  const pool = book ? all.filter((chapter) => chapter.book === book) : all;

  const exact = pool.find((chapter) => fold(chapter.title) === text);
  if (exact) return exact;

  for (const [needle, index] of CATEGORY_ALIASES) {
    if (text.includes(needle)) {
      const chapter = all[index];
      if (chapter && (!book || chapter.book === book)) return chapter;
    }
  }

  const wanted = new Set(tokens(label));
  if (wanted.size === 0) return null;
  let best: CurriculumChapter | null = null;
  let bestScore = 0;
  for (const chapter of pool) {
    const own = tokens(chapter.title);
    const hits = own.filter((word) => wanted.has(word)).length;
    const score = hits / Math.max(1, Math.min(own.length, wanted.size));
    if (hits > 0 && score > bestScore) {
      best = chapter;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Capitolul din plan la care se referă un titlu de heading dintr-o sursă indexată (cuprinsul cărții). */
export function chapterForHeading(heading: string, book?: BookCode | null): CurriculumChapter | null {
  return chapterForLabel(withoutNumber(heading.replace(/^cap(itolul)?\.?\s*\d+[.:\-–]?\s*/i, '')), book);
}
