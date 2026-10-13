import { describe, expect, it } from 'vitest';
import { buildNumberedContext, parseInlineCitations, truncateAtBoundary } from './contextBuilder';
import { contextCharsForTokens, normalizeContextProse } from './contextBudget';
import { estimateTextTokens } from '../lib/ai/tokenBudget';

const chunk = { id: 'first', source: 'Carte.pdf', sourceId: 'book', page: 12, text: 'Doza recomandată este 5 mg. Nu se administrează în sarcină.' };

describe('safe context reduction', () => {
  it('reduces prose whitespace and exact repeated citations without mutating input', () => {
    const padded = { ...chunk, text: chunk.text.replaceAll(' ', '    ') };
    const inputs = [padded, { ...chunk, id: 'reindexed' }];
    const original = structuredClone(inputs);
    const result = buildNumberedContext(inputs, 2000);
    const baseline = buildNumberedContext([{ ...padded, text: `\`${padded.text}\`` }], 2000);
    expect(result.sources.map(s => s.id)).toEqual(['first']);
    expect(result.context).toContain(chunk.text);
    expect(estimateTextTokens(result.context)).toBeLessThan(estimateTextTokens(baseline.context));
    expect(inputs).toEqual(original);
    expect(buildNumberedContext(inputs, 2000)).toEqual(result);
  });

  it('retains each distinct citation even with identical text', () => {
    const result = buildNumberedContext([
      chunk,
      { ...chunk, id: 'page', page: 13 },
      { ...chunk, id: 'source', sourceId: 'other', source: 'Altă carte.pdf' },
      { ...chunk, id: 'printed', printedPage: 100 },
      { ...chunk, id: 'range', pageEnd: 14 },
    ], 3000);
    expect(result.sources).toHaveLength(5);
    expect(result.sources[3].label).toBe('Carte, p. 100');
    expect(result.sources[4].label).toBe('Carte, p. 12–14');
    const cites = parseInlineCitations('[1-5]', result.sources);
    expect(cites[0]).toMatchObject({ type: 'cite', sources: result.sources });
  });

  it('preserves small but material differences that fuzzy matching would remove', () => {
    const result = buildNumberedContext([
      chunk,
      { ...chunk, id: 'dose', text: chunk.text.replace('5 mg', '10 mg') },
      { ...chunk, id: 'negation', text: chunk.text.replace('Nu se', 'Se') },
      { ...chunk, id: 'suffix', text: `${chunk.text} Excepție: numai la indicația specialistului.` },
    ], 3000);
    expect(result.sources).toHaveLength(4);
    expect(result.context).toContain('10 mg');
    expect(result.context).toContain('Se administrează în sarcină.');
    expect(result.context).toContain('Excepție: numai la indicația specialistului.');
  });

  it.each([
    'A  B\nC  D', 'A\tB', '```\n  code  here\n```', '| A  | B |',
    '  indented\n    code', 'A  **bold**', '$a  b$', '<pre>A  B</pre>', 'A\u00a0 B',
  ])('preserves structured text: %s', text => {
    expect(normalizeContextProse(text)).toBe(text.trim());
    expect(buildNumberedContext([{ ...chunk, text }], 2000).context).toContain(text.trim());
  });

  it('keeps the complete next fragment when the first cannot fit', () => {
    const result = buildNumberedContext([{ ...chunk, text: 'Long sentence. '.repeat(200) }, { ...chunk, id: 'short', text: 'Exact fact.' }], 300);
    expect(result.sources.map(s => s.id)).toEqual(['short']);
    expect(result.context).toContain('Exact fact.');
  });

  it('honors tiny, fractional, invalid and zero budgets including fallback', () => {
    for (const limit of [0, 1, 190, 205, 250, 301.9, 500]) {
      const result = buildNumberedContext([{ ...chunk, text: 'x'.repeat(2000) }], limit);
      expect(result.context.length).toBeLessThanOrEqual(Math.floor(limit));
    }
    for (const limit of [0, -1, NaN]) {
      expect(buildNumberedContext([chunk], 2000, limit)).toEqual({ context: '', sources: [] });
    }
    expect(buildNumberedContext([chunk], NaN).context).toBe('');
    for (const limit of [1, 2, 50]) expect(truncateAtBoundary('x'.repeat(100), limit).length).toBeLessThanOrEqual(limit);
  });

  it('uses the shared token estimate for context sizes', () => {
    expect(contextCharsForTokens(100)).toBe(320);
    expect(contextCharsForTokens(NaN)).toBe(0);
  });
});
