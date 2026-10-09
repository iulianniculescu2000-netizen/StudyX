/**
 * Maps a parsed Anki collection (`ankiParser.ts`'s output) into StudyX flashcard
 * decks. Builds full `Quiz` objects (with generated ids) and rehomes embedded
 * images into `flashcardImageStore` (content-addressed by quiz id, harmless to
 * redo/orphan if the user cancels) — but does NOT touch `useFolderStore` or
 * `useQuizStore`. Creating the actual folders and saving the quizzes is a
 * separate, explicit step the caller takes on confirm, since that's the part of
 * "importing" that's visibly disruptive if the user backs out.
 */
import { flashcardImageKey, flashcardImageRef, putFlashcardImage } from '../flashcardImageStore';
import type { Question, Quiz } from '../../types';
import type { AnkiCollection, AnkiModel } from './ankiParser';

export interface MappedAnkiDeck {
  /** "::"-split deck path, e.g. ["Rezidențiat", "Cardiologie", "Aritmii"]. */
  path: string[];
  /** Full Quiz, minus folderId (assigned once the deck's folder chain is created). */
  quiz: Omit<Quiz, 'folderId'>;
}

export interface AnkiImportResult {
  decks: MappedAnkiDeck[];
  stats: {
    deckCount: number;
    cardCount: number;
    clozeCount: number;
    imageCount: number;
    skippedAudioCount: number;
  };
}

/**
 * Orders the distinct path prefixes across every deck path so that creating
 * folders in this order always creates parents before children, and a shared
 * prefix (e.g. two decks both under "Rezidențiat") is only listed once.
 */
export function planFolderChain(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const ordered: string[][] = [];
  for (const path of paths) {
    let acc: string[] = [];
    for (const segment of path) {
      acc = [...acc, segment];
      const key = acc.join('::');
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(acc);
      }
    }
  }
  return ordered;
}

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** `{{c1::answer}}` or `{{c1::answer::hint}}` — group 1 = ordinal, 2 = answer, 3 = optional hint. */
const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs;
const SOUND_RE = /\[sound:[^\]]+\]/gi;
const IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
/** Any `{{…}}` token in an Anki card template. */
const TEMPLATE_TOKEN_RE = /\{\{([^}]+)\}\}/g;
/** Template tokens that are never note fields. */
const SPECIAL_TOKENS = new Set(['FrontSide', 'Tags', 'Type', 'Deck', 'Subdeck', 'Card', 'CardFlag']);

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Last, so "&amp;lt;" decodes to the literal text "&lt;" and not to "<".
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function stripSoundRefs(text: string): { text: string; count: number } {
  const matches = text.match(SOUND_RE);
  return { text: text.replace(SOUND_RE, ''), count: matches?.length ?? 0 };
}

function extractFirstImageSrc(html: string): string | null {
  const match = html.match(IMG_SRC_RE);
  return match ? match[1] : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
};

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Note fields referenced by one side of a card template, in template order.
 * Strips Anki's filter syntax (`{{type:Front}}`, `{{hint:Extra}}`) and skips
 * section markers (`{{#Cond}}`) and built-ins like `{{FrontSide}}`.
 */
function fieldsReferencedBy(format: string, fieldNames: string[]): string[] {
  const found: string[] = [];
  for (const match of format.matchAll(TEMPLATE_TOKEN_RE)) {
    let token = match[1].trim();
    if (!token || '#/^!'.includes(token[0])) continue;
    if (token.includes(':')) token = token.slice(token.lastIndexOf(':') + 1).trim();
    if (SPECIAL_TOKENS.has(token) || !fieldNames.includes(token) || found.includes(token)) continue;
    found.push(token);
  }
  return found;
}

/**
 * Front/back for one Basic-family card. Driven by the note type's actual card
 * template so that "Basic (and reversed card)" yields a genuine reverse card
 * rather than a copy of the forward one. Falls back to positional fields when
 * a model ships no usable template.
 */
function buildBasicFrontBack(model: AnkiModel, fields: string[], ord: number): { front: string; back: string } {
  const template = model.templates[ord] ?? model.templates[0];
  if (template) {
    const valueOf = (name: string) => fields[model.fieldNames.indexOf(name)] ?? '';
    const frontFields = fieldsReferencedBy(template.qfmt, model.fieldNames);
    const backFields = fieldsReferencedBy(template.afmt, model.fieldNames)
      .filter((name) => !frontFields.includes(name));
    const front = frontFields.map(valueOf).filter(Boolean).join('\n');
    const back = backFields.map(valueOf).filter(Boolean).join('\n');
    if (front || back) return { front, back };
  }
  // No template info: treat any card past the first as the reverse direction.
  return ord > 0
    ? { front: fields[1] ?? '', back: fields[0] ?? '' }
    : { front: fields[0] ?? '', back: fields[1] ?? '' };
}

