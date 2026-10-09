import { describe, expect, it } from 'vitest';
import {
  earnedLabel,
  emptyAchievements,
  evaluateAchievements,
  normalizeAchievements,
  permanentLevelInput,
} from './gamificationAchievements';
import { computeStudyLevel, computeCategoryMastery, countOwnSets, overallAccuracy } from './gamificationProgress';
import type { QuestionStat, Quiz } from '../types';

const NOW = Date.UTC(2026, 9, 6, 12);
const live = { sets: 0, sessions: 0, longestStreak: 0 };

describe('evaluateAchievements', () => {
  it('backfills silently on the first run: recorded, flagged, nothing to celebrate', () => {
    const r = evaluateAchievements(emptyAchievements(), [{ id: 'bank', title: 'Constructor de bancă' }], live, NOW);
    expect(r.newlyEarned).toEqual([]);
    expect(r.state.seeded).toBe(true);
    expect(r.state.earned.bank).toEqual({ at: NOW, title: 'Constructor de bancă', backfilled: true });
  });

  it('celebrates an achievement earned after the first run, once', () => {
    const seeded = evaluateAchievements(emptyAchievements(), [], live, NOW).state;
    const first = evaluateAchievements(seeded, [{ id: 'week', title: 'Săptămâna de studiu' }], live, NOW + 1000);
    expect(first.newlyEarned.map((a) => a.id)).toEqual(['week']);
    expect(first.state.earned.week).toEqual({ at: NOW + 1000, title: 'Săptămâna de studiu' });
    const again = evaluateAchievements(first.state, [{ id: 'week', title: 'Săptămâna de studiu' }], live, NOW + 9999);
    expect(again.newlyEarned).toEqual([]);
    expect(again.changed).toBe(false);
    expect(again.state).toBe(first.state);
  });

  it('never loses or rewrites a recorded achievement when the condition stops holding', () => {
    const seeded = evaluateAchievements(emptyAchievements(), [], live, NOW).state;
    const won = evaluateAchievements(seeded, [{ id: 'mastery', title: 'Maestru — Cardiologie' }], live, NOW + 1).state;
    const later = evaluateAchievements(won, [], live, NOW + 99_999);
    expect(later.state.earned.mastery).toEqual(won.earned.mastery);
    const renamed = evaluateAchievements(won, [{ id: 'mastery', title: 'Maestru — Altceva' }], live, NOW + 99_999);
    expect(renamed.state.earned.mastery.title).toBe('Maestru — Cardiologie');
    expect(renamed.state.earned.mastery.at).toBe(NOW + 1);
  });

  it('only ever raises the level marks', () => {
    const s0 = evaluateAchievements(emptyAchievements(), [], { sets: 10, sessions: 30, longestStreak: 5 }, NOW).state;
    const s1 = evaluateAchievements(s0, [], { sets: 2, sessions: 31, longestStreak: 1 }, NOW).state;
    expect(s1.marks).toEqual({ sets: 10, sessions: 31, longestStreak: 5 });
  });
});

describe('normalizeAchievements', () => {
  it('reads old profiles (no field) and garbage as nothing recorded', () => {
    expect(normalizeAchievements(undefined)).toEqual(emptyAchievements());
    expect(normalizeAchievements('x')).toEqual(emptyAchievements());
    const odd = normalizeAchievements({ earned: { ok: { at: 5 }, bad: { at: 'x' }, worse: null }, seeded: 'yes', marks: { sets: -3, sessions: 'a', longestStreak: 4.7 } });
    expect(odd.earned).toEqual({ ok: { at: 5 } });
    expect(odd.seeded).toBe(false);
    expect(odd.marks).toEqual({ sets: 0, sessions: 0, longestStreak: 4 });
  });

  it('round-trips through JSON', () => {
    const state = evaluateAchievements(emptyAchievements(), [{ id: 'bank', title: 'B' }], { sets: 3, sessions: 1, longestStreak: 2 }, NOW).state;
    expect(normalizeAchievements(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe('earnedLabel', () => {
  it('says "Câștigat la <data>" and, for backfilled ones, "până la"', () => {
    expect(earnedLabel({ at: NOW })).toMatch(/^Câștigat la 6 octombrie 2026$/);
    expect(earnedLabel({ at: NOW, backfilled: true })).toMatch(/^Câștigat până la 6 octombrie 2026$/);
  });
});

function deck(id: string, extra: Partial<Quiz> = {}): Quiz {
  return { id, title: id, description: '', emoji: '', category: 'Cardiologie', color: 'blue', createdAt: 1, tags: [], questions: [{ id: `${id}-q1`, text: 't', options: [] }], ...extra } as Quiz;
}

describe('level when a set is split into chapter decks', () => {
  const source = deck('src');
  const chapters = [deck('src--ch1', { tags: ['rezidentiat', 'chapter:1', 'book:K'] }), deck('src--ch2', { tags: ['rezidentiat', 'chapter:2', 'book:K'] })];
  const before = [source, deck('other')];
  const after = [{ ...source, archived: true }, deck('other'), ...chapters];

  it('counts the split set once, neither dropping it nor adding its chapter decks', () => {
    expect(countOwnSets(before)).toBe(2);
    expect(countOwnSets(after)).toBe(2);
    const level = (quizzes: Quiz[]) => computeStudyLevel({ quizCount: countOwnSets(quizzes), sessionCount: 10, longestStreak: 3 }).level;
    expect(level(after)).toBe(level(before));
  });

  it('a set archived on its own still leaves the count, but the permanent level does not drop', () => {
    const archivedOnly = [{ ...source, archived: true }, deck('other')];
    expect(countOwnSets(archivedOnly)).toBe(1);
    const marks = { sets: 2, sessions: 10, longestStreak: 3 };
    const input = permanentLevelInput({ quizCount: countOwnSets(archivedOnly), sessionCount: 10, longestStreak: 3 }, marks);
    expect(computeStudyLevel(input).level).toBe(computeStudyLevel({ quizCount: 2, sessionCount: 10, longestStreak: 3 }).level);
  });

  it('does not count retired history twice (source copy + chapter copy) in accuracy or mastery', () => {
    const stat = (quizId: string, retired?: boolean): QuestionStat => ({
      questionId: 'q1', quizId, timesCorrect: 4, timesWrong: 1, lastSeen: 0, nextReview: 0, interval: 0, ...(retired ? { retired } : {}),
    });
    const stats = { 'src:q1': stat('src', true), 'src--ch1:q1': stat('src--ch1') };
    expect(overallAccuracy(stats)).toEqual({ accuracy: 80, attempts: 5 });
    const src = { ...deck('src', { archived: true }), questions: [{ id: 'q1', text: 't', options: [] }] } as Quiz;
    const ch = { ...deck('src--ch1', { tags: ['rezidentiat'] }), questions: [{ id: 'q1', text: 't', options: [] }] } as Quiz;
    const mastery = computeCategoryMastery([src, ch], stats);
    expect(mastery).toEqual([{ category: 'Cardiologie', answeredQuestions: 1, accuracy: 80 }]);
  });
});
