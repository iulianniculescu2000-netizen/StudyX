import { afterEach, describe, expect, it, vi } from 'vitest';
import { paceProvider, providerGapMs, resetProviderPacing } from './providerPacing';

describe('ritmul cererilor pe furnizor', () => {
  afterEach(() => {
    resetProviderPacing();
    vi.useFakeTimers();
  });

  it('Mistral are pauză de cel puțin o secundă între cereri, ceilalți furnizori nu', () => {
    expect(providerGapMs('mistral')).toBeGreaterThanOrEqual(1000);
    expect(providerGapMs('groq')).toBe(0);
    expect(providerGapMs('google')).toBe(0);
    expect(providerGapMs(undefined)).toBe(0);
  });

  it('a doua și a treia cerere către Mistral așteaptă pe rând', async () => {
    vi.useFakeTimers();
    const started: number[] = [];
    const t0 = Date.now();
    const run = async () => { await paceProvider('mistral'); started.push(Date.now() - t0); };
    const all = Promise.all([run(), run(), run()]);
    await vi.advanceTimersByTimeAsync(3000);
    await all;
    expect(started[0]).toBe(0);
    expect(started[1]).toBeGreaterThanOrEqual(1100);
    expect(started[2]).toBeGreaterThanOrEqual(2200);
  });

  it('Groq pornește imediat, fără pauză', async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    await paceProvider('groq');
    await paceProvider('groq');
    expect(Date.now() - t0).toBe(0);
  });
});
