import { describe, expect, it } from 'vitest';


describe('bundledBookText (cărțile incluse, pentru indexarea în chat)', () => {
  it('întoarce text curat, fără marcaje, cu harta paginilor predată indexării', async () => {
    const { bundledBookText } = await import('./bookText');
    const { takePageMap, PAGE_MARK } = await import('../ai/pageMarkers');
    const text = await bundledBookText('S');
    expect(text).not.toContain(PAGE_MARK);
    expect(text).toBe(text.trim());
    const pages = takePageMap(text);
    expect(pages).not.toBeNull();
    expect(pages!.length).toBe(118);
    expect(pages![0]).toMatchObject({ page: 1, offset: 0 });
    expect(pages!.every((page, i) => i === 0 || page.offset > pages![i - 1].offset)).toBe(true);
  }, 30000);

  it('fragmentele primesc pagina din PDF și conțin text curat (diacritice corecte)', async () => {
    const { bundledBookText } = await import('./bookText');
    const { takePageMap, assignPagesToChunks } = await import('../ai/pageMarkers');
    const text = await bundledBookText('K');
    const map = takePageMap(text)!;
    const at = text.indexOf('sulfatul feros');
    expect(at).toBeGreaterThan(0);
    const [chunk] = assignPagesToChunks(text, [{ id: 'c', text: text.slice(at - 200, at + 300), startOffset: at - 200, endOffset: at + 300 } as never], map);
    expect(chunk).toMatchObject({ page: 57 });
    expect(text).not.toMatch(/funeție|pentrn|[şţ]/);
  }, 60000);

  it('Lawrence: cele 69 de pagini din folder, lipsă din PDF, intră în căutare după paginile PDF-ului, cu pagina tipărită', async () => {
    const { bundledBookText, loadBookPages } = await import('./bookText');
    const { takePageMap } = await import('../ai/pageMarkers');
    const base = (await loadBookPages('L')).length;
    const text = await bundledBookText('L');
    const map = takePageMap(text)!;
    expect(base).toBe(345);
    expect(map.length).toBe(base + 69);
    expect(map[base]).toMatchObject({ page: base + 1, printedPage: 13 });
    expect(text).toContain('Pagina tipărită 143 (nu e în PDF-ul din aplicație)');
    // paginile PDF-ului rămân exact aceleași, în aceeași ordine
    expect(map.slice(0, base).every((entry, i) => entry.page === i + 1 && !('printedPage' in entry))).toBe(true);
  }, 60000);

  it('extraPageAt: pagina citată peste PDF e pagina din folder cu numărul tipărit; paginile PDF-ului nu sunt „extra”', async () => {
    const { extraPageAt } = await import('./bookText');
    await expect(extraPageAt('L', 345)).resolves.toBeNull();
    await expect(extraPageAt('L', 346)).resolves.toMatchObject({ printed: 13 });
    expect((await extraPageAt('L', 346))!.text.trim().length).toBeGreaterThan(50);
    await expect(extraPageAt('L', 345 + 69 + 1)).resolves.toBeNull();
    await expect(extraPageAt('K', 9999)).resolves.toBeNull();
  }, 60000);
});
