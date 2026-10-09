import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import DashboardTodayCard from './DashboardTodayCard';
import type { PlanSummary } from '../../lib/organizare/types';

const plan: PlanSummary = {
  ts: new Date('2026-10-05T09:00:00').getTime(),
  exam: '2026-12-01',
  phase: 2,
  done: 3,
  total: 10,
  pct: 30,
  streak: 1,
  today: { n: 'Aritmii', g: 'Cardiologie', src: 'Kumar p.151-153', pages: 3 },
} as PlanSummary;

function wrap(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>,
  );
}

describe('DashboardTodayCard', () => {
  it('nu afișează nimic fără întrebări scadente și fără plan', () => {
    const { container } = wrap(<DashboardTodayCard dueCount={0} plan={null} today={new Date('2026-10-05')} />);
    expect(container.firstChild).toBeNull();
  });

  it('arată numărul real de întrebări și trimite la recapitulare', () => {
    wrap(<DashboardTodayCard dueCount={7} plan={null} today={new Date('2026-10-05')} />);
    expect(screen.getByText(/7 întrebări de recapitulat/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Recapitulează' }).getAttribute('href')).toBe('/daily-review');
    expect(screen.queryByText('Deschide planul')).toBeNull();
  });

  it('arată ținta din plan când există, fără rând de recapitulare dacă nu e nimic scadent', () => {
    wrap(<DashboardTodayCard dueCount={0} plan={plan} today={new Date('2026-10-05')} />);
    expect(screen.getByText('Aritmii')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Deschide planul' }).getAttribute('href')).toBe('/rezidentiat/organizare');
    expect(screen.queryByText('Recapitulează')).toBeNull();
  });

  it('nu arată topicul unei zile trecute', () => {
    wrap(<DashboardTodayCard dueCount={0} plan={plan} today={new Date('2026-10-06T09:00:00')} />);
    expect(screen.queryByText('Aritmii')).toBeNull();
    expect(screen.getByText('Planul tău')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Deschide planul' })).toBeTruthy();
  });

  it('după examen nu mai numără „0 zile”', () => {
    wrap(<DashboardTodayCard dueCount={0} plan={{ ...plan, exam: '2026-09-01' }} today={new Date('2026-10-05T09:00:00')} />);
    expect(screen.getByText('Examenul a trecut')).toBeTruthy();
    expect(screen.queryByText(/0 zile/)).toBeNull();
  });
});
