import { describe, expect, it } from 'vitest';
import { ACTION_CLAIM_NOTE, neutralizeActionClaims } from './actionClaims';

describe('neutralizeActionClaims', () => {
  it('scoate confirmarea inventată din captură', () => {
    const out = neutralizeActionClaims('Toate cele 5 grile despre infarctul miocardic acut au fost salvate în folderul Cardiologie. Poți începe rezolvarea când dorești.');
    expect(out.removed).toBe(1);
    expect(out.text).not.toMatch(/au fost salvate/);
    expect(out.text).toContain('Poți începe rezolvarea');
    expect(out.text).toContain(ACTION_CLAIM_NOTE);
  });

  it.each([
    'Am creat folderul Cardiologie și am mutat setul acolo.',
    'Le-am salvat în folder, gata.',
    'Setul a fost mutat în Hematologie.',
    'Cărțile au fost reindexate cu pagini.',
  ])('prinde %j', (text) => {
    expect(neutralizeActionClaims(text).removed).toBeGreaterThan(0);
  });

  it.each([
    'Infarctul miocardic acut apare prin ocluzia unei artere coronare.',
    'Au fost salvate multe vieți după introducerea trombolizei.',
    'În studiul lor, pacienții au fost tratați cu aspirină.',
    'Alege „Adaugă cărți”, apoi selectează fișierul.',
  ])('lasă neatins %j', (text) => {
    const out = neutralizeActionClaims(text);
    expect(out.removed).toBe(0);
    expect(out.text).toBe(text);
  });

  it('nu atinge răspunsul când agentul a rulat', () => {
    const text = 'Am creat 5 grile și le-am salvat în folderul Cardiologie.';
    expect(neutralizeActionClaims(text, { agentRan: true })).toEqual({ text, removed: 0 });
  });

  it('nu atinge blocurile de cod', () => {
    const text = 'Exemplu:\n```\nam salvat setul în folder\n```';
    expect(neutralizeActionClaims(text).removed).toBe(0);
  });
});
