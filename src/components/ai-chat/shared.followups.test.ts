import { describe, expect, it } from 'vitest';
import { looksLikeAgentCommand, looksLikePlaceThemRequest } from '../../lib/ai/agent';
import { buildAgentFollowUps, buildFollowUpSuggestions } from './shared';

describe('buildAgentFollowUps', () => {
  it('după grile fără folder: încă 5, pune-le într-un folder, flashcarduri pe subiect', () => {
    const out = buildAgentFollowUps({ quizCount: 1, deckCount: 0, topic: 'infarct miocardic', placedInFolder: false, failedAll: false });
    expect(out).toEqual([
      'Mai fă 5 grile asemănătoare despre infarct miocardic.',
      'Pune-le într-un folder.',
      'Fă flashcarduri despre infarct miocardic.',
    ]);
  });

  it('nu propune folderul când setul e deja plasat', () => {
    const out = buildAgentFollowUps({ quizCount: 1, deckCount: 0, topic: 'HTA', placedInFolder: true, failedAll: false });
    expect(out.some((s) => /folder/i.test(s))).toBe(false);
    expect(out[0]).toContain('grile asemănătoare despre HTA');
  });

  it('după flashcarduri propune încă un pachet, nu grile', () => {
    const out = buildAgentFollowUps({ quizCount: 0, deckCount: 1, topic: 'nefron', placedInFolder: false, failedAll: false });
    expect(out[0]).toBe('Mai fă 10 flashcarduri despre nefron.');
    expect(out.join(' ')).not.toMatch(/grile/);
  });

  it('fără subiect nu inventează unul', () => {
    const out = buildAgentFollowUps({ quizCount: 1, deckCount: 0, topic: null, placedInFolder: false, failedAll: false });
    expect(out).toEqual(['Mai fă 5 grile asemănătoare.', 'Pune-le într-un folder.']);
  });

  it('la eșec propune doar reîncercarea', () => {
    expect(buildAgentFollowUps({ quizCount: 0, deckCount: 0, topic: 'x', placedInFolder: false, failedAll: true })).toEqual(['Mai încearcă.']);
  });

  it('cel mult trei sugestii', () => {
    expect(buildAgentFollowUps({ quizCount: 2, deckCount: 2, topic: 'x', placedInFolder: false, failedAll: false }).length).toBeLessThanOrEqual(3);
  });

  it('fiecare sugestie pornește agentul (trece de detectorul de comenzi), nu chatul simplu', () => {
    const all = [
      ...buildAgentFollowUps({ quizCount: 1, deckCount: 0, topic: 'infarct miocardic', placedInFolder: false, failedAll: false }),
      ...buildAgentFollowUps({ quizCount: 0, deckCount: 1, topic: 'nefron', placedInFolder: false, failedAll: false }),
      ...buildAgentFollowUps({ quizCount: 1, deckCount: 0, topic: null, placedInFolder: false, failedAll: false }),
    ];
    for (const text of all.filter((s) => s !== 'Mai încearcă.')) expect(looksLikeAgentCommand(text), text).toBe(true);
    expect(looksLikePlaceThemRequest('Pune-le într-un folder.')).toBe(true);
  });
});

describe('buildFollowUpSuggestions: rezumat', () => {
  it('propune fișa de 30 de secunde doar dacă n-a fost cerută deja', () => {
    expect(buildFollowUpSuggestions('rezumă-mi capitolul', [], 'summarize')[0]).toContain('fișă de 30 de secunde');
    const again = buildFollowUpSuggestions('fă-mi o fișă scurtă', [], 'summarize');
    expect(again.join(' ')).not.toContain('fișă de 30 de secunde');
    expect(again).toHaveLength(3);
  });
});
