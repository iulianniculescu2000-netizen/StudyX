/**
 * Orchestrates "import grile from a document": route each file to the right
 * formatting-aware source adapter, run the template parser, dedupe across all
 * files, and hand back structured questions ready for the review screen.
 */
import { parseGrile, type ParsedQuestion, type SourceLine } from './grileParser';
import { dedupeQuestions, type DedupeResult } from './grileDedup';
import { pdfToSourceLines } from './pdfGrileSource';
import { docxToSourceLines } from './docxGrileSource';
import { extractGrileFromImage, extractGrileFromScannedPdf } from './imageGrileSource';
import { extractGrileFromTextWithAI } from './grileAIFallback';
import { supportsVision } from '../groq';
import { friendlyAIError } from './friendlyError';
import { useAIStore } from '../../store/aiStore';
import type { QuizImportData } from '../../types';

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|heic)$/i;

function isImage(file: File): boolean {
  return IMAGE_RE.test(file.name) || file.type.startsWith('image/');
}

export interface GrileExtractionResult {
  questions: ParsedQuestion[];
  perFile: Array<{ name: string; total: number; withAnswer: number; error?: string }>;
  dedupe: DedupeResult;
  stats: { total: number; withAnswer: number; needsReview: number };
}

function textToSourceLines(text: string): SourceLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => ({ text: t.trim() }))
    .filter((l) => l.text.length > 0);
}

async function fileToSourceLines(file: File): Promise<{ lines: SourceLine[]; pageImages?: Map<number, string> }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return pdfToSourceLines(file);
  if (name.endsWith('.docx')) return { lines: await docxToSourceLines(file) };
  if (name.endsWith('.txt') || file.type.startsWith('text/')) {
    return { lines: textToSourceLines(await file.text()) };
  }
  throw new Error(`Format neacceptat: ${file.name}`);
}

/** Attach a same-page clinical photo to questions whose text names an image
 *  ("Imaginea reprezintă…") — a page-level heuristic, so it's flagged for the
 *  user to double-check rather than trusted blindly. */
function attachPageImages(questions: ParsedQuestion[], pageImages: Map<number, string> | undefined): ParsedQuestion[] {
  if (!pageImages || pageImages.size === 0) return questions;
  return questions.map((q) => {
    const page = q.pages?.find((p) => pageImages.has(p));
    if (page === undefined) return q;
    return {
      ...q,
      imageUrl: pageImages.get(page),
      warnings: [...new Set([...q.warnings, 'Poză atașată automat de pe aceeași pagină — verifică dacă se potrivește cu enunțul.'])],
    };
  });
}

/** Extract, parse and dedupe questions from one or more uploaded documents. */
export async function extractGrileFromFiles(
  files: File[],
  onProgress?: (message: string) => void,
): Promise<GrileExtractionResult> {
  const all: ParsedQuestion[] = [];
  const perFile: GrileExtractionResult['perFile'] = [];

  const { hasKey, provider } = useAIStore.getState();
  const canVision = hasKey && supportsVision(provider);
  const isPdf = (file: File) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';

  const aiNotes: string[] = [];
  for (const file of files) {
    aiNotes.length = 0;
    onProgress?.(`${file.name}: citesc documentul…`);
    try {
      let questions;
      if (isImage(file)) {
        // Photos go straight to the vision model.
        questions = await extractGrileFromImage(file);
      } else {
        // Documents: template engine first (fast, free, exact)…
        const { lines, pageImages } = await fileToSourceLines(file);
        questions = attachPageImages(parseGrile(lines).questions, pageImages);
        const textLen = lines.reduce((n, l) => n + l.text.length, 0);
        if (questions.length === 0 && hasKey) {
          if (textLen >= 60) {
            // Has a text layer but the templates couldn't structure it → AI reads the text.
            const ai = await extractGrileFromTextWithAI(
              lines.map((l) => l.text).join('\n'),
              ({ done, total }) => onProgress?.(`${file.name}: AI citește partea ${Math.min(done + 1, total)} din ${total}…`),
            );
            questions = ai.questions;
            if (ai.errors.length > 0) {
              aiNotes.push(`${ai.errors.length} din ${ai.chunks} părți n-au putut fi citite de AI (${ai.errors[0]})`);
            }
          } else if (isPdf(file) && canVision) {
            // No text at all → scanned PDF → render pages and read with vision.
            questions = (await extractGrileFromScannedPdf(file)).questions;
          }
        }
      }
      perFile.push({
        name: file.name,
        total: questions.length,
        withAnswer: questions.filter((q) => q.answerSource !== 'none').length,
        error: questions.length === 0
          ? (hasKey || isImage(file) ? 'Nu am găsit nicio grilă în acest fișier.' : 'Nu am găsit nicio grilă în acest fișier (format nerecunoscut). Adaugă o cheie AI în Setări AI ca să-l pot citi cu AI.')
          : aiNotes.length > 0 ? aiNotes[aiNotes.length - 1] : undefined,
      });
      all.push(...questions);
    } catch (error) {
      perFile.push({
        name: file.name,
        total: 0,
        withAnswer: 0,
        error: friendlyAIError(error),
      });
    }
  }

  const dedupe = dedupeQuestions(all);
  const questions = dedupe.unique;

  return {
    questions,
    perFile,
    dedupe,
    stats: {
      total: questions.length,
      withAnswer: questions.filter((q) => q.answerSource !== 'none').length,
      needsReview: questions.filter((q) => q.confidence !== 'high').length,
    },
  };
}

/** Convert reviewed questions into StudyX's import schema for saving. */
export function toQuizImportData(
  title: string,
  questions: ParsedQuestion[],
  meta?: Partial<Pick<QuizImportData, 'description' | 'emoji' | 'category' | 'color'>>,
): QuizImportData {
  return {
    title,
    description: meta?.description ?? '',
    emoji: meta?.emoji ?? '📋',
    category: meta?.category ?? 'Importate',
    color: meta?.color ?? 'blue',
    questions: questions.map((q) => ({
      text: q.text,
      imageUrl: q.imageUrl,
      multipleCorrect: q.multipleCorrect,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  };
}

/** Groups reviewed questions by their detected specialty, preserving first-seen order
 *  (questions with no detected specialty are kept together under a `null` key). */
function groupQuestionsBySpecialty(questions: ParsedQuestion[]): Array<{ specialty: string | null; questions: ParsedQuestion[] }> {
  const order: Array<string | null> = [];
  const groups = new Map<string | null, ParsedQuestion[]>();
  for (const q of questions) {
    const key = q.specialty ?? null;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(q);
  }
  return order.map((specialty) => ({ specialty, questions: groups.get(specialty)! }));
}

/**
 * Convert reviewed questions into one or more `QuizImportData`, split by detected
 * specialty (e.g. "CARDIOLOGIE") when the source bank organizes itself that way — a
 * single 900-question dump isn't usable. Falls back to one quiz (same as
 * `toQuizImportData`) when no specialties were detected — same "no structure found,
 * don't block" fallback already used for chapter detection.
 */
export function toQuizImportDataBySpecialty(
  title: string,
  questions: ParsedQuestion[],
  meta?: Partial<Pick<QuizImportData, 'description' | 'emoji' | 'category' | 'color'>>,
): QuizImportData[] {
  const groups = groupQuestionsBySpecialty(questions);
  if (groups.length <= 1) {
    return [toQuizImportData(title, questions, meta)];
  }
  return groups.map(({ specialty, questions: groupQuestions }) =>
    toQuizImportData(specialty ? `${title} · ${specialty}` : title, groupQuestions, meta),
  );
}