/**
 * Front/back for one Cloze card. Anki makes one card per cloze ordinal, and a
 * card hides ONLY its own deletion while showing the others — reproducing that
 * is what makes `{{c1}}`/`{{c2}}` two different cards instead of two identical
 * ones. `ord` is 0-based, so ord 0 is `{{c1::…}}`.
 */
function buildClozeFrontBack(fields: string[], ord: number): { front: string; back: string } {
  const source = fields[0] ?? '';
  const target = ord + 1;
  const front = source.replace(CLOZE_RE, (_full, num: string, answer: string, hint?: string) => (
    Number(num) === target ? (hint ? `[${hint}]` : '[...]') : answer
  ));
  const back = source.replace(CLOZE_RE, (_full, _num: string, answer: string) => answer);
  return { front, back };
}

/** Builds a front/back pair for one Anki card row (not one note). */
function buildFrontBack(
  model: AnkiModel,
  fields: string[],
  ord: number,
): { front: string; back: string; wasCloze: boolean } {
  if (model.isCloze) {
    return { ...buildClozeFrontBack(fields, ord), wasCloze: true };
  }
  return { ...buildBasicFrontBack(model, fields, ord), wasCloze: false };
}

interface RawCard {
  front: string;
  back: string;
  imageSrc: string | null;
}

export async function mapAnkiCollectionToDecks(collection: AnkiCollection): Promise<AnkiImportResult> {
  const noteById = new Map(collection.notes.map((note) => [note.id, note]));

  const byDeck = new Map<string, { path: string[]; cards: RawCard[] }>();
  let clozeCount = 0;
  let skippedAudioCount = 0;

  for (const card of collection.cards) {
    const note = noteById.get(card.noteId);
    if (!note) continue;
    const model = collection.models.get(note.modelId);
    if (!model) continue;
    const deckName = collection.decks.get(card.deckId) ?? 'Import Anki';
    const path = deckName.split('::').map((segment) => segment.trim()).filter(Boolean);
    const pathKey = path.join('::') || 'Import Anki';

    const { front, back, wasCloze } = buildFrontBack(model, note.fields, card.ord);

    const imageSrc = extractFirstImageSrc(`${front} ${back}`);

    const frontStrip = stripSoundRefs(front);
    const backStrip = stripSoundRefs(back);
    skippedAudioCount += frontStrip.count + backStrip.count;

    const frontText = stripHtml(frontStrip.text);
    const backText = stripHtml(backStrip.text);
    // Empty notes exist in real collections; an image-only card is still valid.
    if (!frontText && !backText && !imageSrc) continue;
    if (wasCloze) clozeCount += 1;

    const deckEntry = byDeck.get(pathKey) ?? { path, cards: [] };
    if (!byDeck.has(pathKey)) byDeck.set(pathKey, deckEntry);
    deckEntry.cards.push({ front: frontText, back: backText, imageSrc });
  }

  const decks: MappedAnkiDeck[] = [];
  let imageCount = 0;
  const imageWrites: Promise<void>[] = [];

  for (const { path, cards } of byDeck.values()) {
    const quizId = uid();
    const title = path[path.length - 1] || 'Import Anki';

    // Images are keyed by their Anki media filename, not by question id, so a
    // picture shared by many cards (very common in medical decks) is encoded
    // and stored once instead of once per card.
    const writtenMedia = new Set<string>();

    const questions: Question[] = cards.map((card) => {
      const questionId = uid();
      let imageUrl: string | undefined;
      if (card.imageSrc) {
        const mediaBytes = collection.media.get(card.imageSrc);
        if (mediaBytes) {
          if (!writtenMedia.has(card.imageSrc)) {
            writtenMedia.add(card.imageSrc);
            const dataUrl = `data:${guessMimeType(card.imageSrc)};base64,${bytesToBase64(mediaBytes)}`;
            imageWrites.push(putFlashcardImage(flashcardImageKey(quizId, card.imageSrc), dataUrl));
            imageCount += 1;
          }
          imageUrl = flashcardImageRef(quizId, card.imageSrc);
        }
      }
      return {
        id: questionId,
        text: card.front,
        multipleCorrect: false,
        options: [{ id: `${questionId}-a`, text: card.back, isCorrect: true }],
        ...(imageUrl ? { imageUrl } : {}),
      };
    });

    decks.push({
      path,
      quiz: {
        id: quizId,
        title,
        description: `Importat din Anki (${path.join(' › ')}).`,
        emoji: '🃏',
        category: title,
        kind: 'flashcard',
        questions,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: 'purple',
        tags: ['anki-import'],
      },
    });
  }

  await Promise.all(imageWrites);

  return {
    decks,
    stats: {
      deckCount: decks.length,
      cardCount: decks.reduce((sum, d) => sum + d.quiz.questions.length, 0),
      clozeCount,
      imageCount,
      skippedAudioCount,
    },
  };
}
