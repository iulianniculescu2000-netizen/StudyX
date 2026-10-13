import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { countImageOps, OCR_MAX_LETTERS, pageNeedsOcr, processPage, type PdfTextItem } from '../lib/pdf/readingOrder';
import { applyOcrText, extractPageMap, hasPageMarkers, pageMarker, rememberPageMap, restitchPages, type PageStart } from './pageMarkers';
import { getPdfOcrEnabled, hasNoTextLayer, planOcrPages, runOcrPages, tesseractLaneFactory } from './pdfOcr';

export interface ParsePdfOptions {
  signal?: AbortSignal;
  /** OCR forțat (ex. test); implicit se citește setarea utilizatorului. */
  ocrEnabled?: boolean;
  onOcrProgress?: (done: number, total: number) => void;
}

// Browser fallback: extract text with pdf.js (same worker the rest of the app uses).
// Runs when there's no Electron bridge (web / PWA build).
async function extractPdfTextInBrowser(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent().catch(() => null);
      if (textContent) {
        // Keep line breaks (`hasEOL`): chapter-title detection downstream needs
        // titles to stay on their own line instead of dissolving into the page.
        // Marcajul de pagină (invizibil) e scos înainte de indexare; vezi pageMarkers.ts.
        let pageText = '';
        let printedPage: number | undefined;
        try {
          const res = processPage(textContent.items as PdfTextItem[]);
          pageText = res.text;
          printedPage = res.printedPage;
        } catch {
          /* fallback mai jos */
        }
        if (!pageText) {
          pageText = textContent.items
            .map((item) => {
              const value = 'str' in item ? String(item.str) : '';
              return 'hasEOL' in item && item.hasEOL ? `${value}\n` : `${value} `;
            })
            .join('');
        }
        // Pagină fără text util dar cu imagini -> `needsOcr` în harta paginilor (OCR-ul e opțional, vezi parsePDF).
        let needsOcr = false;
        try {
          if ((pageText.match(/\p{L}/gu) ?? []).length < OCR_MAX_LETTERS) {
            const OPS = (pdfjs as unknown as { OPS: Record<string, number> }).OPS;
            needsOcr = pageNeedsOcr({ text: pageText, imageCount: countImageOps(await page.getOperatorList(), OPS) });
          }
        } catch {
          /* fără detecție de imagini: pagina rămâne neetichetată */
        }
        parts.push(pageMarker(pageNumber, printedPage, needsOcr) + pageText);
      }
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return parts.join('\n');
}

export function cleanText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n')
    // Cratima de la capăt de rând se unește și peste marcajul de pagină (altfel apare abia după scoaterea marcajelor).
    .replace(/-\n(?=(?:⁣p\d{1,5}(?:\|\d{1,5})?~?⁣)?\p{Ll})/gu, '')
    // Caracterele neacceptate (ex. \u03B2, \u00B5) devin spa\u021Biu \u00CENAINTE de colapsare: altfel \u201Esau \u03B2-lactamine\u201D las\u0103
    // dou\u0103 spa\u021Bii, iar a doua cur\u0103\u021Bare (dup\u0103 scoaterea marcajelor de pagin\u0103) schimb\u0103 textul \u0219i pierde harta paginilor.
    .replace(/[^\x20-\x7E\u00A0-\u036F\u0370-\u03FF\u2000-\u206F\u2070-\u22FF\n]/g, ' ')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getTextStats(text: string) {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const digits = (text.match(/\p{N}/gu) ?? []).length;
  const tokens = text.split(/\s+/).filter(Boolean);
  const usefulRatio = text.length > 0 ? (letters + digits) / text.length : 0;

  return {
    letters,
    digits,
    tokens,
    usefulRatio,
  };
}

function scorePdfCandidate(text: string) {
  const cleaned = cleanText(text);
  const { letters, digits, tokens, usefulRatio } = getTextStats(cleaned);

  return {
    cleaned,
    score: letters * 2 + digits + tokens.length * 8 + usefulRatio * 1000,
  };
}

