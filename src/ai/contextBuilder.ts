/**
 * Construirea contextului din bibliotecă pentru model, cu citări numerotate, și parsarea
 * citărilor inline din răspuns. Funcții pure (fără IndexedDB, fără rețea): se testează izolat.
 *
 *   [1] Kumar · pag. 151 — Fibrilația atrială
 *   <textul fragmentului, întreg sau tăiat la capăt de propoziție>
 */

import { contextDuplicateKey, contextLimit, normalizeContextProse } from './contextBudget';
import { repairOcr } from '../lib/ocrRepair';
import type { SourceTier } from '../lib/bookTier';

/** Strictul necesar dintr-un rezultat de retrieval; `RetrievedChunk` și `ChunkRecord` se potrivesc. */
export interface ContextChunkInput {
  id: string;
  text: string;
  source: string;
  sourceId?: string;
  topic?: string;
  heading?: string;
  chapter?: string;
  page?: number;
  pageEnd?: number;
  /** Numărul tipărit pe pagină în carte. */
  printedPage?: number;
  /** Forma din contractul parserelor PDF; tolerată alături de câmpurile plate. */
  metadata?: { page?: number; pageEnd?: number; printedPage?: number; heading?: string };
  score?: number;
  /** Nivelul sursei; când lipsește, fragmentul nu poartă antet de nivel (comportamentul scopului general). */
  tier?: SourceTier;
}

export interface ContextSource {
  /** Numărul din text: `[n]`. */
  n: number;
  id: string;
  sourceId?: string;
  /** Numele sursei fără extensie. */
  source: string;
  page?: number;
  pageEnd?: number;
  printedPage?: number;
  heading?: string;
  chapter?: string;
  /** Etichetă gata de afișat, ex. „Kumar, p. 151". */
  label: string;
  score?: number;
  /** Nivelul sursei: „book” (carte de bază) sau „bank” (material); interfața îl citește pentru a deosebi „Carte” de „Material”. */
  tier?: SourceTier;
  /** Începutul textului inclus, ca extras scurt pentru UI. */
  excerpt: string;
}

export interface NumberedContext {
  context: string;
  sources: ContextSource[];
}

const HEADER = 'Surse numerotate din biblioteca utilizatorului. Când folosești o informație dintr-o sursă, citează-o inline cu numărul ei, ex. [1]; nu cita surse pe care nu le-ai folosit.';

const TIER_TAG: Partial<Record<SourceTier, string>> = { book: 'CARTE DE BAZĂ', bank: 'MATERIAL' };

export function cleanSourceName(name: string): string {
  return name.replace(/\.(pdf|docx?|txt|md)$/i, '').trim() || name;
}

export function formatPageRange(page?: number, pageEnd?: number): string {
  if (typeof page !== 'number') return '';
  return typeof pageEnd === 'number' && pageEnd > page ? `${page}–${pageEnd}` : String(page);
}

const LABEL_HEADING_MAX = 48;

function shortHeading(heading: string | undefined): string {
  const clean = (heading ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > LABEL_HEADING_MAX ? `${clean.slice(0, LABEL_HEADING_MAX - 1).trimEnd()}…` : clean;
}

/**
 * „Kumar, p. 1136 (Hipertensiunea arterială)". Pagina tipărită în carte are prioritate; apoi pagina
 * PDF (interval dacă e cazul); apoi doar titlul secțiunii; apoi doar numele cărții.
 */
export function formatCitationLabel(
  source: string,
  page?: number,
  pageEnd?: number,
  printedPage?: number,
  heading?: string,
): string {
  const name = cleanSourceName(source);
  const range = typeof printedPage === 'number' && printedPage > 0 ? String(printedPage) : formatPageRange(page, pageEnd);
  const head = shortHeading(heading);
  const base = range ? `${name}, p. ${range}` : name;
  return head ? `${base} (${head})` : base;
}

/** Aduce câmpurile de pagină din forma plată sau din `metadata`, ignorând valorile invalide. */
function pagesOf(chunk: ContextChunkInput): { page?: number; pageEnd?: number; printedPage?: number } {
  const valid = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);
  const page = valid(chunk.page) ?? valid(chunk.metadata?.page);
  const pageEnd = valid(chunk.pageEnd) ?? valid(chunk.metadata?.pageEnd);
  const printedPage = valid(chunk.printedPage) ?? valid(chunk.metadata?.printedPage);
  return {
    ...(page !== undefined ? { page } : {}),
    ...(pageEnd !== undefined ? { pageEnd } : {}),
    ...(printedPage !== undefined ? { printedPage } : {}),
  };
}

