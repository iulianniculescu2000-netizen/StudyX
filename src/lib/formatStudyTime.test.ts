import { describe, expect, it } from 'vitest';
import { formatStudyTime } from './formatStudyTime';

describe('formatStudyTime', () => {
  it('uses minutes below an hour', () => {
    expect(formatStudyTime(0)).toBe('0m');
    expect(formatStudyTime(59)).toBe('0m');
    expect(formatStudyTime(1500)).toBe('25m');
  });
  it('keeps one decimal for hours, matching Stats', () => {
    expect(formatStudyTime(9000)).toBe('2.5h');
    expect(formatStudyTime(7200)).toBe('2h');
    expect(formatStudyTime(7500)).toBe('2.1h');
  });
});
