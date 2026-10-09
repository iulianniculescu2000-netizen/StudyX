// @ts-expect-error -- tipurile node nu fac parte din tsconfig.app; testul rulează sub Node
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { DocumentProcessor } from './documentProcessor';

const proc = new DocumentProcessor();
const prose = (marker: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${marker} propoziția ${i} descrie tratamentul și diagnosticul pacientului cu simptome persistente.`).join('\n');

async function headingsOf(text: string, known?: string[]) {
  const { chunks } = await proc.processDocument(text, 'Carte.pdf', known ? { knownHeadings: known } : undefined);
  return [...new Set(chunks.map((c) => c.metadata.heading))];
}

describe('text normalisation and statistics', () => {
  it('normalises CRLF, tabs, runs of spaces and blank lines but keeps paragraph breaks', async () => {
    const doc = await proc.processDocument('  Linia întâi \t cu   spații\r\n\r\n\r\n\r\nPărerea a doua ț  \r\n', 'n.txt');
    expect(doc.content).toBe('Linia întâi cu spații\n\nPărerea a doua ț');
    expect(doc.statistics).toMatchObject({ totalChars: doc.content.length, totalWords: 8, totalChunks: 1 });
    expect(doc.name).toBe('n.txt');
    expect(doc.id).toMatch(/^doc_\d+_[a-z0-9]+$/);
  });

  it('gives deterministic chunk ids and offsets for a small document', async () => {
    const text = [prose('A', 12), '', prose('B', 12)].join('\n');
    const { chunks } = await proc.processDocument(text, 'src', { chunkSize: 500, overlap: 50, minChunkLength: 50 });
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => `src-chunk-${i}`));
    let running = 0;
    for (const c of chunks) {
      expect(c.metadata.startIndex).toBe(running);
      expect(c.metadata.endIndex).toBe(running + c.text.length);
      expect(c.metadata.charCount).toBe(c.text.length);
      expect(c.metadata.wordCount).toBe(c.text.split(/\s+/).length);
      running += c.text.length;
    }
  });
});

describe('known headings (diacritics, wrapping, squashed glyphs)', () => {
  it('matches ASCII text against diacritic chapter titles and files under the canonical title', async () => {
    const text = ['Cuprins', 'AFECTIUNI GINECOLOGICE SI MAMARE', prose('G', 15), 'ȘOC ȘI RESUSCITARE', prose('S', 15)].join('\n');
    const heads = await headingsOf(text, ['AFECȚIUNI GINECOLOGICE ȘI MAMARE', 'ȘOC ȘI RESUSCITARE']);
    expect(heads).toContain('AFECȚIUNI GINECOLOGICE ȘI MAMARE');
    expect(heads).toContain('ȘOC ȘI RESUSCITARE');
  });

  it('repairs a title the extractor split mid-word, in order, and ignores unrelated lines', async () => {
    const title = 'AFECȚIUNI GINECOLOGICE ȘI MAMARE';
    const heads = await headingsOf(['AFECTIUNI LE GINECOLOGICE SI MAMA RE', prose('G', 15), 'GINECOLOGICE si altele', prose('X', 3)].join('\n'), [title]);
    expect(heads).toEqual([title]);
  });

  it('falls back to the generic heuristic when no known heading occurs in the text', async () => {
    const heads = await headingsOf(['CAPITOLUL UNU AL CARTII', prose('G', 15)].join('\n'), ['NEFROLOGIE', 'ENDOCRINOLOGIE']);
    expect(heads).toEqual(['CAPITOLUL UNU AL CARTII']);
  });

  it('does not treat a long sentence containing the title as a heading', async () => {
    const long = `Aceasta este o propoziție foarte lungă despre NEFROLOGIE care continuă mult peste limita de o sută douăzeci de caractere ca să nu fie titlu.`;
    expect(long.length).toBeGreaterThan(120);
    const heads = await headingsOf([long, 'NEFROLOGIE', prose('N', 10)].join('\n'), ['NEFROLOGIE']);
    expect(heads.filter(Boolean)).toEqual(['NEFROLOGIE']);
  });
});

describe('generic heading heuristic', () => {
  it.each([
    ['CARDIOLOGIE', true],
    ['Capitolul 4', true],
    ['Secțiunea II', true],
    ['1.2 Hipertensiune arterială', true],
    ['1.2 Diagnostic diferențial', false],
    ['3. Tratament', false],
    ['Tratament', false],
    ['TRATAMENT', false],
    ['Etiologie', false],
    ['2. Etiologie = infecție virală', false],
    ['3. Cel mai frecvent defect cardiac congenital', false],
    ['D E R M AT O L O G I E', false],
    ['----LH', false],
    ['Aceasta e o propoziție.', false],
    ['AB', false],
  ])('classifies %j as heading=%s', async (line, expected) => {
    const text = [prose('înainte', 6), line, prose('după', 6)].join('\n');
    const heads = (await headingsOf(text)).filter(Boolean);
    expect(heads.length > 0).toBe(expected);
  });

  it('merges a two-line wrapped ALL-CAPS title into one heading', async () => {
    const heads = (await headingsOf([prose('x', 5), 'PACIENTUL CU', 'DISFUNCȚIE RENALĂ', prose('y', 10)].join('\n'))).filter(Boolean);
    expect(heads).toEqual(['PACIENTUL CU DISFUNCȚIE RENALĂ']);
  });
});

describe('chunk sizing', () => {
  it('splits an oversized paragraph on sentence boundaries without losing text', async () => {
    const para = Array.from({ length: 80 }, (_, i) => `Propoziția numărul ${i} despre ficat.`).join(' ');
    const { chunks, content } = await proc.processDocument(para, 'p', { chunkSize: 300, overlap: 0, minChunkLength: 10 });
    expect(chunks.length).toBeGreaterThan(5);
    chunks.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(300));
    expect(chunks.map((c) => c.text).join(' ').replace(/\s+/g, ' ')).toBe(content.replace(/\s+/g, ' '));
  });

  it('hard-splits a single unbroken token', async () => {
    const { chunks } = await proc.processDocument('x'.repeat(1000), 'p', { chunkSize: 300, overlap: 0 });
    expect(chunks.map((c) => c.text.length)).toEqual([300, 300, 300, 100]);
  });

  it('simple (non-structural) chunking overlaps consecutive chunks and covers the whole text', async () => {
    const text = 'abcdefghij'.repeat(100);
    const { chunks } = await proc.processDocument(text, 'p', { preserveStructure: false, chunkSize: 300, overlap: 50 });
    expect(chunks[0].text).toHaveLength(300);
    expect(chunks[1].text.slice(0, 50)).toBe(chunks[0].text.slice(-50));
    expect(chunks[chunks.length - 1].text.endsWith(text.slice(-10))).toBe(true);
  });

  it('empty input yields no chunks and validateDocument reports it', async () => {
    const doc = await proc.processDocument('   \n ', 'e');
    expect(doc.chunks).toEqual([]);
    expect(proc.validateDocument(doc)).toEqual({ isValid: false, errors: ['Document content is empty', 'No chunks were created'] });
  });
});

describe('large documents (2 MB)', () => {
  function bigBook() {
    const word = (i: number) => Array.from({ length: 8 }, (_, j) => String.fromCharCode(65 + ((i * 7 + j * 3 + (i >> 2)) % 26))).join('');
    const heads = Array.from({ length: 40 }, (_, i) => `SPECIALITATEA ${word(i)} DIN CARTE`);
    const para = 'Insuficiența cardiacă este o afecțiune frecventă. Tratamentul include diuretice și IECA, urmărind simptomele pacientului.';
    let text = '';
    for (let k = 0; text.length < 2_000_000; k += 1) {
      if (k % 60 === 0) text += `${heads[(k / 60) % 40]}\n`;
      text += `${para} linia ${k}\n`;
    }
    return { text, heads };
  }

  it('chunks with a curated chapter list, quickly, keeping every chapter and all text', async () => {
    const { text, heads } = bigBook();
    const start = Date.now();
    const doc = await proc.processDocument(text, 'big.pdf', { knownHeadings: heads });
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(new Set(doc.chunks.map((c) => c.metadata.heading))).toEqual(new Set(heads));
    expect(proc.validateDocument(doc).errors).toEqual([]);
    expect(createHash('md5').update(doc.chunks.map((c) => c.metadata.heading + '|' + c.text.length).join(',')).digest('hex')).toHaveLength(32);
  });

  it('stays fast with a 150-chapter curriculum and short book lines (was ~6s)', async () => {
    const word = (i: number) => Array.from({ length: 8 }, (_, j) => String.fromCharCode(65 + ((i * 7 + j * 3 + (i >> 2)) % 26))).join('');
    const heads = Array.from({ length: 150 }, (_, i) => `SPECIALITATEA ${word(i)} DIN CARTE`);
    let text = '';
    for (let k = 0; text.length < 2_000_000; k += 1) {
      if (k % 60 === 0) text += `${heads[(k / 60) % 150]}\n`;
      text += `Insuficiența cardiacă este frecventă. Tratamentul include diuretice și IECA linia ${k}\n`;
    }
    const start = Date.now();
    const doc = await proc.processDocument(text, 'big.pdf', { knownHeadings: heads });
    expect(Date.now() - start).toBeLessThan(4000);
    expect(new Set(doc.chunks.map((c) => c.metadata.heading))).toEqual(new Set(heads));
  });

  it('chunks with the generic heuristic, quickly', async () => {
    const { text } = bigBook();
    const start = Date.now();
    const doc = await proc.processDocument(text, 'big.pdf');
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(doc.chunks.length).toBeGreaterThan(1000);
    expect(proc.validateDocument(doc).errors).toEqual([]);
  });
});

describe('validateDocument content-loss check', () => {
  const realLike = [
    'CAPITOLUL 12 INSUFICIENȚA CARDIACĂ',
    ...Array.from({ length: 30 }, (_, i) => `Pacientul ${i} prezintă dispnee de efort, edeme gambiere și oboseală. Tratamentul include diuretice de ansă, IECA și beta-blocante conform ghidului.`),
    '| Medicament | Doza | Observații |\n| Furosemid | 40 mg | dimineața |\n| Enalapril | 10 mg | de două ori pe zi |',
    '- Restricție de sare\n- Monitorizarea greutății zilnice\n- Control cardiologic la 3 luni',
  ].join('\n\n');

  it('does not flag overlap-inflated chunks of a multi-chunk document as content loss', async () => {
    const doc = await proc.processDocument(realLike.repeat(3), 'Carte.pdf');
    expect(doc.chunks.length).toBeGreaterThan(2);
    expect(proc.validateDocument(doc).errors).toEqual([]);
  });

  it('still flags a document whose chunks really lost text', async () => {
    const doc = await proc.processDocument(realLike.repeat(3), 'Carte.pdf');
    const broken = { ...doc, chunks: doc.chunks.slice(0, 1), statistics: { ...doc.statistics, totalChunks: 1 } };
    expect(proc.validateDocument(broken).errors).toContain('Significant content loss detected during chunking');
  });
});
