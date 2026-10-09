import type { useAIStore } from '../../store/aiStore';
import { nextCandidateModel } from '../ai/modelHealing';
import { extractApiErrorMessage } from './errors';
import { sanitizeKey } from './keys';
import { getProviderConfig } from './providers';

/**
 * Live check that an API key is actually accepted by the provider — beyond the
 * format check (gsk_/AIza prefix). Sends a 1-token request so we can tell the
 * user "cheie respinsă" instead of showing a misleading green check when the key
 * is expired/invalid and generation will silently fall back to local templates.
 */
export async function validateApiKey(
  provider: ReturnType<typeof useAIStore.getState>['provider'],
  key: string,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const cleanKey = sanitizeKey(key);
  if (!cleanKey) return { ok: false, error: 'Cheia este goală.' };

  const config = getProviderConfig(provider);
  let testModel =
    provider === 'google' ? 'gemini-3.8-flash'
    : provider === 'mistral' ? 'mistral-small-latest'
    : 'openai/gpt-oss-20b';

  // A single hardcoded test model can go dead on the provider's own schedule
  // (the same class of problem modelHealing.ts guards live requests against —
  // Google/Groq all retire model IDs without warning) and make a
  // perfectly valid key look "rejected" here even though other models work
  // fine on it. Try one fallback candidate before concluding the KEY itself
  // is bad, not just this particular model.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cleanKey}` },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) return { ok: true };

      const message = await extractApiErrorMessage(res);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: `Cheie respinsă de ${config.name} (${res.status}). Verifică sau regenerează cheia.` };
      }
      if (res.status === 429) {
        // A 429 only happens AFTER the key authenticates (an invalid key returns
        // 401/403), so the key is valid — it just hit the rate limit during this
        // test ping. Treat as success with a soft note, not a hard failure.
        return { ok: true, warning: 'Cheie validă. Ai atins temporar limita de rate (free tier) — AI-ul merge, doar lasă câteva secunde între cereri.' };
      }

      const fallback = attempt === 0 ? nextCandidateModel(provider, testModel) : null;
      if (fallback) {
        testModel = fallback;
        continue;
      }
      return { ok: false, error: `Eroare ${config.name} (${res.status}): ${message}` };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { ok: false, error: 'Verificarea a expirat — verifică conexiunea la internet.' };
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Nu am putut contacta serverul AI.' };
    }
  }
  return { ok: false, error: `Eroare ${config.name}: nu am putut valida cheia.` };
}
