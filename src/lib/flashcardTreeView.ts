/**
 * Logica pură din spatele listei de flashcarduri: lanțurile de foldere cu un singur copil se strâng într-un
 * antet-breadcrumb, pachetele de capitol se ordonează cronologic (ordinea din plan), se grupează pe
 * specialitate (din folderul din plan) și se rezumă cu cifrele de „de repetat” / progres.
 */
import type { Folder, Quiz } from '../types';
import { isFlashcardDeck } from './deckKind';
import { fold } from './organizare/format';
import { chapterTopics, curriculumChapters, type BookCode, type CurriculumChapter } from './curriculum';
import { chapterOfDeck } from './chapterDecks';
import type { DeckLike, GroupNode } from './flashcardGroups';

/* ───────────────────────── Lanțuri de foldere ───────────────────────── */

export interface CollapsedNode<T extends DeckLike = DeckLike> extends GroupNode<T> {
  /** Folderele lanțului, de sus în jos; ultimul e folderul propriu-zis al nodului (cel cu pachete / copii). */
  path: Folder[];
  children: CollapsedNode<T>[];
}

/**
 * Strânge lanțurile de foldere cu un singur subfolder și fără pachete proprii (Rezidențiat › Flashcarduri › Kumar)
 * într-un singur nod. Nodul rezultat păstrează id-ul, pachetele și numărătorile folderului cel mai de jos, iar
 * `depth` se recalculează ca să nu rămână goluri de indentare. „Neclasificate” (fără folder) nu se atinge.
 */
export function collapseFolderChains<T extends DeckLike>(tree: ReadonlyArray<GroupNode<T>>, baseDepth = 0): CollapsedNode<T>[] {
  return tree.map((node) => {
    let current = node;
    const path: Folder[] = current.folder ? [current.folder] : [];
    while (current.folder && current.decks.length === 0 && current.children.length === 1 && current.children[0].folder) {
      current = current.children[0];
      path.push(current.folder!);
    }
    return {
      ...current,
      depth: baseDepth,
      path,
      children: collapseFolderChains(current.children, baseDepth + 1),
    };
  });
}

/* ───────────────────────── Capitole: număr, ordine, grupuri ───────────────────────── */

export interface DeckStats {
  total: number;
  seen: number;
  due: number;
  mastered: number;
}

export interface SummaryLike extends DeckLike, DeckStats {}

/** Etichetă scurtă cu numărul capitolului din carte, ex. „Cap. 8” (din planul: „Kumar, Cap. 08. Sepsisul…”). */
export function bookChapterTag(chapter: Pick<CurriculumChapter, 'index'>): string | null {
  const full = curriculumChapters()[chapter.index];
  if (!full) return null;
  const source = chapterTopics(full)[0]?.chapter ?? '';
  const match = /\bcap(?:itolul)?\.?\s*0*(\d+)/i.exec(source);
  return match ? `Cap. ${match[1]}` : null;
}

export function chapterOfSummary(deck: DeckLike): CurriculumChapter | null {
  const info = chapterOfDeck(deck.quiz);
  return info ? curriculumChapters()[info.index] ?? null : null;
}

/**
 * Pachetele de capitol primele, în ordinea capitolelor din plan (1, 2, 3…), apoi restul în ordinea primită.
 * Nu modifică lista dată.
 */
export function orderChapterFirst<T extends DeckLike>(decks: ReadonlyArray<T>): T[] {
  const chapters: Array<{ deck: T; index: number }> = [];
  const rest: T[] = [];
  for (const deck of decks) {
    const info = chapterOfDeck(deck.quiz);
    if (info) chapters.push({ deck, index: info.index }); else rest.push(deck);
  }
  chapters.sort((a, b) => a.index - b.index || a.deck.quiz.title.localeCompare(b.deck.quiz.title, 'ro', { numeric: true }));
  return [...chapters.map((entry) => entry.deck), ...rest];
}

const SPECIALTY_LABELS: Record<string, string> = {
  ati: 'ATI',
  'medicina interna': 'Medicină internă',
  'boli infectioase': 'Boli infecțioase',
  'diabet zaharat': 'Diabet zaharat',
  endocrinologie: 'Endocrinologie',
  neurologie: 'Neurologie',
};

/** Specialitatea unui capitol, din folderul planului („Capitole/Medicina Interna/Cardiologie” → „Medicina Interna”). */
function folderSpecialty(folder: string): string | null {
  const parts = folder.split('/').map((part) => part.trim()).filter(Boolean);
  const rest = parts[0] && fold(parts[0]) === 'capitole' ? parts.slice(1) : parts;
  return rest[0] ?? null;
}

/** Folderul cel mai frecvent dintre topicurile capitolului (primul topic poate să nu-l aibă). */
function chapterFolder(chapter: CurriculumChapter): string {
  const counts = new Map<string, number>();
  for (const topic of chapterTopics(chapter)) {
    if (topic.folder) counts.set(topic.folder, (counts.get(topic.folder) ?? 0) + 1);
  }
  let best = chapter.folder;
  let bestCount = 0;
  for (const [folder, count] of counts) {
    if (count > bestCount) { best = folder; bestCount = count; }
  }
  return best;
}

export interface SpecialtyOf {
  key: string;
  label: string;
}

/**
 * Specialitatea fiecărui capitol, derivată din date. Un capitol fără folder în plan primește specialitatea
 * ultimului capitol dinainte din aceeași carte (capitolele vin în ordinea manualului, deci rămâne vecin cu
 * subiectul lui); dacă nu are niciun vecin, nu are specialitate (null).
 */
