import { describe, expect, it } from 'vitest';
import { extractJsonFromText } from './quizImport';

describe('extractJsonFromText', () => {
  it('text gol -> mesaj în română', () => {
    expect(() => extractJsonFromText('   ')).toThrow(/niciun conținut/);
  });
  it('recuperează obiectele complete dintr-un răspuns tăiat', () => {
    const raw = '```json\n[{"title":"A","questions":[]},{"title":"B","quest';
    expect(extractJsonFromText(raw)).toEqual([{ title: 'A', questions: [] }]);
  });
  it('fără niciun element complet -> eroare clară', () => {
    expect(() => extractJsonFromText('[{"title":"A","ques')).toThrow(/tăiat|JSON/);
  });
  it('JSON valid cu text în jur rămâne la fel', () => {
    expect(extractJsonFromText('Iată: {"a":1} gata')).toEqual({ a: 1 });
  });
});
