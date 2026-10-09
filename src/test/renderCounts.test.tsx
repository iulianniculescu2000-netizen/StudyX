import { Profiler, type ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import QuizCard from '../components/QuizCard';
import Sidebar from '../components/Sidebar';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { ThemeProvider } from '../theme/ThemeContext';
import type { Quiz, QuestionStat } from '../types';

const quiz: Quiz = {
  id: 'q1',
  title: 'Test',
  description: '',
  emoji: '📘',
  category: 'Anatomie',
  questions: [],
  createdAt: 1,
  color: 'blue',
};

function stat(id: string, over: Partial<QuestionStat> = {}): QuestionStat {
  return { questionId: id, quizId: 'q1', timesCorrect: 0, timesWrong: 0, lastSeen: 0, nextReview: 0, interval: 0, ...over };
}

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>
  );
}

describe('render counts: field selectors', () => {
  beforeEach(() => {
    localStorage.clear();
    useQuizStore.getState().reset();
    useStatsStore.getState().reset();
  });

  it('QuizCard does not re-render when only questionStats changes', () => {
    let commits = 0;
    render(wrap(<Profiler id="card" onRender={() => { commits += 1; }}><QuizCard quiz={quiz} /></Profiler>));
    const before = commits;
    act(() => { useStatsStore.setState({ questionStats: { a: stat('a', { timesCorrect: 3 }) } }); });
    act(() => { useStatsStore.setState({ totalStudyTime: 120 }); });
    expect(commits - before).toBe(0);
  });

  it('QuizCard still re-renders when its best score changes', () => {
    let commits = 0;
    const { container } = render(wrap(<Profiler id="card" onRender={() => { commits += 1; }}><QuizCard quiz={quiz} /></Profiler>));
    const before = commits;
    act(() => {
      useQuizStore.setState({
        sessions: [{ id: 's1', quizId: 'q1', score: 8, total: 10, startedAt: 1, answers: [] } as never],
      });
    });
    expect(commits - before).toBeGreaterThan(0);
    expect(container.textContent).toContain('80%');
  });

  it('Sidebar does not re-render for questionStats changes that keep due/answered counts', () => {
    let commits = 0;
    render(wrap(<Profiler id="sb" onRender={() => { commits += 1; }}><Sidebar /></Profiler>));
    const before = commits;
    // Unanswered, not due: neither dueCount nor totalAnswered changes.
    act(() => { useStatsStore.setState({ questionStats: { a: stat('a'), b: stat('b') } }); });
    act(() => { useStatsStore.setState({ totalStudyTime: 999 }); });
    expect(commits - before).toBe(0);
  });

  it('Sidebar re-renders when the answered count crosses into the rank', () => {
    let commits = 0;
    render(wrap(<Profiler id="sb" onRender={() => { commits += 1; }}><Sidebar /></Profiler>));
    const before = commits;
    act(() => { useStatsStore.setState({ questionStats: { a: stat('a', { timesCorrect: 5 }) } }); });
    expect(commits - before).toBeGreaterThan(0);
  });
});
