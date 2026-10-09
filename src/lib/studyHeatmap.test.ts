/**
 * The consistency map is read at a glance, so the grid has to be right: local
 * days (not UTC, which shifts every evening session to the next day for us),
 * Monday-first columns, and levels relative to the student's own best day.
 */
import { describe, expect, it } from 'vitest';
import { buildStudyHeatmap, dayKey, toWeekColumns } from './studyHeatmap';
import type { QuizSession } from '../types';

const DAY = 86400000;

function session(at: number, answered: number): QuizSession {
  return {
    id: Math.random().toString(36).slice(2),
    quizId: 'q',
    answers: Object.fromEntries(Array.from({ length: answered }, (_, index) => [`q${index}`, ['a']])),
    startedAt: at - 600000,
    finishedAt: at,
    score: answered,
    total: answered,
    mode: 'study',
  };
}

describe('day keys', () => {
  it('uses the local calendar day, not UTC', () => {
    // 23:30 local — toISOString would roll this to the next day east of UTC.
    const evening = new Date(2026, 2, 15, 23, 30).getTime();
    expect(dayKey(evening)).toBe('2026-03-15');
  });
});

describe('building the grid', () => {
  const now = new Date(2026, 6, 15, 12, 0).getTime(); // Wednesday

  it('covers the requested window and ends today', () => {
    const summary = buildStudyHeatmap([], 4, now);
    expect(summary.days.at(-1)?.date).toBe('2026-07-15');
    // Four weeks of days, plus padding back to Monday.
    expect(summary.days.length).toBeGreaterThanOrEqual(28);
    expect(summary.days.length).toBeLessThanOrEqual(34);
  });

  it('starts on a Monday so week columns line up', () => {
    const summary = buildStudyHeatmap([], 6, now);
    expect(summary.days[0].weekday).toBe(0);
  });

  it('counts answered questions per day', () => {
    const summary = buildStudyHeatmap(
      [session(now - DAY, 12), session(now - DAY, 8), session(now, 5)],
      4,
      now,
    );
    const yesterday = summary.days.find((day) => day.date === dayKey(now - DAY));
    expect(yesterday?.questions).toBe(20);
    expect(summary.totalQuestions).toBe(25);
    expect(summary.activeDays).toBe(2);
    expect(summary.bestDay?.questions).toBe(20);
  });

  it('scales levels against the busiest day', () => {
    const summary = buildStudyHeatmap(
      [session(now, 100), session(now - DAY, 50), session(now - 2 * DAY, 5)],
      4,
      now,
    );
    const level = (offset: number) => summary.days.find((day) => day.date === dayKey(now - offset * DAY))?.level;
    expect(level(0)).toBe(4);
    expect(level(1)).toBe(3);
    expect(level(2)).toBe(1);
    expect(level(3)).toBe(0);
  });

  it('measures the longest run of consecutive days', () => {
    const summary = buildStudyHeatmap(
      [session(now - 5 * DAY, 3), session(now - 4 * DAY, 3), session(now - 3 * DAY, 3), session(now - DAY, 3)],
      4,
      now,
    );
    expect(summary.bestRun).toBe(3);
  });

  it('ignores sessions with nothing answered', () => {
    const empty = session(now, 0);
    empty.total = 0;
    const summary = buildStudyHeatmap([empty], 4, now);
    expect(summary.activeDays).toBe(0);
    expect(summary.bestDay?.questions ?? 0).toBe(0);
  });

  it('falls back to the start time when a session was never finished', () => {
    const unfinished = session(now, 4);
    delete unfinished.finishedAt;
    const summary = buildStudyHeatmap([unfinished], 4, now);
    expect(summary.totalQuestions).toBe(4);
  });
});

describe('week columns', () => {
  it('splits days into columns that each start on Monday', () => {
    const summary = buildStudyHeatmap([], 3, new Date(2026, 6, 15).getTime());
    const columns = toWeekColumns(summary.days);
    expect(columns.length).toBeGreaterThanOrEqual(3);
    columns.forEach((column) => expect(column[0].weekday).toBe(0));
    columns.slice(0, -1).forEach((column) => expect(column).toHaveLength(7));
  });
});