function validateExtractedText(text: string, kind: 'pdf' | 'docx' | 'image') {
  const cleaned = cleanText(text);
  const { letters, tokens, usefulRatio } = getTextStats(cleaned);

  if (kind === 'pdf') {
    const hasUsefulBody = letters >= 45 && tokens.length >= 8;
    const hasStrongBody = letters >= 140 || (tokens.length >= 22 && usefulRatio >= 0.16);
    const hasLongNoisyBody = cleaned.length >= 1200 && tokens.length >= 120;

    if (hasStrongBody) return cleaned;
    if (hasUsefulBody && usefulRatio >= 0.06) return cleaned;
    if (hasLongNoisyBody) return cleaned;

    throw new Error(
      'Textul extras din PDF este prea slab pentru a fi folosit sigur. Incearca o versiune digitala, un export nou sau importul prin OCR in Biblioteca AI.',
    );
  }

  const minChars = 80;
  const minTokens = 15;
  const minUsefulRatio = 0.45;

  if (cleaned.length < minChars || tokens.length < minTokens || usefulRatio < minUsefulRatio) {
    throw new Error('Continutul extras pare incomplet sau ilizibil.');
  }

  return cleaned;
}

/** OCR pe paginile marcate (dacă setarea e pornită sau documentul nu are deloc text). Eșecul OCR nu strică importul. */
async function ocrWeakPages(file: File, text: string, pages: PageStart[], options: ParsePdfOptions): Promise<{ text: string; pages: PageStart[] }> {
  const noTextLayer = hasNoTextLayer(text, pages);
  const plan = planOcrPages(pages, { enabled: options.ocrEnabled ?? getPdfOcrEnabled(), noTextLayer });
  if (plan.length === 0) return { text, pages };

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await loadingTask.promise;
    const results = await runOcrPages({
      pages: plan,
      signal: options.signal,
      createLane: tesseractLaneFactory(pdf as unknown as Parameters<typeof tesseractLaneFactory>[0]),
      onProgress: options.onOcrProgress,
    });
    // Aceeași curățare ca textul normal, ca amprenta textului (și harta paginilor) să rămână valabilă la validare.
    const cleaned = new Map([...results].map(([page, value]) => [page, cleanText(value)] as const));
    const merged = applyOcrText(text, pages, cleaned);
    return { text: merged.text.trimEnd(), pages: merged.pages };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    console.error('PDF OCR failed:', error);
    return { text, pages };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function parsePDF(file: File | string, options: ParsePdfOptions = {}) {
  if (typeof file === 'string') {
    return validateExtractedText(file, 'pdf');
  }

  let extractedText = '';

  if (window.electronAPI) {
    // Electron 32+ nu mai pune `File.path`: calea vine din preload (webUtils). Cu cale, PDF-ul nu mai trece prin memoria paginii.
    const filePath = (file instanceof File ? window.electronAPI.getPathForFile?.(file) : '') || (file as { path?: string }).path;

    if (file instanceof File && filePath) {
      const text = await window.electronAPI.readPdfPath(filePath);
      if (text && text.trim().length > 5) {
        extractedText = text;
      }
    } else if (file instanceof File && typeof window.electronAPI.readPdfBuffer === 'function') {
      const buffer = await file.arrayBuffer();
      const text = await window.electronAPI.readPdfBuffer(new Uint8Array(buffer));
      if (text && text.trim().length > 5) {
        extractedText = text;
      }
    }
  }

  // Web / PWA build: no Electron bridge, extract with pdf.js in the browser.
  if (!extractedText && file instanceof File) {
    try {
      const text = await extractPdfTextInBrowser(file);
      if (text && text.trim().length > 5) {
        extractedText = text;
      }
    } catch (error) {
      console.error('Browser PDF extraction failed:', error);
    }
  }

  if (!extractedText) {
    throw new Error(
      'Nu am putut extrage text din acest PDF. Incearca o versiune digitala sau importa documentul prin OCR in Biblioteca AI.',
    );
  }

  const bestCandidate = scorePdfCandidate(extractedText).cleaned;
  if (!hasPageMarkers(bestCandidate)) return validateExtractedText(bestCandidate, 'pdf');

  // Textul vine din pdf.js cu marcaje de pagină: le scoatem, validăm textul curat și păstrăm harta
  // paginilor pentru indexare (nu schimbă ce primesc apelanții).
  let { text: pageText, pages } = extractPageMap(bestCandidate);
  if (file instanceof File && pages.some((p) => p.needsOcr)) {
    ({ text: pageText, pages } = await ocrWeakPages(file, pageText, pages, options));
  }
  // Fiecare pagină se curăță separat și se lipește curat: a doua curățare (la validare) nu mai schimbă textul și harta rămâne valabilă.
  ({ text: pageText, pages } = restitchPages(pageText, pages, cleanText));
  const validated = validateExtractedText(pageText, 'pdf');
  if (validated === pageText) rememberPageMap(validated, pages);
  return validated;
}
