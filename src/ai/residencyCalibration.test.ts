/**
 * Generation is calibrated against the real exam, not against a guess: the
 * official rezidențiat papers (2021–2024) and two Romanian question banks
 * (~2000 parsed items) all use five options A–E, and the official paper is
 * complement simplu throughout. The app used to ask the model for four.
 */
import { describe, expect, it } from 'vitest';
import { RESIDENCY_STYLE_RULES, buildQuestionPrompt } from './prompts';
import { getMedicalSystemPrompt } from '../lib/aiContext';
import { EXAM_STYLE_META, detectExamStyle, examStyleTags } from '../lib/ai/examStyle';
import { isStudioQuestionQualityAcceptable } from '../lib/ai/studioGeneration';
import type { Question } from '../types';

function buildQuestion(optionCount: number, correctCount = 1): Question {
  return {
    id: 'q1',
    text: 'Segmentul tubului digestiv afectat în colita ulcerativă este:',
    multipleCorrect: correctCount > 1,
    difficulty: 'medium',
    explanation: '',
    options: Array.from({ length: optionCount }, (_, index) => ({
      id: String.fromCharCode(97 + index),
      text: `varianta plauzibilă numărul ${index + 1}`,
      isCorrect: index < correctCount,
    })),
  };
}

describe('complement simplu asks for five options', () => {
  const prompt = buildQuestionPrompt(null, [], 'medium', undefined, 'single', undefined, 5);

  it('states the A-E requirement', () => {
    expect(prompt).toContain('exact 5 opțiuni (A-E)');
    expect(prompt).not.toContain('exact 4 opțiuni');
  });

  it('ships a five-option JSON schema so the model copies the shape', () => {
    const schema = prompt.slice(prompt.indexOf('{"questions"'));
    expect((schema.match(/"isCorrect"/g) ?? []).length).toBe(5);
    expect((schema.match(/"isCorrect":true/g) ?? []).length).toBe(1);
  });

  it('keeps complement multiplu at five options with 2-3 correct', () => {
    const multi = buildQuestionPrompt(null, [], 'medium', undefined, 'multiple', undefined, 5);
    expect(multi).toContain('exact 5 opțiuni');
    expect(multi).toContain('ÎNTRE 2 ȘI 4 răspunsuri corecte');
  });
});

describe('house style reaches every generation path', () => {
  it('is part of the question prompt', () => {
    expect(buildQuestionPrompt(null, [], 'medium')).toContain(RESIDENCY_STYLE_RULES);
  });

  it('is part of the examiner system prompt used for document generation', () => {
    expect(getMedicalSystemPrompt('examiner')).toContain(RESIDENCY_STYLE_RULES);
  });

  it('does not leak into prose roles', () => {
    expect(getMedicalSystemPrompt('tutor')).not.toContain(RESIDENCY_STYLE_RULES);
  });

  it('encodes the patterns measured in the corpus', () => {
    // Colon-terminated stems, single-category options, expanded abbreviations,
    // occasional negative stems, rare vignettes.
    expect(RESIDENCY_STYLE_RULES).toContain('":"');
    expect(RESIDENCY_STYLE_RULES).toContain('aceeași categorie');
    expect(RESIDENCY_STYLE_RULES).toContain('(BCR)');
    expect(RESIDENCY_STYLE_RULES).toContain('incorectă');
    expect(RESIDENCY_STYLE_RULES).toContain('rare la examenul real');
  });
});

describe('quality gate accepts the exam format', () => {
  it('accepts a five-option single-answer question', () => {
    expect(isStudioQuestionQualityAcceptable(buildQuestion(5), 'Curs.pdf')).toBe(true);
  });

  it('still accepts four-option sets created before the calibration', () => {
    expect(isStudioQuestionQualityAcceptable(buildQuestion(4), 'Curs.pdf')).toBe(true);
  });

  it('rejects a single-answer question with too few or too many options', () => {
    expect(isStudioQuestionQualityAcceptable(buildQuestion(3), 'Curs.pdf')).toBe(false);
    expect(isStudioQuestionQualityAcceptable(buildQuestion(6), 'Curs.pdf')).toBe(false);
  });

  it('still requires exactly one correct answer for complement simplu', () => {
    const twoCorrect = buildQuestion(5, 2);
    twoCorrect.multipleCorrect = false;
    // Two correct answers make it a complement multiplu, which needs 2-3 — valid
    // there, but it must never pass as a single-answer question.
    expect(isStudioQuestionQualityAcceptable({ ...twoCorrect, options: twoCorrect.options.slice(0, 3) }, 'Curs.pdf')).toBe(false);
  });
});

describe('two tracks: rezidențiat vs grilă simplă', () => {
  it('asks for four options on the plain subject track', () => {
    const prompt = buildQuestionPrompt(null, [], 'medium', undefined, 'single', undefined, 5, 'simple');
    expect(prompt).toContain('exact 4 opțiuni (A-D)');
    expect(prompt).not.toContain('exact 5 opțiuni (A-E)');

    const schema = prompt.slice(prompt.indexOf('{"questions"'));
    expect((schema.match(/"isCorrect"/g) ?? []).length).toBe(4);
  });

  it('keeps exam conventions out of the plain track', () => {
    const simple = buildQuestionPrompt(null, [], 'medium', undefined, 'single', undefined, 5, 'simple');
    expect(simple).not.toContain(RESIDENCY_STYLE_RULES);
    expect(simple).toContain('grilă simplă, pentru o materie de facultate');
  });

  it('defaults to the residency track', () => {
    expect(buildQuestionPrompt(null, [], 'medium')).toContain('exact 5 opțiuni (A-E)');
  });
});

describe('reading the requested track from the user', () => {
  const residency = [
    'fă-mi 20 de grile de rezidentiat din cardiologie',
    'vreau grile ca la examen',
    'dă-mi 10 grile cu 5 variante',
  ];
  it.each(residency)('detects rezidențiat in %j', (text) => {
    expect(detectExamStyle(text)).toBe('residency');
  });

  const simple = [
    'fă-mi grile simple din biochimie',
    'grile pentru materia de anatomie',
    'vreau 15 grile cu 4 variante',
  ];
  it.each(simple)('detects grilă simplă in %j', (text) => {
    expect(detectExamStyle(text)).toBe('simple');
  });

  it('returns null when nothing was requested, so the caller keeps its default', () => {
    expect(detectExamStyle('fă-mi 10 grile din cursul de micoze')).toBeNull();
  });

  it('labels each track for the student', () => {
    expect(EXAM_STYLE_META.residency.description).toContain('5 variante');
    expect(EXAM_STYLE_META.simple.description).toContain('4 variante');
    // The exam format alone must not hide a set from "Toate grilele": 'rezidentiat' is added on placement.
    expect(examStyleTags('residency')).not.toContain('rezidentiat');
    expect(examStyleTags('simple')).toContain('grila-simpla');
  });
});
