import { BOOK_SHORT, basePlan } from '../../lib/curriculum';
import { bookChapterLabel, resolveCitation, topicSources, type BookCode, type CitationTarget } from '../../lib/bookPages';
import type { Topic } from '../../lib/organizare/types';
import type { BookViewRequest } from './BookPdfReader';

/** Evenimentul prin care orice parte a aplicației (ex. o citare din chat) cere deschiderea cărții la o pagină. */
export const OPEN_BOOK_EVENT = 'studyx:open-book';

export type OpenBookDetail = CitationTarget;

export function dispatchOpenBook(detail: OpenBookDetail): void {
  window.dispatchEvent(new CustomEvent<OpenBookDetail>(OPEN_BOOK_EVENT, { detail }));
}

/** Citirea unui topic: se deschide la prima lui pagină (sau la `pdfPage`, din PDF-ul compilat al cărții). */
export function requestForTopic(topic: Topic, pdfPage?: number): BookViewRequest {
  const siblings = basePlan().topics.filter((t) => t.group === topic.group);
  const page = pdfPage ?? Number(/^\s*(\d+)/.exec(topic.pdf)?.[1] ?? 1);
  const chapter = bookChapterLabel(topic.chapter);
  return {
    title: [BOOK_SHORT[topic.book], chapter, topic.name].filter(Boolean).join(' · '),
    pdfPage: page,
    sources: topicSources(topic, siblings, page),
    topic,
  };
}

/** Din detaliul evenimentului (topic, capitol, pagină PDF sau tipărită) întoarce ce trebuie deschis, sau null. */
export function requestForCitation(detail: Partial<OpenBookDetail> | null | undefined): BookViewRequest | null {
  const book = detail?.book;
  if (book !== 'K' && book !== 'L' && book !== 'S') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const target: CitationTarget = {
    book: book as BookCode,
    pdfPage: num(detail?.pdfPage),
    printedPage: num(detail?.printedPage),
    chapterIndex: num(detail?.chapterIndex),
    topicIndex: num(detail?.topicIndex),
  };
  const { topic, pdfPage } = resolveCitation(basePlan().topics, target);
  if (topic) return requestForTopic(topic, pdfPage);
  const siblings: Topic[] = [];
  return {
    title: `${BOOK_SHORT[book]} · pagina ${pdfPage}`,
    pdfPage,
    sources: topicSources({ book, file: '', pdf: String(pdfPage), src: '' } as Topic, siblings, pdfPage),
    topic: null,
  };
}
