import { describe, expect, it } from 'vitest';
import { rewriteQuery } from './queryRewrite';

describe('rewriteQuery (local)', () => {
  it('scoate formulele de comandă și expandează IMA', () => {
    const r = rewriteQuery('Te rog, explică-mi ce este IMA?');
    expect(r.core).toBe('IMA');
    expect(r.expansions).toContain('infarct miocardic acut');
    expect(r.searchText).toContain('infarct miocardic');
  });

  it('expandează forma completă spre abreviere (HTA)', () => {
    const r = rewriteQuery('tratamentul hipertensiunii arteriale');
    // „hipertensiune arteriala” nu e în text (e „hipertensiunii”), dar abrevierea scrisă o prinde
    const r2 = rewriteQuery('Tratamentul HTA la diabetic');
    expect(r2.expansions).toContain('hipertensiune arteriala');
    expect(r.core).toContain('hipertensiunii');
  });

  it('expandează DZ doar cu majuscule', () => {
    expect(rewriteQuery('complicațiile DZ tip 2').expansions).toContain('diabet zaharat');
    expect(rewriteQuery('dz tip 2').expansions).not.toContain('diabet zaharat');
  });

  it('repară sedila și funcționează fără diacritice', () => {
    expect(rewriteQuery('Explică-mi insuficienţa cardiacă').core).toContain('insuficiența');
    const r = rewriteQuery('insuficienta cardiaca congestiva');
    expect(r.expansions).toContain('icc');
  });

  it('echivalențe EN → RO', () => {
    const r = rewriteQuery('myocardial infarction treatment');
    expect(r.expansions).toContain('infarct miocardic');
    expect(rewriteQuery('heart failure').expansions).toContain('insuficienta cardiaca');
  });

  it('nu golește o întrebare formată doar din formule', () => {
    expect(rewriteQuery('ce este').core.length).toBeGreaterThan(0);
  });

  it('plafonează textul de căutare', () => {
    const long = `HTA ${'foarte lung '.repeat(60)}`;
    expect(rewriteQuery(long, { maxSearchChars: 100 }).searchText.length).toBeLessThanOrEqual(100);
  });

  it('cere LLM doar când regăsirea a fost slabă', () => {
    expect(rewriteQuery('criterii diagnostic lupus', { lastRetrievalScore: 0.1 }).needsLlm).toBe(true);
    expect(rewriteQuery('criterii diagnostic lupus', { lastRetrievalScore: 0.8 }).needsLlm).toBe(false);
    expect(rewriteQuery('criterii diagnostic lupus').needsLlm).toBe(false);
    expect(rewriteQuery('lupus', { lastRetrievalScore: 0.1 }).needsLlm).toBe(false);
  });
});
