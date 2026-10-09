import { describe, expect, it } from 'vitest';
import { computeDashboardTrends } from './dashboardTrends';
import type { Quiz, QuizSession } from '../types';

const NOW = new Date('2026-07-25T12:00:00Z').getTime();
const DAY = 86_400_000;

function quiz(createdAt: number, id = String(createdAt)): Quiz {
  return {
    id, title: id, description: '', emoji: '📘', category: 'test', color: 'blue',
    questions: [], createdAt,
  };
}

function session(finishedAt: number, score: number, total: number, durationMs = 600_000): QuizSession {
  return {
    id: String(finishedAt), quizId: 'q', answers: {},
    startedAt: finishedAt - durationMs, finishedAt, score, total, mode: 'study',
  };
}

describe('computeDashboardTrends', () => {
  it('reports nothing when there is no previous week to compare against', () => {
    const trends = computeDashboardTrends([quiz(NOW - DAY)], [session(NOW - DAY, 8, 10)], NOW);
    expect(trends).toEqual({ quizzes: null, accuracy: null, studyTime: null });
  });

  it('reports a real accuracy gain in percentage points', () => {
    const trends = computeDashboardTrends([], [
      session(NOW - 10 * DAY, 5, 10),  // previous week: 50%
      session(NOW - 2 * DAY, 7, 10),   // current week: 70%
    ], NOW);
    expect(trends.accuracy).toBe(20);
  });

  it('reports a real accuracy drop', () => {
    const trends = computeDashboardTrends([], [
      session(NOW - 10 * DAY, 9, 10),
      session(NOW - 2 * DAY, 6, 10),
    ], NOW);
    expect(trends.accuracy).toBe(-30);
  });

  it('reports percent change in quizzes created', () => {
    const trends = computeDashboardTrends([
      quiz(NOW - 10 * DAY, 'a'), quiz(NOW - 9 * DAY, 'b'),      // previous: 2
      quiz(NOW - 2 * DAY, 'c'), quiz(NOW - DAY, 'd'), quiz(NOW - 3 * DAY, 'e'), // current: 3
    ], [], NOW);
    expect(trends.quizzes).toBe(50);
  });

  it('reports percent change in time actually studied', () => {
    const trends = computeDashboardTrends([], [
      session(NOW - 10 * DAY, 1, 1, 600_000),   // previous: 10 min
      session(NOW - 2 * DAY, 1, 1, 900_000),    // current: 15 min
    ], NOW);
    expect(trends.studyTime).toBe(50);
  });

  it('ignores anything older than two weeks', () => {
    const trends = computeDashboardTrends([], [
      session(NOW - 30 * DAY, 0, 10),
      session(NOW - 10 * DAY, 5, 10),
      session(NOW - 2 * DAY, 5, 10),
    ], NOW);
    expect(trends.accuracy).toBe(0);
  });

  it('does not invent a trend from an unfinished session', () => {
    const unfinished: QuizSession = {
      id: 'u', quizId: 'q', answers: {}, startedAt: NOW - DAY, score: 0, total: 10, mode: 'study',
    };
    const trends = computeDashboardTrends([], [unfinished], NOW);
    expect(trends.accuracy).toBeNull();
    expect(trends.studyTime).toBeNull();
  });

  it('stays null when the previous week had activity but no answered questions', () => {
    const trends = computeDashboardTrends([], [
      session(NOW - 10 * DAY, 0, 0),
      session(NOW - 2 * DAY, 5, 10),
    ], NOW);
    expect(trends.accuracy).toBeNull();
  });
});
