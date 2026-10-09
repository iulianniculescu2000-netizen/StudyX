import { describe, expect, it } from 'vitest';
import {
  LEVEL_STEP,
  MIN_QUESTIONS_FOR_RHYTHM,
  PERFECT_MIN_QUESTIONS,
  SESSION_MINUTES_CAP,
  activityPoints,
  bestDay,
  buildSelfComparison,
  compareDays,
  computeCategoryMastery,
  computeStudyLevel,
  countOwnSets,
  dailyAccuracy,
  effectiveStreak,
  masteryProgress,
  overallAccuracy,
  perfectSessionCount,
  sessionsThisWeek,
  studyMinutesThisWeek,
} from './gamificationProgress';
import type { QuestionStat, Quiz, QuizSession } from '../types';

const NOW = new Date('2026-07-25T12:00:00Z').getTime();
const DAY = 86_400_000;

function quiz(id: string, category: string, questionIds: string[]): Quiz {
  return {
    id, title: id, description: '', emoji: '📘', category, color: 'blue', createdAt: 1,
    questions: questionIds.map((qid) => ({
      id: qid, text: qid,
      options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }],
    })),
  };
}

function stat(quizId: string, questionId: string, correct: number, wrong: number): [string, QuestionStat] {
  return [`${quizId}:${questionId}`, {
    questionId, quizId, timesCorrect: correct, timesWrong: wrong,
    lastSeen: NOW, nextReview: NOW + DAY, interval: 1, eFactor: 2.5, consecutiveCorrect: correct,
  }];
}

function session(finishedAt: number, score: number, total: number): QuizSession {
  return { id: String(finishedAt), quizId: 'q', answers: {}, startedAt: finishedAt - 60_000, finishedAt, score, total, mode: 'study' };
}

describe('computeCategoryMastery', () => {
  it('counts only questions from the matching subject', () => {
    const quizzes = [quiz('a', 'Anatomie', ['a1', 'a2']), quiz('c', 'Cardiologie', ['c1'])];
    const stats = Object.fromEntries([
      stat('a', 'a1', 9, 1),
      stat('a', 'a2', 10, 0),
      stat('c', 'c1', 1, 9),
    ]);

    const mastery = computeCategoryMastery(quizzes, stats);
    const anatomy = mastery.find((m) => m.category === 'Anatomie')!;

    expect(anatomy.answeredQuestions).toBe(2);
    expect(anatomy.accuracy).toBe(95);
    expect(mastery.find((m) => m.category === 'Cardiologie')!.accuracy).toBe(10);
  });

  it('survives a quiz without a questions array', () => {
    const broken = { ...quiz('a', 'Anatomie', []), questions: undefined } as unknown as Quiz;
    expect(computeCategoryMastery([broken], {})).toEqual([]);
  });

  it('ignores questions that were never attempted', () => {
    const quizzes = [quiz('a', 'Anatomie', ['a1', 'a2', 'a3'])];
    const stats = Object.fromEntries([stat('a', 'a1', 5, 0)]);
    expect(computeCategoryMastery(quizzes, stats)[0].answeredQuestions).toBe(1);
  });

  it('returns nothing when nothing has been studied', () => {
    expect(computeCategoryMastery([quiz('a', 'Anatomie', ['a1'])], {})).toEqual([]);
  });
});

