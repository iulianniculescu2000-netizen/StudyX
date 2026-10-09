/**
 * (d) flashcardJudge / grilaJudge — scoring local (0 tokeni) al calității unui element generat, plus un
 * prompt LLM minim de rescriere DOAR pentru elementele marcate slabe.
 *
 * Reutilizează țintele măsurate din `examConformance` (CONFORMANCE_TARGETS) și `examStyle`
 * (EXAM_STYLE_META) pentru lungimi și număr de variante. `isSelfContainedFront` din `flashcardAuthor`
 * e oglindit aici (3 linii) fiindcă `flashcardAuthor.ts` trage după el stores și rețea; recomandare:
 * mutarea lui într-un modul pur și importul din ambele locuri.
 */
import { CONFORMANCE_TARGETS } from '../../lib/ai/examConformance';
import { EXAM_STYLE_META, type ExamStyle } from '../../lib/ai/examStyle';
import { HAS_SEDILLA, normalizeSearchText, type HelperMessage } from './shared';

export type ItemProblemCode =
  | 'front-context'
  | 'front-vague'
  | 'front-long'
  | 'back-empty'
  | 'back-echo'
  | 'back-long'
  | 'back-multifact'
  | 'sedilla'
  | 'option-count'
  | 'correct-count'
  | 'flag-mismatch'
  | 'dup-options'
  | 'all-of-above'
  | 'length-cue'
  | 'shape-outlier'
  | 'absolute-word'
  | 'stem-long'
  | 'stem-short'
  | 'no-explanation';

export interface ItemJudgement<C extends string = ItemProblemCode> {
  /** 0-100. */
  score: number;
  problems: C[];
  /** Merită rescriere (scor sub prag sau problemă gravă). */
  weak: boolean;
}

/** Probleme care singure fac elementul „slab”, indiferent de scor. */
const HARD: ReadonlySet<ItemProblemCode> = new Set([
  'front-context', 'back-empty', 'option-count', 'correct-count', 'flag-mismatch', 'dup-options', 'all-of-above',
]);

const PENALTY: Record<ItemProblemCode, number> = {
  'front-context': 40, 'front-vague': 25, 'front-long': 15, 'back-empty': 60, 'back-echo': 30, 'back-long': 15,
  'back-multifact': 15, sedilla: 5, 'option-count': 40, 'correct-count': 50, 'flag-mismatch': 30, 'dup-options': 35,
  'all-of-above': 30, 'length-cue': 15, 'shape-outlier': 15, 'absolute-word': 10, 'stem-long': 10, 'stem-short': 15,
  'no-explanation': 5,
};

const WEAK_BELOW = 70;

function finish(problems: ItemProblemCode[]): ItemJudgement {
  const score = Math.max(0, 100 - problems.reduce((s, p) => s + PENALTY[p], 0));
  return { score, problems, weak: score < WEAK_BELOW || problems.some((p) => HARD.has(p)) };
}

function wordSet(text: string): Set<string> {
  return new Set(normalizeSearchText(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1));
}

/** Jaccard pe cuvinte (potrivit și pentru texte foarte scurte, spre deosebire de shingles de 3 cuvinte). */
export function wordOverlap(a: string, b: string): number {
  const sa = wordSet(a);
  const sb = wordSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  return shared / (sa.size + sb.size - shared);
}

/* ── Flashcarduri ─────────────────────────────────────────────────────────────────────────── */

export interface FlashcardLike {
  front: string;
  back: string;
}

export const FRONT_VAGUE_RE = /\b(asta|aceasta|acesta|acestea|aceste|cele de mai sus|urm[aă]toarele|menționat|mentionat|textul|paragraful|capitolul)\b/i;
const FRONT_LONG = 220;
const BACK_LONG = 420;

export function judgeFlashcard(card: FlashcardLike): ItemJudgement {
  const front = (card.front ?? '').trim();
  const back = (card.back ?? '').trim();
  const problems: ItemProblemCode[] = [];

  // Oglindă a `isSelfContainedFront` (flashcardAuthor): fără etichetă [..] în față, minim 3 cuvinte.
  if (/^\s*\[[^\]]+\]/.test(front) || front.split(/\s+/).filter(Boolean).length < 3) problems.push('front-context');
  else if (FRONT_VAGUE_RE.test(front)) problems.push('front-vague');
  if (front.length > FRONT_LONG) problems.push('front-long');
  if (!back) problems.push('back-empty');
  else {
    if (wordOverlap(front, back) >= 0.7) problems.push('back-echo');
    if (back.length > BACK_LONG) problems.push('back-long');
    else if ((back.match(/[.!?](?:\s|$)/g)?.length ?? 0) >= 4) problems.push('back-multifact');
  }
  if (HAS_SEDILLA.test(front + back)) problems.push('sedilla');
  return finish(problems);
}

