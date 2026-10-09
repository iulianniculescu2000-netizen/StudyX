import { describe, it, expect } from 'vitest';
import { friendlyAIError } from './friendlyError';

describe('friendlyAIError', () => {
  it('explains a Groq rate limit, keeps the wait time and drops ids and URLs', () => {
    const raw = 'Eroare Groq API: Rate limit reached for model openai/gpt-oss-120b in organization org_01km8nbfv1 service tier on_demand on tokens per minute (TPM): Limit 8000, Used 7634, Requested 5676. Please try again in 8.22s. Need more tokens? Upgrade at https://console.groq.com/settings/billing';
    const out = friendlyAIError(new Error(raw));
    expect(out).toContain('limita');
    expect(out).toContain('9 de secunde');
    expect(out).not.toMatch(/org_|https?:/);
  });

  it('says so when the request itself is bigger than the limit', () => {
    expect(friendlyAIError('Rate limit reached: Limit 8000, Used 0, Requested 9000. Please try again in 1s')).toContain('prea mare');
  });

  it('understands other providers and time units', () => {
    expect(friendlyAIError('You exceeded your current quota. Please retry in 45 milliseconds.')).toContain('o secundă');
    expect(friendlyAIError('RESOURCE_EXHAUSTED: Resource has been exhausted')).toContain('limita');
    expect(friendlyAIError('We are experiencing high traffic right now')).toContain('limita');
    expect(friendlyAIError('Rate limit hit. Please try again in 2m30s.')).toContain('3 minute');
    expect(friendlyAIError('Rate limit: tokens per day. Please try again in 5h12m.')).toContain('zilnică');
  });

  it('handles invalid keys and network failures', () => {
    expect(friendlyAIError('401 Unauthorized')).toContain('Setări AI');
    expect(friendlyAIError('Eroare Groq API: Invalid API Key')).toContain('Setări AI');
    expect(friendlyAIError(new TypeError('Failed to fetch'))).toContain('conexiunea');
  });

  it('does not mistake a number inside ordinary text for a status code', () => {
    expect(friendlyAIError('Nu am găsit cursul „Kumar 401”')).toBe('Nu am găsit cursul „Kumar 401”');
    expect(friendlyAIError('Cardiologie: 429 întrebări găsite')).toBe('Cardiologie: 429 întrebări găsite');
  });

  it('strips provider prefixes and URLs from other errors and caps the length', () => {
    expect(friendlyAIError('Eroare AI: Model overloaded? see https://x.io/y')).not.toMatch(/https?:|Eroare AI/);
    expect(friendlyAIError('Eroare Groq API: Something broke see https://x.io/y')).toBe('Something broke see');
    expect(friendlyAIError('x'.repeat(500)).length).toBeLessThanOrEqual(220);
    expect(friendlyAIError('')).toContain('Încearcă din nou');
  });
});
