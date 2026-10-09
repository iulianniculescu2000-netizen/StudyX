import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../../types';
import { avoidInstruction, describeShortfall, fillShortfall, questionTextKey } from './questionTopUp';

const q = (text: string): Question => ({
  id: text,
  text,
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: false },
  ],
  difficulty: 'medium',
}) as Question;

const batch = (...texts: string[]) => ({ questions: texts.map(q) });

describe('fillShortfall', () => {
  it('nu face nicio rundă când primul lot ajunge', async () => {
    const more = vi.fn();
    const out = await fillShortfall({ target: 2, first: batch('Întrebarea unu', 'Întrebarea doi'), generateMore: more });
    expect(out.questions).toHaveLength(2);
    expect(out.rounds).toBe(0);
    expect(more).not.toHaveBeenCalled();
  });

  it('cere exact diferența, cu enunțurile existente la „nu repeta”', async () => {
    const more = vi.fn().mockResolvedValue(batch('Trei despre IMA', 'Patru despre IMA', 'Cinci despre IMA'));
    const out = await fillShortfall({ target: 5, first: batch('Unu despre IMA', 'Doi despre IMA'), generateMore: more });
    expect(more).toHaveBeenCalledTimes(1);
    expect(more).toHaveBeenCalledWith(3, ['Unu despre IMA', 'Doi despre IMA']);
    expect(out.questions).toHaveLength(5);
    expect(out.rounds).toBe(1);
    expect(out.malformedDroppedCount).toBe(0);
  });

  it('nu depășește ținta și scoate dublurile (și fără diacritice)', async () => {
    const more = vi.fn().mockResolvedValue(batch('Întrebarea unu', 'Alta nouă', 'Încă una nouă', 'Mai multe decât trebuie'));
    const out = await fillShortfall({ target: 3, first: batch('Intrebarea unu'), generateMore: more });
    expect(out.questions.map((x) => x.text)).toEqual(['Intrebarea unu', 'Alta nouă', 'Încă una nouă']);
  });

  it('se oprește după maximul de runde și raportează lipsa', async () => {
    const more = vi.fn().mockResolvedValueOnce(batch('Doar una nouă'));
    more.mockResolvedValue(batch('Alta', 'Alta'));
    const out = await fillShortfall({ target: 5, first: batch('Prima'), generateMore: more, maxRounds: 2 });
    expect(more).toHaveBeenCalledTimes(2);
    expect(out.questions).toHaveLength(3);
    expect(out.malformedDroppedCount).toBe(2);
  });

  it('se oprește când o rundă nu aduce nimic nou', async () => {
    const more = vi.fn().mockResolvedValue(batch('Prima'));
    const out = await fillShortfall({ target: 3, first: batch('Prima'), generateMore: more, maxRounds: 3 });
    expect(more).toHaveBeenCalledTimes(1);
    expect(out.questions).toHaveLength(1);
  });

  it('o eroare (limită, rețea) nu aruncă: întoarce ce are', async () => {
    const more = vi.fn().mockRejectedValue(new Error('429 rate limit'));
    const out = await fillShortfall({ target: 5, first: batch('Prima', 'A doua'), generateMore: more });
    expect(out.questions).toHaveLength(2);
    expect(more).toHaveBeenCalledTimes(1);
  });

  it('Stop (AbortError) se propagă', async () => {
    const abort = Object.assign(new Error('stop'), { name: 'AbortError' });
    await expect(fillShortfall({ target: 5, first: batch('Prima'), generateMore: () => Promise.reject(abort) })).rejects.toThrow('stop');
  });

  it('numără separat ce a scos verificarea medicală', async () => {
    const more = vi.fn().mockResolvedValue({ questions: [q('Nouă')], medicallyFlaggedCount: 1, flaggedReasons: ['cheie greșită'] });
    const out = await fillShortfall({
      target: 4,
      first: { questions: [q('Prima')], medicallyFlaggedCount: 1, flaggedReasons: ['alt motiv'] },
      generateMore: more,
      maxRounds: 1,
    });
    expect(out.questions).toHaveLength(2);
    expect(out.medicallyFlaggedCount).toBe(2);
    expect(out.malformedDroppedCount).toBe(0);
    expect(out.flaggedReasons).toEqual(['alt motiv', 'cheie greșită']);
  });
});

describe('ajutoare', () => {
  it('questionTextKey ignoră diacriticele și punctuația', () => {
    expect(questionTextKey('Ce este „IMA”?')).toBe(questionTextKey('ce este ima'));
  });
  it('avoidInstruction e goală fără enunțuri', () => {
    expect(avoidInstruction([])).toBe('');
    expect(avoidInstruction(['Unu'])).toContain('„Unu”');
  });
});

describe('describeShortfall', () => {
  it('spune „ai cerut 5, am reușit 3” cu motive', () => {
    const [line] = describeShortfall('IMA', { requested: 5, received: 3, rounds: 2, medicallyFlaggedCount: 1, malformedDroppedCount: 1 });
    expect(line).toContain('ai cerut 5, am reușit 3');
    expect(line).toContain('verificarea medicală');
    expect(line).toContain('2 runde');
  });
  it('tace când s-a primit tot și nimic n-a fost eliminat', () => {
    expect(describeShortfall('IMA', { requested: 5, received: 5, rounds: 0 })).toEqual([]);
  });
  it('anunță înlocuirea după eliminări compensate', () => {
    expect(describeShortfall('IMA', { requested: 5, received: 5, rounds: 1, medicallyFlaggedCount: 2 })[0]).toContain('le-am înlocuit');
  });
});