/* ── Grile ────────────────────────────────────────────────────────────────────────────────── */

export interface GrilaOptionLike {
  text: string;
  isCorrect: boolean;
}

export interface GrilaLike {
  text: string;
  options: readonly GrilaOptionLike[];
  multipleCorrect?: boolean;
  explanation?: string;
}

const ALL_ABOVE_RE = /\b(toate (?:de )?(?:mai )?sus|toate variantele|niciuna din(?:tre)?|nici una din|toate cele|a si b|a [sș]i b)\b/i;
const ABSOLUTE_RE = /(?<![\p{L}])([îi]ntotdeauna|niciodat[aă]|exclusiv|numai|absolut|orice|nicio|nici un)(?![\p{L}])/iu;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function judgeGrila(question: GrilaLike, style: ExamStyle = 'residency'): ItemJudgement {
  const problems: ItemProblemCode[] = [];
  const options = question.options ?? [];
  const correct = options.filter((o) => o.isCorrect);
  const multiple = correct.length > 1 || question.multipleCorrect === true;

  // Complement multiplu are 5 variante în ambele regimuri (vezi examConformance).
  const expected = multiple ? 5 : EXAM_STYLE_META[style].optionCount;
  if (options.length !== expected) problems.push('option-count');

  if (multiple ? correct.length < 2 || correct.length > 4 : correct.length !== 1) problems.push('correct-count');
  if (question.multipleCorrect !== undefined && question.multipleCorrect !== correct.length > 1 && correct.length > 0) {
    problems.push('flag-mismatch');
  }

  const texts = options.map((o) => o.text.trim());
  let dup = false;
  for (let i = 0; i < texts.length && !dup; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (normalizeSearchText(texts[i]) === normalizeSearchText(texts[j]) || (texts[i].length > 12 && wordOverlap(texts[i], texts[j]) >= 0.85)) {
        dup = true;
        break;
      }
    }
  }
  if (dup) problems.push('dup-options');
  if (texts.some((t) => ALL_ABOVE_RE.test(t))) problems.push('all-of-above');
  if (texts.some((t) => ABSOLUTE_RE.test(t))) problems.push('absolute-word');

  const lengths = texts.map((t) => t.length);
  if (lengths.length >= 4) {
    const med = median(lengths);
    // Indiciu de lungime: o SINGURĂ variantă corectă, cea mai lungă, cu mult peste mediană.
    if (correct.length === 1 && med > 0) {
      const c = correct[0].text.trim().length;
      if (c === Math.max(...lengths) && c > med * 1.8 && c - med > 25) problems.push('length-cue');
    }
    // Variantă de altă „formă” decât restul (mult mai lungă sau mai scurtă), indiferent dacă e corectă.
    if (!problems.includes('length-cue') && med > 0) {
      const outlier = lengths.some((l) => l > med * 2.6 && l - med > 40);
      if (outlier) problems.push('shape-outlier');
    }
  }

  const target = CONFORMANCE_TARGETS[style];
  const stem = (question.text ?? '').trim();
  if (stem.length < 15) problems.push('stem-short');
  else if (stem.length > target.stemLength[1] * 3.5) problems.push('stem-long');
  if (!(question.explanation ?? '').trim()) problems.push('no-explanation');
  if (HAS_SEDILLA.test(stem + texts.join(' '))) problems.push('sedilla');
  return finish(problems);
}

export interface SetJudgement {
  average: number;
  weakIndexes: number[];
  items: ItemJudgement[];
}

export function judgeFlashcards(cards: readonly FlashcardLike[]): SetJudgement {
  return summarize(cards.map(judgeFlashcard));
}

export function judgeGrile(questions: readonly GrilaLike[], style: ExamStyle = 'residency'): SetJudgement {
  return summarize(questions.map((q) => judgeGrila(q, style)));
}

function summarize(items: ItemJudgement[]): SetJudgement {
  const average = items.length ? Math.round(items.reduce((s, i) => s + i.score, 0) / items.length) : 0;
  return { average, weakIndexes: items.flatMap((item, i) => (item.weak ? [i] : [])), items };
}

/* ── Rescriere LLM minimă (doar pentru elementele slabe) ─────────────────────────────────── */

