/**
 * AI safety net for the grile extractor.
 *
 * When the template engine can't find the correct answer (no bold/color/key —
 * e.g. plain scanned text), we ask the user's own AI to pick it. Answers found
 * this way are marked `answerSource: 'ai'` with medium confidence and a warning,
 * so the review screen always flags them for a human check — the AI never
 * silently overrides a formatting-derived answer.
 */
import { groqRequest } from '../groq';
import { recoverJsonArray, chunkLines } from './jsonRecover';
import { friendlyAIError } from './friendlyError';
import type { ParsedQuestion } from './grileParser';

const BATCH_SIZE = 12;
const AI_CHUNK_CHARS = 5000; // chars of source text per AI extraction call
const AI_CHUNK_RETRIES = 1;

interface AIExtractedQuestion {
  question?: string;
  multipleCorrect?: boolean;
  options?: { text?: string; correct?: boolean }[];
}

export interface AIExtractionProgress {
  done: number;
  total: number;
}

function buildExtractionPrompt(chunk: string): string {
  return [
    'Ești examinator de Medicină. Textul de mai jos conține întrebări grilă, posibil formatate dezordonat.',
    'Extrage fiecare întrebare EXACT cum e scrisă (nu traduce, nu reformula), cu variantele ei.',
    'Dacă răspunsul corect este indicat (marcat, subliniat, cu „R:", cheie), pune "correct": true la acea variantă; altfel toate false.',
    'Răspunde DOAR cu JSON valid, fără text în plus:',
    '[{"question":"enunț","multipleCorrect":false,"options":[{"text":"varianta","correct":true},{"text":"varianta","correct":false}]}]',
    '',
    'TEXT:',
    chunk,
  ].join('\n');
}

function toParsedQuestions(items: unknown[]): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as AIExtractedQuestion;
    const stem = (item.question ?? '').trim();
    const options = (Array.isArray(item.options) ? item.options : [])
      .map((o) => ({ text: (o?.text ?? '').trim(), isCorrect: !!o?.correct }))
      .filter((o) => o.text);
    if (!stem || options.length < 2) continue;
    const hasAnswer = options.some((o) => o.isCorrect);
    out.push({
      text: stem,
      options,
      multipleCorrect: !!item.multipleCorrect || options.filter((o) => o.isCorrect).length > 1,
      answerSource: hasAnswer ? 'ai' : 'none',
      confidence: hasAnswer ? 'medium' : 'low',
      warnings: ['Recunoscut de AI — verifică.'],
    });
  }
  return out;
}

/** One chunk -> questions. Tolerates empty/truncated/prose-wrapped replies and retries once. */
async function extractChunk(chunk: string): Promise<ParsedQuestion[]> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= AI_CHUNK_RETRIES; attempt += 1) {
    try {
      const raw = await groqRequest({
        task: 'questions',
        messages: [{ role: 'user', content: buildExtractionPrompt(chunk) }],
        temperature: 0.1,
        maxTokens: 4000,
        skipLibraryContext: true,
      });
      const questions = toParsedQuestions(recoverJsonArray(raw));
      if (questions.length > 0) return questions;
      lastError = new Error('Răspunsul AI a fost gol sau nu conținea grile.');
    } catch (error) {
      lastError = error;
    }
  }
  // Truncated output is the usual cause of a failed chunk: split it in half and retry each half once.
  const lines = chunk.split('\n');
  if (lines.length >= 8 && chunk.length > 1200) {
    const mid = Math.floor(lines.length / 2);
    const halves = [lines.slice(0, mid).join('\n'), lines.slice(mid).join('\n')];
    const out: ParsedQuestion[] = [];
    for (const half of halves) {
      try {
        const raw = await groqRequest({
          task: 'questions',
          messages: [{ role: 'user', content: buildExtractionPrompt(half) }],
          temperature: 0.1,
          maxTokens: 4000,
          skipLibraryContext: true,
        });
        out.push(...toParsedQuestions(recoverJsonArray(raw)));
      } catch (error) {
        lastError = error;
      }
    }
    if (out.length > 0) return out;
  }
  throw lastError instanceof Error ? lastError : new Error('Extragerea cu AI a eșuat.');
}

/**
 * Fallback for documents the template engine can't structure (odd layout, no
 * numbering/markers): hand the raw text to the AI, chunk by chunk, and ask it to
 * pull out the grile. Everything it returns is `answerSource: 'ai'` (flagged for
 * review). A failed chunk never loses the others: partial results are returned
 * and the failure is reported through `errors`.
 */
