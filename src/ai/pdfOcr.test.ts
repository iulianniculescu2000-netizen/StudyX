import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OCR_MAX_PAGES_NO_TEXT_LAYER, OCR_MAX_PAGES_PARTIAL, PDF_OCR_SETTING_KEY,
  cleanOcrText, getPdfOcrEnabled, hasNoTextLayer, planOcrPages, runOcrPages, setPdfOcrEnabled, type OcrLane,
} from './pdfOcr';
import { applyOcrText, extractPageMap, pageMarker, type PageStart } from './pageMarkers';
import { countImageOps, pageNeedsOcr } from '../lib/pdf/readingOrder';

const pg = (page: number, needsOcr = false): PageStart => ({ offset: page * 10, page, ...(needsOcr ? { needsOcr } : {}) });

describe('pageNeedsOcr / countImageOps (pure)', () => {
  it('needs OCR only for empty/very short text WITH images', () => {
    expect(pageNeedsOcr({ text: '', imageCount: 1 })).toBe(true);
    expect(pageNeedsOcr({ text: 'Fig 3', imageCount: 2 })).toBe(true);
    expect(pageNeedsOcr({ text: '', imageCount: 0 })).toBe(false); // pagină goală, nu scanare
    expect(pageNeedsOcr({ text: 'Hipertensiunea arterială este o boală frecventă.', imageCount: 3 })).toBe(false);
    expect(pageNeedsOcr({ text: '' })).toBe(false);
  });
  it('counts only image operators', () => {
    const OPS = { paintImageXObject: 85, paintInlineImageXObject: 86, paintImageMaskXObject: 83, save: 10 };
    expect(countImageOps({ fnArray: [10, 85, 85, 86, 12] }, OPS)).toBe(3);
    expect(countImageOps(null, OPS)).toBe(0);
  });
});

describe('page markers carry needsOcr', () => {
  it('round-trips the flag, with and without printed page', () => {
    const raw = pageMarker(1, 100) + 'a' + pageMarker(2, undefined, true) + 'b' + pageMarker(3, 102, true) + 'c';
    const { text, pages } = extractPageMap(raw);
    expect(text).toBe('abc');
    expect(pages).toEqual([
      { offset: 0, page: 1, printedPage: 100 },
      { offset: 1, page: 2, needsOcr: true },
      { offset: 2, page: 3, printedPage: 102, needsOcr: true },
    ]);
  });
});

describe('applyOcrText', () => {
  it('replaces only the OCR-ed pages and recomputes offsets', () => {
    const raw = pageMarker(1) + 'text bun\n' + pageMarker(2, undefined, true) + '\n' + pageMarker(3) + 'alt text\n';
    const { text, pages } = extractPageMap(raw);
    const res = applyOcrText(text, pages, new Map([[2, '  text din OCR  ']]));
    expect(res.text).toBe('text bun\ntext din OCR\nalt text\n');
    const at = (n: number) => res.pages.find((p) => p.page === n)!;
    expect(res.text.slice(at(2).offset, at(2).offset + 5)).toBe('text ');
    expect(res.text.slice(at(3).offset, at(3).offset + 3)).toBe('alt');
    expect(at(2).needsOcr).toBeUndefined();
  });
  it('keeps the flag for pages with no (or empty) OCR result', () => {
    const { text, pages } = extractPageMap(pageMarker(1, undefined, true) + 'x' + pageMarker(2, undefined, true) + 'y');
    const res = applyOcrText(text, pages, new Map([[1, '   ']]));
    expect(res.text).toBe(text);
    expect(res.pages.every((p) => p.needsOcr)).toBe(true);
  });
});

