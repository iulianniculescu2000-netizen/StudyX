import { describe, expect, it } from 'vitest';
import { todayProgressPercent } from './todayProgress';

describe('todayProgressPercent', () => {
  it('is null with nothing done and nothing due', () => expect(todayProgressPercent(0, 0)).toBeNull());
  it('is 0 with 3 due and nothing done', () => expect(todayProgressPercent(0, 3)).toBe(0));
  it('is 100 when everything done is cleared', () => expect(todayProgressPercent(5, 0)).toBe(100));
  it('splits done vs due', () => expect(todayProgressPercent(3, 1)).toBe(75));
});