/**
 * Taie `text` la maximum `max` caractere, pe cea mai bună frontieră: sfârșit de paragraf, apoi de
 * propoziție, apoi de cuvânt. Nu taie sub 40% din buget doar ca să găsească o frontieră frumoasă.
 */
export function truncateAtBoundary(text: string, max: number): string {
  max = contextLimit(max);
  const trimmed = text.trim();
  if (max <= 0) return '';
  if (trimmed.length <= max) return trimmed;

  const window = trimmed.slice(0, max);
  const floor = Math.floor(max * 0.4);

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph >= floor) return window.slice(0, paragraph).trim();

  // Sfârșit de propoziție: punct/!/?/; urmat de spațiu + majusculă/cifră/ghilimea, sau de sfârșitul ferestrei.
  let sentenceEnd = -1;
  const re = /[.!?;](?=\s+[\p{Lu}\d"„([]|$)/gu;
  for (const match of window.matchAll(re)) {
    const end = (match.index ?? 0) + 1;
    // „Fig. 3", „pag. 12", „Dr. Popescu": o abreviere scurtă nu încheie propoziția.
    const before = window.slice(Math.max(0, end - 5), end - 1);
    if (/(?:^|\s)(?:fig|pag|dr|prof|tab|nr|cca|vs|etc)$/i.test(before.trim())) continue;
    if (end >= floor) sentenceEnd = end;
  }
  if (sentenceEnd > 0) return window.slice(0, sentenceEnd).trim();

  const line = window.lastIndexOf('\n');
  if (line >= floor) return window.slice(0, line).trim();

  const ellipsisWindow = window.slice(0, max - 1);
  const space = ellipsisWindow.search(/\s\S*$/);
  const cut = space >= floor ? ellipsisWindow.slice(0, space).trim() : ellipsisWindow.trim();
  return `${cut.replace(/[,;:\-–]$/, '')}…`;
}

function headerFor(n: number, chunk: ContextChunkInput): string {
  const name = cleanSourceName(chunk.source);
  const pages = pagesOf(chunk);
  const range = pages.printedPage !== undefined ? String(pages.printedPage) : formatPageRange(pages.page, pages.pageEnd);
  const heading = chunk.heading ?? chunk.metadata?.heading;
  const where = heading ? ` — ${heading}` : '';
  const tag = chunk.tier ? TIER_TAG[chunk.tier] : undefined;
  // Cu nivel: „[1] [CARTE DE BAZĂ · Kumar p.75] — titlu” / „[2] [MATERIAL · nume fișier] — titlu”.
  if (tag) {
    const place = chunk.tier === 'book' ? `${name}${range ? ` p.${range}` : ''}` : `${name}${range ? ` · pag. ${range}` : ''}`;
    return `[${n}] [${tag} · ${place}]${where}`;
  }
  return `[${n}] ${name}${range ? ` · pag. ${range}` : ''}${where}`;
}

/**
 * Alege din chunk-urile deja ordonate (cele mai bune primele) chunk-uri ÎNTREGI până la buget.
 * Dacă unul nu încape, se încearcă următoarele (mai scurte); doar când nu a intrat niciunul
 * (primul e mai mare decât tot bugetul) se taie primul, pe frontieră de propoziție.
 */
export function buildNumberedContext(chunks: ContextChunkInput[], maxChars: number, maxChunks = Infinity): NumberedContext {
  maxChars = contextLimit(maxChars);
  maxChunks = contextLimit(maxChunks);
  if (chunks.length === 0 || maxChars <= 0 || maxChunks <= 0) return { context: '', sources: [] };

  const headerCost = HEADER.length + 2;
  let budget = maxChars - headerCost;
  const picked: Array<{ chunk: ContextChunkInput; body: string }> = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    if (picked.length >= maxChunks) break;
    const body = normalizeContextProse(repairOcr(chunk.text));
    if (!body) continue;
    const pages = pagesOf(chunk);
    const key = contextDuplicateKey(body, [chunk.sourceId, chunk.source, pages.page, pages.pageEnd,
      pages.printedPage, chunk.heading ?? chunk.metadata?.heading, chunk.chapter]);
    if (seen.has(key)) continue;
    const cost = headerFor(picked.length + 1, chunk).length + 1 + body.length + 2;
    if (picked.length < maxChunks && cost <= budget) {
      picked.push({ chunk, body });
      seen.add(key);
      budget -= cost;
    }
  }

  if (picked.length === 0) {
    const first = chunks.find((chunk) => chunk.text.trim());
    if (!first) return { context: '', sources: [] };
    const head = headerFor(1, first);
    const room = budget - head.length - 3;
    const body = truncateAtBoundary(normalizeContextProse(repairOcr(first.text)), room);
    if (!body) return { context: '', sources: [] };
    picked.push({ chunk: first, body });
  }

  const sources: ContextSource[] = picked.map(({ chunk, body }, index) => {
    const pages = pagesOf(chunk);
    const heading = chunk.heading ?? chunk.metadata?.heading;
    return {
      n: index + 1,
      id: chunk.id,
      ...(chunk.sourceId ? { sourceId: chunk.sourceId } : {}),
      source: cleanSourceName(chunk.source),
      ...pages,
      ...(heading ? { heading } : {}),
      ...(chunk.chapter ? { chapter: chunk.chapter } : {}),
      label: formatCitationLabel(chunk.source, pages.page, pages.pageEnd, pages.printedPage, heading),
      ...(typeof chunk.score === 'number' ? { score: chunk.score } : {}),
      ...(chunk.tier ? { tier: chunk.tier } : {}),
      excerpt: truncateAtBoundary(body, 220),
    };
  });

  const blocks = picked.map(({ chunk, body }, index) => `${headerFor(index + 1, chunk)}\n${body}`);
  return { context: `${HEADER}\n\n${blocks.join('\n\n')}`, sources };
}

