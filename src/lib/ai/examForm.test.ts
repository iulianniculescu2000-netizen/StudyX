import { describe, expect, it } from 'vitest';
import type { Question } from '../../types';
import lawrenceText from '../../data/rezidentiat/library/lawrence.txt?raw';
import { MIN_KEY_SUPPORT, findFormIssues, isReorderable, keySupport, polishGeneratedQuestions, rebalanceKeyLetters } from './examForm';

let n = 0;
function q(text: string, options: string[], correct: number[] = [0]): Question {
  n += 1;
  return {
    id: `q${n}`,
    text,
    multipleCorrect: correct.length > 1,
    options: options.map((t, i) => ({ id: `o${n}-${i}`, text: t, isCorrect: correct.includes(i) })),
  };
}
const five = (key = 0) => q('Agentul etiologic al sifilisului este:', ['Treponema pallidum', 'Neisseria gonorrhoeae', 'Chlamydia trachomatis', 'Haemophilus ducreyi', 'Klebsiella granulomatis'], [key]);
const seeded = (seed = 3) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe('findFormIssues', () => {
  it('o grilă curată nu are probleme', () => {
    expect(findFormIssues(five())).toEqual([]);
  });

  it('respinge trimiterile la carte sau la curs', () => {
    const issues = findFormIssues(q('Conform cursului, tratamentul este:', ['a', 'b', 'c', 'd', 'e']));
    expect(issues.map((i) => i.code)).toContain('metaReference');
    expect(findFormIssues(q('Conform Cadranului 16.4:', ['a', 'b', 'c', 'd', 'e'])).length).toBeGreaterThan(0);
  });

  it('nu confundă „în curs de” sau „în contextul” cu o trimitere la curs', () => {
    expect(findFormIssues(q('Un pacient în curs de dializă primește:', ['heparină', 'b', 'c', 'd', 'e']))).toEqual([]);
    expect(findFormIssues(q('În contextul infecției, se administrează:', ['heparină', 'b', 'c', 'd', 'e']))).toEqual([]);
  });

  it('respinge opțiunile-paragraf, dar numai la rezidențiat', () => {
    const long = Array.from({ length: 30 }, () => 'cuvânt').join(' ');
    const question = q('Enunț scurt:', [long, 'b', 'c', 'd', 'e']);
    expect(findFormIssues(question, 'residency').map((i) => i.code)).toContain('paragraphOption');
    expect(findFormIssues(question, 'simple')).toEqual([]);
  });

  it('avertizează când doar cheia are paranteză explicativă', () => {
    const issues = findFormIssues(q('Se caracterizează prin:', ['durere (cu durată prelungită)', 'tuse', 'febră', 'greață', 'vărsături']));
    expect(issues.find((i) => i.code === 'keyGloss')?.severity).toBe('warn');
  });

  it('avertizează la antiteze simetrice', () => {
    const issues = findFormIssues(q('Răspunsul este:', ['crește precoce', 'scade tardiv', 'e frecvent', 'e rar', 'nu apare'], [0]));
    expect(issues.map((i) => i.code)).toContain('antonymPairs');
  });
});

describe('rebalanceKeyLetters', () => {
  it('aduce literele cheilor la profilul real, fără să piardă răspunsul corect', () => {
    const questions = Array.from({ length: 20 }, () => five(1));
    const out = rebalanceKeyLetters(questions, seeded());
    const letters = out.map((x) => x.options.findIndex((o) => o.isCorrect));
    const count = (i: number) => letters.filter((l) => l === i).length;
    expect([count(0), count(1), count(2), count(3), count(4)]).toEqual([2, 4, 6, 5, 3]);
    out.forEach((x, i) => {
      expect(x.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(x.options.find((o) => o.isCorrect)?.text).toBe(questions[i].options.find((o) => o.isCorrect)?.text);
      expect(x.options.map((o) => o.text).sort()).toEqual(questions[i].options.map((o) => o.text).sort());
    });
  });

  it('nu mută opțiunile care depind de ordine', () => {
    const positional = q('Alegeți:', ['Treponema', 'Neisseria', 'Chlamydia', 'Ambele variante, B și C', 'Niciuna'], [0]);
    expect(isReorderable(positional)).toBe(false);
    const out = rebalanceKeyLetters([positional, five(), five(), five()], seeded());
    expect(out[0]).toBe(positional);
  });

  it('lasă în pace un lot prea mic și grilele cu mai multe corecte', () => {
    const small = [five(), five()];
    expect(rebalanceKeyLetters(small)).toBe(small);
    const multi = q('Afirmații:', ['a', 'b', 'c', 'd', 'e'], [0, 1, 2]);
    const out = rebalanceKeyLetters([multi, five(), five(), five()], seeded());
    expect(out[0]).toBe(multi);
  });
});

describe('polishGeneratedQuestions', () => {
  it('scoate grilele cu trimitere la carte și le raportează', () => {
    const bad = q('Conform cursului, boala este:', ['a', 'b', 'c', 'd', 'e']);
    const result = polishGeneratedQuestions([bad, five(), five(), five()], 'residency', { rng: seeded() });
    expect(result.questions).toHaveLength(3);
    expect(result.rejected).toHaveLength(1);
  });

  it('nu golește lotul dacă ar respinge tot', () => {
    const bad = q('Conform cursului, boala este:', ['a', 'b', 'c', 'd', 'e']);
    const result = polishGeneratedQuestions([bad], 'residency');
    expect(result.questions).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('pe pista simplă nu mută literele', () => {
    const questions = Array.from({ length: 6 }, () => five(1));
    const result = polishGeneratedQuestions(questions, 'simple');
    expect(result.questions.every((x) => x.options[1].isCorrect)).toBe(true);
  });
});

describe('sprijinul cheii în textul sursă (cărțile)', () => {
  // Fragment scurt, scris aici; testul real pe cărțile din repo e mai jos.
  const source = 'Stenoza aortică severă se manifestă prin angină pectorală, sincopă și insuficiență cardiacă. '.repeat(8);

  it('măsoară suprapunerea cuvintelor de conținut, cu diacritice și terminații diferite', () => {
    expect(keySupport('angină pectorală și sincopă', source)).toBe(1);
    expect(keySupport('Stenozei aortice severe', source)).toBeGreaterThan(0.9);
    expect(keySupport('hipotiroidism congenital', source)).toBe(0);
    expect(keySupport('angină', 'text prea scurt')).toBeNull();
  });

  it('respinge grila a cărei cheie nu are legătură cu sursa, dar nu și parafrazele', () => {
    const good = q('Stenoza aortică se manifestă prin:', ['angină pectorală', 'hematurie', 'icter', 'artralgii', 'prurit']);
    const bad = q('Stenoza aortică se manifestă prin:', ['hipotiroidism congenital', 'angină pectorală', 'icter', 'artralgii', 'prurit']);
    const result = polishGeneratedQuestions([good, bad, good, good], 'residency', { rng: seeded(), sourceText: source });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0]).toContain('textul sursă');
    expect(result.questions).toHaveLength(3);
  });

  it('cu cărțile din repo: citate reale trec, o cheie din alt domeniu pică', () => {
    const chunk = lawrenceText.slice(200000, 206000);
    const sentence = chunk.split(/(?<=\.)\s/).find((s) => s.length > 60 && s.length < 160) ?? '';
    expect(keySupport(sentence, chunk)).toBeGreaterThan(0.9);
    expect(keySupport('hipotiroidism congenital mixedem cretinism', chunk)).toBeLessThan(MIN_KEY_SUPPORT);
  });
});
