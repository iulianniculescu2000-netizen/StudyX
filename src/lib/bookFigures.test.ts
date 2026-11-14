import { describe, expect, it } from 'vitest';
import { FIGURE_TEXT_LABEL, bundledBookText, loadBookPages } from './bookText';
import figures from '../data/rezidentiat/library/figures.json';

const data = figures as Record<string, Record<string, string>>;

describe('text din figuri și casete, adăugat din proiectul Grile rezidențiat', () => {
  it('are completări pentru toate cele trei cărți, fără filigran și fără resturi', () => {
    for (const code of ['K', 'L', 'S']) {
      expect(Object.keys(data[code]).length, code).toBeGreaterThan(30);
      for (const [page, text] of Object.entries(data[code])) {
        expect(/rezidentiat|grile rezi/i.test(text), `${code} p.${page}`).toBe(false);
        expect(text.includes('\u0163') || text.includes('\u015f'), `${code} p.${page}: cedilă`).toBe(false);
        expect(text.trim().length, `${code} p.${page}`).toBeGreaterThan(10);
      }
    }
  });

  it('se lipesc la finalul paginii, sub marcaj; paginile fără completări rămân neatinse', async () => {
    const pages = await loadBookPages('K');
    const withFigures = Number(Object.keys(data.K)[0]);
    expect(pages[withFigures - 1]).toContain(`${FIGURE_TEXT_LABEL}\n${data.K[String(withFigures)]}`);
    const plain = pages.findIndex((_, i) => !data.K[String(i + 1)]);
    expect(pages[plain]).not.toContain(FIGURE_TEXT_LABEL);
  });

  it('ajung și în textul indexat pentru chat și căutare', async () => {
    const text = await bundledBookText('K');
    expect(text).toContain('Cefuroxim oral');
  });
});
