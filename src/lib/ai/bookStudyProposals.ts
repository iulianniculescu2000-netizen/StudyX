/**
 * bookStudyProposals.ts
 *
 * „Schemă și carduri din carte”: studentul alege un capitol sau un interval de pagini dintr-o carte inclusă în aplicație
 * (Kumar, Lawrence, Sinopsis), iar AI propune o schemă și 10–20 de carduri. Fiecare propunere poartă pagina și un citat
 * scurt, iar citarea se verifică DETERMINIST față de textul paginii (citatul chiar apare acolo, pagina e în interval).
 * Propunerile fără citare verificată se aruncă. Nimic nu se salvează aici: `buildAcceptedDeck` construiește pachetul doar din
 * ce a acceptat studentul, iar `saveFlashcardDeck` îl scrie.
 *
 * Reutilizează conducta existentă: textul paginilor (`bookText.loadBookPages`), autorul de flashcarduri (prompt, nivel,
 * curățare, deduplicare, pachet), regulile de scheme și verificarea citatelor din `bookPassage`. Protecția cărților:
 * în interfață ajunge doar citatul (max. 200 de caractere) și pagina, niciodată textul paginii.
 */
import { z } from 'zod';
import { buildFlashcardAuthorSystem, buildFlashcardUserPrompt, type FlashcardLevel } from '../../ai/flashcardPrompts';
import {
  CITED_CARDS_OUTPUT_SPEC,
  QUOTE_MAX_CHARS,
  buildSchemaSystem,
  buildSchemaUserPrompt,
  pageHeader,
} from '../../ai/bookStudyPrompts';
import { formatCitationLabel } from '../../ai/contextBuilder';
import { parseSchema } from '../../components/ai-chat/schemaDsl';
import { describeDiagram } from '../../components/ai-chat/diagram';
import { BOOK_NAMES, BOOK_SHORT, type BookCode } from '../curriculum';
import { foldText, verifiedQuotes } from '../bookPassage';
import { loadBookPages } from '../bookText';
import { cleanFlashcardText } from '../flashcardText';
import type { PageRange } from '../bookPages';
import type { Quiz } from '../../types';
import { hasAIKey } from '../organizare/analysis';
import { buildFlashcardDeck, cleanAndDedupe, normalizeLevel, pickSpread, runPool, saveFlashcardDeck } from './flashcardAuthor';
import { requestStructured } from './structured';

export const MIN_PROPOSED_CARDS = 10;
export const MAX_PROPOSED_CARDS = 20;
export const DEFAULT_PROPOSED_CARDS = 12;
/** Peste atâtea pagini cererea ar fi prea mare pentru un model gratuit: intervalul se scurtează și studentul e anunțat. */
export const MAX_PROPOSAL_PAGES = 40;
const WINDOW_CHARS = 4500;
const MAX_CARD_WINDOWS = 6;
const SCHEMA_WINDOWS = 3;
const CONCURRENCY = 2;
/** Se cer mai multe carduri decât ținta, ca respingerile să nu lase setul sub număr. */
const OVERSHOOT = 1.5;

export const NO_AI_KEY_MESSAGE =
  'Pentru schema și cardurile din carte ai nevoie de o cheie AI. Adaug-o în Setări AI și încearcă din nou. Fără cheie poți citi capitolul sau face carduri de mână.';

export class NoAIKeyError extends Error {
  constructor() {
    super(NO_AI_KEY_MESSAGE);
    this.name = 'NoAIKeyError';
  }
}

/* ── Tipuri ─────────────────────────────────────────────────────────────────────────────────── */

export interface PageText { page: number; text: string }

/** Pagina din PDF-ul cărții (numerotarea planului și a citărilor din chat) și un citat verificat din ea. */
export interface BookCitation { book: BookCode; page: number; quote: string }

export interface CardProposal {
  id: string;
  front: string;
  back: string;
  level: FlashcardLevel;
  citation: BookCitation;
}

export interface SchemaProposal {
  id: string;
  title: string;
  /** Conținutul blocului ```schema, validat de parser. */
  code: string;
  citations: BookCitation[];
}

