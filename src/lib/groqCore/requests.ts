import { useAIStore } from '../../store/aiStore';
import { logAIDebug } from '../../ai/debug';
import type { AIRequestTask } from '../../ai/types';
import { logDiagnosticEvent } from '../../store/diagnosticsStore';
import { estimateTokens, useAIUsageStore } from '../../store/aiUsageStore';
import { parseRateHeaders } from '../ai/rateHeaders';
import { healPrimaryModelChoice, isModelUnavailableError, nextCandidateModel } from '../ai/modelHealing';
import { markModelRetired } from '../ai/providerStatus';
import { JSON_MODE_UNSUPPORTED } from './capabilities';
import { NonRetryableError, extractApiErrorMessage, isRequestSpecificError } from './errors';
import { backgroundGovernor, generationGovernor, groqGovernor } from './governors';
import { sanitizeKey } from './keys';
import { buildProviderChain, getProviderConfig, markServed, trackProviderOutcome } from './providers';
import { paceProvider } from './providerPacing';
import { isDailyQuotaError, isModelCoolingDown, isModelSpecificFailure, isOversizedRequest, noteModelFailure } from './quotaGuard';
import { lightModelFor, logPromptBreakdown } from '../ai/tokenBudget';
import { TASK_MAX_TOKENS, TASK_TEMPERATURE, buildKnowledgeQuery, estimateMessagesTokens } from './requestConfig';
import { MAX_RATE_LIMIT_WAIT_MS, NON_RETRYABLE_STATUSES, REQUEST_TIMEOUT_MS, ANALYSIS_TIMEOUT_MS, getRetryDelayMs, sleepMs } from './retry';
import { GROQ_VISION_MODEL, supportsVision, type CloudProviderId, type GroqMessage, type LocalCallOptions, type ProviderId } from './types';

/**
 * Run a chat-completions request against ONE provider, with in-provider retries
 * on 429. When a fallback provider is available we retry less (fail fast → switch);
 * on the last provider we ride out per-minute rate limits with more attempts.
 */
