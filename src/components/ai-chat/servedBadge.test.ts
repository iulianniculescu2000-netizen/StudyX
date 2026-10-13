import { describe, expect, it } from 'vitest';
import { servedBadgeText, shortModelName } from './servedBadge';

describe('shortModelName', () => {
  it('scoate prefixul de furnizor și sufixul -latest', () => {
    expect(shortModelName('openai/gpt-oss-120b')).toBe('gpt-oss-120b');
    expect(shortModelName('mistral-small-latest')).toBe('mistral-small');
    expect(shortModelName('qwen3:4b')).toBe('qwen3:4b');
  });
});

describe('servedBadgeText', () => {
  it('cloud: furnizor și model', () => {
    expect(servedBadgeText({ provider: 'groq', model: 'openai/gpt-oss-120b', local: false })).toBe('Groq · gpt-oss-120b');
    expect(servedBadgeText({ provider: 'google', model: 'gemini-3.8-flash', local: false })).toBe('Gemini · gemini-3.8-flash');
  });
  it('completat cu cloud', () => {
    expect(servedBadgeText({ provider: 'groq', model: 'openai/gpt-oss-120b' }, true)).toBe('Groq · gpt-oss-120b → completat cu cloud');
  });
  it('furnizor necunoscut: îl afișează ca atare', () => {
    expect(servedBadgeText({ provider: 'altul', model: 'x/y', local: false })).toBe('altul · y');
  });
});