export async function extractGrileFromTextWithAI(
  text: string,
  onProgress?: (p: AIExtractionProgress) => void,
): Promise<{ questions: ParsedQuestion[]; errors: string[]; chunks: number }> {
  const cleaned = text.replace(/[ \t]+\n/g, '\n').trim();
  if (cleaned.length < 40) return { questions: [], errors: [], chunks: 0 };

  const chunks = chunkLines(cleaned.split('\n'), AI_CHUNK_CHARS);
  const questions: ParsedQuestion[] = [];
  const errors: string[] = [];
  onProgress?.({ done: 0, total: chunks.length });
  for (let i = 0; i < chunks.length; i += 1) {
    try {
      questions.push(...(await extractChunk(chunks[i])));
    } catch (error) {
      errors.push(`partea ${i + 1}/${chunks.length}: ${friendlyAIError(error)}`);
    }
    onProgress?.({ done: i + 1, total: chunks.length });
  }
  return { questions, errors, chunks: chunks.length };
}

function letterToIndex(letter: string): number {
  return letter.trim().toLowerCase().charCodeAt(0) - 97;
}

interface AIAnswer {
  i: number;
  correct: string[];
}

function buildPrompt(batch: ParsedQuestion[]): string {
  const items = batch
    .map((q, idx) => {
      const opts = q.options
        .map((o, oi) => `   ${String.fromCharCode(97 + oi)}) ${o.text}`)
        .join('\n');
      return `${idx + 1}. ${q.text}\n${opts}`;
    })
    .join('\n\n');

  return [
    'Ești examinator de Medicină. Pentru fiecare întrebare grilă de mai jos, indică litera/literele răspunsului corect.',
    'Răspunde DOAR cu JSON valid, fără text în plus, în forma exactă:',
    '[{"i": 1, "correct": ["a"]}, {"i": 2, "correct": ["b","d"]}]',
    'Reguli: "i" = numărul întrebării; "correct" = literele opțiunilor corecte (una sau mai multe). Nu inventa opțiuni. Dacă nu ești sigur, alege cea mai probabilă variantă.',
    '',
    items,
  ].join('\n');
}

async function inferBatch(batch: ParsedQuestion[]): Promise<Map<number, number[]>> {
  const raw = await groqRequest({
    task: 'questions',
    messages: [{ role: 'user', content: buildPrompt(batch) }],
    temperature: 0.1,
    skipLibraryContext: true,
  });

  const parsed = recoverJsonArray(raw) as AIAnswer[];
  const result = new Map<number, number[]>();

  for (const item of parsed) {
    if (!item || typeof item.i !== 'number' || !Array.isArray(item.correct)) continue;
    const q = batch[item.i - 1];
    if (!q) continue;
    const indices = item.correct
      .map((l) => letterToIndex(String(l)))
      .filter((i) => i >= 0 && i < q.options.length);
    if (indices.length > 0) result.set(item.i - 1, [...new Set(indices)]);
  }
  return result;
}

/**
 * Fill in answers for questions the template engine left unanswered.
 * Returns a new array; untouched questions are returned as-is.
 */
export async function inferAnswersWithAI(
  questions: ParsedQuestion[],
  onProgress?: (done: number, total: number) => void,
): Promise<ParsedQuestion[]> {
  const targetIdx = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.answerSource === 'none' && q.options.length >= 2);

  if (targetIdx.length === 0) return questions;

  const updated = [...questions];
  let done = 0;

  for (let start = 0; start < targetIdx.length; start += BATCH_SIZE) {
    const slice = targetIdx.slice(start, start + BATCH_SIZE);
    try {
      const answers = await inferBatch(slice.map((s) => s.q));
      answers.forEach((indices, localIdx) => {
        const globalIdx = slice[localIdx].i;
        const q = updated[globalIdx];
        updated[globalIdx] = {
          ...q,
          options: q.options.map((o, oi) => ({ ...o, isCorrect: indices.includes(oi) })),
          multipleCorrect: q.multipleCorrect || indices.length > 1,
          answerSource: 'ai',
          confidence: 'medium',
          warnings: [...new Set([...q.warnings, 'Răspuns propus de AI — verifică.'])],
        };
      });
    } catch (error) {
      console.error('AI answer inference failed for a batch:', error);
      // Leave this batch's questions unanswered; the review screen still flags them.
    }
    done += slice.length;
    onProgress?.(done, targetIdx.length);
  }

  return updated;
}