export interface ProposalSet {
  book: BookCode;
  range: PageRange;
  cards: CardProposal[];
  schema: SchemaProposal | null;
  /** Câte propuneri a aruncat garda de citare (fără pagină, pagină în afara intervalului, citat negăsit în pagină). */
  rejected: number;
  warnings: string[];
}

/* ── Numere și intervale ────────────────────────────────────────────────────────────────────── */

export function clampProposalCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PROPOSED_CARDS;
  return Math.max(MIN_PROPOSED_CARDS, Math.min(MAX_PROPOSED_CARDS, Math.round(value)));
}

/** Taie intervalul la `MAX_PROPOSAL_PAGES` și la paginile cărții; `null` când nu rămâne nicio pagină. */
export function clampPageRange(range: PageRange, totalPages: number): { range: PageRange; trimmed: boolean } | null {
  const first = Math.max(1, Math.floor(range.first));
  const last = Math.min(Math.floor(range.last), totalPages);
  if (!(last >= first)) return null;
  const capped = Math.min(last, first + MAX_PROPOSAL_PAGES - 1);
  return { range: { first, last: capped }, trimmed: capped < last };
}

export function pageTextsOf(pages: readonly string[], range: PageRange): PageText[] {
  const out: PageText[] = [];
  for (let page = range.first; page <= range.last; page += 1) {
    const text = (pages[page - 1] ?? '').trim();
    if (text) out.push({ page, text });
  }
  return out;
}

/** Ferestre de pagini întregi, fiecare cu marcajul [p. N] înaintea textului paginii. */
export function buildPageWindows(pages: readonly PageText[], size = WINDOW_CHARS): Array<{ pages: number[]; text: string }> {
  const windows: Array<{ pages: number[]; text: string }> = [];
  let current: { pages: number[]; text: string } | null = null;
  for (const page of pages) {
    const block = `${pageHeader(page.page)}\n${page.text}`;
    if (current && current.text.length + block.length + 2 > size) {
      windows.push(current);
      current = null;
    }
    if (!current) current = { pages: [], text: '' };
    current.pages.push(page.page);
    current.text += (current.text ? '\n\n' : '') + block;
  }
  if (current) windows.push(current);
  return windows;
}

/* ── Garda de citare (deterministă) ─────────────────────────────────────────────────────────── */

export type CitationRejection = 'fara-citare' | 'pagina-in-afara-intervalului' | 'citat-negasit' | 'raspuns-fara-legatura';

export type CitationCheck =
  | { ok: true; citation: BookCitation }
  | { ok: false; reason: CitationRejection };

const SUPPORT_MIN_WORD = 5;

/** Răspunsul trebuie să aibă măcar un cuvânt de conținut în pagina citată (un citat real lipit de un răspuns inventat nu trece). */
function answerTouchesPage(back: string, pageText: string): boolean {
  const words = foldText(back).split(/[^a-z0-9]+/).filter((word) => word.length >= SUPPORT_MIN_WORD);
  if (words.length === 0) return true;
  const haystack = foldText(pageText);
  return words.some((word) => haystack.includes(word.slice(0, Math.max(SUPPORT_MIN_WORD, word.length - 2))));
}

/**
 * Verifică o citare față de paginile alese. Pagina trebuie să fie în interval, citatul să apară cuvânt cu cuvânt în ea
 * (fără diacritice și majuscule); dacă apare pe altă pagină din interval, pagina se corectează la cea reală.
 */