async function attemptOnProvider(
  cfg: { name: string; endpoint: string },
  link: { key: string; model: string; provider?: ProviderId; endpoint?: string },
  messages: GroqMessage[],
  temperature: number,
  requestedMaxTokens: number,
  task: AIRequestTask,
  hasFallback: boolean,
  abortSignal?: AbortSignal,
  requestedJsonMode = false,
): Promise<string> {
  const maxAttempts = hasFallback ? 2 : 4;
  const requestTimeoutMs = task === 'analysis' ? ANALYSIS_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const maxTokens = requestedMaxTokens;
  const finalMessages = messages;
  const finalTemperature = temperature;
  const jsonMode = requestedJsonMode;
  let lastError = 'Eroare necunoscută';
  let lastStatus: number | undefined;
  const modeKey = `${link.provider ?? cfg.name}:${link.model}`;
  let useJsonMode = jsonMode && !JSON_MODE_UNSUPPORTED.has(modeKey);
  let jsonModeDropped = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await paceProvider(link.provider, abortSignal);
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      const response = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(link.key ? { Authorization: `Bearer ${link.key}` } : {}) },
        body: JSON.stringify({
          model: link.model,
          messages: finalMessages,
          temperature: finalTemperature,
          max_tokens: maxTokens,
          ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal,
      });

      if (!response.ok) {
        // The provider/model may not accept `response_format`: retry ONCE without it (same attempt,
        // no backoff). It is only remembered as unsupported if the plain request then succeeds, so a
        // 400 caused by something else (too large…) does not disable JSON mode for good.
        if (useJsonMode && (response.status === 400 || response.status === 422)) {
          useJsonMode = false;
          jsonModeDropped = true;
          logAIDebug('groq:jsonModeRejected', { task, provider: cfg.name, model: link.model, status: response.status });
          attempt -= 1;
          continue;
        }
        const msg = await extractApiErrorMessage(response);
        lastStatus = response.status;
        if (link.provider) {
          const window = parseRateHeaders(response.headers);
          if (window) useAIUsageStore.getState().noteWindow(link.provider, window);
        }
        // Cota zilnică epuizată nu se reface în câteva secunde: nu se mai reîncearcă, trece pe alt model sau furnizor.
        if (response.status === 429 && isDailyQuotaError(msg)) throw Object.assign(new NonRetryableError(msg), { status: 429 });
        if (response.status === 429 && attempt < maxAttempts - 1) {
          const retryAfter = response.headers.get('retry-after');
          const retryAfterSeconds = retryAfter ? Number(retryAfter) : 0;
          // A daily/minute quota that resets in minutes would otherwise hold the request queue
          // (and the Stop button) hostage; fail fast so the fallback provider or the user can act.
          // Only the provider's own wait counts here: the backoff we add on top must not trigger it.
          if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds * 1000 > MAX_RATE_LIMIT_WAIT_MS) throw Object.assign(new NonRetryableError(msg), { status: 429 });
          const delayMs = Math.min(getRetryDelayMs(attempt, retryAfter), MAX_RATE_LIMIT_WAIT_MS);
          logAIDebug('groq:ratelimit', { task, provider: cfg.name, retryAfter, delayMs });
          await sleepMs(delayMs, abortSignal);
          continue;
        }
        if (response.status === 404 && link.provider && link.key) markModelRetired(link.provider, link.model, link.key);
        if (NON_RETRYABLE_STATUSES.has(response.status)) throw Object.assign(new NonRetryableError(msg), { status: response.status });
        throw Object.assign(new Error(msg), { status: response.status });
      }

      const data = await response.json();
      const output = (data.choices?.[0]?.message?.content ?? '').trim();
      if (jsonModeDropped) JSON_MODE_UNSUPPORTED.add(modeKey);
      logAIDebug('groq:response', { task, provider: cfg.name, output });
      if (link.provider) {
        const reported = Number(data.usage?.total_tokens ?? (Number(data.usage?.prompt_tokens ?? 0) + Number(data.usage?.completion_tokens ?? 0)));
        const exact = Number.isFinite(reported) && reported > 0;
        useAIUsageStore.getState().record(
          link.provider,
          exact ? reported : estimateMessagesTokens(finalMessages) + estimateTokens(output),
          { estimated: !exact, window: parseRateHeaders(response.headers) },
        );
      }
      return output;
    } catch (error: unknown) {
      // Stop pressed, or a failure retrying cannot fix: surface it now instead of after the backoff.
      if (error instanceof Error && error.name === 'AbortError') throw error;
      // Nobody listening / CORS / too slow: say so plainly and never retry (the chain moves on or ends).
      if (error instanceof NonRetryableError) throw error;
      // No answer within the limit: retrying the same stalled provider would only repeat the wait,
      // so fail this one now and let the provider chain (or the user) move on.
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new NonRetryableError(`${cfg.name} nu a răspuns în ${requestTimeoutMs / 1000} de secunde. Încearcă din nou.`);
      }
      lastError = error instanceof Error ? error.message : String(error);
      logAIDebug('groq:error', { task, provider: cfg.name, attempt, error: lastError });
      if (attempt < maxAttempts - 1) {
        await sleepMs(getRetryDelayMs(attempt, null), abortSignal);
      }
    }
  }
  throw Object.assign(new Error(lastError), { status: lastStatus });
}