export type CitationSegment<S extends { n: number } = ContextSource> =
  | { type: 'text'; text: string }
  | { type: 'cite'; raw: string; numbers: number[]; sources: S[] };

const CITE_RE = /\[(\d{1,2}(?:\s*[,–-]\s*\d{1,2})*)\]/g;

function expandNumbers(inner: string): number[] {
  const numbers: number[] = [];
  for (const part of inner.split(',')) {
    const range = part.trim().match(/^(\d{1,2})\s*[–-]\s*(\d{1,2})$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to >= from && to - from <= 20) for (let n = from; n <= to; n += 1) numbers.push(n);
    } else if (/^\d{1,2}$/.test(part.trim())) {
      numbers.push(Number(part.trim()));
    }
  }
  return [...new Set(numbers)];
}

/**
 * Desparte răspunsul modelului în text simplu și citări inline `[1]`, `[1, 3]`, `[2-4]`, ca UI-ul
 * să le poată randa ca butoane. Un `[n]` care nu corespunde niciunei surse (ex. `x[2]` într-un
 * cod) rămâne text. Concatenarea tuturor segmentelor reface exact textul de intrare.
 */
export function parseInlineCitations<S extends { n: number }>(text: string, sources: readonly S[]): CitationSegment<S>[] {
  const byNumber = new Map(sources.map((source) => [source.n, source]));
  const segments: CitationSegment<S>[] = [];
  let last = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const previous = segments[segments.length - 1];
    if (previous?.type === 'text') previous.text += value;
    else segments.push({ type: 'text', text: value });
  };

  for (const match of text.matchAll(CITE_RE)) {
    const index = match.index ?? 0;
    const numbers = expandNumbers(match[1]);
    const resolved = numbers.map((n) => byNumber.get(n)).filter((source): source is S => !!source);
    // Citare validă doar dacă TOATE numerele există; altfel e text (ex. interval în afara surselor).
    if (numbers.length === 0 || resolved.length !== numbers.length) continue;
    pushText(text.slice(last, index));
    segments.push({ type: 'cite', raw: match[0], numbers, sources: resolved });
    last = index + match[0].length;
  }
  pushText(text.slice(last));
  return segments;
}
