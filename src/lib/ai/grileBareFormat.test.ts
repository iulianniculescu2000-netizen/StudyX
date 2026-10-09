import { describe, it, expect } from 'vitest';
import { parseGrile, type SourceLine } from './grileParser';
import { recoverJsonArray, chunkLines } from './jsonRecover';
import { friendlyAIError } from './friendlyError';

// Mirrors a real PDF export: no punctuation after number/letter (each its own
// text run), running "Pagina N" header, "Răspuns corect" key (with "*" = deduced),
// a matching question and a trailing appendix.
function sample(): SourceLine[] {
  const L = (text: string, page: number): SourceLine => ({ text, page });
  const out: SourceLine[] = [L('Grile Boli infecțioase, setul 1', 1), L('Pagina 1', 1), L('GRILE BOLI INFECȚIOASE', 1)];
  const q = (n: number, stem: string, opts: string[], key: string, page: number) => {
    out.push(L(String(n), page), L(stem, page));
    opts.forEach((o, i) => out.push(L(String.fromCharCode(65 + i), page), L(o, page)));
    out.push(L(`Răspuns corect: ${key}`, page));
  };
  for (let n = 1; n <= 6; n += 1) {
    const page = n;
    if (n > 1) out.push(L('Grile Boli infecțioase, setul 1', page), L(`Pagina ${page}`, page));
    q(n, `Întrebarea numărul ${n} despre infecții:`, ['Prima', 'A doua variantă', 'A treia', 'A patra', 'Toate corecte'], n === 3 ? 'A, C' : n === 4 ? 'B* (dedus, de verificat)' : 'E', page);
  }
  out.push(L('7', 7), L('Asociați afecțiunile cu manifestările clinice specifice cazului.', 7), L('Răspuns corect: A-2, B-4, C-3', 7));
  out.push(L('DECIZII PENTRU CONFLICTE', 8), L('Semnul Koplik.', 8), L('Rujeola. Sursele diferite marcau altceva.', 8));
  return out;
}

describe('format fără punctuație (număr/literă pe rând propriu)', () => {
  const { questions } = parseGrile(sample());

  it('prinde toate întrebările și ignoră antetul/anexa', () => {
    expect(questions).toHaveLength(7);
    expect(questions[0].text).toBe('Întrebarea numărul 1 despre infecții:');
    expect(questions[0].options).toHaveLength(5);
    expect(questions[5].options[4].text).toBe('Toate corecte');
  });
  it('citește cheia, inclusiv multiplu și răspuns dedus', () => {
    expect(questions[0].options.map((o) => o.isCorrect)).toEqual([false, false, false, false, true]);
    expect(questions[2].multipleCorrect).toBe(true);
    expect(questions[2].options.filter((o) => o.isCorrect)).toHaveLength(2);
    expect(questions[3].options[1].isCorrect).toBe(true);
    expect(questions[3].confidence).toBe('medium');
    expect(questions[0].confidence).toBe('high');
  });
  it('întrebarea de asociere rămâne fără răspuns, cu avertisment', () => {
    expect(questions[6].answerSource).toBe('none');
    expect(questions[6].warnings[0]).toMatch(/asociere/);
  });
});

describe('recoverJsonArray', () => {
  it('șir gol -> listă goală, fără excepție', () => {
    expect(recoverJsonArray('')).toEqual([]);
    expect(recoverJsonArray(undefined)).toEqual([]);
  });
  it('păstrează obiectele complete dintr-un JSON trunchiat', () => {
    const raw = '```json\n[{"question":"a?","options":[{"text":"x","correct":true}]},{"question":"b } ?","options":[{"text":"y"}]},{"question":"trunc';
    const out = recoverJsonArray(raw) as Array<{ question: string }>;
    expect(out.map((o) => o.question)).toEqual(['a?', 'b } ?']);
  });
  it('acceptă text în jurul JSON-ului și JSON valid', () => {
    expect(recoverJsonArray('Iată: [{"i":1}] gata')).toEqual([{ i: 1 }]);
    expect(recoverJsonArray('[{"i":1},{"i":2}]')).toHaveLength(2);
  });
});

describe('chunkLines + mesaje', () => {
  it('împarte pe linii, fără a pierde text', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `${i + 1}. Întrebare lungă de test numărul ${i + 1}`);
    const chunks = chunkLines(lines, 1000);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join('\n').split('\n')).toEqual(lines);
  });
  it('JSON.parse brut devine mesaj clar în română', () => {
    expect(friendlyAIError(new Error('Unexpected end of JSON input'))).toMatch(/gol sau incomplet/);
  });
});
