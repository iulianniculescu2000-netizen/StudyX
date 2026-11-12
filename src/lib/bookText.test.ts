import { describe, expect, it } from 'vitest';
import { pageHoldingExcerpt } from './bookText';


describe('bundledBookText (cărțile incluse, pentru indexarea în chat)', () => {
  it('întoarce textul fragmentelor structurate, predate indexării gata făcute', async () => {
    const { bundledBookText } = await import('./bookText');
    const { takePrebuiltChunks, PAGE_MARK } = await import('../ai/pageMarkers');
    const text = await bundledBookText('S');
    expect(text).not.toContain(PAGE_MARK);
    expect(text).toBe(text.trim());
    const chunks = takePrebuiltChunks(text);
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(300);
    expect(chunks!.every((chunk) => typeof chunk.page === 'number' && chunk.page >= 1 && chunk.page <= 118)).toBe(true);
    // id-urile sunt cele ale indexării obișnuite: `<nume>-chunk-<n>`, în ordine (căutarea leagă fragmentele vecine prin ele)
    expect(chunks!.map((chunk) => chunk.id)).toEqual(chunks!.map((_, i) => `Sinopsis de medicină.pdf-chunk-${i}`));
    // o singură dată: a doua cerere nu mai găsește nimic
    expect(takePrebuiltChunks(text)).toBeNull();
  }, 30000);

  it('fragmentul are pagina din PDF, titlul din carte și text curat (diacritice corecte)', async () => {
    const { bundledBookText } = await import('./bookText');
    const { takePrebuiltChunks } = await import('../ai/pageMarkers');
    const text = await bundledBookText('K');
    const chunks = takePrebuiltChunks(text)!;
    const iron = chunks.find((chunk) => chunk.text.includes('sulfatul feros'))!;
    expect(iron.page).toBe(57);
    const psa = chunks.find((chunk) => chunk.heading?.includes('Artrita psoriazică ›') && /Tratament/.test(chunk.heading))!;
    expect(psa.page).toBe(80);
    expect(psa.text).toContain('Se evită folosirea hidroxiclorochinei');
    expect(psa.chapter).toBe('Reumatologie');
    expect(text).not.toMatch(/funeție|pentrn|[şţ]/);
  }, 60000);

  it('Lawrence: cele 69 de pagini din folder, lipsă din PDF, intră în căutare după paginile PDF-ului, cu pagina tipărită', async () => {
    const { bundledBookText, loadBookPages } = await import('./bookText');
    const { takePrebuiltChunks } = await import('../ai/pageMarkers');
    const base = (await loadBookPages('L')).length;
    const text = await bundledBookText('L');
    const chunks = takePrebuiltChunks(text)!;
    expect(base).toBe(345);
    const extra = chunks.filter((chunk) => typeof chunk.printedPage === 'number');
    expect(new Set(extra.map((chunk) => chunk.page)).size).toBe(69);
    expect(extra[0]).toMatchObject({ page: base + 1, printedPage: 13 });
    expect(text).toContain('Pagina tipărită 143 (nu e în PDF-ul din aplicație)');
    // paginile PDF-ului rămân exact aceleași
    expect(chunks.filter((chunk) => chunk.printedPage === undefined).every((chunk) => chunk.page! >= 1 && chunk.page! <= base)).toBe(true);
    // textul din Lawrence nu mai are punctele OCR în cuvinte („h·aumei”, „penh·u”)
    expect(text).not.toMatch(/h·aumei|penh·u|h·ebuie/);
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

describe('pageHoldingExcerpt', () => {
  const pages = ['Introducere în artrite și alte boli.', 'Metotrexatul este tratamentul de fond de referință în poliartrita reumatoidă.', 'Alte medicamente.'];
  it('alege pagina din interval care conține textul', () => {
    expect(pageHoldingExcerpt(pages, 1, 3, 'tratamentul de fond de referință în poliartrita')).toBe(2);
  });
  it('rămâne la prima pagină fără potrivire sau fără interval', () => {
    expect(pageHoldingExcerpt(pages, 1, 3, 'text care nu apare nicăieri aici')).toBe(1);
    expect(pageHoldingExcerpt(pages, 2, 2, 'tratamentul de fond de referință')).toBe(2);
  });
});
