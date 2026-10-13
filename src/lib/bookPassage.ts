/**
 * „Vezi în carte”: pasajul din cărțile incluse (Kumar, Lawrence, Sinopsis) care susține o grilă. Se caută în textul curat al
 * paginilor (`*.pages.json`, extras din PDF-urile din aplicație, cu diacritice și titluri corecte), nu în indexul OCR al
 * bibliotecii AI. Textul afișat este mereu cel din carte, copiat identic: AI-ul doar ALEGE pasajul care susține răspunsul
 * corect și marchează propozițiile-cheie (citate verificate în text), nu rescrie nimic.
 */
import { loadBookPages } from './bookText';
import type { BookCode } from './bookPages';
import { pageContext } from './bookKnowledge';

export type PassageBlock =
  | { kind: 'heading' | 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export type HighlightRole = 'answer' | 'question' | 'distractor';

export interface PassageHighlight {
  /** Textul exact din pasaj. */
  quote: string;
  /** answer: susține răspunsul corect; question: contextul din enunț; distractor: de ce celelalte variante sunt greșite. */
  role: HighlightRole;
}

export interface BookPassage {
  book: BookCode;
  /** Numele cărții, ca în biblioteca AI. */
  source: string;
  /** Pagina din PDF-ul cărții (numerotarea din plan, aceeași cu cititorul). */
  page: number;
  heading: string;
  /** Capitolul și topicul din plan (harta cărților), dacă pagina e acoperită. */
  chapter?: string;
  topic?: string;
  blocks: PassageBlock[];
  /** Propoziții din text de evidențiat, fiecare cu rolul ei (culoare diferită în fereastră). */
  highlights: PassageHighlight[];
  /** AI-ul a confirmat că pasajul susține răspunsul corect. */
  verified: boolean;
  /** O frază: ce spune pasajul despre răspuns (doar când AI-ul a confirmat). */
  why?: string;
}

export const BOOK_SOURCE_NAME: Record<BookCode, string> = {
  K: 'Kumar și Clark – Medicină Clinică',
  L: 'Lawrence – Chirurgie generală și specialități chirurgicale',
  S: 'Sinopsis de medicină',
};

interface Para {
  book: BookCode;
  page: number;
  heading: string;
  chapter: string;
  topic: string;
  /** Rădăcinile din capitol, topic și titlu: contează la acoperirea enunțului, deși nu sunt în textul paragrafului. */
  contextStems: Set<string>;
  kind: 'paragraph' | 'list';
  /** Text de afișat; la liste, elementele sunt separate prin „\n”. */
  text: string;
  tf: Map<string, number>;
  length: number;
}

const FOLD_FROM = 'ăâîșşțţĂÂÎȘŞȚŢ';
const FOLD_TO = 'aaisstt' + 'aaisstt';
/** Fără diacritice și cu litere mici, păstrând lungimea (indicii rămân valabili în textul original). */
export function foldText(text: string): string {
  let out = '';
  for (const ch of text) {
    const at = FOLD_FROM.indexOf(ch);
    out += at >= 0 ? FOLD_TO[at] : ch.toLowerCase();
  }
  return out;
}

const STOP = new Set(['care', 'este', 'sunt', 'pentru', 'dupa', 'cand', 'cele', 'prin', 'trebuie', 'poate', 'fiind', 'dintre', 'unui', 'unei', 'acest', 'acesta', 'aceasta', 'acestei', 'acestui', 'precum', 'astfel', 'foarte', 'tipul', 'cazul', 'cazuri', 'dintre', 'ceea', 'unde', 'fost', 'poti', 'sale', 'lor', 'mai']);
/** Rădăcini de 6 litere: româna flexionează („artritei” / „artrita”), deci cuvintele întregi s-ar rata între ele. */
export function stemsOf(text: string): string[] {
  return foldText(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 6));
}

const SHORT_ITEM = 160;

