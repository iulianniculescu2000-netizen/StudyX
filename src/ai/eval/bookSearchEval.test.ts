/**
 * Măsurarea căutării în cărțile de bază pe setul din `bookSearchCases.ts`. Fără rețea și fără IndexedDB: exact
 * fragmentele pe care le indexează aplicația (baza structurată a celor trei cărți) cu vectorii locali, adică
 * ce primește un utilizator fără cheie de embeddings. Calea e nucleul chatului: `rankChunks` cu `rezidentiat`
 * și pragul `filterRelevantChunks`.
 *
 * Testul tipărește tabelul și ține un prag minim. Când o schimbare în retriever urcă cifrele, urcă și pragul
 * (și tabelul din `docs/eval/README.md`); nu-l coborî ca să treacă testul.
 */
import { describe, expect, it } from 'vitest';
import { embedTextLocal } from '../embeddings';
import { rankChunks, type RankableChunk } from '../retriever';
import { filterRelevantChunks } from '../../components/ai-chat/retrievalQuery';
import { extraPageChunks, structureBook, structuredChunks } from '../../lib/bookStructure';
import { BUNDLED_BOOK_NAMES } from '../../lib/bundledBookNames';
import type { BookCode } from '../../lib/curriculum';
import kumarPages from '../../data/rezidentiat/library/kumar.pages.json';
import lawrencePages from '../../data/rezidentiat/library/lawrence.pages.json';
import sinopsisPages from '../../data/rezidentiat/library/sinopsis.pages.json';
import lawrenceExtra from '../../data/rezidentiat/library/lawrence.extra.json';
import { BOOK_SEARCH_CASES, type BookSearchCase, type CaseKind } from './bookSearchCases';

const BOOKS: Array<{ code: BookCode; id: string; name: string; pages: string[] }> = [
  { code: 'K', id: 'kumar', name: BUNDLED_BOOK_NAMES.kumar, pages: kumarPages as string[] },
  { code: 'L', id: 'lawrence', name: BUNDLED_BOOK_NAMES.lawrence, pages: lawrencePages as string[] },
  { code: 'S', id: 'sinopsis', name: BUNDLED_BOOK_NAMES.sinopsis, pages: sinopsisPages as string[] },
];

/** Paginile Lawrence din afara PDF-ului inclus: aplicația le indexează după ultima pagină (vezi `bundledBookText`). */
const LAWRENCE_EXTRA = Object.entries(lawrenceExtra as Record<string, string>)
  .map(([printed, text]) => ({ printed: Number(printed), text }))
  .filter((entry) => Number.isFinite(entry.printed) && entry.text.trim())
  .sort((a, b) => a.printed - b.printed);

const CHUNKS: RankableChunk[] = BOOKS.flatMap((book) => {
  const main = structuredChunks(structureBook(book.code, book.pages), book.name);
  const all = book.code === 'L' ? [...main, ...extraPageChunks(LAWRENCE_EXTRA, book.pages.length, book.name, main.length)] : main;
  return all.map((chunk) => ({ ...chunk, topic: book.id, source: book.name, sourceId: book.id, embedding: embedTextLocal(chunk.text) }));
});

const SOURCE_ID: Record<BookCode, string> = { K: 'kumar', L: 'lawrence', S: 'sinopsis' };
const TOP_K = 5;

/** Locul (1…5) primului fragment care stă pe o pagină acceptată, sau 0 când niciunul din primele 5 nu stă. */
function rankOfAnswer(testCase: BookSearchCase): number {
  const results = filterRelevantChunks(rankChunks(testCase.query, CHUNKS, embedTextLocal(testCase.query), null, TOP_K, { rezidentiat: true }));
  const accepted: Array<[string, number[]]> = [
    [SOURCE_ID[testCase.book], testCase.pages],
    ...Object.entries(testCase.alt ?? {}).map(([book, pages]): [string, number[]] => [SOURCE_ID[book as BookCode], pages ?? []]),
  ];
  const index = results.findIndex((chunk) => {
    if (typeof chunk.page !== 'number') return false;
    const start = chunk.page;
    const end = chunk.pageEnd ?? start;
    return accepted.some(([sourceId, pages]) => chunk.sourceId === sourceId && pages.some((page) => page >= start && page <= end));
  });
  return index + 1;
}

interface Score { n: number; top1: number; top5: number; mrr: number }

function score(ranks: number[]): Score {
  const n = ranks.length;
  return {
    n,
    top1: ranks.filter((rank) => rank === 1).length / n,
    top5: ranks.filter((rank) => rank > 0).length / n,
    mrr: ranks.reduce((sum, rank) => sum + (rank > 0 ? 1 / rank : 0), 0) / n,
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

describe('măsurarea căutării în cărți', () => {
  const ranks = BOOK_SEARCH_CASES.map(rankOfAnswer);
  const byKind = (kind: CaseKind) => score(ranks.filter((_, i) => BOOK_SEARCH_CASES[i].kind === kind));
  const all = score(ranks);

  it('tipărește tabelul și întrebările ratate', () => {
    const rows = (['direct', 'abreviere', 'parafrază'] as CaseKind[]).map((kind) => {
      const s = byKind(kind);
      return `${kind.padEnd(10)} n=${String(s.n).padStart(2)}  primul=${pct(s.top1).padStart(4)}  în primele 5=${pct(s.top5).padStart(4)}  MRR=${s.mrr.toFixed(2)}`;
    });
    const missed = BOOK_SEARCH_CASES.filter((_, i) => ranks[i] === 0).map((c) => `  ✗ [${c.book}] ${c.query}`);
    console.info([
      `Căutarea în cărți (${all.n} întrebări, ${CHUNKS.length} fragmente, vectori locali)`,
      ...rows,
      `${'TOTAL'.padEnd(10)} n=${all.n}  primul=${pct(all.top1).padStart(4)}  în primele 5=${pct(all.top5).padStart(4)}  MRR=${all.mrr.toFixed(2)}`,
      ...(missed.length ? ['Ratate (pagina nu e în primele 5):', ...missed] : []),
    ].join('\n'));
    expect(all.n).toBeGreaterThanOrEqual(40);
  });

  it('nu scade sub pragul măsurat', () => {
    expect(byKind('direct').top5).toBeGreaterThanOrEqual(FLOOR.directTop5);
    expect(all.top5).toBeGreaterThanOrEqual(FLOOR.allTop5);
    expect(all.mrr).toBeGreaterThanOrEqual(FLOOR.allMrr);
  });
});

/** Pragul minim = valorile măsurate la 14 nov 2026, rotunjite în jos. Urcă-l când cifrele urcă. */
const FLOOR = { directTop5: 0.97, allTop5: 0.92, allMrr: 0.78 };
