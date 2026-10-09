import { expandMedicalQuery } from '../ai/medicalSynonyms';
import { isFlashcardDeck } from './deckKind';
import { isFolderSessionQuiz } from './rezidentiatOverview';
import type { Quiz } from '../types';

/**
 * Căutare în CONȚINUT (text de întrebare, opțiuni, explicații, etichete, fața/verso-ul cardurilor și
 * notițe) pentru Ctrl+K. Indexul e construit o singură dată per pereche (quizzes, notes) de referințe
 * (cache în WeakMap) și e invers: cuvânt normalizat -> documente. O interogare nu mai atinge toate cele
 * 4000+ de întrebări, ci doar documentele din listele de postări ale cuvintelor căutate.
 *
 * Potrivirea ignoră diacriticele și majusculele și înțelege abrevierile medicale (IC <-> insuficiență
 * cardiacă) prin ajutorul din `src/ai/medicalSynonyms` (doar citit).
 */

export type ContentKind = 'question' | 'flashcard' | 'note';
export type ContentField = 'text' | 'options' | 'explanation' | 'tags';

export interface Segment {
  text: string;
  hit: boolean;
}

export interface ContentHit {
  id: string;
  kind: ContentKind;
  quizId: string | null;
  quizTitle: string | null;
  questionId: string;
  /** Prima linie a textului principal (enunț / față / notiță). */
  label: string;
  /** Câmpul în care a apărut cea mai bună potrivire. */
  field: ContentField;
  /** Fragment din câmpul potrivit, cu potrivirile marcate. */
  snippet: Segment[];
  /** 0–100. */
  score: number;
}

interface ContentDoc {
  kind: ContentKind;
  quizId: string | null;
  quizTitle: string | null;
  questionId: string;
  /** [text, options, explanation, tags] — original, pentru fragmente. */
  raw: string[];
  /** Aceleași câmpuri, normalizate cu aceeași lungime ca originalul (pozițiile se potrivesc). */
  folded: string[];
}

export interface ContentIndex {
  docs: ContentDoc[];
  postings: Map<string, number[]>;
  tokens: string[];
}

const FIELDS: ContentField[] = ['text', 'options', 'explanation', 'tags'];
const FIELD_WEIGHT = [1, 0.6, 0.4, 0.5];
export const CONTENT_LIMITS: Record<ContentKind, number> = { question: 10, flashcard: 6, note: 6 };

const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Ca `normalizeSearchText`, dar garantat de aceeași lungime ca textul original (pentru poziții în fragmente). */
export function foldSameLength(s: string): string {
  const whole = stripMarks(s);
  if (whole.length === s.length) return whole;
  let out = '';
  for (const ch of s) {
    const f = stripMarks(ch);
    out += f.length === ch.length ? f : (f[0] ?? ch).padEnd(ch.length, ' ').slice(0, ch.length);
  }
  return out;
}

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const tokenize = (folded: string) => folded.split(WORD_SPLIT).filter(Boolean);

function makeDoc(
  kind: ContentKind, quizId: string | null, quizTitle: string | null, questionId: string, raw: string[],
): ContentDoc {
  return { kind, quizId, quizTitle, questionId, raw, folded: raw.map(foldSameLength) };
}

function buildIndex(quizzes: Quiz[], notes: Record<string, string>): ContentIndex {
  const docs: ContentDoc[] = [];
  const titleByQuestion = new Map<string, { id: string; title: string }>();
  for (const quiz of quizzes) {
    // Sesiunile combinate („mix-…”) conțin aceleași întrebări ca seturile lor: ar apărea de două ori.
    if (isFolderSessionQuiz(quiz)) continue;
    const kind: ContentKind = isFlashcardDeck(quiz) ? 'flashcard' : 'question';
    for (const question of quiz.questions) {
      if (!titleByQuestion.has(question.id)) titleByQuestion.set(question.id, { id: quiz.id, title: quiz.title });
      docs.push(makeDoc(kind, quiz.id, quiz.title, question.id, [
        question.text ?? '',
        (question.options ?? []).map((option) => option.text).join(' | '),
        question.explanation ?? '',
        (question.tags ?? []).join(' '),
      ]));
    }
  }
  for (const [questionId, text] of Object.entries(notes)) {
    if (!text || !text.trim()) continue;
    const owner = titleByQuestion.get(questionId);
    docs.push(makeDoc('note', owner?.id ?? null, owner?.title ?? null, questionId, [text, '', '', '']));
  }

  const postings = new Map<string, number[]>();
  docs.forEach((doc, index) => {
    for (const field of doc.folded) {
      if (!field) continue;
      for (const token of tokenize(field)) {
        const list = postings.get(token);
        if (!list) postings.set(token, [index]);
        else if (list[list.length - 1] !== index) list.push(index);
      }
    }
  });
  return { docs, postings, tokens: [...postings.keys()] };
}

