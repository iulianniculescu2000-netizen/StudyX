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
  /** `false`: potrivire găsită doar local, fără ca AI-ul s-o fi verificat (fără evidențieri de rol); `true`: AI-ul a judecat pasajul. */
  aiChecked?: boolean;
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

const STOP = new Set(['care', 'este', 'sunt', 'pentru', 'dupa', 'cand', 'cele', 'prin', 'trebuie', 'poate', 'fiind', 'dintre', 'unui', 'unei', 'acest', 'acesta', 'aceasta', 'acestei', 'acestui', 'precum', 'astfel', 'foarte', 'tipul', 'cazul', 'cazuri', 'dintre', 'ceea', 'unde', 'fost', 'poti', 'sale', 'lor', 'mai',
  // Formule de enunț de examen: nu spun nimic medical și nu apar în manual.
  'reprezentat', 'reprezentata', 'reprezentate', 'reprezinta', 'referinta', 'urmatoarele', 'urmatoarea', 'urmatorul', 'urmatorii', 'afirmatii', 'afirmatia', 'adevarate', 'adevarat', 'corecte', 'corect', 'false', 'incorecte', 'indicati', 'precizati', 'alegeti',
  'exceptia', 'exceptie', 'exceptii', 'exceptiile', 'intalnita', 'intalnite', 'intalnit', 'enumerate', 'mentionate', 'identificati', 'identificat', 'caracterizat', 'caracterizata', 'caracterizeaza', 'utilizat', 'utilizata', 'utilizeaza', 'folosit', 'folosita', 'folosite', 'referitor', 'referitoare', 'privind', 'legatura', 'situatii', 'situatia', 'situatie', 'considerat', 'considerata', 'considerate']);
/** Rădăcini de 6 litere: româna flexionează („artritei” / „artrita”), deci cuvintele întregi s-ar rata între ele. */
export function stemsOf(text: string): string[] {
  return wordsOf(text).map((w) => w.slice(0, 6));
}

const wordsOf = (text: string): string[] => foldText(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));

/** Distanță de editare cel mult 1 (înlocuire, inserare sau ștergere a unei litere). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Prefixe care se lipesc de rădăcină („poliartrită”, „hipertiroidism”): pasajul poate vorbi doar despre rădăcină. */
const PREFIXES = ['poli', 'hiper', 'hipo', 'intra', 'inter', 'extra', 'supra', 'infra', 'anti', 'post', 'peri', 'endo', 'para', 'trans', 'pan'];

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
  /** Rădăcinile cărților grupate după prima literă, pentru potrivirea tolerantă la greșeli. */
  stemsByFirst: Map<string, string[]>;
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
  const stemsByFirst = new Map<string, string[]>();
  for (const stem of df.keys()) {
    if (stem.length < 5) continue;
    const bucket = stemsByFirst.get(stem[0]);
    if (bucket) bucket.push(stem); else stemsByFirst.set(stem[0], [stem]);
  }
  return { paras, df, avgLength: total / Math.max(1, paras.length), stemsByFirst };
}

/** Cu atât de puține apariții, o rădăcină e mai degrabă o greșeală de tipar a cărții decât un termen. */
const WEAK_DF = 3;

/** Cea mai frecventă rădăcină din cărți la cel mult o literă distanță de `probe` (greșeli de scriere din bancă, ex. „poliartita”). */
function nearestStem(corpus: Corpus, probe: string): string | null {
  if (probe.length < 5) return null;
  let best: string | null = null;
  let bestDf = 0;
  for (const stem of corpus.stemsByFirst.get(probe[0]) ?? []) {
    const df = corpus.df.get(stem) ?? 0;
    if (df > bestDf && df >= WEAK_DF && withinOneEdit(probe, stem)) { best = stem; bestDf = df; }
  }
  return best;
}

