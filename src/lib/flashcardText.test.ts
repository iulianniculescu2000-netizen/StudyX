import { describe, expect, it } from 'vitest';
import { cleanFlashcardText, normalizeRomanianDiacritics, stripInlineMarkdown } from './flashcardText';

describe('normalizeRomanianDiacritics', () => {
  it('turns cedilla s/t into comma-below s/t, both cases', () => {
    expect(normalizeRomanianDiacritics('şi ţine Şcoala Ţării')).toBe('și ține Școala Țării');
  });

  it('composes a base letter plus combining cedilla', () => {
    expect(normalizeRomanianDiacritics('şi ţine')).toBe('și ține');
  });

  it('leaves correct text and other letters alone', () => {
    expect(normalizeRomanianDiacritics('înțelegere ăâî ș ț')).toBe('înțelegere ăâî ș ț');
  });
});

describe('stripInlineMarkdown', () => {
  it('removes bold markers and keeps the words', () => {
    expect(stripInlineMarkdown('subliniat **dieta, masajul** și băile')).toBe('subliniat dieta, masajul și băile');
    expect(stripInlineMarkdown('__termen__ important')).toBe('termen important');
  });

  it('removes an unpaired marker left by a cut-off answer', () => {
    expect(stripInlineMarkdown('se axează pe **aplicarea factorilor fizici...')).toBe('se axează pe aplicarea factorilor fizici...');
  });

  it('leaves fill-in blanks and maths alone', () => {
    expect(stripInlineMarkdown('K+ normal este ____ mEq/L')).toBe('K+ normal este ____ mEq/L');
    expect(stripInlineMarkdown('___ si ______')).toBe('___ si ______');
    expect(stripInlineMarkdown('x**2 + y**2 = 5 **')).toBe('x**2 + y**2 = 5 **');
    expect(stripInlineMarkdown('**')).toBe('**');
  });

  it('keeps single asterisks and underscores', () => {
    expect(stripInlineMarkdown('p < 0,05* și snake_case')).toBe('p < 0,05* și snake_case');
  });
});

describe('cleanFlashcardText', () => {
  it('fixes both problems in one pass', () => {
    expect(cleanFlashcardText('**intervenţii fizice** şi exerciţii')).toBe('intervenții fizice și exerciții');
  });
});
