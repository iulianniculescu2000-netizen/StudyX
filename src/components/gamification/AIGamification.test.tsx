import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AIGamification from './AIGamification';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { ThemeProvider } from '../../theme/ThemeContext';
import type { Quiz, QuizSession } from '../../types';

// The exit animation of AnimatePresence needs real animation frames, which the fake timers of the
// test setup never deliver; without exit animations a closed dialog leaves the DOM at once.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <AIGamification userId="p1" username="" />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function tile(label: string): HTMLElement {
  return screen.getByText(label).closest('div')!.parentElement!;
}

afterEach(() => {
  useQuizStore.getState().reset();
  useStatsStore.getState().reset();
});

describe('AIGamification with an empty profile', () => {
  it('shows zeros and dashes, never NaN', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Realizări' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
    expect(within(tile('Acuratețe')).getByText('—')).toBeTruthy();
    expect(screen.getByText('încă 4 pași')).toBeTruthy();
    expect(screen.getByText('/4')).toBeTruthy();
  });

  it('switches tabs and says there is nothing to compare', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Provocări' }));
    expect(screen.getByText('Ritm săptămânal')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Începe provocarea' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('tab', { name: 'Tu vs. tine' }));
    expect(screen.getByText('Azi nu ai răspuns încă la întrebări.')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Acuratețe pe ultimele 7 zile/ })).toBeTruthy();
  });

  it('moves between tabs with the arrow keys and keeps one tab in the tab order', () => {
    renderPage();
    const first = screen.getByRole('tab', { name: 'Realizări' });
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('aria-controls')).toBe('gamification-panel-achievements');
    expect(screen.getByRole('tab', { name: 'Provocări' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tab', { name: 'Provocări' }).getAttribute('aria-controls')).toBeNull();

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('tab', { name: 'Provocări' });
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(second);
    expect(screen.getByRole('tabpanel').id).toBe('gamification-panel-challenges');

    fireEvent.keyDown(second, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Tu vs. tine' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tu vs. tine' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Realizări' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Realizări' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Tu vs. tine' }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens an achievement as a dialog and removes it after Escape', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Constructor de bancă/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Cum se măsoară')).toBeTruthy();
    expect(within(dialog).getByRole('progressbar', { name: /Progres: Constructor de bancă/ })).toBeTruthy();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AIGamification with real data', () => {
  // Midday on a fixed date: "today" and "yesterday" stay stable even when the run crosses midnight.
  beforeEach(() => { vi.setSystemTime(new Date('2026-10-13T12:00:00')); });

  function seed() {
    const now = Date.now();
    const quiz: Quiz = {
      id: 'q1', title: 'Cardio', description: '', emoji: '', category: 'Cardiologie', color: 'blue', createdAt: 1,
      questions: [{ id: 'a', text: 'a', options: [{ id: 'x', text: 'x', isCorrect: true }, { id: 'y', text: 'y', isCorrect: false }] }],
    };
    const session: QuizSession = {
      id: 's1', quizId: 'q1', answers: {}, startedAt: now - 5 * 60_000, finishedAt: now - 60_000, score: 9, total: 10, mode: 'study',
    };
    useQuizStore.setState({ quizzes: [quiz], sessions: [session] });
    useStatsStore.setState({
      questionStats: {
        'q1:a': {
          questionId: 'a', quizId: 'q1', timesCorrect: 9, timesWrong: 1,
          lastSeen: now, nextReview: now, interval: 1, eFactor: 2.5, consecutiveCorrect: 3,
        },
      },
    });
  }

  it('fills the accuracy and weekly tiles from the sessions and drops the dash', () => {
    seed();
    renderPage();
    const accuracy = tile('Acuratețe');
    expect(within(accuracy).queryByText('—')).toBeNull();
    expect(within(accuracy).getByText('90')).toBeTruthy();
    expect(within(accuracy).getByText('Toate răspunsurile, tot istoricul')).toBeTruthy();
    expect(within(tile('Întrebări în 7 zile')).getByText('10')).toBeTruthy();
  });

  it('points the challenges at places that exist', () => {
    seed();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Provocări' }));
    const links = screen.getAllByRole('link', { name: 'Începe provocarea' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/quizzes', '/quizzes', '/daily-review']);
    expect(screen.getAllByText(/Se numără doar sesiunile de grile încheiate în ultimele 7 zile/).length).toBe(2);
  });

  it('shows today in the comparison with the real accuracy', () => {
    seed();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Tu vs. tine' }));
    expect(screen.getByText('Ieri nu ai răspuns la întrebări, nu avem cu ce compara.')).toBeTruthy();
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0);
  });
});
