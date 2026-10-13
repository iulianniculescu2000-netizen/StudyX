import { afterEach, describe, expect, it } from 'vitest';
import { isAuthFailure, isDailyQuotaError, isModelCoolingDown, noteModelFailure, resetQuotaGuard } from './quotaGuard';
import { buildProviderChain } from './providers';

const GEMINI_DAILY = 'You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash Please retry in 6h38m42.724027012s. [RESOURCE_EXHAUSTED, GenerateRequestsPerDayPerProjectPerModel-FreeTier]';
const KEYS = { groq: 'gsk_test_key_for_chain_000000', google: 'AIza-test-key-for-chain-0000', mistral: 'mistral-test-key-for-chain-000' };

describe('cota gratuită pe model', () => {
  afterEach(resetQuotaGuard);

  it('recunoaște cota zilnică (Gemini) și o limită scurtă (Mistral), dar nu alte erori', () => {
    expect(isDailyQuotaError(GEMINI_DAILY)).toBe(true);
    expect(isDailyQuotaError('Rate limit exceeded')).toBe(false);
    expect(isDailyQuotaError('Request too large')).toBe(false);
    expect(isAuthFailure('Incorrect API key provided')).toBe(true);
    expect(isAuthFailure('HTTP 429')).toBe(false);
  });

  it('un model cu cota zilnică epuizată e sărit până la resetarea declarată, apoi revine', () => {
    const now = 1_000_000;
    noteModelFailure('google', 'gemini-3.8-flash', GEMINI_DAILY, now);
    expect(isModelCoolingDown('google', 'gemini-3.8-flash', now + 6 * 3600_000)).toBe(true);
    expect(isModelCoolingDown('google', 'gemini-3.8-flash', now + 7 * 3600_000)).toBe(false);
    expect(isModelCoolingDown('google', 'gemini-3.6-flash', now)).toBe(false);
  });

  it('o limită scurtă pune modelul în pauză doar un minut, iar erorile fără legătură cu limitele nu pun nimic', () => {
    const now = 5_000;
    noteModelFailure('mistral', 'mistral-small-latest', 'Rate limit exceeded', now);
    expect(isModelCoolingDown('mistral', 'mistral-small-latest', now + 30_000)).toBe(true);
    expect(isModelCoolingDown('mistral', 'mistral-small-latest', now + 61_000)).toBe(false);
    noteModelFailure('groq', 'openai/gpt-oss-120b', 'Incorrect API key provided', now);
    expect(isModelCoolingDown('groq', 'openai/gpt-oss-120b', now)).toBe(false);
  });
});

describe('modele care tac', () => {
  afterEach(resetQuotaGuard);

  it('un model care nu a răspuns la timp e sărit 5 minute, apoi se încearcă din nou', () => {
    const now = 9_000;
    noteModelFailure('google', 'gemini-3.6-flash', 'Google Gemini nu a răspuns în 30 de secunde. Încearcă din nou.', now);
    expect(isModelCoolingDown('google', 'gemini-3.6-flash', now + 4 * 60_000)).toBe(true);
    expect(isModelCoolingDown('google', 'gemini-3.6-flash', now + 6 * 60_000)).toBe(false);
  });
});

describe('lanțul de încercări', () => {
  afterEach(resetQuotaGuard);

  it('după modelul ales vin celelalte modele ale aceluiași furnizor, apoi următorii furnizori', () => {
    const chain = buildProviderChain('google', 'gemini-3.8-flash', KEYS);
    expect(chain.map((link) => `${link.provider}:${link.model}`)).toEqual([
      'google:gemini-3.8-flash', 'google:gemini-4-argon', 'google:gemini-3.6-flash', 'google:gemini-3.5-flash-lite', 'google:gemini-3.1-flash-lite', 'google:gemini-3.1-pro-preview',
      'groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b',
      'mistral:mistral-small-latest', 'mistral:mistral-large-latest',
    ]);
  });

  it('modelul cu cota epuizată dispare din lanț, iar celelalte rămân în ordine', () => {
    noteModelFailure('google', 'gemini-3.8-flash', GEMINI_DAILY);
    const chain = buildProviderChain('google', 'gemini-3.8-flash', KEYS);
    expect(chain[0]).toMatchObject({ provider: 'google', model: 'gemini-4-argon' });
    expect(chain.some((link) => link.model === 'gemini-3.8-flash')).toBe(false);
  });

  it('dacă toate modelele unui furnizor sunt epuizate, rămâne modelul ales (eroarea trebuie să se vadă)', () => {
    for (const model of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']) noteModelFailure('groq', model, 'Rate limit exceeded: tokens per day (TPD)');
    const chain = buildProviderChain('groq', 'openai/gpt-oss-120b', { groq: KEYS.groq });
    expect(chain.map((link) => link.model)).toEqual(['openai/gpt-oss-120b']);
  });

  it('furnizorii fără cheie nu apar în lanț', () => {
    const chain = buildProviderChain('groq', 'openai/gpt-oss-120b', { groq: KEYS.groq });
    expect(new Set(chain.map((link) => link.provider))).toEqual(new Set(['groq']));
  });
});
