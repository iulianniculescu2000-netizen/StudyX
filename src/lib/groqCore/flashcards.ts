import { getMedicalSystemPrompt } from '../aiContext';
import { cleanFlashcardText, normalizeRomanianDiacritics } from '../flashcardText';
import { FlashcardsBatchSchema, parseStructuredReply } from '../ai/schemas';
import { rateLimitWaitSeconds } from '../ai/friendlyError';
import { chunkText, levenshtein } from './questions';
import { groqChat } from './requests';
import { sleepMs } from './retry';
import type { GroqMessage } from './types';

function normalizeFlashcardKey(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

const numbersIn = (text: string) => (text.match(/\d+/g) ?? []).join(',');

export function isDuplicateFlashcard(front: string, existingFronts: string[]) {
  const normalized = normalizeFlashcardKey(front);
  if (!normalized) return true;

  return existingFronts.some((existing) => {
    const candidate = normalizeFlashcardKey(existing);
    if (!candidate) return false;
    if (candidate === normalized) return true;
    // "MEN1" and "MEN2", "stadiul 2" and "stadiul 3" differ by one character yet are different questions.
    if (numbersIn(candidate) !== numbersIn(normalized)) return false;
    const maxLen = Math.max(candidate.length, normalized.length);
    // Short fronts: a substring match ("HTA" inside "Tratamentul HTA") is not a repeat, only a near-identical wording is.
    return 1 - levenshtein(candidate, normalized) / maxLen > (maxLen < 24 ? 0.85 : 0.82);
  });
}

/**
 * Thrown by `notesToFlashcards` (with `keepPartialOnError`) when the AI failed
 * after some cards were already made, so the caller can keep them and resume.
 */
export class FlashcardGenerationInterrupted extends Error {
  /** Cards generated before the failure. */
  readonly partial: { front: string; back: string }[];
  /** The error that stopped the run. */
  readonly original: unknown;
  /** Seconds the provider asked to wait, when it said so. */
  readonly waitSeconds: number | null;
  /** Chunk to resume from — the one that failed. */
  readonly nextChunk: number;

  constructor(
    partial: { front: string; back: string }[],
    original: unknown,
    waitSeconds: number | null,
    nextChunk: number,
  ) {
    super(original instanceof Error ? original.message : 'Generarea a fost întreruptă.');
    this.name = 'FlashcardGenerationInterrupted';
    this.partial = partial;
    this.original = original;
    this.waitSeconds = waitSeconds;
    this.nextChunk = nextChunk;
  }
}

/** Nothing new could be made from the text (everything it offered was already a card). */
export class NoNewFlashcardsError extends Error {
  constructor() {
    super('Nu s-au putut genera flashcardurile. Textul ar putea fi prea complex sau ilizibil.');
    this.name = 'NoNewFlashcardsError';
  }
}

/** A per-minute limit resets within this; longer waits are left to the caller to surface. */
const AUTO_WAIT_MAX_SECONDS = 75;
const AUTO_WAIT_MAX_TIMES = 3;

async function sleepWithCountdown(seconds: number, onTick?: (secondsLeft: number) => void, abortSignal?: AbortSignal) {
  for (let left = Math.ceil(seconds); left > 0; left -= 1) {
    onTick?.(left);
    await sleepMs(1000, abortSignal);
  }
}

export async function notesToFlashcards(
  notesText: string,
  options: {
    count?: number;
    avoidFronts?: string[];
    sourceName?: string;
    /** Called before the first batch and after every finished one, so the UI can show real progress. */
    onProgress?: (done: number, target: number) => void;
    /**
     * Opt in to riding out a short rate limit: when the provider asks for up to
     * ~75 s, wait and retry the same batch, calling this each second with the
     * seconds left. Without it a rate limit fails the call immediately.
     */
    onWait?: (secondsLeft: number) => void;
    /** If the AI fails after some cards exist, throw `FlashcardGenerationInterrupted` carrying them instead of losing them. */
    keepPartialOnError?: boolean;
    /** Resume: first chunk to use (from a previous interruption). */
    startChunk?: number;
    /** Resume: the card count of the original request, so the chunk list matches the first run. */
    chunkBudget?: number;
    /** Stop: cancels the request in flight and any rate-limit wait. */
    abortSignal?: AbortSignal;
  } = {},
): Promise<{ front: string; back: string }[]> {
  if (!notesText || notesText.trim().length < 20)
    throw new Error('Notițele sunt prea scurte pentru conversia în flashcarduri.');

  const targetCount = Math.max(1, Math.min(100, Math.round(options.count ?? 15)));
  const cleanText = normalizeRomanianDiacritics(notesText)
    .replace(/\f/g, '\n')
    .replace(/[ \t]{3,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const maxChunks = Math.max(4, Math.min(14, Math.ceil((options.chunkBudget ?? targetCount) / 8)));
  const chunks = chunkText(cleanText, 5200, 420, maxChunks);
  const batchSize = 10;
  const generated: { front: string; back: string }[] = [];
  const seenFronts = [...(options.avoidFronts ?? [])];
  options.onProgress?.(0, targetCount);

  let autoWaits = 0;
  const askModel = async (messages: GroqMessage[], temperature: number): Promise<string> => {
    for (;;) {
      try {
        return await groqChat(messages, temperature, { skipLibraryContext: true, task: 'questions', abortSignal: options.abortSignal });
      } catch (error: unknown) {
        const wait = rateLimitWaitSeconds(error);
        const canWait = options.onWait && wait !== null && wait <= AUTO_WAIT_MAX_SECONDS && autoWaits < AUTO_WAIT_MAX_TIMES;
        if (!canWait) throw error;
        autoWaits += 1;
        await sleepWithCountdown(wait + 1, options.onWait, options.abortSignal);
      }
    }
  };

  for (let index = options.startChunk ?? 0; index < chunks.length && generated.length < targetCount; index += 1) {
    const requested = Math.min(batchSize, targetCount - generated.length);
    const avoidList = seenFronts.slice(-35).map((front) => `- ${front.slice(0, 120)}`).join('\n');
    const userPrompt = `Transforma textul medical de mai jos in exact ${requested} flashcarduri ultra-eficiente pentru examen.
REGULI:
- "front": intrebare de active recall, clara si specifica
- "back": raspuns critic, scurt si explicativ; include mecanismul daca ajuta memorarea
- Acopera definitii, mecanisme, semne clinice, diagnostic, tratament, capcane si diferente intre concepte apropiate.
- Nu repeta carduri deja existente.
- Nu formula carduri despre document/PDF/pagina; intreaba despre continutul medical.
- In "front" si "back" scrie text simplu: fara markdown (fara **, #, liste cu -), cu diacritice romanesti corecte (ș, ț, ă, â, î), nu cu sedila (ş, ţ).
- Fiecare "back" se termina cu o propozitie completa, nu cu "...".
- Raspunde strict cu array JSON valid, fara markdown.
${avoidList ? `CARDURI DE EVITAT (deja exista sau au fost generate):\n${avoidList}\n` : ''}

TEXT SURSA${options.sourceName ? ` (${options.sourceName})` : ''}:
---
${chunks[index]}
---

Format: [{"front":"?","back":"..."}]`;

    let raw = '';
    let lastJsonError = '';
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const retryNote = lastJsonError
          ? `\n\nATENTIE: Ultima incercare a returnat JSON invalid (${lastJsonError}). Returneaza STRICT un array JSON valid, fara text sau markdown in afara lui.`
          : '';
        raw = await askModel([
          { role: 'system', content: getMedicalSystemPrompt('tutor') + '\nEști expert în transformarea cursurilor medicale dense în flashcarduri de tip Active Recall, fără repetiții și fără umplutură. Un card conține un singur fapt verificabil din text; nu adăuga doze, valori sau clasificări care nu apar în textul primit.' },
          { role: 'user', content: userPrompt + retryNote },
        ], attempt === 0 ? 0.32 : 0.45);
        const check = parseStructuredReply(raw, FlashcardsBatchSchema);
        if (check.ok) break;
        lastJsonError = check.error;
      }
    } catch (error: unknown) {
      // Cards already made are worth more than a clean failure: hand them back so the caller can keep and resume.
      if (!options.keepPartialOnError || generated.length === 0) throw error;
      throw new FlashcardGenerationInterrupted(generated.slice(0, targetCount), error, rateLimitWaitSeconds(error), index);
    }

    const structured = parseStructuredReply(raw, FlashcardsBatchSchema);
    if (!structured.ok) continue;

    try {
      const parsed: { front: string; back: string }[] = structured.data.cards;
      // One pass, so a front repeated inside this same reply is compared with the ones just accepted.
      for (const flashcard of parsed) {
        if (generated.length >= targetCount) break;
        if (typeof flashcard?.front !== 'string' || typeof flashcard?.back !== 'string') continue;
        const front = cleanFlashcardText(flashcard.front).trim();
        const back = cleanFlashcardText(flashcard.back).trim();
        if (!front || !back || isDuplicateFlashcard(front, seenFronts)) continue;
        generated.push({ front, back });
        seenFronts.push(front);
      }
    } catch {
      // Continue with the next chunk; partial high-quality output is better than losing the deck.
    }
    options.onProgress?.(Math.min(generated.length, targetCount), targetCount);
  }

  if (generated.length === 0) throw new NoNewFlashcardsError();

  return generated.slice(0, targetCount);
}
