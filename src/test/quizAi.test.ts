import { describe, expect, it } from 'vitest';
import type { Question } from '../types';
import {
  buildAnalysisFallback,
  buildClarificationFallback,
  buildHintFallback,
  buildMnemonicFallback,
  getAnswerTextForOptionIds,
  getCorrectAnswerText,
} from '../helpers/quizAi';

const sampleQuestion: Question = {
  id: 'q1',
  text: 'Care este antibioticul de prima intentie?',
  explanation: 'Prima intentie ramane varianta cu spectru tintit si profil bun de siguranta.',
  difficulty: 'medium',
  tags: ['infectii', 'antibiotice'],
  options: [
    { id: 'a', text: 'Amoxicilina', isCorrect: true },
    { id: 'b', text: 'Vancomicina', isCorrect: false },
    { id: 'c', text: 'Colistina', isCorrect: false },
  ],
};

describe('quizAi helpers', () => {
  it('builds a progressive local hint fallback', () => {
    const hint = buildHintFallback(sampleQuestion);

    expect(hint.light).toContain('infectii');
    expect(hint.medium.length).toBeGreaterThan(20);
    expect(hint.full).toContain('Amoxicilina');
  });

  it('builds a usable local analysis fallback', () => {
    const analysis = buildAnalysisFallback({
      question: sampleQuestion,
      userAnswer: 'Vancomicina',
      correctAnswer: getCorrectAnswerText(sampleQuestion),
      isCorrect: false,
    });

    expect(analysis.explanation).toContain('Amoxicilina');
    expect(analysis.recommendedTopic).toBe('infectii');
    expect(analysis.relatedConcepts).toContain('antibiotice');
  });

  it('returns readable answer text helpers', () => {
    expect(getCorrectAnswerText(sampleQuestion)).toBe('Amoxicilina');
    expect(getAnswerTextForOptionIds(sampleQuestion.options, ['b'])).toBe('Vancomicina');
    expect(getAnswerTextForOptionIds(sampleQuestion.options, [])).toBe('niciun raspuns');
  });

  it('creates a deterministic mnemonic fallback', () => {
    const mnemonic = buildMnemonicFallback('infectii bacteriene', 'Amoxicilina');

    expect(mnemonic).toContain('infectii bacteriene');
    expect(mnemonic).toContain('Amoxicilina');
  });

  it('never leaks internal tags or document meta-text into a studio question analysis', () => {
    const studioQuestion: Question = {
      id: 'q2',
      text: 'Veziculele iau nastere prin doua mecanisme principale. Care este corect?',
      // Baked meta-explanation that used to leak the document name.
      explanation: 'Întrebarea este construită din fragmentul despre "Veziculele" din documentul "Cursul 1.pdf".',
      difficulty: 'medium',
      tags: ['ai-studio', 'cursul 1.pdf', 'veziculele'],
      options: [
        { id: 'a', text: 'Prin clivaj intraepidermic', isCorrect: true },
        { id: 'b', text: 'Prin necroza completa', isCorrect: false },
      ],
    };

    const analysis = buildAnalysisFallback({
      question: studioQuestion,
      userAnswer: 'Prin clivaj intraepidermic',
      correctAnswer: 'Prin clivaj intraepidermic',
      isCorrect: true,
    });

    expect(analysis.recommendedTopic).not.toBe('ai-studio');
    expect(analysis.recommendedTopic.toLowerCase()).not.toContain('.pdf');
    expect(analysis.relatedConcepts).not.toContain('ai-studio');
    expect(analysis.explanation.toLowerCase()).not.toContain('documentul');
    expect(analysis.explanation.toLowerCase()).not.toContain('.pdf');
    expect(analysis.rule.toLowerCase()).not.toContain('documentul');
  });

  it('compresses long copied answers into a clean mnemonic without repetition', () => {
    const longAnswer = 'Pot fi localizate pe piele dar si pe mucoasele externe bucala faringe';
    const mnemonic = buildMnemonicFallback(longAnswer, longAnswer);

    expect(mnemonic).not.toMatch(/^Leaga/);
    // The full sentence must not appear twice (the old bug echoed it).
    const occurrences = mnemonic.split('mucoasele externe').length - 1;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it('builds a clarification fallback from the same analysis rules', () => {
    const clarification = buildClarificationFallback(sampleQuestion, 'Vancomicina', 'Amoxicilina');

    expect(clarification).toContain('Amoxicilina');
    expect(clarification).toContain('Vancomicina');
  });
});