const cache = new WeakMap<object, WeakMap<object, ContentIndex>>();

/** Index lazy, memorat pe (quizzes, notes): la prima deschidere se construiește, apoi e reutilizat. */
export function getContentIndex(quizzes: Quiz[], notes: Record<string, string>): ContentIndex {
  let inner = cache.get(quizzes);
  if (!inner) cache.set(quizzes, (inner = new WeakMap()));
  let index = inner.get(notes);
  if (!index) inner.set(notes, (index = buildIndex(quizzes, notes)));
  return index;
}

interface Variant {
  words: string[];
  weight: number;
}

function variantsFor(query: string): Variant[] {
  const folded = foldSameLength(query);
  const words = tokenize(folded);
  if (words.length === 0) return [];
  const variants: Variant[] = [{ words, weight: 1 }];
  // Abrevieri medicale și sinonime; se aplică pe interogarea originală (IC se recunoaște doar cu majuscule).
  for (const phrase of expandMedicalQuery(query).phrases) {
    const phraseWords = tokenize(foldSameLength(phrase));
    if (phraseWords.length > 0 && phraseWords.join(' ') !== words.join(' ')) variants.push({ words: phraseWords, weight: 0.75 });
  }
  return variants;
}

/** Cuvintele de 1–2 litere (IC, DZ) se potrivesc doar întregi, ca să nu apară în orice cuvânt. */
function matchingTokens(index: ContentIndex, word: string, memo: Map<string, string[]>): string[] {
  const hit = memo.get(word);
  if (hit) return hit;
  const found = word.length <= 2
    ? (index.postings.has(word) ? [word] : [])
    : index.tokens.filter((token) => token.includes(word));
  memo.set(word, found);
  return found;
}

function docsForWord(index: ContentIndex, word: string, memo: Map<string, string[]>): Set<number> {
  const set = new Set<number>();
  for (const token of matchingTokens(index, word, memo)) for (const id of index.postings.get(token)!) set.add(id);
  return set;
}

function wordStartAt(text: string, pos: number): boolean {
  return pos === 0 || !/[\p{L}\p{N}]/u.test(text[pos - 1]);
}

/** Cea mai bună poziție a cuvântului: o potrivire la început de cuvânt bate una din mijloc. */
function findWord(text: string, word: string): { pos: number; start: boolean } | null {
  let from = 0;
  let fallback = -1;
  for (;;) {
    const pos = text.indexOf(word, from);
    if (pos < 0) break;
    if (word.length <= 2) {
      const after = text[pos + word.length];
      if (wordStartAt(text, pos) && (!after || !/[\p{L}\p{N}]/u.test(after))) return { pos, start: true };
    } else if (wordStartAt(text, pos)) return { pos, start: true };
    else if (fallback < 0) fallback = pos;
    from = pos + 1;
  }
  return word.length > 2 && fallback >= 0 ? { pos: fallback, start: false } : null;
}

interface Scored {
  index: number;
  score: number;
  field: number;
  words: string[];
}

function scoreDoc(doc: ContentDoc, variant: Variant, phrase: string): Scored | null {
  let sum = 0;
  let bestField = 0;
  let bestFieldScore = -1;
  for (const word of variant.words) {
    let best = 0;
    for (let f = 0; f < doc.folded.length; f++) {
      if (!doc.folded[f]) continue;
      const found = findWord(doc.folded[f], word);
      if (!found) continue;
      const value = FIELD_WEIGHT[f] * (found.start ? 1 : 0.6);
      if (value > best) best = value;
      if (value > bestFieldScore) { bestFieldScore = value; bestField = f; }
    }
    if (best === 0) return null;
    sum += best;
  }
  let score = sum / variant.words.length;
  if (variant.words.length > 1) {
    if (doc.folded[0].includes(phrase)) score += 0.25;
    else if (doc.folded.some((field) => field.includes(phrase))) score += 0.1;
  }
  if (doc.folded[0].startsWith(variant.words[0])) score += 0.1;
  return { index: 0, score: Math.min(1.2, score) * variant.weight * 80, field: bestField, words: variant.words };
}

