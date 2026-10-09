/**
 * OCR de rezervă pentru paginile de PDF fără text util (scanări, pagini-imagine).
 * Conservator: dezactivat implicit (setare), cu limită de pagini pe document și concurență mică.
 * Excepție: un document fără NICIUN strat de text (scanare integrală) se OCR-izează oricum, fiindcă
 * altfel nu se poate indexa deloc. Partea pură (plan, pool, setare) e testată cu mock-uri; adaptorul
 * tesseract + randarea pe canvas rulează doar în renderer.
 */
import type { PageStart } from './pageMarkers';

export const PDF_OCR_SETTING_KEY = 'studyx-pdf-ocr-enabled';
/** Pagini OCR-izate simultan (fiecare lane = un worker tesseract; memoria contează). */
export const OCR_CONCURRENCY = 2;
/** Limita pe document când OCR e pornit din setare (doar paginile slabe dintr-o carte cu text). */
export const OCR_MAX_PAGES_PARTIAL = 60;
/** Limita pe document pentru o scanare integrală. */
export const OCR_MAX_PAGES_NO_TEXT_LAYER = 400;
/** Sub atâtea litere/pagină în medie, documentul nu are strat de text. */
const NO_TEXT_LAYER_LETTERS_PER_PAGE = 5;

export function getPdfOcrEnabled(): boolean {
  try {
    return localStorage.getItem(PDF_OCR_SETTING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPdfOcrEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PDF_OCR_SETTING_KEY, enabled ? '1' : '0');
  } catch {
    /* indisponibil: rămâne dezactivat */
  }
}

/** Documentul întreg nu are text util (media literelor pe pagină e aproape zero). */
export function hasNoTextLayer(text: string, pages: readonly PageStart[]): boolean {
  if (pages.length === 0) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters / pages.length < NO_TEXT_LAYER_LETTERS_PER_PAGE;
}

export interface OcrPlanOptions {
  enabled: boolean;
  noTextLayer: boolean;
  maxPages?: number;
}

/** Ce pagini se OCR-izează: nimic dacă setarea e oprită și documentul are text; altfel paginile marcate, plafonate. */
export function planOcrPages(pages: readonly PageStart[], options: OcrPlanOptions): number[] {
  if (!options.enabled && !options.noTextLayer) return [];
  const max = options.maxPages ?? (options.noTextLayer ? OCR_MAX_PAGES_NO_TEXT_LAYER : OCR_MAX_PAGES_PARTIAL);
  const flagged = pages.filter((p) => p.needsOcr).map((p) => p.page);
  // Scanare integrală fără imagini detectate: mai bine toate paginile decât un document gol.
  const candidates = flagged.length === 0 && options.noTextLayer ? pages.map((p) => p.page) : flagged;
  return candidates.slice(0, Math.max(0, max));
}

export interface OcrLane {
  process: (page: number) => Promise<string>;
  dispose: () => Promise<void> | void;
}

export interface RunOcrOptions {
  pages: readonly number[];
  concurrency?: number;
  signal?: AbortSignal;
  createLane: () => Promise<OcrLane>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Rulează paginile pe cel mult `concurrency` lane-uri. O pagină care eșuează se sare (rămâne fără text);
 * anularea aruncă. Lane-urile se închid mereu.
 */
export async function runOcrPages(options: RunOcrOptions): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const queue = [...options.pages];
  const total = queue.length;
  if (total === 0) return results;
  const laneCount = Math.max(1, Math.min(options.concurrency ?? OCR_CONCURRENCY, total));
  let done = 0;

  const lanes: OcrLane[] = [];
  try {
    for (let i = 0; i < laneCount; i += 1) lanes.push(await options.createLane());
    await Promise.all(lanes.map(async (lane) => {
      for (;;) {
        if (options.signal?.aborted) throw new DOMException('OCR anulat', 'AbortError');
        const page = queue.shift();
        if (page === undefined) return;
        try {
          const text = await lane.process(page);
          if (text.trim()) results.set(page, text);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          /* pagină ilizibilă: o sărim */
        }
        done += 1;
        options.onProgress?.(done, total);
      }
    }));
  } finally {
    await Promise.allSettled(lanes.map((lane) => lane.dispose()));
  }
  return results;
}

/** Curăță ieșirea tesseract: fără control chars, spații multiple, linii goale în exces. */
export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex -- scoatem intenționat caracterele de control din ieșirea OCR
    .replace(/[\u0000-\u0008\u000B-\u001F⁣]/g, ' ')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Renderer: randare pagină pe canvas + tesseract ───────────────────────────

interface RenderablePdf {
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
    cleanup: () => void;
  }>;
}

/** Creează un lane tesseract (limba 'ron', iar dacă nu se poate încărca, 'eng') peste un document pdf.js deja deschis. */
export function tesseractLaneFactory(pdf: RenderablePdf, scale = 2): () => Promise<OcrLane> {
  return async () => {
    const { createWorker } = await import('tesseract.js');
    let worker;
    try {
      worker = await createWorker('ron');
    } catch {
      worker = await createWorker('eng');
    }
    return {
      process: async (pageNumber) => {
        const page = await pdf.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) return '';
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          const ret = await worker.recognize(canvas);
          canvas.width = 0;
          canvas.height = 0;
          return cleanOcrText(ret.data.text);
        } finally {
          page.cleanup();
        }
      },
      dispose: async () => { await worker.terminate(); },
    };
  };
}
