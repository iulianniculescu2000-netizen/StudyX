/**
 * Turns a Word (.docx) file into formatting-aware lines for the grile extractor.
 * Word marks the correct answer with **bold**, which mammoth preserves as
 * <strong>/<b> — so we split the HTML into block-level lines and flag the bold
 * ones. `parseGrile` then reads `bold` as "this option is correct".
 */
import type { SourceLine } from './grileParser';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function htmlToSourceLines(html: string): SourceLine[] {
  // Each list item / paragraph / heading is one logical line.
  const chunks = html.split(/<\/(?:li|p|h[1-6])>/i);
  const lines: SourceLine[] = [];
  for (const chunk of chunks) {
    const bold = /<(?:strong|b)\b/i.test(chunk);
    const text = decodeEntities(chunk.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text) lines.push({ text, bold });
  }
  return lines;
}

export async function docxToSourceLines(file: File): Promise<SourceLine[]> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToSourceLines(value);
}
