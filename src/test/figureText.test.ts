import { describe, expect, it } from 'vitest';
import { cleanFigureText, dropReplacementChars, wordFrequency } from '../../scripts/lib/figureText.mjs';
import extra from '../data/rezidentiat/library/lawrence.extra.json';

const BAD = String.fromCharCode(0xfffd);
const pages = Object.entries(extra as Record<string, string>);

describe('paginile Lawrence din afara PDF-ului (lawrence.extra.json)', () => {
  it('nicio pagină cu U+FFFD sau cu rânduri doar de punctuație; toate cele 69 au text', () => {
    expect(pages).toHaveLength(69);
    for (const [printed, text] of pages) {
      expect(text.includes(BAD), `pagina ${printed}`).toBe(false);
      const punctuationOnly = text.split('\n').filter((line) => line.trim() && !/[\p{L}\p{N}]/u.test(line));
      expect(punctuationOnly, `pagina ${printed}`).toEqual([]);
      expect(text.trim().length, `pagina ${printed}`).toBeGreaterThan(50);
    }
  });

  it('fără săgeți OCR („...--..+---------”) în etichetele figurilor', () => {
    for (const [printed, text] of pages) expect(/-{4,}|\.{4,}/.test(text), `pagina ${printed}`).toBe(false);
  });

  it('etichetele figurii de la pagina tipărită 146 sunt curate', () => {
    const text = (extra as Record<string, string>)['146'];
    expect(text).toContain('Ganglionii subcarinali');
    expect(text).toContain('Ganglionii trunchiului celiac');
    expect(text).toContain('Figurai 2-6. Drenajul limfatic al esofagului.');
  });
});

describe('cleanFigureText', () => {
  const freq = wordFrequency(['Ganglionii subcarinali sondă duoden cm de și în la', 'Ganglionii subcarinali sondă duoden']);

  it('scoate săgețile, capetele lor și caracterele stricate; lipește eticheta ruptă evidentă', () => {
    const page = ['+-,,...,..l""\'"-,.------- Ganglionii', 'subcarinali', `at${BAD}${BAD}N--------- `, '/4=::::-41 cm', 'sondă ----L--!'].join('\n\n');
    expect(cleanFigureText(page, freq)).toBe(['Ganglionii subcarinali', '41 cm', 'sondă'].join('\n\n'));
  });

  it('nu lipește etichetele când gruparea e ambiguă', () => {
    expect(cleanFigureText('Ganglionii\n\ninterni\n\nparaesofagieni\n\nsuperiori', freq)).toBe('Ganglionii\n\ninterni\n\nparaesofagieni\n\nsuperiori');
  });

  it('proza rămâne neatinsă; o literă pierdută nu e ghicită', () => {
    const prose = 'Pirozisul este senzația de arsură resimțită retrosternal (vezi Figura 12-3), până la nivel cervical.';
    expect(cleanFigureText(prose, freq)).toBe(prose);
    expect(dropReplacementChars(`frecv${BAD}nță cardiacă`)).toBe('frecvnță cardiacă');
    expect(dropReplacementChars(`## C${BAD}Trunchi tirocervical`)).toBe('## C Trunchi tirocervical');
  });

  it('variantele de grilă, titlurile și numerele din tabele rămân', () => {
    const page = '- A. Spironolactona\n\n## A B\n\n>9\n\n1. Răspuns: C';
    expect(cleanFigureText(page, freq)).toBe(page);
  });

  it('e idempotentă', () => {
    const once = cleanFigureText((extra as Record<string, string>)['149'], freq);
    expect(cleanFigureText(once, freq)).toBe(once);
  });
});