describe('masteryProgress', () => {
  it('counts only a subject the user is actually holding at the required accuracy', () => {
    const result = masteryProgress([
      { category: 'Cardiologie', answeredQuestions: 80, accuracy: 55 },
      { category: 'Anatomie', answeredQuestions: 40, accuracy: 93 },
    ]);
    expect(result.category).toBe('Anatomie');
    expect(result.answeredQuestions).toBe(40);
    // Cardiologie has the most answers, so it is the "nearest" subject even though it does not qualify.
    expect(result.nearest).toEqual({ category: 'Cardiologie', answeredQuestions: 80, accuracy: 55 });
  });

  it('reports zero when no subject meets the bar', () => {
    const result = masteryProgress([{ category: 'Cardiologie', answeredQuestions: 200, accuracy: 60 }]);
    expect(result.category).toBeNull();
    expect(result.answeredQuestions).toBe(0);
  });

  it('reports the furthest-along subject as nearest, even under the bar', () => {
    const result = masteryProgress([
      { category: 'Cardiologie', answeredQuestions: 30, accuracy: 70 },
      { category: 'Anatomie', answeredQuestions: 64, accuracy: 85 },
    ]);
    expect(result.category).toBeNull();
    expect(result.nearest).toEqual({ category: 'Anatomie', answeredQuestions: 64, accuracy: 85 });
  });

  it('never treats "Neclasificate" as a subject', () => {
    const result = masteryProgress([
      { category: 'Neclasificate', answeredQuestions: 300, accuracy: 99 },
      { category: 'Anatomie', answeredQuestions: 20, accuracy: 60 },
    ]);
    expect(result.category).toBeNull();
    expect(result.nearest?.category).toBe('Anatomie');
    expect(masteryProgress([{ category: 'Neclasificate', answeredQuestions: 300, accuracy: 99 }]).nearest).toBeNull();
  });

  it('has no nearest subject when nothing was studied', () => {
    expect(masteryProgress([]).nearest).toBeNull();
  });

  it('keeps one subject for a locked badge: 120 questions at 88% is the nearest, not an empty bar', () => {
    const result = masteryProgress([{ category: 'Anatomie', answeredQuestions: 120, accuracy: 88 }]);
    expect(result.category).toBeNull();
    expect(result.nearest).toEqual({ category: 'Anatomie', answeredQuestions: 120, accuracy: 88 });
  });

  it('a tiny qualifying subject does not replace the furthest-along one as nearest', () => {
    const result = masteryProgress([
      { category: 'Anatomie', answeredQuestions: 120, accuracy: 88 },
      { category: 'Fiziologie', answeredQuestions: 3, accuracy: 100 },
    ]);
    expect(result.category).toBe('Fiziologie');
    expect(result.nearest?.category).toBe('Anatomie');
  });

  it('breaks a tie on questions with the higher accuracy', () => {
    const result = masteryProgress([
      { category: 'A', answeredQuestions: 50, accuracy: 60 },
      { category: 'B', answeredQuestions: 50, accuracy: 80 },
    ]);
    expect(result.nearest?.category).toBe('B');
  });
});

describe('perfectSessionCount', () => {
  it('counts only fully correct sessions', () => {
    expect(perfectSessionCount([
      session(NOW, 10, 10),
      session(NOW, 9, 10),
      session(NOW, 0, 0),
    ])).toBe(1);
  });

  it('ignores tiny sessions when a minimum is given', () => {
    expect(PERFECT_MIN_QUESTIONS).toBe(5);
    expect(perfectSessionCount([
      session(NOW, 5, 5),
      session(NOW, 3, 3),
      session(NOW, 0, 0),
      session(NOW, 9, 10),
    ], PERFECT_MIN_QUESTIONS)).toBe(1);
  });
});

