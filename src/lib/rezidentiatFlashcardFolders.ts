/**
 * Foldere și pachete proprii în Rezidențiat › Flashcarduri.
 *
 * Folderele utilizatorului stau în arborele de foldere al Rezidențiatului, sub „Rezidențiat / Flashcarduri”, lângă
 * pachetele pe capitole făcute de aplicație. Aici trăiesc regulile: ce foldere se oferă, cum se creează unul nou
 * (o singură dată, chiar dacă cererea se repetă), cum se citește un CSV și cum se construiește un pachet manual.
 */
import { useFolderStore } from '../store/folderStore';
import type { Folder, Question, Quiz } from '../types';
import { CHAPTER_FOLDER_NAME } from './chapterDecks';
import { suggestFolderAppearance } from './folderAppearance';
import { folderPathLabel, folderSubtreeIds } from './flashcardGroups';
import { findOrCreateRezidentiatQuizRoot } from './rezidentiatRoot';

/** Alegerea „folderul de bază al flashcardurilor”, care se creează abia când e nevoie de el. */
export const FLASHCARDS_ROOT_CHOICE = '__rezidentiat_flashcards_root__';

export type FolderChoice =
  | { mode: 'existing'; id: string }
  | { mode: 'new'; name: string; parentId: string };

export interface FolderOption { id: string; label: string; depth: number }

const norm = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function childNamed(folders: ReadonlyArray<Folder>, parentId: string, name: string): Folder | undefined {
  return folders.find((folder) => folder.parentId === parentId && norm(folder.name) === norm(name));
}

/** `Rezidențiat / Flashcarduri`; creează ce lipsește. */
export function ensureFlashcardsRoot(): string {
  const root = findOrCreateRezidentiatQuizRoot();
  const store = useFolderStore.getState();
  const existing = childNamed(store.folders, root.id, CHAPTER_FOLDER_NAME);
  if (existing) return existing.id;
  return store.addFolder(CHAPTER_FOLDER_NAME, '🃏', 'purple', root.id);
}

function flashcardsRootId(folders: ReadonlyArray<Folder>): string | null {
  const root = folders.find((folder) => !folder.parentId && norm(folder.name) === norm('Rezidențiat'));
  if (!root) return null;
  return childNamed(folders, root.id, CHAPTER_FOLDER_NAME)?.id ?? null;
}

/** Folderele în care poate ajunge un pachet nou: „Flashcarduri” și tot ce e sub el, în ordinea arborelui. */
export function flashcardFolderOptions(folders: ReadonlyArray<Folder>): FolderOption[] {
  const rootId = flashcardsRootId(folders);
  const options: FolderOption[] = [{ id: rootId ?? FLASHCARDS_ROOT_CHOICE, label: CHAPTER_FOLDER_NAME, depth: 0 }];
  if (!rootId) return options;
  const inside = folderSubtreeIds(rootId, folders);
  const walk = (parentId: string, depth: number) => {
    const children = folders.filter((folder) => folder.parentId === parentId && inside.has(folder.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    for (const child of children) {
      options.push({ id: child.id, label: folderPathLabel(folders, child.id).split(' / ').slice(2).join(' / '), depth });
      walk(child.id, depth + 1);
    }
  };
  walk(rootId, 1);
  return options;
}

/** Face din alegerea utilizatorului un id de folder; un folder nou se creează o singură dată. */
export function resolveFolderChoice(choice: FolderChoice): string {
  if (choice.mode === 'existing') {
    return choice.id === FLASHCARDS_ROOT_CHOICE ? ensureFlashcardsRoot() : choice.id;
  }
  const parentId = choice.parentId === FLASHCARDS_ROOT_CHOICE ? ensureFlashcardsRoot() : choice.parentId;
  const name = choice.name.trim().replace(/\s+/g, ' ');
  if (!name) return parentId;
  const store = useFolderStore.getState();
  const existing = childNamed(store.folders, parentId, name);
  if (existing) return existing.id;
  const look = suggestFolderAppearance(name);
  return store.addFolder(name, look.emoji, look.color, parentId);
}

/** Cum se numește destinația, pentru confirmări („în Flashcarduri / Cardiologie”). */
export function describeFolderChoice(choice: FolderChoice, folders: ReadonlyArray<Folder>): string {
  const labelOf = (id: string) => (id === FLASHCARDS_ROOT_CHOICE
    ? CHAPTER_FOLDER_NAME
    : folderPathLabel(folders, id).split(' / ').slice(1).join(' / ') || CHAPTER_FOLDER_NAME);
  if (choice.mode === 'existing') return labelOf(choice.id);
  return `${labelOf(choice.parentId)} / ${choice.name.trim() || 'folder nou'}`;
}

/* ── Citire de carduri din text (CSV, TSV, linii lipite) ───────────────────────────────────── */

export interface ParsedCards { cards: Array<{ front: string; back: string }>; skipped: number }

const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim();

/** Taie o linie la separator, ignorând separatorii din interiorul ghilimelelor („…, de fapt, …”). */
function splitOutsideQuotes(line: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '""'; i += 1; continue; }
      quoted = !quoted;
      current += char;
    } else if (char === separator && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** O linie = un card: față și spate separate prin tab, „;”, „|” sau virgulă (în ordinea asta). Liniile `#` sunt comentarii. */
export function parseFlashcardLines(text: string): ParsedCards {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (lines.length === 0) return { cards: [], skipped: 0 };
  const sample = lines[0];
  const separator = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : sample.includes('|') ? '|' : ',';
  const cards: ParsedCards['cards'] = [];
  let skipped = 0;
  for (const line of lines) {
    const parts = splitOutsideQuotes(line, separator);
    const front = unquote(parts[0] ?? '');
    const back = unquote(parts.slice(1).join(separator));
    if (parts.length < 2 || !front || !back) { skipped += 1; continue; }
    cards.push({ front, back });
  }
  return { cards, skipped };
}

/* ── Pachet făcut de mână ──────────────────────────────────────────────────────────────────── */

export function buildFlashcardQuestion(front: string, back: string): Question {
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    text: front.trim(),
    multipleCorrect: false,
    difficulty: 'medium',
    explanation: '',
    options: [{ id: 'a', text: back.trim(), isCorrect: true }],
  };
}

export interface ManualDeckInput {
  title: string;
  folderId: string;
  cards: ReadonlyArray<{ front: string; back: string }>;
  /** `manual` (scris de utilizator) sau `import` (CSV / lipit). */
  origin?: 'manual' | 'import';
}

export function buildManualDeck(input: ManualDeckInput): Quiz {
  const cards = input.cards.filter((card) => card.front.trim() && card.back.trim());
  const origin = input.origin ?? 'manual';
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    title: input.title.trim() || 'Pachet nou',
    description: origin === 'import' ? `Importat (${cards.length} carduri).` : `Creat de tine (${cards.length} carduri).`,
    emoji: '🃏',
    category: 'Rezidențiat',
    kind: 'flashcard',
    folderId: input.folderId,
    color: 'blue',
    shuffleQuestions: true,
    shuffleAnswers: false,
    tags: ['flashcard', origin, 'rezidentiat'],
    questions: cards.map((card) => buildFlashcardQuestion(card.front, card.back)),
    createdAt: Date.now(),
  };
}
