import { describe, expect, it } from 'vitest';
import { EXAM_PARAMS, apportion, blueprintPromptBlock, planQuestionSet } from './examBlueprint';
import { buildQuestionPrompt } from '../../ai/prompts';

const seeded = (seed = 7) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe('apportion', () => {
  it('împarte exact și proporțional', () => {
    expect(apportion(20, [0.11, 0.2, 0.3, 0.25, 0.15])).toEqual([2, 4, 6, 5, 3]);
    expect(apportion(7, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(7);
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
  });
});

describe('planQuestionSet', () => {
  it('la complement multiplu respectă 25/56/19 pe un lot de 100', () => {
    const plan = planQuestionSet(100, 'multiple', seeded());
    const by = (n: number) => plan.filter((p) => p.correct === n).length;
    expect([by(2), by(3), by(4)]).toEqual([25, 56, 19]);
    expect(plan.every((p) => p.correct >= 2 && p.correct <= 4)).toBe(true);
  });

  it('metodele de distractori ies 48/30/22 pe 100', () => {
    const plan = planQuestionSet(100, 'single', seeded());
    const by = (s: string) => plan.filter((p) => p.strategy === s).length;
    expect(by('external') + by('internal') + by('mixed')).toBe(100);
    expect(Math.abs(by('external') - 48.5)).toBeLessThan(1.5);
    expect(Math.abs(by('internal') - 30)).toBeLessThan(1.5);
    expect(plan.every((p) => p.correct === 1)).toBe(true);
  });

  it('un lot nu iese uniform: nu toate grilele CM au 3 corecte', () => {
    const plan = planQuestionSet(10, 'multiple', seeded());
    expect(new Set(plan.map((p) => p.correct)).size).toBeGreaterThan(1);
  });

  it('parametrii însumează 1', () => {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(EXAM_PARAMS.correctCount)).toBeCloseTo(1, 5);
    expect(sum(EXAM_PARAMS.strategy)).toBeCloseTo(1, 5);
    expect(EXAM_PARAMS.singleKeyLetter.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 1); // Educato n=301 însumează 101%: apportion normalizează
  });
});

describe('blueprintPromptBlock', () => {
  it('e gol pentru o singură grilă și pentru loturi foarte mari', () => {
    expect(blueprintPromptBlock(planQuestionSet(1, 'single'))).toBe('');
    expect(blueprintPromptBlock(planQuestionSet(40, 'single'))).toBe('');
  });

  it('numerotează fiecare întrebare', () => {
    const block = blueprintPromptBlock(planQuestionSet(5, 'multiple', seeded()));
    expect(block).toContain('PLAN PE ÎNTREBĂRI');
    expect(block).toContain('5) ');
    expect(block).toMatch(/\d corecte/);
  });
});

describe('planul în promptul de grile', () => {
  it('apare la rezidențiat cu mai multe grile, nu la pista simplă și nu la o grilă', () => {
    const many = buildQuestionPrompt(null, [], 'medium', undefined, 'multiple', undefined, 6, 'residency');
    expect(many).toContain('PLAN PE ÎNTREBĂRI');
    expect(buildQuestionPrompt(null, [], 'medium', undefined, 'multiple', undefined, 6, 'simple')).not.toContain('PLAN PE ÎNTREBĂRI');
    expect(buildQuestionPrompt(null, [], 'medium', undefined, 'single', undefined, 1, 'residency')).not.toContain('PLAN PE ÎNTREBĂRI');
  });
});

describe('regulile de construcție din text', () => {
  const context = { summary: 'Cadranul 8.7 Profilaxia antibiotică ...', chunks: [], query: 'x', weakTopics: [], level: 'medium' as const };

  it('intră doar la Rezidențiat și doar cu context', () => {
    const grounded = buildQuestionPrompt(null, [], 'medium', context, 'single', undefined, 3, 'residency');
    expect(grounded).toContain('CONSTRUCȚIE DIN TEXT');
    expect(buildQuestionPrompt(null, [], 'medium', undefined, 'single', undefined, 3, 'residency')).not.toContain('CONSTRUCȚIE DIN TEXT');
    expect(buildQuestionPrompt(null, [], 'medium', context, 'single', undefined, 3, 'simple')).not.toContain('CONSTRUCȚIE DIN TEXT');
  });
});
