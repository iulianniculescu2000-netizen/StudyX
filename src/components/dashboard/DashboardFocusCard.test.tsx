import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import DashboardFocusCard from './DashboardFocusCard';
import { expectNoA11yViolations } from '../../test/a11y';
import type { StudyFocusItem } from '../../lib/topicMastery';

const item = (kind: StudyFocusItem['kind'], topic: string, extra: Partial<StudyFocusItem['topic']> = {}): StudyFocusItem => ({
  kind,
  topic: { topic, mastery: 38, answered: 6, wrong: 4, lastSeen: 0, daysSince: 9, ...extra },
});

function wrap(node: React.ReactNode) {
  return render(<MemoryRouter><ThemeProvider>{node}</ThemeProvider></MemoryRouter>);
}

describe('DashboardFocusCard', () => {
  it('nu afișează nimic fără subiecte', () => {
    const { container } = wrap(<DashboardFocusCard items={[]} onPractice={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('spune motivul în cifre și pornește exersarea subiectului', () => {
    const onPractice = vi.fn();
    wrap(<DashboardFocusCard items={[item('weak', 'Aritmii'), item('stale', 'Insuficiență cardiacă', { mastery: 80 })]} onPractice={onPractice} />);
    expect(screen.getByText(/4 greșeli din 6 răspunsuri/)).toBeTruthy();
    expect(screen.getByText(/Nu l-ai mai atins de 9 zile/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exersează Aritmii' }));
    expect(onPractice).toHaveBeenCalledWith('Aritmii');
  });

  it('nu are probleme de accesibilitate (axe)', async () => {
    const { container } = wrap(<DashboardFocusCard items={[item('weak', 'Aritmii'), item('stale', 'Insuficiență cardiacă', { mastery: 80 })]} onPractice={() => {}} />);
    await expectNoA11yViolations(container);
  }, 30_000);

  it('arată „Grile noi” doar pentru subiecte slabe și doar când există generare', () => {
    const items = [item('weak', 'Aritmii'), item('stale', 'Insuficiență cardiacă', { mastery: 80 })];
    const first = wrap(<DashboardFocusCard items={items} onPractice={() => {}} />);
    expect(screen.queryByText('Grile noi')).toBeNull();
    first.unmount();

    const onGenerate = vi.fn();
    wrap(<DashboardFocusCard items={items} onPractice={() => {}} onGenerate={onGenerate} />);
    expect(screen.getAllByText('Grile noi')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Grile noi despre Aritmii' }));
    expect(onGenerate).toHaveBeenCalledWith('Aritmii');
  });

  it('în timpul generării arată progresul și nu lasă un al doilea clic', () => {
    wrap(<DashboardFocusCard items={[item('weak', 'Aritmii')]} onPractice={() => {}} onGenerate={() => {}} generatingTopic="Aritmii" />);
    const button = screen.getByRole('button', { name: 'Grile noi despre Aritmii' }) as HTMLButtonElement;
    expect(button.textContent).toBe('Generez…');
    expect(button.disabled).toBe(true);
  });

  it('nu are probleme de accesibilitate (axe) cu butonul de generare', async () => {
    const { container } = wrap(<DashboardFocusCard items={[item('weak', 'Aritmii')]} onPractice={() => {}} onGenerate={() => {}} />);
    await expectNoA11yViolations(container);
  }, 30_000);
});
