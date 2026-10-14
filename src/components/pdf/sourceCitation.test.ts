import { describe, expect, it } from 'vitest';
import type { ChunkRecord } from '../../ai/types';
import type { AIKnowledgeSource } from '../../store/aiStore';
import { findCitationSource, textForCitation } from './sourceCitation';
import { REZIDENTIAT_LIBRARY_BOOKS } from '../../lib/rezidentiatLibrary';

const source = { id: 'curs-1', name: 'Curs.pdf' } as AIKnowledgeSource;
const chunk = (text: string, page: number, pageEnd?: number) => ({ text, page, ...(pageEnd ? { pageEnd } : {}) }) as ChunkRecord;

describe('citări din documente importate', () => {
  it('identifică sursa după ID și nu substituie o sursă diferită cu același nume', () => {
    expect(findCitationSource([source], { sourceId: 'curs-1', sourceName: 'Alt nume' })).toBe(source);
    expect(findCitationSource([source], { sourceId: 'șters', sourceName: 'Curs.pdf' })).toBeUndefined();
    expect(findCitationSource([source], { sourceName: 'curs.PDF' })).toBe(source);
    expect(findCitationSource([source], { sourceName: 'Curs' })).toBe(source);
  });

  it('o citare veche a unei cărți de bază se deschide și după ce cartea a fost refăcută (alt id, același nume)', () => {
    const bookName = REZIDENTIAT_LIBRARY_BOOKS[0].name;
    const rebuilt = { id: 'nou-1', name: bookName } as AIKnowledgeSource;
    expect(findCitationSource([rebuilt], { sourceId: 'vechi-9', sourceName: bookName })).toBe(rebuilt);
  });

  it('arată fragmentele paginii citate, inclusiv un fragment care se întinde pe mai multe pagini', () => {
    expect(textForCitation([
      chunk('Altă pagină', 1256),
      chunk('Eritemul infecțios', 1257),
      chunk('Tablou clinic', 1257, 1258),
    ], { pdfPage: 1257, excerpt: 'rezervă' })).toBe('Eritemul infecțios\n\nTablou clinic');
  });

  it('folosește fragmentul din mesaj dacă indexul nu mai conține pagina', () => {
    expect(textForCitation([chunk('Altă pagină', 10)], { pdfPage: 1257, excerpt: 'Fragment salvat' })).toBe('Fragment salvat');
  });
});