/**
 * Rădăcina din cărți pentru un cuvânt al grilei: ea însăși când apare destul de des; altfel varianta apropiată (o literă greșită
 * sau lipsă), eventual fără prefix („poliartrită” → „artrit”). `null` când cuvântul nu există deloc în cărți (nu poate fi acoperit).
 */
function resolveStem(corpus: Corpus, word: string): string | null {
  const own = word.slice(0, 6);
  const ownDf = corpus.df.get(own) ?? 0;
  if (ownDf > 0) return own; // un termen rar, dar real: nu-l înlocuim cu unul apropiat
  const options: string[] = [];
  const bases = [word];
  const prefix = PREFIXES.find((candidate) => word.startsWith(candidate) && word.length - candidate.length >= 5);
  if (prefix) bases.push(word.slice(prefix.length));
  for (const base of bases) {
    if (base !== word) {
      const stem = base.slice(0, 6);
      if ((corpus.df.get(stem) ?? 0) >= WEAK_DF) options.push(stem);
    }
    for (const length of [6, 5]) {
      const near = nearestStem(corpus, base.slice(0, length));
      if (near) options.push(near);
    }
  }
  return options.sort((a, b) => (corpus.df.get(b) ?? 0) - (corpus.df.get(a) ?? 0))[0] ?? null;
}

/**
 * Grupuri de rădăcini echivalente, câte unul pe cuvânt: rădăcina cuvântului și, la cuvintele cu prefix („poliartrită”), cea a
 * rădăcinii goale („artrit”), pe care cărțile o folosesc des singură. Un grup e acoperit când apare oricare din membri.
 */
const resolveGroups = (corpus: Corpus, text: string): string[][] =>
  wordsOf(text).flatMap((word) => {
    const primary = resolveStem(corpus, word);
    const prefix = PREFIXES.find((candidate) => word.startsWith(candidate) && word.length - candidate.length >= 5);
    const bare = prefix ? resolveStem(corpus, word.slice(prefix.length)) : null;
    const group = [...new Set([primary, bare].filter((stem): stem is string => !!stem))];
    return group.length ? [group] : [];
  });

const resolveStems = (corpus: Corpus, text: string): string[] => resolveGroups(corpus, text).flat();

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
  /** Rădăcini din variantele greșite (în „cu excepția” sunt afirmații adevărate din carte) găsite în fereastră. */
  sharedOptions: number;
  /** Din greutatea (IDF) cuvintelor enunțului care există în cărți, cât se regăsește în fereastră (0-1). */
  coverage: number;
  /** Cele mai rare două cuvinte ale enunțului (ancorele lui) se găsesc amândouă în fereastră. */
  anchored: boolean;
  /** Cât de specific e cel mai rar cuvânt al enunțului găsit în fereastră (IDF): sub un prag, enunțul e prea generic ca potrivirea să conteze. */
  topIdf: number;
}

const K1 = 1.2;
const B = 0.6;
const WINDOW_CHARS = 1500;
const MIN_QUESTION_TERMS = 2;
/** Din greutatea (IDF) cuvintelor enunțului, cât trebuie să se regăsească în fereastră: cuvintele rare („pneumonie”) contează, nu „tratament”. */
const MIN_COVERAGE = 0.35;
/** Un cuvânt rar nu valorează mai mult de atât la acoperire: altfel un singur termen absent („frust”) ar exclude pasajul bun. */
const COVERAGE_IDF_CAP = 4.5;
/** Fără nicio legătură cu răspunsul sau cu variantele, o fereastră trece doar dacă acoperă aproape tot enunțul. */
const COVERAGE_WITHOUT_ANSWER = 0.75;
const FOCUS_BOOST = 1.35;

/** „Cu excepția…”, „nu este…”, „falsă”: răspunsul corect e afirmația greșită, deci nu se caută în carte; variantele greșite sunt cele adevărate. */
export function isExceptionQuestion(question: string): boolean {
  return /\b(cu except|nu (este|sunt|fac|face|reprezint|apar|caracteriz|se |poate|pot|necesit|cuprind|include|intra|determin|constituie|prezint|e )|fals|incorect|gresit|neadevar)/.test(foldText(question));
}