// ── Core API ──────────────────────────────────────────────────────────────────
export async function groqRequest({
  task,
  messages,
  temperature,
  maxTokens,
  abortSignal,
  skipLibraryContext,
  jsonMode,
  only,
  light,
  onServed,
}: LocalCallOptions & {
  task: AIRequestTask;
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  skipLibraryContext?: boolean;
  /**
   * Ask for `response_format: {type:'json_object'}` (the reply is then a single JSON object — not
   * suitable for prompts that want a bare array). Providers that reject it are retried without,
   * and remembered. Use `requestStructured` rather than setting this directly.
   */
  jsonMode?: boolean;
  /**
   * Run on exactly this provider/model, with no fallback chain and no sticky-switch side effects
   * (used by "Verifică cu alt model": silently falling back to the producer would defeat the check).
   */
  only?: { provider: CloudProviderId; model: string };
  /** Sarcină utilitară (rezumat/extragere de memorie): rulează pe modelul mic al furnizorului curent, dacă are unul. */
  light?: boolean;
}): Promise<string> {
  const governor = light ? backgroundGovernor : task === 'questions' ? generationGovernor : groqGovernor;
  return governor.run(task, async () => {
    const state = useAIStore.getState();
    const primaryProvider = state.provider;
    const primaryKey = sanitizeKey(state.apiKey);
    if (!primaryKey) {
      throw new Error(getProviderConfig(primaryProvider).keyHint);
    }
    const effectiveKeys: Partial<Record<ProviderId, string>> = { ...state.providerKeys, ...(primaryKey ? { [primaryProvider]: primaryKey } : {}) };

    const kb = skipLibraryContext ? '' : await state.getKnowledgeContext(buildKnowledgeQuery(messages), 6000);
    const finalMessages: GroqMessage[] = kb
      ? [
          {
            role: 'system',
            content:
              'Context suplimentar din biblioteca locală a utilizatorului. ' +
              'Folosește-l doar când este relevant medical și nu inventa informații absente.\n\n' +
              kb,
          },
          ...messages,
        ]
      : messages;

    const finalTemperature = temperature ?? TASK_TEMPERATURE[task] ?? 0.5;
    const finalMaxTokens = maxTokens ?? TASK_MAX_TOKENS[task] ?? 1200;

    if (abortSignal?.aborted) throw new Error('Request aborted before start');
    logPromptBreakdown(`request:${task}`, finalMessages);

    let chain = buildProviderChain(primaryProvider, state.model, effectiveKeys);
    if (only) {
      const onlyKey = sanitizeKey(state.providerKeys[only.provider] ?? (only.provider === primaryProvider ? primaryKey : ''));
      if (!onlyKey) throw new Error(getProviderConfig(only.provider).keyHint);
      chain = [{ provider: only.provider, key: onlyKey, model: only.model }];
    }

    if (light && !only) {
      chain = chain
        .map((entry) => {
          const small = lightModelFor(entry.provider, entry.model);
          return small ? { ...entry, model: small } : entry;
        })
        // Modelele de rezervă ale aceluiași furnizor se reduc la același model mic: o singură încercare, nu trei identice.
        .filter((entry, index, all) => all.findIndex((other) => other.provider === entry.provider && other.model === entry.model) === index);
    }

    let lastError = 'Eroare necunoscută';
    for (let ci = 0; ci < chain.length; ci++) {
      const link = chain[ci];
      const cfg = getProviderConfig(link.provider);
      const next = chain[ci + 1];
      logAIDebug('groq:request', {
        task,
        provider: link.provider,
        model: link.model,
        temperature: finalTemperature,
        maxTokens: finalMaxTokens,
        messagesCount: messages.length,
      });
      try {
        const result = await attemptOnProvider(cfg, link, finalMessages, finalTemperature, finalMaxTokens, task, !!next, abortSignal, jsonMode);
        if (!only) {
          trackProviderOutcome(link.provider, primaryProvider, cfg.name, !(isRequestSpecificError(lastError) || isOversizedRequest(lastError)), lastError);
          markServed(link.provider, link.model);
        }
        onServed?.({ provider: link.provider, model: link.model });
        return result;
      } catch (error: unknown) {
        // Stop pressed: not a provider failure, so do not try the next provider with a dead signal.
        if (abortSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
        const failure = error instanceof Error ? error.message : String(error);
        lastError = failure;
        logAIDebug('groq:providerFailed', { provider: link.provider, error: lastError });
        // Cota epuizată a modelului: următoarele cereri îl sar până la resetare. Cheie greșită: restul modelelor aceluiași furnizor ar eșua la fel.
        const failureStatus = (error as { status?: number }).status;
        noteModelFailure(link.provider, link.model, failure);
        const skipProviderModels = !isModelSpecificFailure(failure, failureStatus);

        // The model itself is gone (provider deprecated/decommissioned it), not
        // just rate-limited or down — retry immediately on a known-good model
        // for this SAME provider before giving up on it and moving to the next
        // provider in the chain. A dead model would otherwise fail every future
        // request forever, indistinguishable from the whole provider being down.
        if (!only && isModelUnavailableError(lastError)) {
          const altModel = nextCandidateModel(link.provider, link.model, (candidate) => isModelCoolingDown(link.provider, candidate));
          if (altModel) {
            try {
              const healedResult = await attemptOnProvider(
                cfg, { ...link, model: altModel }, finalMessages, finalTemperature, finalMaxTokens, task, !!next, abortSignal, jsonMode,
              );
              trackProviderOutcome(link.provider, primaryProvider, cfg.name, !(isRequestSpecificError(lastError) || isOversizedRequest(lastError)), lastError);
              healPrimaryModelChoice(link.provider, primaryProvider, link.model, altModel, cfg.name);
              return healedResult;
            } catch (healError: unknown) {
              lastError = healError instanceof Error ? healError.message : String(healError);
              logAIDebug('groq:healAttemptFailed', { provider: link.provider, altModel, error: lastError });
            }
          }
        }

        if (next) {
          logDiagnosticEvent({
            area: 'ai',
            level: 'warning',
            title: next.provider === link.provider ? 'Trec pe alt model AI' : 'Trec pe alt provider AI',
            detail: next.provider === link.provider
              ? `${link.model} indisponibil (${lastError}). Încerc ${next.model}, din aceeași cheie ${cfg.name}.`
              : `${cfg.name} indisponibil (${lastError}). Continui automat pe ${getProviderConfig(next.provider).name}.`,
          });
        }
        if (skipProviderModels) while (chain[ci + 1]?.provider === link.provider) ci += 1;
      }
    }

    logDiagnosticEvent({ area: 'ai', level: 'error', title: 'AI indisponibil', detail: `Task ${task}: ${lastError}` });
    throw new Error(`Eroare AI: ${lastError}`);
  });
}

export async function groqChat(
  messages: GroqMessage[],
  temperature = 0.7,
  options: LocalCallOptions & { skipLibraryContext?: boolean; task?: AIRequestTask; maxTokens?: number; abortSignal?: AbortSignal } = {},
): Promise<string> {
  return groqRequest({
    task: options.task ?? 'chat',
    messages,
    temperature,
    maxTokens: options.maxTokens ?? 4096,
    skipLibraryContext: options.skipLibraryContext,
    abortSignal: options.abortSignal,
    onServed: options.onServed,
  });
}

/**
 * Single-turn vision request — sends an image (data URL) + text prompt to
 * Llama 4 Scout on Groq. Groq-only (see supportsVision).
 */
export async function groqVisionRequest(
  imageDataUrl: string,
  prompt: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const { apiKey, provider } = useAIStore.getState();
  if (!supportsVision(provider)) {
    throw new Error('Vision necesită Groq. Schimbă providerul în setări AI.');
  }
  const key = sanitizeKey(apiKey);
  if (!key) throw new Error('Cheia API Groq nu este configurată. Mergi la Setări AI.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      max_tokens: 800,
      temperature: 0.3,
    }),
    signal: abortSignal,
  });

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res));
  }
  const data = await res.json();
  return ((data.choices?.[0]?.message?.content as string | undefined) ?? '').trim();
}