export function verifyCitation(
  book: BookCode,
  page: unknown,
  quote: unknown,
  back: string,
  pages: readonly PageText[],
): CitationCheck {
  const wanted = typeof page === 'number' ? page : Number(page);
  const text = typeof quote === 'string' ? quote.trim().slice(0, QUOTE_MAX_CHARS) : '';
  if (!Number.isInteger(wanted) || wanted < 1 || !text) return { ok: false, reason: 'fara-citare' };
  const cited = pages.find((entry) => entry.page === wanted);
  if (!cited) return { ok: false, reason: 'pagina-in-afara-intervalului' };
  const candidates = [cited, ...pages.filter((entry) => entry !== cited).sort((a, b) => Math.abs(a.page - wanted) - Math.abs(b.page - wanted))];
  for (const entry of candidates) {
    const found = verifiedQuotes([text], entry.text)[0];
    if (!found) continue;
    if (!answerTouchesPage(back, entry.text)) return { ok: false, reason: 'raspuns-fara-legatura' };
    return { ok: true, citation: { book, page: entry.page, quote: found.slice(0, QUOTE_MAX_CHARS) } };
  }
  return { ok: false, reason: 'citat-negasit' };
}

export interface RawCitedCard { front: string; back: string; level: FlashcardLevel; page: unknown; quote: unknown }

const newId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** Păstrează doar cardurile cu citare verificată; numără respingerile. */
export function keepCitedCards(
  raw: readonly RawCitedCard[],
  book: BookCode,
  pages: readonly PageText[],
): { cards: CardProposal[]; rejected: number } {
  const cards: CardProposal[] = [];
  let rejected = 0;
  for (const card of raw) {
    const check = verifyCitation(book, card.page, card.quote, card.back, pages);
    if (!check.ok) { rejected += 1; continue; }
    cards.push({ id: newId(), front: card.front, back: card.back, level: card.level, citation: check.citation });
  }
  return { cards, rejected };
}

/** Curăță, scoate duplicatele, ordonează după pagină și TAIE la numărul cerut (modelul poate întoarce mai multe). */
export function finalizeCards(cards: readonly CardProposal[], count: number, existingFronts: readonly string[] = []): CardProposal[] {
  const cleaned = cleanAndDedupe(cards, existingFronts);
  return [...cleaned].sort((a, b) => a.citation.page - b.citation.page).slice(0, clampProposalCount(count));
}

/* ── Răspunsurile modelului ─────────────────────────────────────────────────────────────────── */

export const citedCardsReplySchema = z.unknown().transform((input, ctx): RawCitedCard[] => {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? ((input as Record<string, unknown>).cards ?? (input as Record<string, unknown>).flashcards ?? (input as Record<string, unknown>).carduri)
      : null;
  if (!Array.isArray(source)) {
    ctx.addIssue({ code: 'custom', message: 'Lipsește lista „cards”.' });
    return z.NEVER;
  }
  const out: RawCitedCard[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const front = cleanFlashcardText(String(record.front ?? record.question ?? '')).trim();
    const back = cleanFlashcardText(String(record.back ?? record.answer ?? '')).trim();
    if (front.length < 4 || back.length < 1) continue;
    out.push({
      front,
      back: back.charAt(0).toUpperCase() + back.slice(1),
      level: normalizeLevel(record.difficulty ?? record.level) ?? 'medium',
      page: record.page ?? record.pagina,
      quote: record.quote ?? record.citat,
    });
  }
  if (out.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Niciun card valid în răspuns.' });
    return z.NEVER;
  }
  return out;
});

interface RawSchema { title: string; schema: string; quotes: Array<{ page: unknown; quote: unknown }> }