export function specialtyByChapter(): Map<number, SpecialtyOf | null> {
  const map = new Map<number, SpecialtyOf | null>();
  let previous: { book: BookCode; value: SpecialtyOf } | null = null;
  for (const chapter of curriculumChapters()) {
    const raw = folderSpecialty(chapterFolder(chapter));
    let value: SpecialtyOf | null = null;
    if (raw) {
      const key = fold(raw);
      value = { key, label: SPECIALTY_LABELS[key] ?? raw };
    } else if (previous && previous.book === chapter.book) {
      value = previous.value;
    }
    map.set(chapter.index, value);
    if (value) previous = { book: chapter.book, value };
  }
  return map;
}

export interface ChapterGroupView<T> {
  id: string;
  /** Numele specialității, sau null când capitolele nu au nicio grupare în plan (lista rămâne simplă). */
  label: string | null;
  items: T[];
  /** Primul și ultimul capitol din grup (numerele din aplicație), pentru „1–3”. */
  range: [number, number];
}

/**
 * Grupează elementele pe specialitate, păstrând ordinea cronologică: grupurile apar în ordinea primului lor
 * capitol, iar înăuntru capitolele rămân în ordinea din plan. Elementele trebuie date deja ordonate.
 */
export function groupBySpecialty<T>(items: ReadonlyArray<T>, chapterOf: (item: T) => CurriculumChapter | null): ChapterGroupView<T>[] {
  const specialties = specialtyByChapter();
  const groups = new Map<string, ChapterGroupView<T>>();
  for (const item of items) {
    const chapter = chapterOf(item);
    if (!chapter) continue;
    const specialty = specialties.get(chapter.index) ?? null;
    const id = specialty ? specialty.key : `carte:${chapter.book}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, label: specialty ? specialty.label : null, items: [], range: [chapter.number, chapter.number] };
      groups.set(id, group);
    }
    group.items.push(item);
    group.range = [Math.min(group.range[0], chapter.number), Math.max(group.range[1], chapter.number)];
  }
  return [...groups.values()];
}

/** Câte capitole trebuie să aibă un folder ca să fie afișate grupate (sub prag lista simplă e mai bună). */
export const CHAPTER_GROUPING_MIN = 4;

export interface SplitDecks<T extends DeckLike> {
  chapters: T[];
  rest: T[];
}

/** Desparte pachetele de capitol (ordonate cronologic) de restul. */
export function splitChapterDecks<T extends DeckLike>(decks: ReadonlyArray<T>): SplitDecks<T> {
  const ordered = orderChapterFirst(decks);
  const chapters = ordered.filter((deck) => chapterOfDeck(deck.quiz) !== null);
  return { chapters, rest: ordered.slice(chapters.length) };
}

/* ───────────────────────── Cifre de repetare / progres ───────────────────────── */

export interface DueSummary<T> {
  /** Carduri restante în total. */
  cards: number;
  /** Câte pachete / capitole au restante. */
  chapters: number;
  /** De unde se începe: pachetul cu cele mai multe restante (la egalitate, primul în ordinea cronologică). */
  start: T | null;
}

export function summarizeDue<T extends DeckStats>(items: ReadonlyArray<T>): DueSummary<T> {
  let cards = 0;
  let chapters = 0;
  let start: T | null = null;
  for (const item of items) {
    if (item.due <= 0) continue;
    cards += item.due;
    chapters += 1;
    if (!start || item.due > start.due) start = item;
  }
  return { cards, chapters, start };
}

export interface ProgressSegments {
  /** Procente (0–100) din total; suma e 100 când total > 0. */
  known: number;
  learning: number;
  fresh: number;
}

/** Stăpânite / în învățare (văzute, dar nestăpânite) / noi (nevăzute), ca procente din total. */
export function progressSegments({ total, seen, mastered }: Pick<DeckStats, 'total' | 'seen' | 'mastered'>): ProgressSegments {
  if (total <= 0) return { known: 0, learning: 0, fresh: 100 };
  const knownCount = Math.min(mastered, seen, total);
  const learningCount = Math.max(0, Math.min(seen, total) - knownCount);
  const known = (knownCount / total) * 100;
  const learning = (learningCount / total) * 100;
  return { known, learning, fresh: Math.max(0, 100 - known - learning) };
}

/** „12 de repetat” — numărul cu forma lui corectă. */
export const dueLabel = (count: number) => `${count} de repetat`;

/**
 * Folderele oferite în „Mută în…” / „Salvează în” din Flashcarduri: cele cu scope „flashcards”, cele din
 * Rezidențiat și cele care conțin deja pachete de flashcarduri (plus părinții lor, ca să rămână calea întreagă).
 * Folderele obișnuite de grile nu apar aici.
 */
export function flashcardPickerFolders(
  folders: ReadonlyArray<Folder>,
  quizzes: ReadonlyArray<Pick<Quiz, 'folderId' | 'kind' | 'questions' | 'tags'>>,
  residencyFolderIds: ReadonlySet<string>,
): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const withDecks = new Set<string>();
  for (const quiz of quizzes) if (quiz.folderId && isFlashcardDeck(quiz as Quiz)) withDecks.add(quiz.folderId);
  const keep = new Set<string>();
  for (const folder of folders) {
    if (folder.scope !== 'flashcards' && !residencyFolderIds.has(folder.id) && !withDecks.has(folder.id)) continue;
    let current: Folder | undefined = folder;
    const guard = new Set<string>();
    while (current && !keep.has(current.id) && !guard.has(current.id)) {
      guard.add(current.id);
      keep.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return folders.filter((folder) => keep.has(folder.id));
}