/** Blocurile unei pagini, cu titlul curent (continuat de pe pagina anterioară); liste din fragmentele scurte de după „:”. */
function parsePage(book: BookCode, page: number, text: string, carriedHeading: string): { paras: Array<Omit<Para, 'tf' | 'length' | 'contextStems' | 'chapter' | 'topic'>>; heading: string } {
  const blocks = text.split(/\n{2,}/).map((b) => b.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const paras: Array<Omit<Para, 'tf' | 'length' | 'contextStems' | 'chapter' | 'topic'>> = [];
  let heading = carriedHeading;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.startsWith('#')) {
      heading = block.replace(/^#+\s*/, '').trim();
      continue;
    }
    if (block.length < 25 && !/[.:;]$/.test(block)) continue; // antet sau număr rătăcit
    // Lista începe uneori în același bloc cu introducerea („… sunt: lipsa complianței”): primul element e coada de după „:”.
    const inline = /^(.{40,}:)\s+([^.:]{3,100})$/su.exec(block);
    const intro = inline ? inline[1] : block;
    if (inline || /:$/.test(block)) {
      const items: string[] = inline ? [inline[2].trim()] : [];
      let j = i + 1;
      while (j < blocks.length && items.length < 14 && !blocks[j].startsWith('#') && blocks[j].length < SHORT_ITEM && /^[\p{Ll}\d•●▪*-]/u.test(blocks[j]) && !/\.\s+\p{Lu}/u.test(blocks[j])) {
        items.push(blocks[j].replace(/^[•●▪*-]\s*/, ''));
        j += 1;
      }
      paras.push({ book, page, heading, kind: 'paragraph', text: intro });
      if (items.length >= 2) {
        paras.push({ book, page, heading, kind: 'list', text: items.join('\n') });
        i = j - 1;
      }
      continue;
    }
    paras.push({ book, page, heading, kind: 'paragraph', text: block });
  }
  return { paras, heading };
}

interface Corpus {
  paras: Para[];
  df: Map<string, number>;
  avgLength: number;
}

let corpusPromise: Promise<Corpus> | null = null;

async function buildCorpus(): Promise<Corpus> {
  const paras: Para[] = [];
  for (const book of ['K', 'L', 'S'] as BookCode[]) {
    const pages = await loadBookPages(book);
    let heading = '';
    pages.forEach((text, index) => {
      const parsed = parsePage(book, index + 1, text, heading);
      heading = parsed.heading;
      const context = pageContext(book, index + 1);
      for (const para of parsed.paras) {
        const tf = new Map<string, number>();
        const chapter = context?.chapter ?? '';
        const topic = context?.topic ?? '';
        const contextStems = new Set(stemsOf(`${chapter} ${topic} ${para.heading}`));
        const stems = [...contextStems, ...stemsOf(para.text)];
        for (const stem of stems) tf.set(stem, (tf.get(stem) ?? 0) + 1);
        paras.push({ ...para, chapter, topic, contextStems, tf, length: stems.length });
      }
    });
  }
  const df = new Map<string, number>();
  let total = 0;
  for (const para of paras) {
    total += para.length;
    for (const stem of para.tf.keys()) df.set(stem, (df.get(stem) ?? 0) + 1);
  }
  return { paras, df, avgLength: total / Math.max(1, paras.length) };
}

function getCorpus(): Promise<Corpus> {
  if (!corpusPromise) {
    corpusPromise = buildCorpus();
    corpusPromise.catch(() => { corpusPromise = null; });
  }
  return corpusPromise;
}

export interface PassageQuery {
  question: string;
  /** Textul răspunsului/răspunsurilor corecte. */
  answer: string;
  explanation?: string;
  /** Variantele greșite (pentru marcarea „de ce nu”; nu intră în căutare). */
  wrongAnswers?: string[];
  /** Termeni în plus pentru căutare: forme complete ale abrevierilor, sinonime (din locator sau din dicționarul medical). */
  extraTerms?: string[];
  /** Capitole (intervale de pagini) în care e mai probabil pasajul, după localizator: scorul lor crește, nu se exclude restul. */
  focus?: Array<{ book: BookCode; first: number; last: number }>;
}

export interface PassageCandidate {
  paras: Para[];
  score: number;
  /** Rădăcini ale întrebării / ale răspunsului găsite în fereastră. */
  sharedQuestion: number;
  sharedAnswer: number;
}

const K1 = 1.2;
const B = 0.6;
const WINDOW_CHARS = 1500;
const MIN_QUESTION_TERMS = 2;
/** Din greutatea (IDF) cuvintelor enunțului, cât trebuie să se regăsească în fereastră: cuvintele rare („pneumonie”) contează, nu „tratament”. */
const MIN_COVERAGE = 0.45;
const FOCUS_BOOST = 1.35;

