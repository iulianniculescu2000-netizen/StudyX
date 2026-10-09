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
  it('local: arată viteza, sau timpul până la primul cuvânt când răspunsul a fost scurt', () => {
    expect(servedBadgeText({ provider: 'local', model: 'qwen3:4b', local: true, tokensPerSec: 12.4, ttftSeconds: 2 })).toBe('Local · qwen3:4b · 12,4 tok/s');
    expect(servedBadgeText({ provider: 'local', model: 'qwen3:4b', local: true, tokensPerSec: null, ttftSeconds: 3.2 })).toBe('Local · qwen3:4b · 3,2 s până la primul cuvânt');
    expect(servedBadgeText({ provider: 'local', model: 'qwen3:4b', local: true })).toBe('Local · qwen3:4b');
  });
  it('local completat cu cloud', () => {
    expect(servedBadgeText({ provider: 'local', model: 'qwen3:4b', local: true, tokensPerSec: 8 }, true)).toBe('Local · qwen3:4b · 8,0 tok/s → completat cu cloud');
  });
  it('furnizor necunoscut: îl afișează ca atare', () => {
    expect(servedBadgeText({ provider: 'altul', model: 'x/y', local: false })).toBe('altul · y');
  });
});
