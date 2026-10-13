import { render, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import type { Quiz, QuizSession } from '../../types';
import { resolve } from '../../theme/motion';
import { THEMES } from '../../theme/themes';
import ResultHero from './ResultHero';

const presentation = vi.hoisted(() => ({ theme: 'light' as 'light' | 'dark', reducedMotion: true, performanceLite: false }));
vi.mock('../../theme/ThemeContext', () => ({ useTheme: () => THEMES[presentation.theme] }));
vi.mock('../../hooks/useAdaptiveMotion', () => ({
  useAdaptiveMotion: () => {
    const calmMotion = presentation.reducedMotion || presentation.performanceLite;
    return { ...presentation, calmMotion, t: resolve(calmMotion) };
  },
}));

const session: QuizSession = { id: 's', quizId: 'q', answers: {}, score: 3, total: 4, mode: 'study', startedAt: 10, finishedAt: 20, partialAnswers: ['partial'] };
const quiz = { id: 'q', title: 'Cardiologie', questions: [], penaltyMode: false } as unknown as Quiz;
const props = { quiz, session, sessions: [], pct: 75, grade: { label: 'Bine!', Icon: BookOpen, color: '#123456' }, duration: 10, formatTime: (seconds: number) => `${seconds}s`, wrongCount: 1, disciplineResults: [] };

describe('composed result hero in calm / lite mode', () => {
  it.each(['light', 'dark'] as const)('uses %s theme tokens and responsive partial-answer metrics', (theme) => {
    presentation.theme = theme;
    presentation.reducedMotion = true;
    presentation.performanceLite = false;
    const { container } = render(<ResultHero {...props} />);
    expect(screen.getByRole('heading', { name: 'Bine!' }).style.color).toBe(theme === 'light' ? 'rgb(29, 29, 31)' : 'rgb(245, 245, 247)');
    const metrics = container.querySelector('dl')!;
    expect(metrics.classList.contains('grid-cols-2')).toBe(true);
    expect(metrics.classList.contains('sm:grid-cols-4')).toBe(true);
    expect(metrics.querySelectorAll('dt')).toHaveLength(4);
    expect(screen.getByText('Greșite').nextElementSibling?.textContent).toBe('0');
  });

  it.each(['light', 'dark'] as const)('renders final scores immediately in %s for both opt-outs', (theme) => {
    presentation.theme = theme;
    for (const [reducedMotion, performanceLite] of [[true, false], [false, true]]) {
      presentation.reducedMotion = reducedMotion;
      presentation.performanceLite = performanceLite;
      const { container, unmount } = render(<ResultHero {...props} />);
      expect(Number(container.querySelectorAll('circle')[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(2 * Math.PI * 42 * 0.25);
      expect(container.querySelector('[style*="transform"]')).toBeNull();
      unmount();
    }
  });

  it('keeps the percentage readable while normal-mode ring reveal begins', () => {
    presentation.reducedMotion = false;
    presentation.performanceLite = false;
    const { container, unmount } = render(<ResultHero {...props} />);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(Number(container.querySelectorAll('circle')[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(2 * Math.PI * 42);
    unmount();
    presentation.reducedMotion = true;
  });
  it('renders the ring at its final value immediately and retains partial counts', () => {
    const { container } = render(<ResultHero {...props} />);
    const circle = container.querySelectorAll('circle')[1];
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(2 * Math.PI * 42 * 0.25);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('Parțiale')).toBeTruthy();
    expect(container.firstElementChild?.getAttribute('style')).not.toContain('opacity: 0');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('keeps the empty-session ring finite and preserves the penalty summary', () => {
    const { container } = render(<ResultHero {...props} pct={0}
      quiz={{ ...quiz, penaltyMode: true }} session={{ ...session, total: 0, score: 0, penalizedScore: -0.25, partialAnswers: [] }} />);
    expect(Number(container.querySelectorAll('circle')[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(2 * Math.PI * 42);
    expect(screen.getByText('Scor net Rezidențiat')).toBeTruthy();
    expect(screen.getByText(/0% din punctajul maxim/)).toBeTruthy();
  });
});
