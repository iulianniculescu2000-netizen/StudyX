import { describe, expect, it } from 'vitest';
import { parseRateHeaders, parseResetSeconds } from './rateHeaders';

describe('parseResetSeconds', () => {
  it('reads provider duration strings', () => {
    expect(parseResetSeconds('7.66s')).toBeCloseTo(7.66);
    expect(parseResetSeconds('2m59.56s')).toBeCloseTo(179.56);
    expect(parseResetSeconds('1h2m')).toBe(3720);
    expect(parseResetSeconds('45')).toBe(45);
    expect(parseResetSeconds('250ms')).toBeCloseTo(0.25);
  });

  it('returns null for nothing or nonsense', () => {
    expect(parseResetSeconds(null)).toBeNull();
    expect(parseResetSeconds('soon')).toBeNull();
  });
});

describe('parseRateHeaders', () => {
  it('reads the x-ratelimit headers', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens': '8000',
      'x-ratelimit-remaining-tokens': '5200',
      'x-ratelimit-reset-tokens': '12s',
      'x-ratelimit-limit-requests': '14400',
      'x-ratelimit-remaining-requests': '14390',
    });
    expect(parseRateHeaders(headers, 1000)).toEqual({
      limitTokens: 8000,
      remainingTokens: 5200,
      resetTokensIn: 12,
      limitRequests: 14400,
      remainingRequests: 14390,
      resetRequestsIn: undefined,
      at: 1000,
    });
  });

  it('returns null when the provider reports nothing', () => {
    expect(parseRateHeaders(new Headers({ 'content-type': 'application/json' }))).toBeNull();
  });
});
