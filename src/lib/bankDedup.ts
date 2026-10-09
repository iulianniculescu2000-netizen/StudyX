/**
 * Detector for duplicate questions across the imported Rezidențiat banks.
 *
 * Pure and read-only: it never changes a quiz. Two questions are
 *  - **exact** duplicates when their normalized stem, normalized option set and
 *    correct-answer set are identical (option order, diacritics, case, "12." /
 *    "(pg. 28)" decorations are ignored);
 *  - **near** duplicates when stem + options are ≥ 0.9 similar (Jaccard on
 *    character shingles) AND the correct-answer set and every number match;
 *  - a **conflict** when they look like the same question but the correct
 *    answers differ. Conflicts are flagged, never merged.
 *
 * Linear-ish: exact matches go through a hash map, near matches through
 * MinHash banding, so thousands of questions take well under a second.
 */
import type { Question, Quiz } from '../types';

export interface DuplicateMember {
  quizId: string;
  questionId: string;
  /** Position of the question inside its quiz. */
  index: number;
}

export interface DuplicateGroup {
  /** Stable for a given primary member. */
  id: string;
  kind: 'exact' | 'near';
  /** First not-yet-hidden member: the copy that stays in sessions and progress. */
  primary: DuplicateMember;
  /** Every member including the primary, in quiz order. */
  members: DuplicateMember[];
}

export interface DuplicateReport {
  groups: DuplicateGroup[];
  /** Same question, different correct answers: never merged, worth a manual look. */
  conflicts: DuplicateMember[][];
  /** Copies beyond the first one in each group (what "N întrebări duplicate" counts). */
  duplicateCount: number;
  /** `${quizId}:${questionId}` → group, for every member (primary included). */
  groupOf: Map<string, DuplicateGroup>;
}

export const memberKey = (quizId: string, questionId: string) => `${quizId}:${questionId}`;

const NEAR_THRESHOLD = 0.9;
const SHINGLE = 5;
const BANDS = 6;
const ROWS = 2;
const HASHES = BANDS * ROWS;
const MAX_BUCKET = 64;

const NON_ASCII = /[^ -~]/;
const stripMarks = (value: string) =>
  (NON_ASCII.test(value) ? value.normalize('NFD').replace(/[̀-ͯ]/g, '') : value).toLowerCase();
const alnum = (value: string) => value.replace(/[^a-z0-9]+/g, '');

/** "(pg. 28)", "(pag 27)", "(p. 3-4)" page references the bank adds to stems. */
const PAGE_REF = /\(\s*(?:pagina|pag|pg|p)\.?\s*\d[\d\s,.;\-–]*\)/g;
/** "12." / "12)" / "(12)" numbering at the very start. */
const LEADING_NUMBER = /^\s*(?:\(?\d{1,4}\s*[.)]\s*)+/;
/** "a)" / "B." lettering at the start of an option. */
const OPTION_LETTER = /^\s*\(?[a-e]\s*[.)]\s+/;

/** The stem with decorations removed, lowercase, no diacritics (still spaced, for digit extraction). */
export function cleanStem(text: string): string {
  return stripMarks(text).replace(PAGE_REF, ' ').replace(LEADING_NUMBER, '');
}
const cleanOption = (text: string) => stripMarks(text).replace(OPTION_LETTER, '');
const digits = (value: string) => value.replace(/\D+/g, '');

/** Letters + digits only: what two copies of the same stem have in common. */
export const normalizeStem = (text: string) => alnum(cleanStem(text));

interface Prepared {
  quizId: string;
  questionId: string;
  index: number;
  hidden: boolean;
  /** stem|sorted options|image — identical for exact duplicates (correctness aside). */
  fullKey: string;
  correctKey: string;
  digitKey: string;
  shingleSource: string;
}

function prepare(quiz: Quiz, question: Question, index: number): Prepared | null {
  const options = question.options ?? [];
  if (options.length < 2 || !question.text) return null;
  const optionTexts = options.map((o) => cleanOption(o.text ?? ''));
  const optionKeys = optionTexts.map(alnum);
  const correct = options.map((o, i) => (o.isCorrect ? optionKeys[i] : null)).filter((k): k is string => k !== null);
  const cleaned = cleanStem(question.text);
  const stem = alnum(cleaned);
  if (!stem || correct.length === 0 || optionKeys.some((k) => !k)) return null;
  const sorted = optionKeys.slice().sort();
  const image = question.imageUrl ? `img:${question.imageUrl.length}:${question.imageUrl.slice(-48)}` : '';
  const body = `${stem}#${sorted.join('#')}`;
  return {
    quizId: quiz.id,
    questionId: question.id,
    index,
    hidden: question.hidden === true,
    fullKey: `${body}#${image}`,
    correctKey: correct.slice().sort().join('¦'),
    digitKey: `${digits(cleaned)}|${optionTexts.map(digits).sort().join(',')}|${image}`,
    shingleSource: body,
  };
}

