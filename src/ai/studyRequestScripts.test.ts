import { describe, expect, it } from 'vitest';
import { OPTION_CARD_CANCELLED, countLabel, optionCardDone, optionCardFailed, optionCardIntro } from './studyRequestScripts';

describe('studyRequestScripts', () => {
  it('acordă numeralul corect în română', () => {
    expect(countLabel('quiz', 1)).toBe('1 grilă');
    expect(countLabel('quiz', 3)).toBe('3 grile');
    expect(countLabel('quiz', 19)).toBe('19 grile');
    expect(countLabel('quiz', 20)).toBe('20 de grile');
    expect(countLabel('flashcards', 25)).toBe('25 de flashcarduri');
    expect(countLabel('flashcards', 100)).toBe('100 de flashcarduri');
    expect(countLabel('flashcards', 101)).toBe('101 flashcarduri');
  });

  it('introducerea numește subiectul și recapitulează ce a spus deja utilizatorul', () => {
    const text = optionCardIntro({ kind: 'flashcards', topic: 'sepsis', count: 20, difficulty: 'hard', folderName: 'Cardiologie' });
    expect(text).toContain('„sepsis”');
    expect(text).toContain('20 de flashcarduri');
    expect(text).toContain('nivel dificil');
    expect(text).toContain('folderul „Cardiologie”');
  });

  it('fără subiect îl cere, fără să-l inventeze', () => {
    const text = optionCardIntro({ kind: 'quiz', topic: '', count: null, difficulty: null, folderName: null });
    expect(text).not.toContain('„');
    expect(text).not.toContain('Am reținut');
    expect(text.toLowerCase()).toMatch(/subiect|despre ce/);
  });

  it('aceeași cerere primește același răspuns', () => {
    const input = { kind: 'quiz' as const, topic: 'HTA', count: null, difficulty: null, folderName: null };
    expect(optionCardIntro(input)).toBe(optionCardIntro(input));
  });

  it('confirmarea spune câte au ieșit, unde sunt și avertizează când nu au pornit din carte', () => {
    const done = optionCardDone({ kind: 'flashcards', topic: 'sepsis', produced: 12, requested: 15, destination: 'Flashcarduri / Cardiologie', grounded: false });
    expect(done).toContain('12 flashcarduri');
    expect(done).toContain('Flashcarduri / Cardiologie');
    expect(done).toContain('Mi-ai cerut 15');
    expect(done).toContain('cunoștințe medicale generale');
    const clean = optionCardDone({ kind: 'quiz', topic: 'HTA', produced: 10, requested: 10, destination: 'automat, pe specialitate' });
    expect(clean).not.toContain('Mi-ai cerut');
    expect(clean).not.toContain('cunoștințe');
  });

  it('eșecul dă un motiv și un pas următor', () => {
    expect(optionCardFailed('limită de cereri.')).toContain('Nu a ieșit: limită de cereri.');
    expect(optionCardFailed('')).toBe('Nu a ieșit. Poți încerca din nou cu același card, sau schimbă subiectul.');
    expect(OPTION_CARD_CANCELLED.length).toBeGreaterThan(10);
  });
});
