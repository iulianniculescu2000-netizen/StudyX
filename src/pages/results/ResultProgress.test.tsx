import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QuizSession } from '../../types';
import ResultProgress from './ResultProgress';

const current: QuizSession = { id: 'current', quizId: 'quiz', answers: { a: ['x'], b: ['y'] }, startedAt: 100, finishedAt: 200, score: 2, total: 2, mode: 'study' };
const prior: QuizSession = { ...current, id: 'prior', startedAt: 10, finishedAt: 20, score: 1 };

describe('result comparison', () => {
  it('uses the latest eligible attempt regardless of history order', () => {
    const older = { ...prior, id: 'older', finishedAt: 15, score: 0 };
    render(<ResultProgress session={current} sessions={[current, older, prior]} penaltyMode={false} />);
    expect(screen.getByText('+50 puncte procentuale')).toBeTruthy();
  });

  it.each([
    { mode: 'exam' as const }, { quizId: 'other' }, { total: 3 },
    { finishedAt: undefined }, { finishedAt: 150 }, { penalizedScore: 1 },
    { answers: { a: ['x'], c: ['y'] } }, { id: 'current' }, { score: NaN }, { score: 3 },
  ])('hides comparison for incompatible history: %j', (change) => {
    const { container } = render(<ResultProgress session={current} sessions={[{ ...prior, ...change }]} penaltyMode={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('hides comparison for penalty, empty and incomplete current sessions', () => {
    const { container, rerender } = render(<ResultProgress session={current} sessions={[prior]} penaltyMode />);
    expect(container.firstChild).toBeNull();
    for (const change of [{ penalizedScore: 1 }, { total: 0 }, { finishedAt: undefined }, { answers: { a: ['x'] } }, { score: NaN }]) {
      rerender(<ResultProgress session={{ ...current, ...change }} sessions={[prior]} penaltyMode={false} />);
      expect(container.firstChild).toBeNull();
    }
  });

  it.each([[2, '+50'], [1, 'Același scor'], [0, '−50']])('reports honest change for score %s', (score, label) => {
    render(<ResultProgress session={{ ...current, score: Number(score) }} sessions={[prior]} penaltyMode={false} />);
    expect(screen.getByText(new RegExp(String(label).replace('+', '\\+')))).toBeTruthy();
  });
});
