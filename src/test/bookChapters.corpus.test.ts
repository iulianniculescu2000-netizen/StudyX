/**
 * Chapter attribution measured on the real residency textbooks.
 *
 * Chunk-level chapter labels are what "generate a quiz from Cardiologie"
 * actually stands on, and the heading matcher has already been wrong twice
 * (page text collapsed into one blob; titles wrapped across two lines). The
 * books live outside the repo, so this skips when they aren't there.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { chunkDocument } from '../ai/chunker';
import { matchBookByName } from '../data/residencyCurriculum';

const BOOKS = [
  { file: 'C:/Users/Asus/Desktop/Rezidentiat/Carti/kumar-doar-capitolele-rezi.pdf', minChapters: 16 },
  { file: 'C:/Users/Asus/Desktop/Rezidentiat/Carti/LAWRENCE.pdf', minChapters: 17 },
  { file: 'C:/Users/Asus/Desktop/Rezidentiat/Carti/Sinopsis.pdf', minChapters: 6 },
];

const available = BOOKS.filter((book) => existsSync(book.file));

function cleanText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/-\n(?=\p{Ll})/gu, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\x20-\x7E\u00A0-\u036F\u2000-\u206F\u2070-\u218F\n]/g, ' ')
    .trim();
}

/** Same extraction as the packaged app: line breaks preserved via `hasEOL`. */
async function extract(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  const parts: string[] = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const rendered = await doc.getPage(page);
    const content = await rendered.getTextContent();
    parts.push(content.items.map((item: { str?: string; hasEOL?: boolean }) => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join(''));
    rendered.cleanup();
  }
  await loadingTask.destroy();
  return cleanText(parts.join('\n'));
}

const normalize = (value: string) =>
  value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

describe.skipIf(available.length === 0)('chapter attribution on the real books', () => {
  it.each(available)('$file', async ({ file, minChapters }) => {
    const name = file.split('/').pop()!;
    const book = matchBookByName(name);
    expect(book, `${name} trebuie să fie în curriculum`).toBeTruthy();

    const text = await extract(file);
    const chunks = await chunkDocument(text, name, {
      chunkSize: 1500,
      overlap: 200,
      preserveStructure: true,
      minChunkLength: 100,
      knownHeadings: book!.chapters,
    });

    const covered = book!.chapters.filter((chapter) =>
      chunks.some((chunk) => chunk.heading && normalize(chunk.heading).includes(normalize(chapter))));
    const withHeading = chunks.filter((chunk) => chunk.heading).length;

    console.log(`${name}: ${covered.length}/${book!.chapters.length} capitole · ${Math.round((withHeading / chunks.length) * 100)}% fragmente etichetate (${chunks.length} fragmente)`);

    expect(covered.length).toBeGreaterThanOrEqual(minChapters);
    expect(withHeading / chunks.length).toBeGreaterThan(0.95);
  }, 600000);
});
