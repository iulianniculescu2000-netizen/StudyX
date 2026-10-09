import { describe, expect, it } from 'vitest';
import {
  buildFallbackQuestionsFromChunks,
  clampStudioPackCount,
  clampStudioQuestionCount,
  isStudioQuestionQualityAcceptable,
} from '../lib/ai/studioGeneration';

const chunks = [
  {
    id: 'c1',
    source: 'Curs cardio',
    topic: 'insuficiență cardiacă',
    text: 'Insuficiența cardiacă apare atunci când inima nu poate asigura un debit suficient pentru nevoile metabolice ale organismului. Dispneea de efort și ortopneea sunt simptome frecvente. Tratamentul include controlul volemiei și optimizarea terapiei neurohormonale.',
  },
  {
    id: 'c2',
    source: 'Curs cardio',
    topic: 'fibrilație atrială',
    text: 'Fibrilația atrială se caracterizează prin activitate atrială rapidă și neregulată, cu puls neregulat absolut la examenul clinic. Controlul frecvenței și prevenția tromboembolică sunt obiective majore. Evaluarea riscului se face prin scoruri clinice standardizate.',
  },
  {
    id: 'c3',
    source: 'Curs cardio',
    topic: 'endocardită infecțioasă',
    text: 'Endocardita infecțioasă trebuie suspectată la pacientul cu febră persistentă și suflu cardiac nou apărut. Hemoculturile repetate și ecocardiografia sunt esențiale pentru diagnostic. Tratamentul necesită antibioterapie țintită și monitorizare atentă.',
  },
  {
    id: 'c4',
    source: 'Curs cardio',
    topic: 'hipertensiune arterială',
    text: 'Hipertensiunea arterială este definită prin valori tensionale persistent crescute, documentate corect în condiții standard. Modificarea stilului de viață și tratamentul medicamentos reduc riscul de complicații cardiovasculare. Evaluarea afectării de organ țintă face parte din bilanțul inițial.',
  },
];

describe('studioGeneration helpers', () => {
  it('clamps pack and question counts to safe studio limits', () => {
    expect(clampStudioPackCount(0)).toBe(1);
    expect(clampStudioPackCount(999)).toBe(36);
    // Minimum is 1 since v1.0.4 so short requests like "2 grile" stay literal.
    expect(clampStudioQuestionCount(0)).toBe(1);
    expect(clampStudioQuestionCount(2)).toBe(2);
    expect(clampStudioQuestionCount(999)).toBe(60);
  });

  it('builds concise fallback questions grounded in the source chunks', () => {
    const questions = buildFallbackQuestionsFromChunks({
      sourceName: 'Curs cardio',
      chunks,
      count: 4,
      difficulty: 'medium',
      packIndex: 0,
    });

    expect(questions).toHaveLength(4);
    questions.forEach((question) => {
      expect(question.options).toHaveLength(4);
      expect(question.options.filter((option) => option.isCorrect)).toHaveLength(1);
      // Explanation must stay grounded in the topic WITHOUT leaking the document name.
      expect(question.explanation?.length ?? 0).toBeGreaterThan(0);
      expect(question.explanation).not.toContain('Curs cardio');
      expect(question.explanation?.toLowerCase()).not.toContain('documentul');
      expect(question.tags?.length).toBeGreaterThan(0);
      expect(question.text.toLowerCase()).not.toContain('cursul încărcat');
      expect(question.text.toLowerCase()).not.toContain('.pdf');
      question.options.forEach((option) => {
        expect(option.text.length).toBeLessThanOrEqual(120);
        expect(option.text.split(/\s+/).length).toBeLessThanOrEqual(18);
      });
    });
  });

  it('rejects low-quality studio questions that mention files or use oversized options', () => {
    expect(isStudioQuestionQualityAcceptable({
      id: 'q1',
      text: 'Ce afirmație despre "Cursul 1.pdf" este confirmată de cursul încărcat?',
      options: [
        { id: '1', text: 'O opțiune foarte lungă '.repeat(10), isCorrect: true },
        { id: '2', text: 'Altă variantă lungă '.repeat(10), isCorrect: false },
        { id: '3', text: 'A treia variantă lungă '.repeat(10), isCorrect: false },
        { id: '4', text: 'A patra variantă lungă '.repeat(10), isCorrect: false },
      ],
      difficulty: 'medium',
    }, 'Cursul 1.pdf')).toBe(false);
  });
});