describe('computeStudyLevel', () => {
  it('starts at level 1 with an empty profile', () => {
    const info = computeStudyLevel({ quizCount: 0, sessionCount: 0, longestStreak: 0 });
    expect(info).toMatchObject({ level: 1, activity: 0, intoLevel: 0, toNext: LEVEL_STEP, progress: 0 });
  });

  it('reports the progress inside a level', () => {
    expect(computeStudyLevel({ quizCount: 1, sessionCount: 1, longestStreak: 1 }))
      .toMatchObject({ level: 1, intoLevel: 3, progress: 75, toNext: 1 });
    expect(computeStudyLevel({ quizCount: 1, sessionCount: 1, longestStreak: 2 }))
      .toMatchObject({ level: 2, intoLevel: 0 });
    expect(computeStudyLevel({ quizCount: 10, sessionCount: 20, longestStreak: 6 }).level).toBe(10);
  });

  it('treats NaN, Infinity and negatives as zero', () => {
    const info = computeStudyLevel({ quizCount: Number.NaN, sessionCount: Infinity, longestStreak: -5 });
    expect(info.level).toBe(1);
    expect(info.activity).toBe(0);
  });

  it('floors fractions', () => {
    expect(computeStudyLevel({ quizCount: 3.9, sessionCount: 0, longestStreak: 0 }).activity).toBe(3);
  });

  it('matches the formula App.tsx used before', () => {
    const old = (q: number, s: number, l: number) => Math.max(1, Math.floor((q + s + l) / 4) + 1);
    for (let i = 0; i < 20; i++) {
      const q = (i * 7) % 13;
      const s = (i * 11) % 17;
      const l = (i * 5) % 9;
      expect(computeStudyLevel({ quizCount: q, sessionCount: s, longestStreak: l }).level).toBe(old(q, s, l));
    }
  });
});

describe('effectiveStreak', () => {
  const streak = { currentStreak: 5, lastStudyDate: '2026-07-25' };

  it('keeps the streak when the last study day is today or yesterday', () => {
    expect(effectiveStreak(streak, '2026-07-25')).toBe(5);
    expect(effectiveStreak(streak, '2026-07-26')).toBe(5);
  });

  it('is zero once a day was skipped', () => {
    expect(effectiveStreak(streak, '2026-07-27')).toBe(0);
  });

  it('is zero without any study date', () => {
    expect(effectiveStreak({ currentStreak: 0, lastStudyDate: '' }, '2026-07-25')).toBe(0);
    expect(effectiveStreak({ currentStreak: 3, lastStudyDate: '' }, '2026-07-25')).toBe(0);
  });

  it('does not keep a streak whose last day is in the future (clock set back)', () => {
    expect(effectiveStreak({ currentStreak: 5, lastStudyDate: '2026-07-27' }, '2026-07-25')).toBe(0);
  });

  it('handles a year boundary', () => {
    expect(effectiveStreak({ currentStreak: 5, lastStudyDate: '2026-12-31' }, '2027-01-01')).toBe(5);
  });

  it('handles the month boundary', () => {
    expect(effectiveStreak({ currentStreak: 5, lastStudyDate: '2026-07-31' }, '2026-08-01')).toBe(5);
    expect(effectiveStreak({ currentStreak: 5, lastStudyDate: '2026-07-31' }, '2026-08-02')).toBe(0);
  });
});

describe('studyMinutesThisWeek', () => {
  const now = new Date(2026, 6, 25, 12, 0).getTime();
  const MIN = 60_000;
  function timed(finishedAt: number | undefined, minutes: number): QuizSession {
    return {
      id: String(finishedAt) + minutes, quizId: 'q', answers: {}, startedAt: (finishedAt ?? now) - minutes * MIN,
      ...(finishedAt === undefined ? {} : { finishedAt }), score: 1, total: 1, mode: 'study',
    };
  }

  it('adds up the sessions of the last week', () => {
    expect(studyMinutesThisWeek([timed(now - DAY, 10), timed(now - 2 * DAY, 10)], now)).toBe(20);
  });

  it('caps one session so an open tab is not study time', () => {
    expect(SESSION_MINUTES_CAP).toBe(45);
    expect(studyMinutesThisWeek([timed(now - DAY, 300)], now)).toBe(45);
    expect(studyMinutesThisWeek([timed(now - DAY, 300)], now, 30)).toBe(30);
  });

  it('leaves out old and unfinished sessions', () => {
    expect(studyMinutesThisWeek([timed(now - 8 * DAY, 30), timed(undefined, 30)], now)).toBe(0);
  });
});

