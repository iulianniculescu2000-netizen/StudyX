import { describe, expect, it } from 'vitest';
import {
  BOOK_FILES, bookChapterLabel, bookChapterNumber, chapterFileGuess, parseFilePages, parsePageRange, parsePrintedPages,
  printedPageFor, resolveCitation, topicSources,
} from './bookPages';
import { basePlan } from './curriculum';
import type { Topic } from './organizare/types';

const mk = (over: Partial<Topic>): Topic => ({
  index: 0, group: 0, book: 'K', chapter: 'Kumar, Cap. 08. Sepsisul', name: 'x', pages: 1, quizzes: 0, src: 'Kumar p.151-153', pdf: '5-7',
  resources: '', folder: '', note: '', a: [], b: [], h: [],
  file: 'Carti/Kumar/Kumar - capitole/08. Sepsisul/01. Abilități - pagina 5-7.pdf', ...over,
});

describe('parsers', () => {
  it('reads ranges and single pages', () => {
    expect(parsePageRange('5-7')).toEqual({ first: 5, last: 7 });
    expect(parsePageRange('42')).toEqual({ first: 42, last: 42 });
    expect(parsePageRange('7-5')).toBeNull();
    expect(parsePageRange('')).toBeNull();
    expect(parsePageRange(undefined)).toBeNull();
  });
  it('reads page numbers from file names and src', () => {
    expect(parseFilePages('a/b/01. Abilități - pagina 5-7.pdf')).toEqual({ first: 5, last: 7 });
    expect(parseFilePages('a/01. Terapie - pagina 42.pdf')).toEqual({ first: 42, last: 42 });
    expect(parseFilePages('a/carte.pdf')).toBeNull();
    expect(parsePrintedPages('Kumar p.151-153')).toEqual({ first: 151, last: 153 });
    expect(parsePrintedPages('')).toBeNull();
  });
  it('derives the book own chapter number', () => {
    expect(bookChapterNumber('Kumar, Cap. 08. Sepsisul')).toBe(8);
    expect(bookChapterNumber('Kumar, Cap. 09 Echilibrul')).toBe(9);
    expect(bookChapterLabel('Sinopsis, Cap. 15 Epidemiologie')).toBe('Cap. 15');
    expect(bookChapterLabel('fără număr')).toBeNull();
  });
});

describe('topicSources', () => {
  it('opens the section file at its first page and falls back to the compiled book', () => {
    const t = mk({ pdf: '8-11', file: 'Carti/Kumar/Kumar - capitole/08. Sepsisul/02. Introducere - pagina 8-11.pdf' });
    const s = topicSources(t, [mk({}), t]);
    expect(s.map((x) => x.kind)).toEqual(['chapter', 'section', 'book']);
    expect(s[0]).toEqual({ kind: 'chapter', file: 'Carti/Kumar/Kumar - capitole/Capitole Intregi/08. Sepsisul - pagina 5-11.pdf', page: 4 });
    expect(s[1]).toEqual({ kind: 'section', file: t.file, page: 1 });
    expect(s[2]).toEqual({ kind: 'book', file: BOOK_FILES.K, page: 8 });
  });
  it('maps a later pdf page into the section file', () => {
    const t = mk({});
    const s = topicSources(t, [t], 7);
    expect(s.find((x) => x.kind === 'section')?.page).toBe(3);
    expect(s.find((x) => x.kind === 'book')?.page).toBe(7);
  });
  it('skips the section file for a page outside it', () => {
    expect(topicSources(mk({}), [mk({})], 30).map((x) => x.kind)).toEqual(['book']);
  });
  it('uses the compiled book for topics without a file (Lawrence)', () => {
    const t = mk({ book: 'L', file: '', pdf: '13-14' });
    expect(topicSources(t)).toEqual([{ kind: 'book', file: BOOK_FILES.L, page: 13 }]);
  });
  it('guesses no chapter file without a section path', () => {
    expect(chapterFileGuess('x.pdf', [mk({})])).toBeNull();
  });
});

describe('resolveCitation / printedPageFor', () => {
  const topics = [
    mk({ index: 0, group: 0 }),
    mk({ index: 1, group: 0, src: 'Kumar p.154-157', pdf: '8-11' }),
    mk({ index: 2, group: 1, book: 'L', file: '', src: 'Lawrence p.100-101', pdf: '13-14' }),
  ];
  it('resolves by topic index, chapter and pdf page', () => {
    expect(resolveCitation(topics, { book: 'K', topicIndex: 1 })).toMatchObject({ pdfPage: 8, topic: { index: 1 } });
    expect(resolveCitation(topics, { book: 'K', chapterIndex: 0 })).toMatchObject({ pdfPage: 5, topic: { index: 0 } });
    expect(resolveCitation(topics, { book: 'K', pdfPage: 10 })).toMatchObject({ pdfPage: 10, topic: { index: 1 } });
  });
  it('converts printed pages through the src/pdf pair', () => {
    expect(resolveCitation(topics, { book: 'K', printedPage: 156 })).toMatchObject({ pdfPage: 10, topic: { index: 1 } });
    expect(resolveCitation(topics, { book: 'L', printedPage: 101 })).toMatchObject({ pdfPage: 14 });
    expect(printedPageFor(topics[1], 10)).toBe(156);
    expect(printedPageFor(topics[1], 99)).toBeNull();
  });
  it('falls back to page 1 for an unknown citation', () => {
    expect(resolveCitation(topics, { book: 'S' })).toEqual({ topic: null, pdfPage: 1 });
  });
});

describe('real plan', () => {
  it('every Kumar section file name agrees with its pdf range', () => {
    for (const t of basePlan().topics.filter((x) => x.file)) {
      expect(parseFilePages(t.file), t.file).toEqual(parsePageRange(t.pdf));
    }
  });
  it('every Kumar topic yields a chapter number', () => {
    for (const t of basePlan().topics) expect(bookChapterNumber(t.chapter), t.chapter).not.toBeNull();
  });
});
