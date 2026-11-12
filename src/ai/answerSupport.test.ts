import { describe, expect, it } from 'vitest';
import { assessAnswerSupport, citedNumbers } from './answerSupport';
import { enforceBooksOnly } from './groundingGuard';

const cites = [{ n: 1, score: 0.8 }, { n: 2, score: 0.7 }, { n: 3, score: 0.2 }];

describe('citedNumbers', () => {
  it('citește [n], liste și intervale, fără duplicate', () => {
    expect(citedNumbers('A [1]. B [2, 3]. C [1].').sort()).toEqual([1, 2, 3]);
    expect(citedNumbers('A [1-3].').sort()).toEqual([1, 2, 3]);
    expect(citedNumbers('fără etichete')).toEqual([]);
  });
});

describe('assessAnswerSupport', () => {
  it('două surse bune: susținut de 2 surse', () => {
    expect(assessAnswerSupport('Fier [1]. Anemie [2].', cites)).toEqual({ level: 'supported', cited: 2, label: 'Susținut de 2 surse' });
  });
  it('o singură sursă: formă la singular', () => {
    expect(assessAnswerSupport('Fier [1].', cites).label).toBe('Susținut de 1 sursă');
  });
  it('etichetă inexistentă nu contează', () => {
    expect(assessAnswerSupport('Fier [9].', cites).level).toBe('none');
  });
  it('fără [n] sau fără fragmente: fără surse în cărți', () => {
    expect(assessAnswerSupport('Text fără citări.', cites).label).toBe('Fără surse în cărți');
    expect(assessAnswerSupport('Fier [1].', []).label).toBe('Fără surse în cărți');
  });
  it('scor mic: parțial susținut', () => {
    expect(assessAnswerSupport('Ceva [3].', cites)).toMatchObject({ level: 'partial', label: 'Parțial susținut' });
  });
  it('amestec cu cunoștințe generale: parțial susținut', () => {
    const text = 'Fier [1].\n\nDin cunoștințe generale (nu din cărți): altceva.';
    expect(assessAnswerSupport(text, cites).level).toBe('partial');
  });
});

describe('enforceBooksOnly', () => {
  it('scoate secțiunea din cunoștințe generale', () => {
    const text = 'Fier [1].\n\nDin cunoștințe generale (nu din cărți): ceva.\n\nContinuare fără sursă.';
    expect(enforceBooksOnly(text)).toBe('Fier [1].');
  });
  it('lasă neatins un răspuns fără marcaj', () => {
    expect(enforceBooksOnly('Fier [1].')).toBe('Fier [1].');
  });
  it('dacă nu rămâne nimic: Nu am găsit în cărți.', () => {
    expect(enforceBooksOnly('Din cunoștințe generale (nu din cărți): ceva.')).toBe('Nu am găsit în cărți.');
  });
});