const isSession = (quiz: Pick<Quiz, 'tags'>) => (quiz.tags ?? []).some((tag) => tag.startsWith('folder-session:'));

/** Quizzes whose questions take part in duplicate detection. */
export const isDedupeCandidate = (quiz: Quiz) => !quiz.archived && quiz.kind !== 'flashcard' && !isSession(quiz);

function shingleHashes(source: string): Uint32Array {
  const n = Math.max(1, source.length - SHINGLE + 1);
  const all = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) {
    let h = 2166136261;
    const end = Math.min(source.length, i + SHINGLE);
    for (let j = i; j < end; j += 1) h = Math.imul(h ^ source.charCodeAt(j), 16777619);
    all[i] = h;
  }
  all.sort();
  let unique = 0;
  for (let i = 0; i < n; i += 1) if (i === 0 || all[i] !== all[i - 1]) all[unique++] = all[i];
  return all.subarray(0, unique);
}

const EMPTY = 0xffffffff;

/** One-permutation MinHash: a single mix per shingle, the smallest value kept per bin. */
function sketch(shingles: Uint32Array): Uint32Array {
  const mins = new Uint32Array(HASHES).fill(EMPTY);
  for (let s = 0; s < shingles.length; s += 1) {
    let x = Math.imul(shingles[s] ^ (shingles[s] >>> 15), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    x = (x ^ (x >>> 16)) >>> 0;
    const bin = x % HASHES;
    if (x < mins[bin]) mins[bin] = x;
  }
  return mins;
}

function jaccard(a: Uint32Array, b: Uint32Array): number {
  const small = Math.min(a.length, b.length);
  const large = Math.max(a.length, b.length);
  if (small / large < NEAR_THRESHOLD) return 0;
  let i = 0;
  let j = 0;
  let shared = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { shared += 1; i += 1; j += 1; }
    else if (a[i] < b[j]) i += 1;
    else j += 1;
  }
  return shared / (a.length + b.length - shared);
}

class Dsu {
  private parent: number[];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, i) => i); }
  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    let cur = x;
    while (this.parent[cur] !== root) { const next = this.parent[cur]; this.parent[cur] = root; cur = next; }
    return root;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
    return true;
  }
}

interface Node { items: number[]; fullKey: string; correctKey: string }

