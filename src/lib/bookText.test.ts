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
});