describe('sessionsThisWeek', () => {
  const now = new Date(2026, 6, 25, 12, 0).getTime();
  const at = (daysAgo: number, total: number): QuizSession => {
    const finishedAt = new Date(2026, 6, 25 - daysAgo, 9, 0).getTime();
    return { id: `${daysAgo}-${total}`, quizId: 'q', answers: {}, startedAt: finishedAt - 60_000, finishedAt, score: total, total, mode: 'study' };
  };

  it('counts only finished sessions of the last seven calendar days', () => {
    const unfinished: QuizSession = { ...at(0, 5) };
    delete unfinished.finishedAt;
    expect(sessionsThisWeek([at(0, 5), at(6, 5), at(7, 5), unfinished], now)).toBe(2);
  });

  it('can ignore tiny sessions, so opening and closing a quiz is not a session', () => {
    expect(MIN_QUESTIONS_FOR_RHYTHM).toBe(5);
    expect(sessionsThisWeek([at(0, 5), at(1, 4), at(2, 1), at(3, 12)], now, MIN_QUESTIONS_FOR_RHYTHM)).toBe(2);
  });

  it('ignores corrupt totals', () => {
    expect(sessionsThisWeek([{ ...at(0, 5), total: Number.NaN }], now)).toBe(0);
  });
});

describe('countOwnSets', () => {
  it('leaves out archived, mixed-session and Rezidențiat bank sets', () => {
    expect(countOwnSets([
      { tags: [] },
      { tags: undefined },
      { tags: ['cardio'] },
      { tags: ['rezidentiat'] },
      { tags: ['rezidentiat-bank:modele-grile-v1'] },
      { tags: ['folder-session:abc'] },
      { archived: true, tags: [] },
    ])).toBe(3);
  });
});

describe('overallAccuracy', () => {
  it('weights every attempt', () => {
    const stats = Object.fromEntries([stat('a', 'a1', 9, 1), stat('a', 'a2', 0, 0)]);
    expect(overallAccuracy(stats)).toEqual({ accuracy: 90, attempts: 10 });
  });

  it('is null (not 0%) without attempts', () => {
    expect(overallAccuracy({})).toEqual({ accuracy: null, attempts: 0 });
  });

  it('ignores corrupt counters', () => {
    const [key, value] = stat('a', 'a1', 4, 1);
    const broken = { ...value, timesWrong: Number.NaN };
    expect(overallAccuracy({ [key]: broken })).toEqual({ accuracy: 100, attempts: 4 });
  });

  it('is a real 0% when everything was wrong', () => {
    expect(overallAccuracy(Object.fromEntries([stat('a', 'a1', 0, 4)]))).toEqual({ accuracy: 0, attempts: 4 });
  });
});

describe('activityPoints', () => {
  it('adds the four weighted parts', () => {
    expect(activityPoints({ quizCount: 2, sessionCount: 3, perfectSessions: 1, studyDays: 4 })).toBe(325);
  });

  it('is zero for an empty profile', () => {
    expect(activityPoints({ quizCount: 0, sessionCount: 0, perfectSessions: 0, studyDays: 0 })).toBe(0);
  });
});

