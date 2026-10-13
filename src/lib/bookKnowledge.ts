/**
 * Harta celor trei cărți incluse (Kumar și Clark, Lawrence, Sinopsis): pentru fiecare pagină din PDF, din ce capitol și topic
 * face parte, după planul din Organizare (39 de capitole, 555 de topicuri cu pagini). Agentul „Vezi în carte” o folosește ca
 * să înțeleagă unde se află un subiect: numele capitolului și al topicului intră în căutare, localizatorul AI alege capitole
 * dintr-o listă scurtă, iar fereastra arată „Capitol · Topic · Pagina”.
 */
import { basePlan, curriculumChapters } from './curriculum';
import { parsePageRange, type BookCode } from './bookPages';

export interface PageContext {
  /** Numărul capitolului în plan (1-39), unic între cărți. */
  chapterNumber: number;
  chapter: string;
  topic: string;
}

export interface ChapterRange {
  number: number;
  book: BookCode;
  title: string;
  first: number;
  last: number;
}

const withoutOrdinal = (name: string) => name.replace(/^\s*\d+\.\s*/, '').trim();

let pageMaps: Map<BookCode, Array<PageContext | undefined>> | null = null;
let ranges: ChapterRange[] | null = null;

function build() {
  const plan = basePlan();
  const chapters = curriculumChapters();
  const maps = new Map<BookCode, Array<PageContext | undefined>>();
  const spans = new Map<BookCode, Array<number | undefined>>();
  const bounds = new Map<number, { first: number; last: number }>();
  for (const topic of plan.topics) {
    const range = parsePageRange(topic.pdf);
    const chapter = chapters[topic.group];
    if (!range || !chapter) continue;
    const map = maps.get(topic.book) ?? [];
    const span = spans.get(topic.book) ?? [];
    for (let page = range.first; page <= range.last; page += 1) {
      const width = range.last - range.first;
      // Topicul cel mai îngust care conține pagina câștigă (topicurile vecine se ating la capete).
      if (span[page] !== undefined && span[page]! <= width) continue;
      map[page] = { chapterNumber: chapter.number, chapter: chapter.title, topic: withoutOrdinal(topic.name) };
      span[page] = width;
    }
    maps.set(topic.book, map);
    spans.set(topic.book, span);
    const bound = bounds.get(chapter.number);
    bounds.set(chapter.number, { first: Math.min(bound?.first ?? range.first, range.first), last: Math.max(bound?.last ?? range.last, range.last) });
  }
  pageMaps = maps;
  ranges = chapters
    .filter((chapter) => bounds.has(chapter.number))
    .map((chapter) => ({ number: chapter.number, book: chapter.book, title: chapter.title, ...bounds.get(chapter.number)! }));
}

/** Capitolul și topicul unei pagini din PDF-ul cărții, sau `undefined` dacă planul nu o acoperă. */
export function pageContext(book: BookCode, page: number): PageContext | undefined {
  if (!pageMaps) build();
  return pageMaps!.get(book)?.[page];
}

export function chapterRanges(): readonly ChapterRange[] {
  if (!ranges) build();
  return ranges!;
}

/** Lista scurtă de capitole pentru localizatorul AI: „12 | K | Hematologie (p. 40-70)”. */
export function chapterOutline(): string {
  return chapterRanges().map((chapter) => `${chapter.number} | ${chapter.book} | ${chapter.title} (p. ${chapter.first}-${chapter.last})`).join('\n');
}

export function rangesOfChapters(numbers: readonly number[]): ChapterRange[] {
  const wanted = new Set(numbers);
  return chapterRanges().filter((chapter) => wanted.has(chapter.number));
}
