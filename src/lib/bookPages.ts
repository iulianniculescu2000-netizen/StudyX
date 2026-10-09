/**
 * Paginile cărților din plan: cum se ajunge de la un topic (sau de la o citare din chat) la fișierul PDF și la
 * pagina potrivită. Pagina „PDF” a planului (`pdf: '5-7'`) este numărul paginii din PDF-ul compilat al cărții
 * („Kumar 10th ed RO - doar capitolele rezi”); „src” sunt paginile tipărite ale cărții (`Kumar p.151-153`).
 * Fișierele pe secțiune au în nume „pagina A-B” = aceleași pagini din PDF-ul compilat, deci pagina n a fișierului
 * secțiunii este pagina A + n - 1 din cel compilat. Totul aici e pur (fără acces la disc), ca să fie testabil.
 */
import type { Topic } from './organizare/types';

export type BookCode = 'K' | 'L' | 'S';

/** PDF-urile cărților întregi (compilate), pentru topicuri fără fișier propriu. */
export const BOOK_FILES: Record<BookCode, string> = {
  K: 'Carti/Kumar/Kumar 10th ed RO - doar capitolele rezi (391 p).pdf',
  L: 'Carti/Lawrence/Lawrence RO - capitole rezi (345 p).pdf',
  S: 'Carti/Sinopsis/Sinopsis RO - tematica (118 p).pdf',
};

export interface PageRange {
  first: number;
  last: number;
}

/** „5-7” → {5,7}; „42” → {42,42}; „5–7” (cu cratimă lungă) la fel; altfel null. */
export function parsePageRange(text: string | null | undefined): PageRange | null {
  const m = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(text ?? '');
  if (!m) return null;
  const first = Number(m[1]);
  const last = m[2] ? Number(m[2]) : first;
  if (first < 1 || last < first) return null;
  return { first, last };
}

/** „…/01. Abilități - pagina 5-7.pdf” → {5,7}: paginile din PDF-ul compilat pe care le conține fișierul. */
export function parseFilePages(file: string | null | undefined): PageRange | null {
  const m = /pagina\s+(\d+(?:\s*[-–—]\s*\d+)?)\s*\.pdf\s*$/i.exec(file ?? '');
  return m ? parsePageRange(m[1]) : null;
}

/** „Kumar p.151-153” → {151,153}: paginile tipărite ale cărții. */
export function parsePrintedPages(src: string | null | undefined): PageRange | null {
  const m = /p\.\s*(\d+(?:\s*[-–—]\s*\d+)?)/i.exec(src ?? '');
  return m ? parsePageRange(m[1]) : null;
}

/** Numărul capitolului cărții din eticheta planului („Kumar, Cap. 08. Sepsis…” → 8), sau null. */
export function bookChapterNumber(chapter: string | null | undefined): number | null {
  const m = /Cap\.?\s*(\d+)/i.exec(chapter ?? '');
  return m ? Number(m[1]) : null;
}

/** „Cap. 8” — numărul din cartea însăși (nu cel 1–39 din plan), sau null când eticheta nu are număr. */
export function bookChapterLabel(chapter: string | null | undefined): string | null {
  const n = bookChapterNumber(chapter);
  return n === null ? null : `Cap. ${n}`;
}

export interface TopicPages {
  book: BookCode;
  /** Fișierul secțiunii (gol când topicul nu are unul propriu). */
  file: string;
  /** Paginile în PDF-ul compilat al cărții. */
  pdf: PageRange | null;
  /** Paginile tipărite ale cărții. */
  printed: PageRange | null;
}

export function topicPages(topic: Pick<Topic, 'book' | 'file' | 'pdf' | 'src'>): TopicPages {
  return { book: topic.book, file: topic.file, pdf: parsePageRange(topic.pdf), printed: parsePrintedPages(topic.src) };
}

export type SourceKind = 'chapter' | 'section' | 'book';

export interface BookSource {
  kind: SourceKind;
  /** Calea relativă la folderul ales de student. */
  file: string;
  /** Pagina (1-based) din ACEST fișier la care se deschide. */
  page: number;
}

const dirname = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf('/')));
const basename = (file: string) => file.slice(file.lastIndexOf('/') + 1);

/**
 * PDF-ul capitolului întreg („Capitole Intregi/<NN. Titlu> - pagina A-B.pdf”, lângă folderul capitolului),
 * presupus din secțiunile capitolului: A-B = de la prima la ultima pagină a topicurilor lui. Doar o presupunere;
 * dacă fișierul nu există, se trece la următoarea sursă.
 */