/** Primele `limit` ferestre de text (paragraful potrivit și vecinii lui din aceeași secțiune), cele mai bune întâi. */
export async function findPassageCandidates(query: PassageQuery, limit = 3): Promise<PassageCandidate[]> {
  const corpus = await getCorpus();
  const exception = isExceptionQuestion(query.question);
  const questionGroups = resolveGroups(corpus, query.question);
  const question = new Set(questionGroups.flat());
  const answer = new Set(resolveStems(corpus, `${query.answer} ${query.explanation ?? ''}`).filter((stem) => !question.has(stem)));
  const options = new Set(resolveStems(corpus, (query.wrongAnswers ?? []).join(' ')).filter((stem) => !question.has(stem) && !answer.has(stem)));
  const weights = new Map<string, number>();
  for (const stem of question) weights.set(stem, 1);
  // La „cu excepția” răspunsul corect e afirmația falsă: contează puțin, iar variantele (adevărate) susțin pasajul.
  for (const stem of answer) weights.set(stem, exception ? 0.5 : 1.6);
  for (const stem of options) weights.set(stem, exception ? 1 : 0.5);
  const extraStems = resolveStems(corpus, (query.extraTerms ?? []).join(' '));
  for (const stem of extraStems) if (!weights.has(stem)) weights.set(stem, 0.8);
  if (weights.size === 0) return [];

  const n = corpus.paras.length;
  const idfOf = (stem: string) => {
    const df = corpus.df.get(stem) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  };
  const groupIdf = (group: string[]) => Math.min(COVERAGE_IDF_CAP, Math.min(...group.map(idfOf)));
  const questionIdf = questionGroups.reduce((sum, group) => sum + groupIdf(group), 0);
  const anchors = [...questionGroups].sort((a, b) => Math.min(...b.map(idfOf)) - Math.min(...a.map(idfOf))).slice(0, 2);
  // Termenii aduși de dicționar sau de localizator (forme complete, sinonime) susțin enunțul când pasajul nu repetă cuvintele lui.
  const extra = new Set(extraStems.filter((stem) => !question.has(stem) && !answer.has(stem)));
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
    const foundGroups = questionGroups.filter((group) => group.some((stem) => have.has(stem)));
    const sharedQuestion = foundGroups.length;
    const sharedAnswer = [...answer].filter((stem) => have.has(stem)).length;
    const sharedOptions = [...options].filter((stem) => have.has(stem)).length;
    const sharedExtra = [...extra].filter((stem) => have.has(stem));
    if (sharedQuestion + Math.min(sharedExtra.length, 2) < Math.min(MIN_QUESTION_TERMS, questionGroups.length)) continue;
    const foundIdf = foundGroups.reduce((sum, group) => sum + groupIdf(group), 0)
      + 0.8 * sharedExtra.reduce((sum, stem) => sum + Math.min(COVERAGE_IDF_CAP, idfOf(stem)), 0);
    const coverage = questionIdf > 0 ? Math.min(foundIdf, questionIdf) / questionIdf : 1;
    const topIdf = Math.max(0, ...foundGroups.map((group) => Math.min(...group.map(idfOf))));
    const anchored = anchors.length >= 2 && anchors.every((group) => group.some((stem) => have.has(stem)));
    if (coverage < MIN_COVERAGE && !anchored) continue;
    const linked = sharedAnswer > 0 || sharedOptions > 0 || (answer.size === 0 && options.size === 0);
    if (!linked && coverage < COVERAGE_WITHOUT_ANSWER) continue;
    sections.add(sectionKey);
    out.push({ paras, score: scores[index], sharedQuestion, sharedAnswer, sharedOptions, coverage, anchored, topIdf });
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
    aiChecked: false,
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