/** Primele `limit` ferestre de text (paragraful potrivit și vecinii lui din aceeași secțiune), cele mai bune întâi. */
export async function findPassageCandidates(query: PassageQuery, limit = 3): Promise<PassageCandidate[]> {
  const corpus = await getCorpus();
  const question = new Set(stemsOf(query.question));
  const answer = new Set([...stemsOf(`${query.answer} ${query.explanation ?? ''}`)].filter((stem) => !question.has(stem)));
  const weights = new Map<string, number>();
  for (const stem of question) weights.set(stem, 1);
  for (const stem of answer) weights.set(stem, 1.6);
  for (const stem of stemsOf((query.extraTerms ?? []).join(' '))) if (!weights.has(stem)) weights.set(stem, 0.8);
  if (weights.size === 0) return [];

  const n = corpus.paras.length;
  const idfOf = (stem: string) => {
    const df = corpus.df.get(stem) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  };
  const questionIdf = [...question].reduce((sum, stem) => sum + idfOf(stem), 0);
  const scores = new Float64Array(n);
  corpus.paras.forEach((para, index) => {
    let score = 0;
    for (const [stem, weight] of weights) {
      const tf = para.tf.get(stem);
      if (!tf) continue;
      score += weight * idfOf(stem) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * para.length) / corpus.avgLength)));
    }
    if (query.focus?.some((zone) => zone.book === para.book && para.page >= zone.first && para.page <= zone.last)) score *= FOCUS_BOOST;
    scores[index] = score;
  });

  const order = Array.from(scores.keys()).filter((i) => scores[i] > 0).sort((a, b) => scores[b] - scores[a]).slice(0, 40);
  const used = new Set<number>();
  const sections = new Set<string>();
  const out: PassageCandidate[] = [];
  for (const index of order) {
    if (used.has(index)) continue;
    const start = corpus.paras[index];
    // Un singur candidat pe secțiune: două ferestre din aceeași pagină și același titlu ar lua locul altor pasaje.
    const sectionKey = `${start.book}:${start.page}:${start.heading}`;
    if (sections.has(sectionKey)) continue;
    const window: number[] = [index];
    let chars = start.text.length;
    // Vecinii din aceeași secțiune: înainte (context) și după, cât încape.
    for (const step of [-1, 1, 1, -1]) {
      const edge = step < 0 ? window[0] : window[window.length - 1];
      const next = edge + step;
      const neighbour = corpus.paras[next];
      if (!neighbour || neighbour.book !== start.book || neighbour.heading !== start.heading || used.has(next)) continue;
      if (Math.abs(neighbour.page - start.page) > 1 || chars + neighbour.text.length > WINDOW_CHARS) continue;
      if (step < 0) window.unshift(next); else window.push(next);
      chars += neighbour.text.length;
    }
    window.forEach((i) => used.add(i));
    const paras = window.map((i) => corpus.paras[i]);
    const have = new Set([...stemsOf(paras.map((p) => p.text).join(' ')), ...paras.flatMap((p) => [...p.contextStems])]);
    const sharedQuestion = [...question].filter((stem) => have.has(stem)).length;
    const sharedAnswer = [...answer].filter((stem) => have.has(stem)).length;
    if (sharedQuestion < Math.min(MIN_QUESTION_TERMS, question.size)) continue;
    const foundIdf = [...question].filter((stem) => have.has(stem)).reduce((sum, stem) => sum + idfOf(stem), 0);
    if (questionIdf > 0 && foundIdf / questionIdf < MIN_COVERAGE) continue;
    if (answer.size > 0 && sharedAnswer === 0) continue;
    sections.add(sectionKey);
    out.push({ paras, score: scores[index], sharedQuestion, sharedAnswer });
    if (out.length >= limit) break;
  }
  return out;
}

const blocksOf = (paras: readonly Para[]): PassageBlock[] => {
  const blocks: PassageBlock[] = [];
  const heading = paras[0]?.heading;
  if (heading) blocks.push({ kind: 'heading', text: heading });
  for (const para of paras) {
    blocks.push(para.kind === 'list' ? { kind: 'list', items: para.text.split('\n') } : { kind: 'paragraph', text: para.text });
  }
  return blocks;
};

/** Pasajul propus fără AI: cea mai bună fereastră, nemarcată ca verificată. */
export function passageFromCandidate(candidate: PassageCandidate): BookPassage {
  const first = candidate.paras[0];
  return {
    book: first.book,
    source: BOOK_SOURCE_NAME[first.book],
    page: first.page,
    heading: first.heading,
    chapter: first.chapter || undefined,
    topic: first.topic || undefined,
    blocks: blocksOf(candidate.paras),
    highlights: [],
    verified: false,
  };
}

export const textOfPassage = (passage: Pick<BookPassage, 'blocks'>): string =>
  passage.blocks.map((block) => (block.kind === 'list' ? block.items.join('\n') : block.text)).join('\n\n');

/** Citatele care chiar apar în text (fără diacritice și majuscule), aduse la forma din text; cele inventate se aruncă. */
export function verifiedQuotes(quotes: readonly string[], text: string): string[] {
  const haystack = foldText(text).replace(/\s+/g, ' ');
  const original = text.replace(/\s+/g, ' ');
  const out: string[] = [];
  for (const quote of quotes) {
    const needle = foldText(quote).replace(/\s+/g, ' ').trim();
    if (needle.length < 12) continue;
    const at = haystack.indexOf(needle);
    if (at >= 0) out.push(original.slice(at, at + needle.length));
  }
  return out;
}
