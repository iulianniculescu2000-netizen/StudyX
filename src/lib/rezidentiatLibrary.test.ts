import { describe, expect, it } from 'vitest';
import { isBundledLibraryBookName, REZIDENTIAT_LIBRARY_BOOKS } from './rezidentiatLibrary';

describe('cărți incluse în aplicație', () => {
  it('recunoaște numele cărților din bibliotecă și nimic altceva', () => {
    for (const book of REZIDENTIAT_LIBRARY_BOOKS) expect(isBundledLibraryBookName(book.name)).toBe(true);
    expect(isBundledLibraryBookName('Altă carte.pdf')).toBe(false);
  });
});
