/**
 * Regresie pentru „Fără pagini” pe PDF-uri noi: textul se curăța cu marcajele de pagină în el și apoi încă o dată fără ele.
 * Orice schimbare a celei de-a doua curățări (rânduri libere sau spații la limita dintre pagini, o pagină care începe cu
 * „β”, „≥”, „ﬁ”, tab…) arunca harta paginilor pentru toată cartea. Aici fiecare caz trebuie să păstreze toate paginile,
 * cu pozițiile corecte.
 */
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

async function parseAndMap(pages: string[]) {
  const { parsePDF } = await import('./pdfParser');
  const raw = pages.map((p, i) => pageMarker(i + 1) + p).join('\n');
  const text = await parsePDF(fileWith(raw));
  return { text, map: takePageMap(text.trim()) };
}

beforeEach(() => localStorage.clear());

describe('parsePDF — harta paginilor rezistă la orice formă a limitei dintre pagini', () => {
  const CHARS = ['ﬁ', 'ﬂ', 'α', 'β', 'μ', '≥', '≤', '→', '\t', '\f', '▪', 'Ω', 'Δ', '﻿', '\r', '  ', ' ,', ' )', '\u0000', '\n\n\n', ' ', '-'];

  it.each(CHARS.flatMap((ch) => (['start', 'end'] as const).map((where) => [ch, where] as const)))(
    'caracterul %j la %s de pagină',
    async (ch, where) => {
      const first = where === 'start' ? `${ch}${body(1)}` : `${body(1)}sfârșit${ch}`;
      const { text, map } = await parseAndMap([first, body(2), body(3)]);
      expect(map?.map((p) => p.page)).toEqual([1, 2, 3]);
      // Pozițiile trebuie să cadă exact pe începutul textului fiecărei pagini.
      expect(text.slice(map![1].offset).startsWith('Capitolul 2')).toBe(true);
      expect(text.slice(map![2].offset).startsWith('Capitolul 3')).toBe(true);
    },
  );

  it.each([
    ['pagină care se termină cu rând liber', [`${body(1)}\n`, body(2), body(3)]],
    ['pagină care începe cu rânduri libere', [body(1), `\n\n${body(2)}`, body(3)]],
    ['rânduri libere pe ambele părți', [`${body(1)}\n\n`, `\n\n${body(2)}\n\n`, `\n${body(3)}`]],
    ['spații la capete', [`  ${body(1)}  `, ` ${body(2)} `, `${body(3)}   `]],
    ['pagină goală la mijloc', [body(1), '', body(3)]],
  ])('%s', async (_name, pages) => {
    const { text, map } = await parseAndMap(pages as string[]);
    expect(map).not.toBeNull();
    expect(map!.map((p) => p.page)).toEqual([1, 2, 3]);
    // O pagină goală arată spre granița de lângă ea; cele cu text arată exact spre începutul lor.
    const last = text.slice(map![2].offset);
    expect(last.startsWith('Capitolul 3')).toBe(true);
  });

  it('o carte mare cu limite „urâte” își păstrează toate paginile', async () => {
    const pages = Array.from({ length: 120 }, (_, i) => {
      const lead = ['', '\n', '\n\n', ' ', 'β', '≥ 140 mmHg: '][i % 6];
      const tail = ['', '\n', '\n\n', ' ', '-', ' ≥'][(i + 2) % 6];
      return `${lead}${body(i + 1)}${tail}`;
    });
    const { map } = await parseAndMap(pages);
    expect(map).not.toBeNull();
    expect(map!.length).toBe(120);
    expect(map!.map((p) => p.page)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
  });
});