export function chapterFileGuess(sectionFile: string, chapterTopics: Array<Pick<Topic, 'pdf'>>): { file: string; pages: PageRange } | null {
  const parts = sectionFile.split('/');
  if (parts.length < 3) return null;
  const folder = parts[parts.length - 2];
  const ranges = chapterTopics.map((t) => parsePageRange(t.pdf)).filter((r): r is PageRange => !!r);
  if (!ranges.length) return null;
  const pages = { first: Math.min(...ranges.map((r) => r.first)), last: Math.max(...ranges.map((r) => r.last)) };
  const root = dirname(dirname(sectionFile));
  const span = pages.first === pages.last ? `${pages.first}` : `${pages.first}-${pages.last}`;
  return { file: `${root}/Capitole Intregi/${folder} - pagina ${span}.pdf`, pages };
}

/**
 * Sursele în care se poate citi un topic, de la cea mai bună la cea mai slabă, fiecare cu pagina la care se
 * deschide: capitolul întreg (dacă e presupus), fișierul secțiunii, cartea compilată. `pdfPage` = pagina din PDF-ul
 * compilat (implicit prima a topicului).
 */
export function topicSources(topic: Topic, chapterTopics: Topic[] = [topic], pdfPage?: number): BookSource[] {
  const { pdf, file } = topicPages(topic);
  const target = pdfPage ?? pdf?.first ?? 1;
  const out: BookSource[] = [];
  if (file) {
    const guess = chapterFileGuess(file, chapterTopics);
    if (guess && guess.file !== file && target >= guess.pages.first && target <= guess.pages.last) {
      out.push({ kind: 'chapter', file: guess.file, page: target - guess.pages.first + 1 });
    }
    const own = parseFilePages(file);
    if (own) {
      // Pagina cerută e în secțiune doar dacă intră în A-B; altfel secțiunea nu o conține.
      if (target >= own.first && target <= own.last) out.push({ kind: 'section', file, page: target - own.first + 1 });
    } else {
      out.push({ kind: 'section', file, page: 1 });
    }
  }
  out.push({ kind: 'book', file: BOOK_FILES[topic.book], page: target });
  return out;
}

export interface CitationTarget {
  book: BookCode;
  pdfPage?: number;
  printedPage?: number;
  chapterIndex?: number;
  topicIndex?: number;
}

export interface ResolvedCitation {
  topic: Topic | null;
  /** Pagina în PDF-ul compilat al cărții. */
  pdfPage: number;
}

/**
 * Din ce poate indica o citare (topic, capitol, pagină din PDF sau pagină tipărită) află topicul și pagina din
 * PDF-ul compilat. O pagină tipărită se convertește prin intervalul „src” ↔ „pdf” al topicului care o conține.
 */
export function resolveCitation(topics: Topic[], target: CitationTarget): ResolvedCitation {
  const ofBook = topics.filter((t) => t.book === target.book);
  const range = (t: Topic) => topicPages(t);
  let topic: Topic | null = null;
  if (target.topicIndex !== undefined) topic = topics.find((t) => t.index === target.topicIndex) ?? null;
  if (!topic && target.chapterIndex !== undefined) topic = ofBook.find((t) => t.group === target.chapterIndex) ?? null;

  let pdfPage = target.pdfPage;
  if (pdfPage === undefined && target.printedPage !== undefined) {
    const p = target.printedPage;
    const within = (t: Topic) => { const r = range(t); return !!r.printed && !!r.pdf && p >= r.printed.first && p <= r.printed.last; };
    const hit = (topic && within(topic) ? topic : null) ?? ofBook.find(within) ?? null;
    if (hit) {
      const r = range(hit);
      pdfPage = r.pdf!.first + (p - r.printed!.first);
      topic = hit;
    }
  }
  if (pdfPage !== undefined) {
    const q = pdfPage;
    if (!topic || !(range(topic).pdf && q >= range(topic).pdf!.first && q <= range(topic).pdf!.last)) {
      topic = ofBook.find((t) => { const r = range(t).pdf; return !!r && q >= r.first && q <= r.last; }) ?? topic;
    }
  }
  return { topic, pdfPage: pdfPage ?? (topic ? range(topic).pdf?.first ?? 1 : 1) };
}

/** Pagina tipărită corespunzătoare unei pagini din PDF-ul compilat, în topicul dat (sau null). */
export function printedPageFor(topic: Pick<Topic, 'book' | 'file' | 'pdf' | 'src'>, pdfPage: number): number | null {
  const { pdf, printed } = topicPages(topic);
  if (!pdf || !printed || pdfPage < pdf.first || pdfPage > pdf.last) return null;
  const p = printed.first + (pdfPage - pdf.first);
  return p <= printed.last ? p : null;
}

export { basename as fileBaseName };
