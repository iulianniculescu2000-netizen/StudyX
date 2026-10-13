import { describe, expect, it } from 'vitest';
import { extractApiErrorMessage } from './errors';
import { shortProviderReason } from './providers';

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('erorile furnizorilor', () => {
  it('Gemini: eroarea vine ca listă și se citește cu statusul și metrica de cotă', async () => {
    const message = await extractApiErrorMessage(response(429, [{
      error: {
        code: 429,
        message: 'You exceeded your current quota.',
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
      },
    }]));
    expect(message).toBe('You exceeded your current quota. [RESOURCE_EXHAUSTED, GenerateRequestsPerDayPerProjectPerModel-FreeTier]');
  });

  it('o eroare cu doar status, fără mesaj, nu mai rămâne „HTTP 429” gol', async () => {
    expect(await extractApiErrorMessage(response(429, [{ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }]))).toBe('RESOURCE_EXHAUSTED (HTTP 429)');
  });

  it('formele vechi rămân la fel (Groq/Mistral)', async () => {
    expect(await extractApiErrorMessage(response(429, { error: { message: 'Rate limit exceeded' } }))).toBe('Rate limit exceeded');
    expect(await extractApiErrorMessage(response(500, { detail: 'boom' }))).toBe('boom');
  });

  it('motivul scurt din notificarea de trecere pe alt furnizor', () => {
    expect(shortProviderReason('Rate limit exceeded')).toBe('limita gratuită a cheii a fost atinsă');
    expect(shortProviderReason('RESOURCE_EXHAUSTED (HTTP 429)')).toBe('limita gratuită a cheii a fost atinsă');
    expect(shortProviderReason('Incorrect API key provided (401)')).toBe('cheia API nu este acceptată');
    expect(shortProviderReason('The model `x` was not found (404)')).toBe('modelul ales nu mai există');
    expect(shortProviderReason('')).toBe('');
  });
});
