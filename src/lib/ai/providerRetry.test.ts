import { describe, expect, it } from 'vitest';
import {
  attemptsForProvider, historyWithoutFailedTurns, isSwitchProviderRequest, isTransientErrorMessage, isTransientStatus,
  nextConfiguredProvider, transientRetryDelayMs,
} from './providerRetry';
import { friendlyAIError } from './friendlyError';

describe('providerRetry', () => {
  it('treats 429 and 5xx as transient, auth and bad requests as not', () => {
    for (const s of [408, 429, 500, 502, 503, 504]) expect(isTransientStatus(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 413, 422]) expect(isTransientStatus(s)).toBe(false);
  });

  it('recognises transient failures from messages', () => {
    expect(isTransientErrorMessage('Eroare Mistral AI API: HTTP 503')).toBe(true);
    expect(isTransientErrorMessage('Service Unavailable')).toBe(true);
    expect(isTransientErrorMessage('Invalid API key')).toBe(false);
  });

  it('backs off exponentially, honours Retry-After and caps the wait', () => {
    expect(transientRetryDelayMs(0, null)).toBe(800);
    expect(transientRetryDelayMs(1, null)).toBe(1600);
    expect(transientRetryDelayMs(0, '3')).toBe(3000);
    expect(transientRetryDelayMs(0, '120')).toBe(6000);
  });

  it('gives fewer attempts when a fallback exists', () => {
    expect(attemptsForProvider(true)).toBeLessThan(attemptsForProvider(false));
  });

  it('picks the next provider that has a key, or null', () => {
    expect(nextConfiguredProvider<string>('mistral', { mistral: 'k', groq: 'g' })).toBe('groq');
    expect(nextConfiguredProvider<string>('groq', { groq: 'g', google: ' ' })).toBeNull();
    expect(nextConfiguredProvider<string>('groq', { groq: 'g', google: ' ', mistral: 'm' })).toBe('mistral');
  });

  it('detects "switch AI" commands but not medical questions', () => {
    expect(isSwitchProviderRequest('comutarea la alt AI')).toBe(true);
    expect(isSwitchProviderRequest('Treci pe alt model')).toBe(true);
    expect(isSwitchProviderRequest('schimbă providerul')).toBe(true);
    expect(isSwitchProviderRequest('Care e tratamentul la fibrilația atrială?')).toBe(false);
    expect(isSwitchProviderRequest('')).toBe(false);
  });

  it('shows 503 as a friendly Romanian sentence', () => {
    const msg = friendlyAIError(new Error('Eroare Mistral AI API: HTTP 503'));
    expect(msg).not.toMatch(/HTTP 503/);
    expect(msg).toMatch(/indisponibil|supraîncărcat/i);
  });

  it('drops error bubbles and the question they answered from the history', () => {
    const msgs = [
      { role: 'user', content: 'a' }, { role: 'assistant', content: 'ra' },
      { role: 'user', content: 'b' }, { role: 'assistant', content: 'err', isError: true },
    ];
    expect(historyWithoutFailedTurns(msgs).map((m) => m.content)).toEqual(['a', 'ra']);
  });
});
