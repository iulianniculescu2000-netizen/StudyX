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

describe('cifrele din propozițiile citate', () => {
  const withText = [
    { n: 1, score: 0.8, text: 'Tromboliza trebuie să înceapă până la maxim 4,5 ore de la debut. Glicemie peste 126 mg/dl.' },
    { n: 2, score: 0.8, text: 'Lactuloza 10-30 ml de trei ori pe zi.' },
  ];

  it('cifrele care apar în pasajul citat nu sunt semnalate (virgula și punctul zecimal sunt la fel)', async () => {
    const { unverifiedFigures } = await import('./answerSupport');
    expect(unverifiedFigures('Fereastra este de 4.5 ore [1]. Lactuloză 10–30 ml [2].', withText)).toEqual([]);
  });

  it('o cifră absentă din pasajul citat e de verificat, iar răspunsul devine parțial susținut', async () => {
    const { unverifiedFigures } = await import('./answerSupport');
    const answer = 'Fereastra este de 6,5 ore [1].\n- Glicemie peste 126 mg/dl [1].';
    expect(unverifiedFigures(answer, withText)).toEqual(['6.5']);
    expect(assessAnswerSupport(answer, withText)).toMatchObject({ level: 'partial', label: 'Parțial susținut: o cifră de verificat în carte', unverified: ['6.5'] });
  });

  it('nu verifică propozițiile fără [n], numerotarea listei, cifrele singure și etichetele', async () => {
    const { unverifiedFigures } = await import('./answerSupport');
    const answer = 'Din experiență, 80% răspund.\n12. Există 2 forme [1].\nVezi și [1, 2].';
    expect(unverifiedFigures(answer, withText)).toEqual([]);
  });

  it('fără textul pasajelor rămâne calculul vechi', () => {
    expect(assessAnswerSupport('Doza e de 999 mg [1].', cites).level).toBe('supported');
  });
});
