import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageMarker, takePageMap } from './pageMarkers';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, OPS: {}, getDocument: () => ({ promise: Promise.reject(new Error('nu se folosește')), destroy: async () => {} }) }));

const body = (n: number) => `Capitolul ${n} descrie hipertensiunea arterială, diagnosticul și tratamentul pacientului în detaliu. `.repeat(3);

function fileWith(text: string): File {
  const file = new File(['%PDF'], 'carte.pdf', { type: 'application/pdf' });
  (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => new ArrayBuffer(4);
  (window.electronAPI as unknown as Record<string, unknown>).readPdfBuffer = async () => text;
  return file;
}

beforeEach(() => localStorage.clear());

describe('parsePDF — harta paginilor rezistă curățării de text', () => {
  it('păstrează harta când textul are „β-lactamine” (caracter neacceptat lângă spațiu)', async () => {
    const { parsePDF } = await import('./pdfParser');
    const text = await parsePDF(fileWith([pageMarker(1) + body(1) + 'sau β-lactamine rezistente.', pageMarker(2) + body(2)].join('\n')));
    expect(takePageMap(text)?.map((p) => p.page)).toEqual([1, 2]);
  });

  it('păstrează harta când un cuvânt cu cratimă se termină la sfârșit de pagină', async () => {
    const { parsePDF } = await import('./pdfParser');
    const text = await parsePDF(fileWith([pageMarker(1) + body(1) + 'evidențierea anato-', pageMarker(2) + 'mică a vaselor. ' + body(2)].join('\n')));
    expect(text).toContain('anatomică');
    expect(takePageMap(text)?.map((p) => p.page)).toEqual([1, 2]);
  });
});
