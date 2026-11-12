import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AccuracyTrendChart from './AccuracyTrendChart';
import ActivityBarChart from './ActivityBarChart';
import CategoryRadarChart from './CategoryRadarChart';
import { ThemeProvider, useTheme } from '../../theme/ThemeContext';
import { expectNoA11yViolations } from '../../test/a11y';
import { activitySummary, labelIndexes, niceScale, truncateLabel } from './chartMath';

const day = (d: string, sesiuni: number, acuratete: number) => ({ day: d, sesiuni, acuratete });

function Host({ children }: { children: (theme: ReturnType<typeof useTheme>) => ReactNode }) {
  return <>{children(useTheme())}</>;
}
const wrap = (node: (theme: ReturnType<typeof useTheme>) => ReactNode) => render(<ThemeProvider><Host>{node}</Host></ThemeProvider>);

describe('chartMath', () => {
  it('picks round ticks and never returns NaN', () => {
    expect(niceScale(0, 4)).toEqual({ max: 4, step: 1 });
    expect(niceScale(7, 4)).toEqual({ max: 8, step: 2 });
    expect(niceScale(130, 4)).toEqual({ max: 150, step: 50 });
    expect(niceScale(Number.NaN, 4).max).toBe(4);
    expect(niceScale(Infinity, 4).max).toBe(4);
  });
  it('thins labels without crowding the last one', () => {
    expect(labelIndexes(28, 7)).toEqual([0, 7, 14, 21, 27]);
    expect(labelIndexes(10, 3)).toEqual([0, 3, 6, 9]);
    expect(labelIndexes(8, 3)).toEqual([0, 3, 6]);
    expect(labelIndexes(0, 3)).toEqual([]);
  });
  it('truncates long labels and writes Romanian summaries', () => {
    expect(truncateLabel('Medicină internă și urgențe', 12)).toBe('Medicină in…');
    expect(activitySummary([day('1 nov.', 0, 0)])).toBe('Activitate pe 1 zi: nicio sesiune.');
    expect(activitySummary([])).toMatch(/nu există date/);
    expect(activitySummary([day('1 nov.', Number.NaN, 0), day('2 nov.', 3, 0)])).toMatch(/3 sesiuni/);
  });
});

describe('stats charts', () => {
  it('activity chart: summary, accessible, handles empty and NaN data', async () => {
    const first = wrap((theme) => <ActivityBarChart data={[day('1 nov.', 2, 80), day('2 nov.', Number.NaN, 0)]} theme={theme} tooltip={<div />} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Activitate pe 2 zile: 2 sesiuni/);
    expect(first.container.textContent).not.toMatch(/NaN/);
    await expectNoA11yViolations(first.container);
    first.unmount();
    wrap((theme) => <ActivityBarChart data={[]} theme={theme} tooltip={<div />} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/nu există date/);
  });

  it('accuracy chart: one point is described, empty shows a message', () => {
    const one = wrap((theme) => <AccuracyTrendChart data={[day('1 nov.', 1, 150)]} theme={theme} tooltip={<div />} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Acuratețe: 100% pe 1 nov..');
    one.unmount();
    wrap((theme) => <AccuracyTrendChart data={[]} theme={theme} tooltip={<div />} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Apare după prima sesiune/)).toBeTruthy();
  });

  it('radar chart: summary lists every category, empty shows a message', () => {
    const r = wrap((theme) => <CategoryRadarChart data={[{ subject: 'Anatomie', acuratete: 60, fullMark: 100 }, { subject: 'Fiziologie', acuratete: Number.NaN, fullMark: 100 }]} theme={theme} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Acuratețe pe 2 categorii. Anatomie: 60%; Fiziologie: 0%.');
    r.unmount();
    wrap((theme) => <CategoryRadarChart data={[]} theme={theme} />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
