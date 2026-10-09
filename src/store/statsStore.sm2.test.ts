/**
 * SM-2 scheduling guards.
 *
 * A flashcard whose interval collapses to zero is due forever: it keeps
 * reappearing in "Restante" no matter how well the user answers it, which
 * quietly wrecks the review queue for the whole deck.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useStatsStore } from './statsStore';
import type { QuestionStat } from '../types';

const QUIZ = 'q1';
const QUESTION = 'card1';
const KEY = `${QUIZ}:${QUESTION}`;

function stat(): QuestionStat {
  return useStatsStore.getState().questionStats[KEY];
}

/** Seed a stat that already graduated but carries a zero interval (legacy/partial data). */
function seedGraduatedWithZeroInterval() {
  useStatsStore.getState()._hydrate({
    questionStats: {
      [KEY]: {
        questionId: QUESTION,
        quizId: QUIZ,
        timesCorrect: 5,
        timesWrong: 0,
        lastSeen: Date.now(),
        nextReview: Date.now(),
        interval: 0,
        eFactor: 2.5,
        consecutiveCorrect: 5,
      },
    },
    streak: { currentStreak: 0, longestStreak: 0, lastStudyDate: '', studyDates: [] },
    totalStudyTime: 0,
  });
}

beforeEach(() => {
  useStatsStore.getState()._hydrate({
    questionStats: {},
    streak: { currentStreak: 0, longestStreak: 0, lastStudyDate: '', studyDates: [] },
    totalStudyTime: 0,
  });
});

describe('SM-2 interval', () => {
  it('never schedules a correct answer for review in the past or right now', () => {
    seedGraduatedWithZeroInterval();
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident');

    expect(stat().interval).toBeGreaterThanOrEqual(1);
    expect(stat().nextReview).toBeGreaterThan(Date.now());
  });

  it('does not leave a well-answered card permanently due', () => {
    seedGraduatedWithZeroInterval();
    for (let i = 0; i < 5; i++) {
      useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident');
    }

    const due = useStatsStore.getState().getDueQuestions().map((s) => s.questionId);
    expect(due).not.toContain(QUESTION);
  });

  it('still grows the interval normally from a healthy card', () => {
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident'); // n=0 -> 1 day
    expect(stat().interval).toBe(1);
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident'); // n=1 -> 6 days
    expect(stat().interval).toBe(6);
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident'); // n>=2 -> interval * EF
    expect(stat().interval).toBeGreaterThan(6);
  });

  it('still resets to one day on a lapse', () => {
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident');
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'confident');
    useStatsStore.getState().recordAnswer(QUIZ, QUESTION, false);

    expect(stat().interval).toBe(1);
    expect(stat().consecutiveCorrect).toBe(0);
  });

  it('keeps the ease factor at or above the SM-2 floor', () => {
    for (let i = 0; i < 15; i++) {
      useStatsStore.getState().recordAnswer(QUIZ, QUESTION, false, 'blackout');
      useStatsStore.getState().recordAnswer(QUIZ, QUESTION, true, 'guess');
    }
    expect(stat().eFactor).toBeGreaterThanOrEqual(1.3);
  });
});
