import { describe, expect, it } from 'vitest';
import { parseCsvFlashcards } from './csvCards';

const texts = (csv: string) => parseCsvFlashcards(csv).map((q) => ({ front: q.text, back: q.options.find((o) => o.isCorrect)?.text }));

describe('parseCsvFlashcards', () => {
  it('skips a header row', () => {
    expect(texts('Față,Spate\nA,B\nC,D')).toEqual([
      { front: 'A', back: 'B' },
      { front: 'C', back: 'D' },
    ]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(texts('"Valve, tipuri","Mitrală, aortică"')).toEqual([{ front: 'Valve, tipuri', back: 'Mitrală, aortică' }]);
  });

  it('keeps line breaks inside a quoted field', () => {
    const [card] = texts('Termen,"linia 1\nlinia 2"');
    expect(card.front).toBe('Termen');
    expect(card.back).toBe('linia 1\nlinia 2');
  });

  it('unescapes doubled quotes', () => {
    expect(texts('"Semn ""Murphy""",colecistită')).toEqual([{ front: 'Semn "Murphy"', back: 'colecistită' }]);
  });

  it('accepts semicolons and tabs, CRLF and comments', () => {
    expect(texts('# comentariu\r\nA;B\r\nC;D')).toHaveLength(2);
    expect(texts('A\tB')).toEqual([{ front: 'A', back: 'B' }]);
  });

  it('rejects empty input', () => {
    expect(() => parseCsvFlashcards('# doar comentariu')).toThrow();
    expect(() => parseCsvFlashcards('singur')).toThrow();
  });
});

describe('parseCsvFlashcardsDetailed', () => {
  it('numără liniile omise', async () => {
    const { parseCsvFlashcardsDetailed } = await import('./csvCards');
    const r = parseCsvFlashcardsDetailed('a;b\nlinie fără separator\nc,d\ne;f');
    expect(r.questions).toHaveLength(2);
    expect(r.skipped).toBe(2);
  });
});