describe('dailyAccuracy', () => {
  const now = new Date(2026, 6, 25, 23, 30).getTime();
  const at = (day: number, hour: number, minute: number, score: number, total: number): QuizSession => {
    const finishedAt = new Date(2026, 6, day, hour, minute).getTime();
    return { id: `${day}-${hour}-${score}`, quizId: 'q', answers: {}, startedAt: finishedAt - 60_000, finishedAt, score, total, mode: 'study' };
  };

  it('weights by questions inside one local day', () => {
    const days = dailyAccuracy([at(25, 10, 0, 9, 10), at(25, 22, 0, 1, 30)], now);
    expect(days).toHaveLength(7);
    expect(days[6].date).toBe('2026-07-25');
    expect(days[6].accuracy).toBe(25);
    expect(days[6].questions).toBe(40);
    expect(days.slice(0, 6).every((day) => day.accuracy === null)).toBe(true);
    expect(days[0].date).toBe('2026-07-19');
  });

  it('keeps a late-evening session on its local day', () => {
    const days = dailyAccuracy([at(24, 23, 50, 4, 5)], now);
    expect(days[5]).toMatchObject({ date: '2026-07-24', accuracy: 80, questions: 5 });
    expect(days[6].accuracy).toBeNull();
  });

  it('puts a session finished at 00:30 local on that local day, not on the UTC one', () => {
    // In Europe/Bucharest this instant is 21:30Z of the previous day.
    const early = at(25, 0, 30, 3, 5);
    const days = dailyAccuracy([early], new Date(2026, 6, 25, 10, 0).getTime());
    expect(days[6]).toMatchObject({ date: '2026-07-25', accuracy: 60, questions: 5 });
    expect(days[5].accuracy).toBeNull();
  });

  it('crosses a year boundary', () => {
    const days = dailyAccuracy([], new Date(2027, 0, 2, 12, 0).getTime());
    expect(days.map((day) => day.date)).toEqual([
      '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ]);
  });

  it('ignores unfinished sessions', () => {
    const unfinished: QuizSession = { ...at(25, 10, 0, 5, 5) };
    delete unfinished.finishedAt;
    expect(dailyAccuracy([unfinished], now)[6].accuracy).toBeNull();
  });

  it('drops sessions older than the window', () => {
    expect(dailyAccuracy([at(10, 12, 0, 5, 5)], now).every((day) => day.accuracy === null)).toBe(true);
  });

  it('builds the self comparison with a weighted week and no fake delta', () => {
    const result = buildSelfComparison([at(25, 10, 0, 9, 10), at(23, 10, 0, 1, 10)], now);
    expect(result.today.accuracy).toBe(90);
    expect(result.yesterday.accuracy).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.week).toEqual({ accuracy: 50, questions: 20 });
  });

  it('is empty-safe', () => {
    const result = buildSelfComparison([], now);
    expect(result.week).toEqual({ accuracy: null, questions: 0 });
    expect(result.best).toBeNull();
    expect(result.delta).toBeNull();
  });
});

describe('compareDays', () => {
  it('has no delta when a day is missing', () => {
    expect(compareDays(80, null)).toBeNull();
    expect(compareDays(null, 80)).toBeNull();
  });

  it('is the difference in percentage points', () => {
    expect(compareDays(80, 60)).toBe(20);
    expect(compareDays(50, 70)).toBe(-20);
  });
});

describe('bestDay', () => {
  const at = (day: number, score: number, total: number): QuizSession => {
    const finishedAt = new Date(2026, 6, day, 12, 0).getTime();
    return { id: `${day}-${score}`, quizId: 'q', answers: {}, startedAt: finishedAt - 60_000, finishedAt, score, total, mode: 'study' };
  };

  it('ignores days with too few questions', () => {
    const best = bestDay([at(20, 1, 1), at(21, 9, 10), at(22, 5, 10)]);
    expect(best).toMatchObject({ date: '2026-07-21', accuracy: 90, questions: 10 });
  });

  it('breaks a tie on accuracy with more questions, then the more recent day', () => {
    expect(bestDay([at(20, 9, 10), at(21, 18, 20)])).toMatchObject({ date: '2026-07-21', questions: 20 });
    expect(bestDay([at(20, 9, 10), at(22, 9, 10)])).toMatchObject({ date: '2026-07-22' });
  });

  it('keeps an old year in the date so the screen can say so', () => {
    const old = new Date(2025, 6, 26, 12, 0).getTime();
    const session: QuizSession = { id: 'o', quizId: 'q', answers: {}, startedAt: old - 60_000, finishedAt: old, score: 10, total: 10, mode: 'study' };
    expect(bestDay([session])).toMatchObject({ date: '2025-07-26', accuracy: 100 });
  });

  it('is null when no day has enough questions', () => {
    expect(bestDay([at(20, 1, 1)])).toBeNull();
  });
});