describe('planOcrPages / hasNoTextLayer', () => {
  const pages = Array.from({ length: 100 }, (_, i) => pg(i + 1, i % 2 === 0));
  it('is OFF by default: nothing planned when the setting is off and the document has text', () => {
    expect(planOcrPages(pages, { enabled: false, noTextLayer: false })).toEqual([]);
  });
  it('setting on: only flagged pages, capped', () => {
    const plan = planOcrPages(pages, { enabled: true, noTextLayer: false });
    expect(plan).toHaveLength(50); // 50 pagini marcate din 100, sub plafonul de OCR_MAX_PAGES_PARTIAL
    expect(OCR_MAX_PAGES_PARTIAL).toBeGreaterThanOrEqual(50);
    expect(plan.every((n) => n % 2 === 1)).toBe(true);
    expect(planOcrPages(pages, { enabled: true, noTextLayer: false, maxPages: 3 })).toEqual([1, 3, 5]);
  });
  it('no text layer: runs even with the setting off, with the larger cap; all pages if none were flagged', () => {
    const big = Array.from({ length: 500 }, (_, i) => pg(i + 1, true));
    expect(planOcrPages(big, { enabled: false, noTextLayer: true })).toHaveLength(OCR_MAX_PAGES_NO_TEXT_LAYER);
    expect(planOcrPages([pg(1), pg(2)], { enabled: false, noTextLayer: true })).toEqual([1, 2]);
  });
  it('detects a document with no text layer', () => {
    expect(hasNoTextLayer('  \n ', [pg(1), pg(2)])).toBe(true);
    expect(hasNoTextLayer('Un text real de mai multe cuvinte '.repeat(10), [pg(1), pg(2)])).toBe(false);
    expect(hasNoTextLayer('', [])).toBe(false);
  });
});

describe('runOcrPages', () => {
  const lane = (impl: (p: number) => Promise<string>, disposed: number[] = []): OcrLane => ({
    process: impl,
    dispose: () => { disposed.push(1); },
  });

  it('never exceeds the concurrency limit, collects results, disposes every lane', async () => {
    let active = 0;
    let peak = 0;
    const disposed: number[] = [];
    const progress: number[] = [];
    const res = await runOcrPages({
      pages: [1, 2, 3, 4, 5, 6, 7],
      concurrency: 2,
      createLane: async () => lane(async (p) => {
        active += 1; peak = Math.max(peak, active);
        await Promise.resolve(); await Promise.resolve();
        active -= 1;
        return `pagina ${p}`;
      }, disposed),
      onProgress: (d) => progress.push(d),
    });
    expect(peak).toBe(2);
    expect(res.size).toBe(7);
    expect(res.get(4)).toBe('pagina 4');
    expect(disposed).toHaveLength(2);
    expect(progress[progress.length - 1]).toBe(7);
  });

  it('skips pages that fail or return nothing instead of failing the document', async () => {
    const res = await runOcrPages({
      pages: [1, 2, 3],
      createLane: async () => lane(async (p) => { if (p === 2) throw new Error('canvas'); return p === 3 ? '  ' : 'ok'; }),
    });
    expect([...res.keys()]).toEqual([1]);
  });

  it('abort stops the queue and still disposes lanes', async () => {
    const controller = new AbortController();
    const disposed: number[] = [];
    const seen: number[] = [];
    await expect(runOcrPages({
      pages: [1, 2, 3, 4, 5, 6],
      concurrency: 1,
      signal: controller.signal,
      createLane: async () => lane(async (p) => { seen.push(p); if (p === 2) controller.abort(); return 'x'; }, disposed),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toEqual([1, 2]);
    expect(disposed).toHaveLength(1);
  });

  it('does nothing (and creates no lanes) for an empty plan', async () => {
    const createLane = vi.fn();
    expect((await runOcrPages({ pages: [], createLane })).size).toBe(0);
    expect(createLane).not.toHaveBeenCalled();
  });
});

describe('setting + cleaning', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('defaults to OFF and persists', () => {
    expect(getPdfOcrEnabled()).toBe(false);
    setPdfOcrEnabled(true);
    expect(localStorage.getItem(PDF_OCR_SETTING_KEY)).toBe('1');
    expect(getPdfOcrEnabled()).toBe(true);
  });
  it('is OFF if storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getPdfOcrEnabled()).toBe(false);
  });
  it('cleans OCR output', () => {
    expect(cleanOcrText('a\u0001b   c\r\n\n\n\nd ')).toBe('a b c\n\nd');
  });
});