/** Finds duplicate groups among the given quizzes (archived, flashcard and combined-session sets are skipped). */
export function findDuplicates(quizzes: Quiz[]): DuplicateReport {
  const items: Prepared[] = [];
  for (const quiz of quizzes) {
    if (!isDedupeCandidate(quiz)) continue;
    quiz.questions.forEach((question, index) => {
      const prepared = prepare(quiz, question, index);
      if (prepared) items.push(prepared);
    });
  }

  // 1. Exact: same stem + options → bucket; inside a bucket the correct set splits nodes.
  const nodes: Node[] = [];
  const buckets = new Map<string, Map<string, Node>>();
  items.forEach((item, i) => {
    let bucket = buckets.get(item.fullKey);
    if (!bucket) { bucket = new Map(); buckets.set(item.fullKey, bucket); }
    const node = bucket.get(item.correctKey);
    if (node) node.items.push(i);
    else {
      const created: Node = { items: [i], fullKey: item.fullKey, correctKey: item.correctKey };
      bucket.set(item.correctKey, created);
      nodes.push(created);
    }
  });

  const dsu = new Dsu(nodes.length);
  const nodeIndex = new Map<Node, number>(nodes.map((node, i) => [node, i]));
  const conflictEdges: Array<[number, number]> = [];
  for (const bucket of buckets.values()) {
    if (bucket.size < 2) continue;
    const list = [...bucket.values()].map((node) => nodeIndex.get(node) as number);
    for (let k = 1; k < list.length; k += 1) conflictEdges.push([list[0], list[k]]);
  }

  // 2. Near: MinHash banding over node representatives, verified with real Jaccard.
  const shingles: Array<Uint32Array | undefined> = new Array(nodes.length);
  const shinglesOf = (n: number) => (shingles[n] ??= shingleHashes(items[nodes[n].items[0]].shingleSource));
  const bandMap = new Map<string, number[]>();
  const checked = new Set<number>();
  nodes.forEach((_, n) => {
    const mins = sketch(shinglesOf(n));
    for (let band = 0; band < BANDS; band += 1) {
      let key = `${band}`;
      let empty = false;
      for (let r = 0; r < ROWS; r += 1) {
        const value = mins[band * ROWS + r];
        if (value === EMPTY) empty = true;
        key += `:${value}`;
      }
      if (empty) continue;
      const bucket = bandMap.get(key);
      if (!bucket) { bandMap.set(key, [n]); continue; }
      if (bucket.length >= MAX_BUCKET) continue;
      for (const other of bucket) {
        const pair = other * nodes.length + n;
        if (checked.has(pair)) continue;
        checked.add(pair);
        const a = nodes[other];
        const b = nodes[n];
        if (a.fullKey === b.fullKey) continue; // same text, different answers: already a conflict edge
        if (items[a.items[0]].digitKey !== items[b.items[0]].digitKey) continue;
        if (jaccard(shinglesOf(other), shinglesOf(n)) < NEAR_THRESHOLD) continue;
        if (a.correctKey === b.correctKey) {
          dsu.union(other, n);
        } else conflictEdges.push([other, n]);
      }
      bucket.push(n);
    }
  });

  // 3. Components → groups.
  const members = (node: Node): DuplicateMember[] =>
    node.items.map((i) => ({ quizId: items[i].quizId, questionId: items[i].questionId, index: items[i].index }));
  const byRoot = new Map<number, number[]>();
  nodes.forEach((_, n) => {
    const root = dsu.find(n);
    byRoot.set(root, [...(byRoot.get(root) ?? []), n]);
  });
  const positionOf = new Map<string, number>();
  items.forEach((item, i) => positionOf.set(memberKey(item.quizId, item.questionId), i));
  const byPosition = (a: DuplicateMember, b: DuplicateMember) =>
    (positionOf.get(memberKey(a.quizId, a.questionId)) ?? 0) - (positionOf.get(memberKey(b.quizId, b.questionId)) ?? 0);

  const groups: DuplicateGroup[] = [];
  const groupOf = new Map<string, DuplicateGroup>();
  let duplicateCount = 0;
  for (const list of byRoot.values()) {
    const all = list.flatMap((n) => members(nodes[n])).sort(byPosition);
    if (all.length < 2) continue;
    const hiddenOf = (m: DuplicateMember) => items[positionOf.get(memberKey(m.quizId, m.questionId)) as number].hidden;
    const primary = all.find((m) => !hiddenOf(m)) ?? all[0];
    const group: DuplicateGroup = {
      id: memberKey(primary.quizId, primary.questionId),
      kind: list.length > 1 ? 'near' : 'exact',
      primary,
      members: all,
    };
    groups.push(group);
    duplicateCount += all.length - 1;
    for (const m of all) groupOf.set(memberKey(m.quizId, m.questionId), group);
  }
  groups.sort((a, b) => (positionOf.get(a.id) ?? 0) - (positionOf.get(b.id) ?? 0));

  // 4. Conflicts: components of "looks the same, answers differ" edges.
  const conflictDsu = new Dsu(nodes.length);
  const inConflict = new Set<number>();
  for (const [a, b] of conflictEdges) { conflictDsu.union(a, b); inConflict.add(a); inConflict.add(b); }
  const conflictBy = new Map<number, DuplicateMember[]>();
  for (const n of inConflict) {
    const root = conflictDsu.find(n);
    conflictBy.set(root, [...(conflictBy.get(root) ?? []), ...members(nodes[n])]);
  }
  const conflicts = [...conflictBy.values()].map((list) => list.sort(byPosition)).sort((a, b) => byPosition(a[0], b[0]));

  return { groups, conflicts, duplicateCount, groupOf };
}

let lastRun: { quizzes: Quiz[]; report: DuplicateReport } | null = null;
/** `findDuplicates` remembered while the same quiz objects come back (progress changes recompute the overview, not the groups). */
export function findDuplicatesCached(quizzes: Quiz[]): DuplicateReport {
  if (lastRun && lastRun.quizzes.length === quizzes.length && lastRun.quizzes.every((quiz, i) => quiz === quizzes[i])) return lastRun.report;
  const report = findDuplicates(quizzes);
  lastRun = { quizzes: quizzes.slice(), report };
  return report;
}

/** Non-primary members: the copies a "view-level dedupe" ignores. */
export function redundantMembers(report: DuplicateReport): DuplicateMember[] {
  const out: DuplicateMember[] = [];
  for (const group of report.groups) {
    for (const m of group.members) if (m !== group.primary) out.push(m);
  }
  return out;
}

/** Questions a session may draw from: everything except copies the user chose to hide. */
export function playableQuestions(quiz: Pick<Quiz, 'questions'>): Question[] {
  return quiz.questions.some((q) => q.hidden) ? quiz.questions.filter((q) => !q.hidden) : quiz.questions;
}
