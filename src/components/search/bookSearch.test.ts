import { describe, expect, it } from 'vitest';
import { buildBookIndex, highlightTokens, queryTokens, searchBook } from './bookSearch';

const pages = [
  'Capitolul 1\nIntroducere în medicină.',
  'Hipertensiunea arterială\nHipertensiunea arterială este definită ca tensiune peste 140/90 mmHg. Tratamentul include IECA.',
  'Insuficiența cardiacă\nSe tratează cu diuretice; hipertensiunea poate fi o cauză.',
  '',
  'Șoc septic: tratament în terapie intensivă, antibiotice precoce.',
];
const index = buildBookIndex('K', pages);

describe('bookSearch', () => {
  it('ignoră diacriticele și majusculele și întoarce pagina din PDF (de la 1)', () => {
    const hits = searchBook(index, 'SOC septic');
    expect(hits).toHaveLength(1);
    expect(hits[0].pdfPage).toBe(5);
    expect(hits[0].book).toBe('K');
  });

  it('cere toate cuvintele și pune fraza întreagă și titlul primele', () => {
    expect(searchBook(index, 'hipertensiunea arterială').map((h) => h.pdfPage)).toEqual([2]);
    expect(searchBook(index, 'hipertensiunea').map((h) => h.pdfPage)).toEqual([2, 3]);
  });

  it('nu caută sub trei litere și nu are rezultate fără potrivire', () => {
    expect(searchBook(index, 'hi')).toEqual([]);
    expect(searchBook(index, 'zzzzqq')).toEqual([]);
    expect(searchBook(index, '   ')).toEqual([]);
  });

  it('respectă limita de rezultate', () => {
    expect(searchBook(index, 'hipertensiunea', 1)).toHaveLength(1);
  });

  it('fragmentul marchează potrivirea și păstrează textul original (cu diacritice)', () => {
    const [hit] = searchBook(index, 'tensiune');
    const text = hit.snippet.map((s) => s.text).join('');
    expect(text).toContain('Hipertensiunea arterială');
    const marked = hit.snippet.filter((s) => s.hit).map((s) => s.text.toLowerCase());
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((m) => m.includes('tensiune'))).toBe(true);
    expect(text).not.toContain('\n');
  });

  it('queryTokens și highlightTokens', () => {
    expect(queryTokens('A  Șoc, șoc  septic')).toEqual(['soc', 'septic']);
    const segments = highlightTokens('Șoc septic', 'soc septic', ['soc', 'septic']);
    expect(segments.map((s) => [s.text, s.hit])).toEqual([['Șoc', true], [' ', false], ['septic', true]]);
  });
});