const PROBLEM_HINT: Partial<Record<ItemProblemCode, string>> = {
  'front-context': 'față fără context: fă-o autonomă',
  'front-vague': 'față vagă („asta/textul”): numește subiectul',
  'front-long': 'față prea lungă',
  'back-echo': 'spate care repetă fața',
  'back-long': 'spate prea lung: păstrează esența',
  'back-multifact': 'spate cu mai multe fapte: un singur fapt',
  'dup-options': 'variante duplicate: diferențiază-le',
  'all-of-above': 'fără „toate/niciuna”',
  'length-cue': 'varianta corectă e mai lungă: egalizează lungimea',
  'shape-outlier': 'variante de lungime/formă inegale',
  'absolute-word': 'fără cuvinte absolute în distractori',
  'stem-long': 'enunț prea lung',
};

export const FLASHCARD_REWRITE_SYSTEM =
  'Rescrie DOAR formularea cardurilor marcate, în română, fără fapte noi. JSON: [{"i":nr,"front":"…","back":"…"}].';
export const GRILA_REWRITE_SYSTEM =
  'Corectează DOAR forma grilelor marcate (enunț, lungimea și formularea variantelor), în română, fără fapte noi; păstrează ordinea și variantele corecte. JSON: [{"i":nr,"text":"…","options":["…"]}].';

function hints(problems: readonly ItemProblemCode[]): string {
  return problems.map((p) => PROBLEM_HINT[p]).filter(Boolean).join('; ');
}

export function buildFlashcardRewriteMessages(
  cards: readonly FlashcardLike[],
  judgement: SetJudgement,
  maxItems = 8,
): HelperMessage[] {
  const lines = judgement.weakIndexes.slice(0, maxItems).map((i) => {
    const c = cards[i];
    return `${i}| ${c.front} || ${c.back} || ${hints(judgement.items[i].problems)}`;
  });
  return [
    { role: 'system', content: FLASHCARD_REWRITE_SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ];
}

export function buildGrilaRewriteMessages(
  questions: readonly GrilaLike[],
  judgement: SetJudgement,
  maxItems = 6,
): HelperMessage[] {
  const lines = judgement.weakIndexes.slice(0, maxItems).map((i) => {
    const q = questions[i];
    return `${i}| ${q.text} || ${q.options.map((o) => o.text).join(' ; ')} || ${hints(judgement.items[i].problems)}`;
  });
  return [
    { role: 'system', content: GRILA_REWRITE_SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ];
}

function parseArray(reply: string | null | undefined): unknown[] {
  if (!reply) return [];
  const body = reply.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Înlocuiri valide pentru carduri: indexul trebuie să fie unul dintre cele cerute. */
export function parseFlashcardRewrite(reply: string | null | undefined, allowed: readonly number[]): Map<number, FlashcardLike> {
  const out = new Map<number, FlashcardLike>();
  for (const row of parseArray(reply)) {
    if (!isRecord(row) || typeof row.i !== 'number' || !allowed.includes(row.i)) continue;
    if (typeof row.front !== 'string' || typeof row.back !== 'string') continue;
    const next = { front: row.front.trim(), back: row.back.trim() };
    if (next.front && next.back) out.set(row.i, next);
  }
  return out;
}

/**
 * Înlocuiri valide pentru grile: numărul de variante trebuie să rămână același; corectitudinea
 * (ce variantă e corectă) NU e atinsă de rescriere, rămâne pe poziție (`apply` păstrează `isCorrect`).
 */
export function parseGrilaRewrite(
  reply: string | null | undefined,
  originals: readonly GrilaLike[],
  allowed: readonly number[],
): Map<number, { text: string; options: string[] }> {
  const out = new Map<number, { text: string; options: string[] }>();
  for (const row of parseArray(reply)) {
    if (!isRecord(row) || typeof row.i !== 'number' || !allowed.includes(row.i)) continue;
    const original = originals[row.i];
    if (!original || typeof row.text !== 'string' || !Array.isArray(row.options)) continue;
    if (row.options.length !== original.options.length || !row.options.every((o) => typeof o === 'string' && o.trim())) continue;
    out.set(row.i, { text: row.text.trim(), options: (row.options as string[]).map((o) => o.trim()) });
  }
  return out;
}

/** Aplică o rescriere peste grila originală, păstrând pozițiile variantelor corecte. */
export function applyGrilaRewrite<Q extends GrilaLike>(question: Q, rewrite: { text: string; options: string[] }): Q {
  return {
    ...question,
    text: rewrite.text,
    options: question.options.map((o, idx) => ({ ...o, text: rewrite.options[idx] })),
  };
}
