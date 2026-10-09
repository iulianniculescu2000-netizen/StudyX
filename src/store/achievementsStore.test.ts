import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAchievementEvaluation } from './achievementsStore';
import { useQuizStore } from './quizStore';
import { useStatsStore } from './statsStore';
import type { Quiz } from '../types';

const deck = (id: string): Quiz => ({ id, title: id, description: '', emoji: '', category: 'X', color: 'blue', createdAt: 1, tags: [], questions: [] } as Quiz);
const tenSets = () => Array.from({ length: 10 }, (_, i) => deck(`s${i}`));

beforeEach(() => {
  useQuizStore.getState().reset();
  useStatsStore.getState().reset();
});
afterEach(() => {
  useQuizStore.getState().reset();
  useStatsStore.getState().reset();
});

describe('runAchievementEvaluation', () => {
  it('backfills what is already true without announcing it, then keeps it after the sets are deleted', () => {
    useQuizStore.setState({ quizzes: tenSets(), _hasHydrated: true });
    expect(runAchievementEvaluation(1000)).toEqual([]);
    const state = useStatsStore.getState().achievements;
    expect(state.seeded).toBe(true);
    expect(state.earned.bank.backfilled).toBe(true);

    useQuizStore.setState({ quizzes: [] });
    expect(runAchievementEvaluation(2000)).toEqual([]);
    expect(useStatsStore.getState().achievements.earned.bank.at).toBe(1000);
  });

  it('announces a new win exactly once', () => {
    useQuizStore.setState({ quizzes: [], _hasHydrated: true });
    runAchievementEvaluation(1000);
    useQuizStore.setState({ quizzes: tenSets() });
    expect(runAchievementEvaluation(2000).map((a) => a.id)).toEqual(['bank']);
    expect(runAchievementEvaluation(3000)).toEqual([]);
  });

  it('does nothing while the profile is still loading', () => {
    useQuizStore.setState({ quizzes: tenSets(), _hasHydrated: false });
    expect(runAchievementEvaluation(1000)).toEqual([]);
    expect(useStatsStore.getState().achievements.seeded).toBe(false);
  });
});

describe('statsStore persistence of achievements', () => {
  it('round-trips through snapshot/hydrate and accepts an old snapshot without the field', () => {
    useQuizStore.setState({ quizzes: tenSets(), _hasHydrated: true });
    runAchievementEvaluation(1000);
    const snapshot = JSON.parse(JSON.stringify(useStatsStore.getState()._snapshot()));
    useStatsStore.getState().reset();
    useStatsStore.getState()._hydrate(snapshot);
    expect(useStatsStore.getState().achievements.earned.bank.at).toBe(1000);

    const { achievements: _drop, ...old } = snapshot;
    void _drop;
    useStatsStore.getState()._hydrate(old);
    expect(useStatsStore.getState().achievements).toEqual({ earned: {}, seeded: false, marks: { sets: 0, sessions: 0, longestStreak: 0 } });
  });
});