export const schemaReplySchema = z.unknown().transform((input, ctx): RawSchema => {
  if (!input || typeof input !== 'object') {
    ctx.addIssue({ code: 'custom', message: 'Răspunsul nu e un obiect.' });
    return z.NEVER;
  }
  const record = input as Record<string, unknown>;
  const quotes = Array.isArray(record.quotes) ? record.quotes : [];
  return {
    title: String(record.title ?? '').trim(),
    schema: String(record.schema ?? '').replace(/^\s*```(?:schem[ăa])?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim(),
    quotes: quotes
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({ page: item.page ?? item.pagina, quote: item.quote ?? item.citat })),
  };
});

/** Schema se păstrează doar dacă se desenează (parserul) și are cel puțin un citat verificat din paginile alese. */
export function keepCitedSchema(
  raw: RawSchema,
  book: BookCode,
  fallbackTitle: string,
  pages: readonly PageText[],
): SchemaProposal | null {
  if (!raw.schema) return null;
  const parsed = parseSchema(raw.schema);
  if (!parsed || parsed.nodes.length < 3) return null;
  const citations: BookCitation[] = [];
  for (const entry of raw.quotes.slice(0, 3)) {
    // Schema nu are „răspuns”: legătura cu pagina se verifică prin citat, nu prin cuvintele răspunsului.
    const check = verifyCitation(book, entry.page, entry.quote, '', pages);
    if (check.ok && !citations.some((c) => c.page === check.citation.page && c.quote === check.citation.quote)) citations.push(check.citation);
  }
  if (citations.length === 0) return null;
  return { id: newId(), title: raw.title || parsed.title || fallbackTitle, code: raw.schema, citations };
}

/* ── Generarea ──────────────────────────────────────────────────────────────────────────────── */

export interface ProposalRequest {
  book: BookCode;
  range: PageRange;
  /** Titlul capitolului sau al intervalului, pentru prompt și pentru titlul pachetului. */
  topic: string;
  count: number;
  /** Fronturile deja existente, ca să nu fie repetate. */
  avoidFronts?: readonly string[];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Pentru teste: înlocuiește citirea paginilor din fișierele cărții. */
  loadPages?: (book: BookCode) => Promise<string[]>;
}

export async function generateBookProposals(request: ProposalRequest): Promise<ProposalSet> {
  if (!hasAIKey()) throw new NoAIKeyError();
  const count = clampProposalCount(request.count);
  const allPages = await (request.loadPages ?? loadBookPages)(request.book);
  const clamped = clampPageRange(request.range, allPages.length);
  if (!clamped) throw new Error('Paginile alese nu sunt în carte. Alege un interval din carte.');
  const pages = pageTextsOf(allPages, clamped.range);
  if (pages.length === 0) throw new Error('Nu am găsit text în paginile alese. Încearcă alte pagini.');

  const warnings: string[] = [];
  if (clamped.trimmed) warnings.push(`Am folosit primele ${MAX_PROPOSAL_PAGES} pagini din interval (p. ${clamped.range.first}–${clamped.range.last}), ca cererea să rămână precisă.`);

  const windows = buildPageWindows(pages);
  const cardWindows = pickSpread(windows, Math.min(MAX_CARD_WINDOWS, Math.max(1, Math.ceil(count / 4))));
  const perWindow = Math.min(8, Math.ceil((count * OVERSHOOT) / cardWindows.length));
  const bookLine = `${BOOK_NAMES[request.book]}, p. ${clamped.range.first}–${clamped.range.last}`;
  const steps = cardWindows.length + 1;
  let done = 0;
  const tick = () => { done += 1; request.onProgress?.(done, steps); };
  request.onProgress?.(0, steps);

  const collected: RawCitedCard[] = [];
  const schemaTask = (async (): Promise<RawSchema | null> => {
    try {
      const context = pickSpread(windows, SCHEMA_WINDOWS).map((window) => window.text).join('\n\n');
      const result = await requestStructured({
        schema: schemaReplySchema,
        messages: [
          { role: 'system', content: buildSchemaSystem() },
          { role: 'user', content: buildSchemaUserPrompt({ topic: request.topic, bookLine, context }) },
        ],
        task: 'analysis',
        temperature: 0.25,
        maxTokens: 1800,
        abortSignal: request.signal,
        label: 'bookStudySchema',
        schemaHint: '{"title":string,"schema":string,"quotes":[{"page":number,"quote":string}]}',
      });
      return result.ok ? result.data : null;
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      return null;
    } finally {
      tick();
    }
  })();

  await runPool(cardWindows, CONCURRENCY, async (window) => {
    if (request.signal?.aborted) return;
    try {
      const result = await requestStructured({
        schema: citedCardsReplySchema,
        messages: [
          { role: 'system', content: buildFlashcardAuthorSystem() },
          {
            role: 'user',
            content: buildFlashcardUserPrompt({
              topic: request.topic,
              bookLine,
              difficulty: 'auto',
              count: perWindow,
              context: window.text,
              avoidFronts: [...(request.avoidFronts ?? []), ...collected.map((card) => card.front)],
              outputSpec: CITED_CARDS_OUTPUT_SPEC,
            }),
          },
        ],
        task: 'questions',
        temperature: 0.3,
        maxTokens: Math.min(3600, 600 + perWindow * 300),
        abortSignal: request.signal,
        label: 'bookStudyCards',
        schemaHint: '{"cards":[{"front":string,"back":string,"difficulty":string,"page":number,"quote":string}]}',
      });
      if (result.ok) collected.push(...result.data);
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      warnings.push('O parte din pagini nu a putut fi procesată și a fost sărită.');
    } finally {
      tick();
    }
  });
  const rawSchema = await schemaTask;
  if (request.signal?.aborted) throw new DOMException('Generarea a fost oprită.', 'AbortError');

  const kept = keepCitedCards(collected, request.book, pages);
  const cards = finalizeCards(kept.cards, count, request.avoidFronts ?? []);
  const schema = rawSchema ? keepCitedSchema(rawSchema, request.book, request.topic, pages) : null;
  const rejected = kept.rejected + (rawSchema && !schema ? 1 : 0);

  if (cards.length === 0 && !schema) {
    throw new Error('Nu am putut propune carduri sau schemă cu citări verificate din paginile alese. Încearcă un interval mai mic sau alt model AI.');
  }
  if (cards.length < count) warnings.push(`Am obținut ${cards.length} din ${count} carduri; restul nu aveau o citare verificată în paginile alese sau repetau alt card.`);
  if (!schema) warnings.push('Nu am putut propune o schemă cu citare verificată pentru aceste pagini.');
  return { book: request.book, range: clamped.range, cards, schema, rejected, warnings };
}

/* ── Acceptarea (singurul loc unde propunerile devin date) ──────────────────────────────────── */

export const citationLabel = (citation: BookCitation): string => formatCitationLabel(BOOK_SHORT[citation.book], citation.page);

/** Schema ca text pentru spatele unui card: titlul și pașii, plus pagina. Desenul rămâne în dialog și în chat. */
export function schemaCardBack(schema: SchemaProposal): string {
  const parsed = parseSchema(schema.code);
  const steps = parsed ? describeDiagram(parsed).replace(/^Schem[ăa][^.]*\.\s*/, '') : schema.code.replace(/\s+/g, ' ');
  return steps;
}

export interface AcceptedSelection {
  cards: readonly CardProposal[];
  schema: SchemaProposal | null;
}

/** Pachetul din ce a acceptat studentul. Aruncă dacă nu a acceptat nimic. */
export function buildAcceptedDeck(
  selection: AcceptedSelection,
  options: { title: string; topic: string; book: BookCode; folderId: string | null },
): Quiz {
  if (selection.cards.length === 0 && !selection.schema) throw new Error('Nu ai acceptat nicio propunere.');
  const drafts = selection.cards.map((card) => ({ front: card.front, back: card.back, level: card.level }));
  const labels = selection.cards.map((card) => citationLabel(card.citation));
  if (selection.schema) {
    drafts.unshift({ front: `Schemă: ${selection.schema.title}`, back: schemaCardBack(selection.schema), level: 'medium' });
    labels.unshift(selection.schema.citations.map(citationLabel).filter((label, i, all) => all.indexOf(label) === i).join('; '));
  }
  const deck = buildFlashcardDeck({
    title: options.title,
    topic: options.topic,
    folderId: options.folderId,
    cards: drafts,
    difficulty: 'auto',
    residency: true,
    sourceName: BOOK_SHORT[options.book],
  });
  deck.tags = [...(deck.tags ?? []), 'ai-book-proposals', `book:${options.book}`];
  deck.questions = deck.questions.map((question, index) => ({ ...question, explanation: `Sursă: ${labels[index]}` }));
  return deck;
}

export function saveAcceptedProposals(deck: Quiz): string {
  return saveFlashcardDeck(deck);
}
