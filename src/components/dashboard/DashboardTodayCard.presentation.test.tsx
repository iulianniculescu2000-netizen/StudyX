import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { THEMES } from '../../theme/themes';
import type { PlanSummary } from '../../lib/organizare/types';
import DashboardTodayCard from './DashboardTodayCard';

const presentation = vi.hoisted(() => ({ theme: 'light' as 'light' | 'dark', calmMotion: true }));
vi.mock('../../theme/ThemeContext', () => ({ useTheme: () => THEMES[presentation.theme] }));
vi.mock('../../hooks/useAdaptiveMotion', () => ({ useAdaptiveMotion: () => ({ calmMotion: presentation.calmMotion }) }));
const today = new Date('2026-10-05T09:00:00');
const plan = { ts: today.getTime(), exam: '2026-12-01', phase: 2, today: { n: 'Evaluarea și tratamentul aritmiilor supraventriculare', g: 'Cardiologie', src: 'Kumar p.151–153' } } as PlanSummary;

describe('today focus presentation', () => {
  it.each(['light', 'dark'] as const)('keeps one primary action in %s with recap and plan', (theme) => {
    presentation.theme = theme;
    const { container } = render(<MemoryRouter><DashboardTodayCard dueCount={7} plan={plan} today={today} /></MemoryRouter>);
    const recap = screen.getByRole('link', { name: 'Recapitulează' });
    const organize = screen.getByRole('link', { name: 'Deschide planul' });
    expect(recap.classList.contains('text-white')).toBe(true);
    expect(organize.classList.contains('text-white')).toBe(false);
    expect(screen.getByText(/7 întrebări/).classList.contains('text-lg')).toBe(true);
    expect(container.querySelector('.fx-spot')).toBeNull();
    expect(screen.getByRole('region', { name: 'Azi' }).classList.contains('fx-rise')).toBe(false);
    expect(recap.getAttribute('href')).toBe('/daily-review');
    expect(organize.getAttribute('href')).toBe('/rezidentiat/organizare');
  });

  it('promotes the plan when no review is due and keeps narrow-layout actions under wrapping text', () => {
    render(<MemoryRouter><DashboardTodayCard dueCount={0} plan={plan} today={today} /></MemoryRouter>);
    const action = screen.getByRole('link', { name: 'Deschide planul' });
    expect(action.classList.contains('text-white')).toBe(true);
    expect(action.classList.contains('col-start-2')).toBe(true);
    expect(action.classList.contains('sm:col-start-auto')).toBe(true);
    expect(action.parentElement?.classList.contains('grid-cols-[40px_minmax(0,1fr)]')).toBe(true);
    expect(screen.getByText(plan.today!.n).classList.contains('break-words')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Recapitulează' })).toBeNull();
  });
});
