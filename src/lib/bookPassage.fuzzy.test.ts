import { describe, expect, it } from 'vitest';
import { findPassageCandidates, isExceptionQuestion, withinOneEdit } from './bookPassage';

describe('căutare tolerantă la greșeli', () => {
  it('distanța de editare 1: înlocuire, inserare, ștergere', () => {
    expect(withinOneEdit('artit', 'artrit')).toBe(true);
    expect(withinOneEdit('artrat', 'artrit')).toBe(true);
    expect(withinOneEdit('artrittt', 'artrit')).toBe(false);
    expect(withinOneEdit('artr', 'artrit')).toBe(false);
  });

  it('„poliartita” (greșeală din bancă) găsește artrita reumatoidă și fără termenii AI', async () => {
    const found = await findPassageCandidates({ question: 'Tratamentul de fond, de referință în poliartita reumatoidă este reprezentat de:', answer: 'Metotrexat' }, 3);
    expect(found.some((c) => c.paras[0].book === 'K' && c.paras[0].page >= 74 && c.paras[0].page <= 77)).toBe(true);
  }, 30000);

  it('un cuvânt care nu seamănă cu nimic din cărți nu se potrivește forțat', async () => {
    const found = await findPassageCandidates({ question: 'xyzqwertyuiop blorptastic', answer: 'qwzxqwzx' }, 3);
    expect(found).toEqual([]);
  }, 30000);

  it('recunoaște întrebările „cu excepția” (răspunsul corect e afirmația falsă)', () => {
    expect(isExceptionQuestion('Cauzele sunt următoarele, cu excepția:')).toBe(true);
    expect(isExceptionQuestion('Care din afirmații este FALSĂ?')).toBe(true);
    expect(isExceptionQuestion('Tratamentul de fond în artrita reumatoidă este:')).toBe(false);
  });
});
