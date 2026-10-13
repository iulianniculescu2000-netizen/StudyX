// @ts-expect-error -- tipurile node nu fac parte din tsconfig.app; testul rulează sub Node
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  buildFallbackQuestionsFromChunks,
  buildStudioContextPayload,
  isStudioQuestionQualityAcceptable,
} from './studioGeneration';

function diseaseChunks(count: number, repeatSentence = false) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    source: 's',
    topic: `Boala ${i}`,
    text:
      `Boala ${i} se caracterizează prin sindrom unic numărul ${i} cu manifestări distincte. `
      + `Simptomele includ febră tip ${i} și astenie marcată ${i}. `
      + `Tratamentul include medicament numărul ${i} administrat zilnic. `
      + `Diagnosticul se bazează pe examen numărul ${i} de laborator.`
      + (repeatSentence ? ` Boala ${i} se caracterizează prin sindrom unic numărul ${i} cu manifestări distincte.` : ''),
  }));
}

function signature(questions: ReturnType<typeof buildFallbackQuestionsFromChunks>) {
  return questions.map((q) => [q.text, q.options.map((o) => (o.isCorrect ? '*' : '') + o.text), q.tags]);
}

describe('buildFallbackQuestionsFromChunks (characterization)', () => {
  it('is deterministic and pins the exact questions produced for a fixed input', () => {
    const questions = buildFallbackQuestionsFromChunks({
      sourceName: 'Curs', chunks: diseaseChunks(60, true), count: 20, difficulty: 'medium', packIndex: 2,
    });
    expect(questions).toHaveLength(20);
    expect(signature(questions).slice(0, 2)).toEqual([
      ['Ce element susține diagnosticul de Boala 6?',
        ['Examen numărul 28 de laborator', 'Examen numărul 29 de laborator', '*Examen numărul 6 de laborator', 'Examen numărul 30 de laborator'],
        ['ai-studio', 'curs', 'boala', '6']],
      ['Care afirmație descrie corect Boala 7?',
        ['Sindrom unic numărul 29 cu manifestări distincte', 'Sindrom unic numărul 30 cu manifestări distincte', 'Sindrom unic numărul 31 cu manifestări distincte', '*Sindrom unic numărul 7 cu manifestări distincte'],
        ['ai-studio', 'curs', 'boala', '7']],
    ]);
    const hash = createHash('md5').update(JSON.stringify(signature(questions))).digest('hex');
    expect(hash).toBe('0d267acdfa7ce94f11fa648ddd15a77d');
  });

  it('returns nothing when fewer than 4 distinct facts exist', () => {
    expect(buildFallbackQuestionsFromChunks({
      sourceName: 'x', chunks: diseaseChunks(1), count: 5, difficulty: 'easy', packIndex: 0,
    })).toEqual([]);
  });

  it('never repeats a question and keeps four distinct options with one correct', () => {
    const questions = buildFallbackQuestionsFromChunks({
      sourceName: 'x', chunks: diseaseChunks(80, true), count: 60, difficulty: 'hard', packIndex: 0,
    });
    expect(questions.length).toBeGreaterThan(10);
    const seen = new Set<string>();
    for (const q of questions) {
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
      const key = `${q.text}::${q.options.find((o) => o.isCorrect)!.text}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('copes with a very large chunk set quickly', () => {
    const start = Date.now();
    const questions = buildFallbackQuestionsFromChunks({
      sourceName: 'x', chunks: diseaseChunks(2000), count: 60, difficulty: 'medium', packIndex: 1,
    });
    expect(questions.length).toBeGreaterThan(10);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

describe('buildStudioContextPayload (characterization)', () => {
  const chunks = diseaseChunks(12);

  it('windows the chunks by pack index and caps topics / weak topics', () => {
    const payload = buildStudioContextPayload({
      sourceName: 'Curs.pdf', chunks, packIndex: 1, totalPacks: 2, difficulty: 'hard',
      // Doar punctele slabe din temele pachetului intră în prompt; „Altă patologie” (din altă temă) ar fi mutat întrebările.
      weakTopics: [
        { topic: 'Altă patologie', accuracy: 5, wrongCount: 9, total: 10, recencyScore: 0 },
        ...Array.from({ length: 6 }, (_, i) => ({ topic: `Boala ${i + 3}`, accuracy: 10, wrongCount: 3, total: 4, recencyScore: 0 })),
      ],
    });
    // totalPacks <= 3 -> window of 6; start = (1*3) % (12-6+1) = 3
    expect(payload.chunks!.map((c) => c.id)).toEqual(['c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(payload.query).toBe('Întrebări despre Boala 3, Boala 4, Boala 5, Boala 6');
    expect(payload.summary).toContain('Document sursă: Curs.pdf');
    expect(payload.summary).toContain('Puncte slabe ale utilizatorului de urmărit: Boala 3, Boala 4, Boala 5, Boala 6.');
    expect(payload.summary).not.toContain('Altă patologie');
    expect(payload.summary).toContain('Fragment 1 | Boala 3');
    expect(payload.level).toBe('hard');
  });

  it('uses the whole list from the start when there are fewer chunks than the window', () => {
    const payload = buildStudioContextPayload({
      sourceName: 'x', chunks: chunks.slice(0, 2), packIndex: 5, totalPacks: 9, difficulty: 'easy',
    });
    expect(payload.chunks).toHaveLength(2);
    expect(payload.summary).not.toContain('Puncte slabe');
  });

  it('falls back to a neutral label for blank topics and no chunks', () => {
    const payload = buildStudioContextPayload({ sourceName: 'x', chunks: [], packIndex: 0, totalPacks: 1, difficulty: 'medium' });
    expect(payload.query).toBe('Întrebări despre temele selectate');
  });
});

describe('isStudioQuestionQualityAcceptable (characterization)', () => {
  const opts = (texts: string[], correct: number[]) => texts.map((text, i) => ({ id: String(i), text, isCorrect: correct.includes(i) }));
  const base = { id: 'q', difficulty: 'medium' as const };

  it('accepts a clean rezidențiat-style stem ending in a colon', () => {
    expect(isStudioQuestionQualityAcceptable({
      ...base, text: 'Sifilisul este cauzat de:',
      options: opts(['Treponema pallidum', 'Borrelia burgdorferi', 'Leptospira interrogans', 'Chlamydia trachomatis', 'Neisseria gonorrhoeae'], [0]),
    }, 'Curs')).toBe(true);
  });

  it('rejects options that end on a connector or have unbalanced parentheses', () => {
    const q = (o: string[]) => ({ ...base, text: 'Care afirmație descrie corect hipertensiunea?', options: opts(o, [0]) });
    expect(isStudioQuestionQualityAcceptable(q(['Valori crescute persistente', 'Hipotensiune ortostatică severă', 'Bradicardie sinusală marcată', 'Tahicardie paroxistică supraventriculară']), 'Curs')).toBe(true);
    expect(isStudioQuestionQualityAcceptable(q(['Valori crescute (ex', 'Hipotensiune ortostatică severă', 'Bradicardie sinusală marcată', 'Tahicardie paroxistică supraventriculară']), 'Curs')).toBe(false);
    expect(isStudioQuestionQualityAcceptable(q(['Valori crescute prin', 'Hipotensiune ortostatică severă', 'Bradicardie sinusală marcată', 'Tahicardie paroxistică supraventriculară']), 'Curs')).toBe(false);
  });

  it('rejects a stem that contains the correct answer verbatim, and wrong correct counts', () => {
    const text = 'Care este Bradicardie sinusală marcată la adult?';
    expect(isStudioQuestionQualityAcceptable({ ...base, text, options: opts(['Bradicardie sinusală marcată', 'Hipotensiune ortostatică severă', 'Valori crescute persistente', 'Tahicardie paroxistică severă'], [0]) }, 'Curs')).toBe(false);
    expect(isStudioQuestionQualityAcceptable({ ...base, text: 'Care afirmație descrie corect hipertensiunea?', options: opts(['Valori crescute persistente', 'Hipotensiune ortostatică severă', 'Bradicardie sinusală marcată', 'Tahicardie paroxistică severă'], [0, 1]), multipleCorrect: false }, 'Curs')).toBe(true);
  });

  it('applies the complement multiplu limits (4-6 options, 2-4 correct)', () => {
    const q = (n: number, correct: number[]) => ({
      ...base, multipleCorrect: true, text: 'Care afirmații sunt adevărate despre hipertensiune?',
      options: opts(Array.from({ length: n }, (_, i) => `Varianta numărul ${i} corectă`), correct),
    });
    expect(isStudioQuestionQualityAcceptable(q(5, [0, 1]), 'Curs')).toBe(true);
    expect(isStudioQuestionQualityAcceptable(q(5, [0]), 'Curs')).toBe(false);
    // The real bank has 1-4 correct (most often 3): four is fine, all five is not a question.
    expect(isStudioQuestionQualityAcceptable(q(5, [0, 1, 2, 3]), 'Curs')).toBe(true);
    expect(isStudioQuestionQualityAcceptable(q(5, [0, 1, 2, 3, 4]), 'Curs')).toBe(false);
    expect(isStudioQuestionQualityAcceptable(q(3, [0, 1]), 'Curs')).toBe(false);
  });
});
