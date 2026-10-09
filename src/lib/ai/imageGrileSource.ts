/**
 * Extract grile from PHOTOS and SCANNED PDFs using the vision-capable AI.
 *
 * OCR would throw away the very thing that marks the answer (the red/highlighted
 * option), so instead we hand the image straight to a vision model and ask it to
 * read the questions, options, and which option is visually marked as correct.
 * Results are `answerSource: 'ai'` (flagged for review) — the model can misread.
 */
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { groqVisionRequest } from '../groq';
import { recoverJsonArray } from './jsonRecover';
import type { ParsedQuestion } from './grileParser';

const MAX_SCANNED_PAGES = 25; // bound cost/time on huge scanned PDFs

const VISION_PROMPT = [
  'Ești examinator de Medicină. Imaginea conține una sau mai multe întrebări grilă.',
  'Extrage-le EXACT cum sunt scrise (nu traduce, nu reformula). Pentru fiecare, marchează opțiunea corectă',
  'după cum e evidențiată vizual: text colorat (roșu/verde), îngroșat, subliniat, bifat sau încercuit.',
  'Răspunde DOAR cu JSON valid, fără text în plus, în forma:',
  '[{"question":"enunț","multipleCorrect":false,"options":[{"text":"varianta","correct":true},{"text":"varianta","correct":false}]}]',
  'Dacă nicio opțiune nu pare marcată, pune toate "correct": false. Nu inventa întrebări care nu sunt în imagine.',
].join('\n');

interface VisionOption {
  text?: string;
  correct?: boolean;
}
interface VisionQuestion {
  question?: string;
  multipleCorrect?: boolean;
  options?: VisionOption[];
}

function parseVisionQuestions(raw: string): ParsedQuestion[] {
  const parsed = recoverJsonArray(raw) as VisionQuestion[];

  const questions: ParsedQuestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const stem = (item.question ?? '').trim();
    const options = (item.options ?? [])
      .map((o) => ({ text: (o.text ?? '').trim(), isCorrect: !!o.correct }))
      .filter((o) => o.text);
    if (!stem || options.length < 2) continue;

    const hasAnswer = options.some((o) => o.isCorrect);
    questions.push({
      text: stem,
      options,
      multipleCorrect: !!item.multipleCorrect || options.filter((o) => o.isCorrect).length > 1,
      answerSource: hasAnswer ? 'ai' : 'none',
      confidence: hasAnswer ? 'medium' : 'low',
      warnings: hasAnswer ? ['Extras din imagine de AI — verifică.'] : ['Fără răspuns detectat în imagine.'],
    });
  }
  return questions;
}

/** Downscale to keep the base64 payload small; phone photos are huge. */
async function toResizedDataUrl(file: File, maxEdge = 1500): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponibil');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function extractGrileFromImage(file: File): Promise<ParsedQuestion[]> {
  const dataUrl = await toResizedDataUrl(file);
  const raw = await groqVisionRequest(dataUrl, VISION_PROMPT);
  return parseVisionQuestions(raw);
}

export interface ScannedPdfResult {
  questions: ParsedQuestion[];
  pagesProcessed: number;
  pagesTotal: number;
}

/**
 * Scanned (image-only) PDF: render each page to an image and read it with the
 * vision model. Capped at MAX_SCANNED_PAGES so a 200-page file doesn't fire off
 * 200 AI calls — the caller is told how many pages were covered.
 */
export async function extractGrileFromScannedPdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ScannedPdfResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pagesTotal = pdf.numPages;
  const pagesToDo = Math.min(pagesTotal, MAX_SCANNED_PAGES);
  const questions: ParsedQuestion[] = [];

  try {
    for (let p = 1; p <= pagesToDo; p += 1) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 1500 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponibil');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      try {
        const raw = await groqVisionRequest(dataUrl, VISION_PROMPT);
        questions.push(...parseVisionQuestions(raw));
      } catch (error) {
        console.error(`Vision failed on scanned page ${p}:`, error);
      }
      onProgress?.(p, pagesToDo);
    }
  } finally {
    await loadingTask.destroy();
  }

  return { questions, pagesProcessed: pagesToDo, pagesTotal };
}
