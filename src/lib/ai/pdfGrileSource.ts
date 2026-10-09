/**
 * Turns a PDF into formatting-aware lines for the grile extractor.
 *
 * Plain text extraction (pdf.js getTextContent) discards color, but quiz banks
 * mark the correct answer by painting the option a distinct color (red, green,
 * a yellow highlight, …). So we walk the page's operator list, track the active
 * fill color per text run, and tag each line whose color stands out from the
 * document's body color as `marked` — which `parseGrile` reads as "correct".
 *
 * The body color is detected per document (not hard-coded to black) so Moodle
 * exports (gray #333 body) and normal PDFs (black body) both work, and ANY
 * saturated marker color is caught — we never assume it's red.
 */
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { SourceLine } from './grileParser';

function hexToRgb(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r / 255, g / 255, b / 255];
}

/** A "marker" ink: saturated (not gray) and not near-white — red, green, yellow, blue, brown… */
function isMarkerColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  return chroma > 0.22 && max > 0.2;
}

interface Glyph {
  unicode?: string;
}
interface RawLine {
  text: string;
  color: string;
  page: number;
}

export interface PdfGrileSource {
  lines: SourceLine[];
  /** Rendered image (data URL) for each page that contains an embedded image —
   *  e.g. "Grile cu poze (leziuni cutanate)" sections where the clinical photo
   *  and the question text sit on the same page. Keyed by 1-based page number. */
  pageImages: Map<number, string>;
}

export async function pdfToSourceLines(file: File): Promise<PdfGrileSource> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const OPS = pdfjs.OPS as unknown as Record<string, number>;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const rawLines: RawLine[] = [];
  const colorWeight = new Map<string, number>(); // hex -> total chars, to find the body color
  const imagePages: number[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const ops = await page.getOperatorList();

      let fill = '#000000';
      let lineText = '';
      const lineColors = new Map<string, number>();
      let curY: number | null = null;
      let hasImage = false;

      const flush = () => {
        const text = lineText.replace(/\s+/g, ' ').trim();
        if (text) {
          // The line's color = the color covering most of its characters.
          let color = '#000000';
          let max = -1;
          for (const [hex, n] of lineColors) {
            if (n > max) {
              max = n;
              color = hex;
            }
          }
          rawLines.push({ text, color, page: pageNum });
        }
        lineText = '';
        lineColors.clear();
      };

      for (let i = 0; i < ops.fnArray.length; i += 1) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown[];

        if (
          fn === OPS.paintImageXObject
          || fn === OPS.paintJpegXObject
          || fn === OPS.paintInlineImageXObject
        ) {
          hasImage = true;
        } else if (fn === OPS.setFillRGBColor || fn === OPS.setFillColorN || fn === OPS.setFillColor) {
          if (typeof args[0] === 'string') fill = args[0] as string;
        } else if (fn === OPS.setFillGray || fn === OPS.setFillCMYKColor) {
          fill = '#000000';
        } else if (fn === OPS.beginText) {
          flush();
          curY = null;
        } else if (fn === OPS.setTextMatrix) {
          const y = args[5] as number;
          if (curY !== null && Math.abs(y - curY) > 0.5) flush();
          curY = y;
        } else if (fn === OPS.moveText || fn === OPS.setLeadingMoveText) {
          const ty = args[1] as number;
          if (ty !== 0) {
            flush();
            curY = (curY ?? 0) + ty;
          }
        } else if (fn === OPS.nextLine) {
          flush();
        } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
          const glyphs = (args[0] as Glyph[]) || [];
          const text = glyphs.map((g) => (g && typeof g === 'object' ? g.unicode ?? '' : '')).join('');
          if (text) {
            lineText += text;
            const n = text.replace(/\s/g, '').length;
            lineColors.set(fill, (lineColors.get(fill) ?? 0) + n);
            colorWeight.set(fill, (colorWeight.get(fill) ?? 0) + n);
          }
        }
      }
      flush();
      if (hasImage) imagePages.push(pageNum);
      page.cleanup();
    }

    // Render just the image-bearing pages (usually a handful, at the end of a
    // "grile cu poze" section) — cheap enough, and reuses the same page-to-canvas
    // approach as imageProcessing.ts's PDF→image flashcard import.
    const pageImages = new Map<number, string>();
    for (const pageNum of imagePages) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        pageImages.set(pageNum, canvas.toDataURL('image/jpeg', 0.85));
      }
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

    // Body color = the most-used ink across the whole document.
    let bodyColor = '#000000';
    let bodyMax = -1;
    for (const [hex, n] of colorWeight) {
      if (n > bodyMax) {
        bodyMax = n;
        bodyColor = hex;
      }
    }

    return {
      lines: rawLines.map((l) => ({
        text: l.text,
        marked: l.color !== bodyColor && isMarkerColor(l.color),
        page: l.page,
      })),
      pageImages,
    };
  } finally {
    await loadingTask.destroy();
  }
}
