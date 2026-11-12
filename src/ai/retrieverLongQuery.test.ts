/**
 * Întrebări lungi, în limbaj natural, pe textul real din Kumar, cu vectorii locali (fără cheie de embeddings).
 * Test live (19 oct 2026): la „formele clinice ale artritei psoriazice… ce tratament se evită?” primul fragment era
 * nefrita lupică (p.347), pagina despre APs ieșea pe locul 41, iar la „Explică-mi guta…” toate scorurile cădeau sub
 * pragul chatului, deci modelul răspundea fără carte. Cauze: vectorul local (hash fără IDF) primea 38% din scor, iar
 * cuvintele generale („clinic”, „tratament”) cereau în normalizarea BM25 cât numele bolii.
 */
import { describe, expect, it } from 'vitest';
import { embedTextLocal } from './embeddings';
import { rankChunks, type RankableChunk } from './retriever';
import { filterRelevantChunks } from '../components/ai-chat/retrievalQuery';
import kumarPages from '../data/rezidentiat/library/kumar.pages.json';
import { structureBook, structuredChunks } from '../lib/bookStructure';

const SOURCE = 'Kumar și Clark – Medicină Clinică.pdf';

/** Exact fragmentele pe care le indexează aplicația: baza structurată a cărții (subiect › secțiune, pagina exactă). */
function bookChunks(): RankableChunk[] {
  return structuredChunks(structureBook('K', kumarPages as string[]), SOURCE).map((chunk) => ({
    ...chunk, topic: 'Kumar', source: SOURCE, sourceId: 'kumar', embedding: embedTextLocal(chunk.text),
  }));
}

const CHUNKS = bookChunks();

function search(query: string) {
  return filterRelevantChunks(rankChunks(query, CHUNKS, embedTextLocal(query), null, 5, { rezidentiat: true }));
}

describe('întrebări lungi pe Kumar cu vectori locali', () => {
  it('artrita psoriazică: primul fragment e despre APs, nu despre nefrita lupică', () => {
    const results = search('Care sunt formele clinice ale artritei psoriazice și cum arată radiologic? Și ce tratament se evită?');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toMatch(/psoriazi|APs/);
    expect(results.some((chunk) => /hidroxiclorochin/.test(chunk.text))).toBe(true);
  });

  it('guta: întrebarea cu multe cuvinte generale primește fragmente din capitolul de gută', () => {
    const results = search('Explică-mi guta din Kumar: cauze, tablou clinic, diagnostic și tratamentul crizei acute vs de fond');
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.filter((chunk) => /gut[aăe]|urat/i.test(chunk.text)).length).toBeGreaterThanOrEqual(3);
  });

  it('poliartrita reumatoidă: tratamentul de fond aduce pagina cu metotrexatul', () => {
    const results = search('Ce tratament de fond se folosește în poliartrita reumatoidă și ce monitorizăm?');
    expect(results.some((chunk) => /metotrexat/i.test(chunk.text))).toBe(true);
  });

  it('întrebările scurte rămân neschimbate: acalazia vine prima', () => {
    const results = search('tratamentul acalaziei');
    expect(results[0].text).toMatch(/acalazi/i);
  });

  it('o întrebare fără legătură cu medicina nu primește fragmente', () => {
    expect(search('Spune-mi o glumă')).toEqual([]);
  });
});

describe('cartea numită în întrebare', () => {
  it('„din Kumar”, „Lawrence”, „Sinopsis” sunt recunoscute; două cărți sau niciuna nu aleg nimic', async () => {
    const { bookNamedIn } = await import('./retriever');
    expect(bookNamedIn('Explică-mi guta din Kumar')).toBe('K');
    expect(bookNamedIn('ce spune Lawrence despre hernii')).toBe('L');
    expect(bookNamedIn('în Sinopsisul de medicină')).toBe('S');
    expect(bookNamedIn('compară Kumar și Lawrence')).toBeNull();
    expect(bookNamedIn('tratamentul gutei')).toBeNull();
  });
});
