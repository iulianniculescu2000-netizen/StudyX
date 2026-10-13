import { describe, expect, it } from 'vitest';
import { DAILY_SESSION_CAP, planDailySession } from './dueItems';

describe('planDailySession', () => {
  it('caps a huge queue and reports the rest', () => {
    const due = Array.from({ length: 730 }, (_, i) => i);
    const { today, remaining } = planDailySession(due);
    expect(today).toHaveLength(DAILY_SESSION_CAP);
    expect(remaining).toBe(730 - DAILY_SESSION_CAP);
  });
  it('leaves a small queue whole', () => {
    expect(planDailySession([1, 2, 3])).toEqual({ today: [1, 2, 3], remaining: 0 });
  });
});
