const fs = require('fs');

function cleanText(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/-\n(?=(?:⁣p\d{1,5}(?:\|\d{1,5})?~?⁣)?\p{Ll})/gu, '')
    .replace(/[^\x20-\x7E\u00A0-\u036F\u2000-\u206F\u2070-\u218F\n]/g, ' ')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function regexPdfFallback(buffer) {
  const raw = buffer.toString('latin1');
  const textChunks = [];
  const arrayRe = /\[((?:\([^)]*\)|-?\d+(?:\.\d+)?|\s+)+)\]\s*TJ/g;
  let match;

  while ((match = arrayRe.exec(raw)) !== null) {
    const content = match[1];
    const innerParenRe = /\(([^)]*)\)/g;
    let inner;
    while ((inner = innerParenRe.exec(content)) !== null) {
      const text = inner[1]
        .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\\\/g, '\\');
      if (text.trim().length > 0) textChunks.push(text);
    }
  }

  const parenRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|'|")/g;
  while ((match = parenRe.exec(raw)) !== null) {
    const text = match[1]
      .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\\\/g, '\\')
      .replace(/\\(.)/g, '$1');
    if (text.trim().length > 0) textChunks.push(text);
  }

  return cleanText(textChunks.join(' '));
}

async function parseWithPdfLib(buffer) {
  try {
    const pdfParse = require('pdf-parse');

    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      return cleanText(data?.text || '');
    }

    if (typeof pdfParse?.PDFParse === 'function') {
      const parser = new pdfParse.PDFParse({ data: buffer });
      try {
        const data = await parser.getText({ pageJoiner: '\n' });
        return cleanText(data?.text || '');
      } finally {
        try {
          await parser.destroy();
        } catch {}
      }
    }

    if (typeof pdfParse?.default === 'function') {
      const data = await pdfParse.default(buffer);
      return cleanText(data?.text || '');
    }
  } catch (error) {
    process.send?.({ type: 'log', message: `[PDF Worker] pdf-parse failed: ${error instanceof Error ? error.message : String(error)}` });
  }

  return '';
}

/** Pages per streamed batch: often enough to salvage a killed job, rarely enough to stay cheap. */
const STREAM_BATCH_PAGES = 20;

/**
 * Page-by-page extraction with pdf.js.
 *
 * Textbooks are the reason this exists: `pdf-parse` returns one string at the
 * very end, so a 391-page book that outruns the job timeout yields NOTHING.
 * Streaming batches upstream means the parent keeps every page already read,
 * and reports real progress instead of a silent wait.
 */
async function extractWithPdfjs(buffer) {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    process.send?.({ type: 'log', message: `[PDF Worker] pdf.js unavailable: ${error instanceof Error ? error.message : String(error)}` });
    return '';
  }

  const readingOrder = await import('./pdfReadingOrder.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  const parts = [];
  let batch = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent().catch(() => null);
      if (textContent) {
        // Ordine de citire (2 coloane, titluri full-width, antet/watermark) + marcaj de pagină
        // invizibil (src/ai/pageMarkers.ts), ca chunk-urile să primească page/pageEnd/printedPage.
        // Fallback la formatul vechi (hasEOL) dacă reconstructorul eșuează sau nu produce text.
        let pageText = '';
        let printedPage;
        try {
          const res = readingOrder.processPage(textContent.items);
          pageText = res.text;
          printedPage = res.printedPage;
        } catch {}
        if (!pageText) {
          pageText = textContent.items
            .map((item) => {
              const value = 'str' in item ? String(item.str) : '';
              return item.hasEOL ? `${value}\n` : `${value} `;
            })
            .join('');
        }
        // Pagină fără text util dar cu imagini: o marcăm `needsOcr` (OCR-ul rulează doar în renderer, dacă e permis).
        let needsOcr = false;
        try {
          const letters = (pageText.match(/\p{L}/gu) || []).length;
          if (letters < readingOrder.OCR_MAX_LETTERS) {
            const imageCount = readingOrder.countImageOps(await page.getOperatorList(), pdfjs.OPS);
            needsOcr = readingOrder.pageNeedsOcr({ text: pageText, imageCount });
          }
        } catch {}
        batch.push(readingOrder.formatPageMarker(pageNumber, printedPage, needsOcr) + pageText);
      }
      page.cleanup();

      if (batch.length >= STREAM_BATCH_PAGES || pageNumber === doc.numPages) {
        const text = batch.join('\n');
        parts.push(text);
        batch = [];
        process.send?.({ type: 'chunk', text, page: pageNumber, total: doc.numPages });
      }
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  return cleanText(parts.join('\n'));
}

async function extractText(payload) {
  const buffer = payload?.filePath
    ? fs.readFileSync(payload.filePath)
    : payload?.bufferBase64
      ? Buffer.from(payload.bufferBase64, 'base64')
      : null;

  if (!buffer || buffer.length === 0) return null;

  try {
    const streamed = await extractWithPdfjs(buffer);
    if (streamed.length > 24) return streamed;
  } catch (error) {
    process.send?.({ type: 'log', message: `[PDF Worker] pdf.js extraction failed: ${error instanceof Error ? error.message : String(error)}` });
  }

  const parsedText = await parseWithPdfLib(buffer);

  if (parsedText.length > 24) {
    return parsedText;
  }

  const fallbackText = regexPdfFallback(buffer);
  return fallbackText.length > 24 ? fallbackText : null;
}

process.on('message', async (payload) => {
  try {
    const text = await extractText(payload);
    process.send?.({ type: 'result', text });
  } catch (error) {
    process.send?.({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    process.exit(0);
  }
});