const SNIPPET_BEFORE = 36;
const SNIPPET_AFTER = 84;

function buildSnippet(raw: string, folded: string, words: string[]): Segment[] {
  const ranges: [number, number][] = [];
  for (const word of words) {
    let from = 0;
    let guard = 0;
    for (;;) {
      const found = findWord(folded.slice(from), word);
      if (!found || guard++ > 6) break;
      const start = from + found.pos;
      ranges.push([start, start + word.length]);
      from = start + word.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  const first = merged[0]?.[0] ?? 0;
  let from = Math.max(0, first - SNIPPET_BEFORE);
  let to = Math.min(raw.length, first + SNIPPET_AFTER);
  // Nu tăia cuvintele pe margini.
  if (from > 0) { const space = raw.indexOf(' ', from); if (space >= 0 && space < first) from = space + 1; }
  if (to < raw.length) { const space = raw.lastIndexOf(' ', to); if (space > first) to = space; }

  const segments: Segment[] = [];
  const push = (text: string, hit: boolean) => { if (text) segments.push({ text, hit }); };
  let cursor = from;
  for (const [start, end] of merged) {
    if (end <= from || start >= to) continue;
    const s = Math.max(start, from);
    const e = Math.min(end, to);
    push(raw.slice(cursor, s), false);
    push(raw.slice(s, e), true);
    cursor = e;
  }
  push(raw.slice(cursor, to), false);
  if (from > 0 && segments.length) segments[0] = { ...segments[0], text: `…${segments[0].text}` };
  if (to < raw.length && segments.length) {
    const last = segments[segments.length - 1];
    segments[segments.length - 1] = { ...last, text: `${last.text}…` };
  }
  return segments.map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, ' ') }));
}

const firstLine = (text: string, max = 140) => {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * Caută în conținut. Rezultatele sunt sortate după scor, limitate pe tip (întrebări / carduri / notițe)
 * și au fragmente cu potrivirile marcate. `limits` poate fi suprascris (în teste).
 */
export function searchContent(
  index: ContentIndex,
  query: string,
  limits: Record<ContentKind, number> = CONTENT_LIMITS,
): ContentHit[] {
  const variants = variantsFor(query);
  if (variants.length === 0) return [];
  const memo = new Map<string, string[]>();
  const best = new Map<number, Scored>();

  for (const variant of variants) {
    const sets = variant.words.map((word) => docsForWord(index, word, memo));
    if (sets.some((set) => set.size === 0)) continue;
    sets.sort((a, b) => a.size - b.size);
    const phrase = variant.words.join(' ');
    for (const id of sets[0]) {
      if (!sets.every((set) => set.has(id))) continue;
      const scored = scoreDoc(index.docs[id], variant, phrase);
      if (!scored) continue;
      scored.index = id;
      const previous = best.get(id);
      if (!previous || scored.score > previous.score) best.set(id, scored);
    }
  }

  const ranked = [...best.values()].sort((a, b) => b.score - a.score || a.index - b.index);
  const taken: Record<ContentKind, number> = { question: 0, flashcard: 0, note: 0 };
  const hits: ContentHit[] = [];
  for (const scored of ranked) {
    const doc = index.docs[scored.index];
    if (taken[doc.kind] >= limits[doc.kind]) continue;
    taken[doc.kind]++;
    hits.push({
      id: `${doc.kind}-${doc.quizId ?? 'none'}-${doc.questionId}`,
      kind: doc.kind,
      quizId: doc.quizId,
      quizTitle: doc.quizTitle,
      questionId: doc.questionId,
      label: firstLine(doc.raw[0]),
      field: FIELDS[scored.field],
      snippet: buildSnippet(doc.raw[scored.field], doc.folded[scored.field], scored.words),
      score: Math.round(scored.score * 10) / 10,
    });
  }
  return hits;
}
