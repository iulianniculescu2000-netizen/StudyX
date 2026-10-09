import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageMarker, takePageMap } from './pageMarkers';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

const rendered: number[] = [];
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  OPS: {},
  getDocument: () => ({
    promise: Promise.resolve({
      getPage: async (n: number) => ({
        getViewport: () => ({ width: 10, height: 10 }),
        render: () => { rendered.push(n); return { promise: Promise.resolve() }; },
        cleanup: () => {},
      }),
    }),
    destroy: async () => {},
  }),
}));

const recognize = vi.fn(async () => ({ data: { text: 'Text recunoscut prin OCR despre hipertensiune arterială și tratament' } }));
const createWorker = vi.fn(async () => ({ recognize, terminate: async () => {} }));
vi.mock('tesseract.js', () => ({ createWorker }));

const body = (n: number) => `Capitolul ${n} descrie hipertensiunea arterială, diagnosticul și tratamentul pacientului în detaliu. `.repeat(3);

function fileWith(text: string): File {
  const file = new File(['%PDF'], 'carte.pdf', { type: 'application/pdf' });
  (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => new ArrayBuffer(4);
  (window.electronAPI as unknown as Record<string, unknown>).readPdfBuffer = async () => text;
  return file;
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  rendered.length = 0;
  recognize.mockClear();
  createWorker.mockClear();
  localStorage.clear();
});

describe('parsePDF OCR fallback', () => {
  const mixed = () => [pageMarker(1) + body(1), pageMarker(2, undefined, true), pageMarker(3) + body(3)].join('\n');

  it('does nothing while the setting is OFF and the document has text (page stays flagged in the map)', async () => {
    const { parsePDF } = await import('./pdfParser');
    const text = await parsePDF(fileWith(mixed()));
    expect(createWorker).not.toHaveBeenCalled();
    expect(text).not.toContain('OCR');
    expect(takePageMap(text)?.find((p) => p.page === 2)?.needsOcr).toBe(true);
  });

  it('OCRs only the flagged page when the setting is ON, and keeps page numbers consistent', async () => {
    const { parsePDF } = await import('./pdfParser');
    const text = await parsePDF(fileWith(mixed()), { ocrEnabled: true });
    expect(rendered).toEqual([2]);
    expect(text).toContain('Text recunoscut prin OCR');
    const pages = takePageMap(text)!;
    const p3 = pages.find((p) => p.page === 3)!;
    expect(text.slice(p3.offset, p3.offset + 10)).toBe('Capitolul ');
    expect(pages.find((p) => p.page === 2)?.needsOcr).toBeUndefined();
  });

  it('falls back from "ron" to "eng" when the language data cannot load', async () => {
    createWorker.mockRejectedValueOnce(new Error('no ron'));
    const { parsePDF } = await import('./pdfParser');
    await parsePDF(fileWith(mixed()), { ocrEnabled: true });
    expect(createWorker.mock.calls.map((c) => (c as unknown as string[])[0]).slice(0, 2)).toEqual(['ron', 'eng']);
  });

  it('runs on a document with no text layer at all even with the setting OFF', async () => {
    const scan = [1, 2, 3].map((n) => pageMarker(n, undefined, true)).join('\n');
    const { parsePDF } = await import('./pdfParser');
    const text = await parsePDF(fileWith(scan));
    expect(rendered.sort()).toEqual([1, 2, 3]);
    expect(text).toContain('Text recunoscut prin OCR');
  });

  it('an OCR engine failure does not break an otherwise valid import', async () => {
    createWorker.mockRejectedValue(new Error('no network'));
    const { parsePDF } = await import('./pdfParser');
    const text = await parsePDF(fileWith(mixed()), { ocrEnabled: true });
    expect(text).toContain('Capitolul 1');
    createWorker.mockImplementation(async () => ({ recognize, terminate: async () => {} }));
  });
});
