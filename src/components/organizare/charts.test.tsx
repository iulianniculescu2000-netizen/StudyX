import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccuracyChart, Heatmap, HoursChart, ProgressChart } from './charts';
import { ThemeProvider } from '../../theme/ThemeContext';
import { expectNoA11yViolations } from '../../test/a11y';

const view = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);
const label = (c: HTMLElement) => c.querySelector('svg')!.getAttribute('aria-label')!;

describe('Organizare charts', () => {
  it('HoursChart: empty, NaN and huge values stay finite; summary in words', async () => {
    const empty = view(<HoursChart data={[]} />);
    expect(label(empty.container)).toMatch(/nu există date/);
    expect(empty.container.innerHTML).not.toMatch(/NaN|Infinity/);
    empty.unmount();
    const data = [
      { day: '2026-11-01', hours: 2.5, target: 2.5 },
      { day: '2026-11-02', hours: Number.NaN, target: 2.5 },
      { day: '2026-11-03', hours: 90, target: 5.5 },
    ];
    const { container } = view(<HoursChart data={data} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(label(container)).toMatch(/ultimele 3 zile.*în 2 zile de studiu/);
    expect(container.querySelectorAll('line').length).toBeLessThanOrEqual(7);
    await expectNoA11yViolations(container);
  });

  it('ProgressChart: without progress or with a single-day window', () => {
    const { container } = view(<ProgressChart data={{ from: '2026-11-01', to: '2026-11-01', plan: [['2026-11-01', 0]], actual: [] }} today="2026-11-01" />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(label(container)).toMatch(/niciun topic/);
  });

  it('ProgressChart: values above 100% stay inside the plot', () => {
    const { container } = view(<ProgressChart data={{ from: '2026-11-01', to: '2026-11-10', plan: [['2026-11-01', 0], ['2026-11-10', 1]], actual: [['2026-11-01', 0], ['2026-11-05', 1.4]] }} today="2026-11-05" />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(label(container)).toMatch(/100% din pagini/);
  });

  it('AccuracyChart: one point, no points', () => {
    const none = view(<AccuracyChart data={[{ week: '2026-11-02', g: 0, p: null }]} />);
    expect(label(none.container)).toMatch(/nu există date/);
    none.unmount();
    const { container } = view(<AccuracyChart data={[{ week: '2026-11-02', g: 12, p: 0.75 }, { week: '2026-11-09', g: 0, p: null }]} />);
    expect(label(container)).toMatch(/1 săptămână cu date.*75% din 12 grile/);
    expect(container.innerHTML).not.toMatch(/NaN/);
  });

  it('Heatmap: empty grid and a normal grid', () => {
    const empty = view(<Heatmap grid={[]} />);
    expect(empty.container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(label(empty.container)).toMatch(/nu există date/);
    empty.unmount();
    const { container } = view(<Heatmap grid={[[{ day: '2026-11-02', hours: 2, level: 0.8 }, null, null, null, null, null, null]]} />);
    expect(label(container)).toMatch(/1 zi de studiu din 1, 2,0 h/);
  });
});
