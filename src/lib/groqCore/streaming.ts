import { useAIStore } from '../../store/aiStore';
import { logAIDebug } from '../../ai/debug';
import type { AIRequestTask } from '../../ai/types';
import { logDiagnosticEvent } from '../../store/diagnosticsStore';
import { estimateTokens, useAIUsageStore } from '../../store/aiUsageStore';
import { parseRateHeaders } from '../ai/rateHeaders';
import { attemptsForProvider, isTransientStatus, transientRetryDelayMs } from '../ai/providerRetry';
import { STREAM_USAGE_UNSUPPORTED } from './capabilities';
import { extractApiErrorMessage, isRequestSpecificError } from './errors';
import { groqGovernor } from './governors';
import { sanitizeKey } from './keys';
import { buildProviderChain, getProviderConfig, markServed, trackProviderOutcome } from './providers';
import { TASK_MAX_TOKENS, buildKnowledgeQuery, estimateMessagesTokens } from './requestConfig';
import { MAX_RATE_LIMIT_WAIT_MS, sleepMs } from './retry';
import type { GroqMessage, LocalCallOptions, ProviderId } from './types';

/** Exact total tokens from the usage block a stream ends with (`stream_options.include_usage`), or 0. */
function readStreamUsage(chunk: { usage?: { total_tokens?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown } | null }): number {
  const usage = chunk?.usage;
  if (!usage) return 0;
  const total = Number(usage.total_tokens ?? (Number(usage.prompt_tokens ?? 0) + Number(usage.completion_tokens ?? 0)));
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/** Token budget of a streamed chat answer — long-form, so above the 2000 of a plain `chat` request. */
const STREAM_CHAT_MAX_TOKENS = 4096;

export async function groqStream(
  messages: GroqMessage[],
  onChunk: (text: string) => void,
  temperature = 0.7,
  abortSignal?: AbortSignal,
  skipLibraryContext = false,
  options: LocalCallOptions & {
    /** Budget class of the stream: `chat` keeps the generous streaming default, other tasks use TASK_MAX_TOKENS. */
    task?: AIRequestTask;
    maxTokens?: number;
  } = {},
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error('Stream aborted before start');
  }
  const streamTask = options.task ?? 'chat';
  const streamMaxTokens = options.maxTokens
    ?? (streamTask === 'chat' ? STREAM_CHAT_MAX_TOKENS : TASK_MAX_TOKENS[streamTask] ?? STREAM_CHAT_MAX_TOKENS);
  return groqGovernor.run(streamTask, async () => {
    const state = useAIStore.getState();
    const primaryKey = sanitizeKey(state.apiKey);
    if (!primaryKey) {
      throw new Error(getProviderConfig(state.provider).keyHint);
    }
    const kb = skipLibraryContext ? '' : await state.getKnowledgeContext(buildKnowledgeQuery(messages), 4500);
    const finalMessages: GroqMessage[] = kb
      ? [
          {
            role: 'system',
            content:
              'Context suplimentar din biblioteca locală a utilizatorului. ' +
              'Folosește-l strict ca referință, fără halucinații.\n\n' +
              kb,
          },
          ...messages,
        ]
      : messages;

    // Try each provider in the chain for the INITIAL connection only — once bytes
    // start streaming to the UI we commit to that provider (switching mid-stream
    // would mean discarding partial output the user already sees).
    const primaryProvider = state.provider;
    const effectiveKeys: Partial<Record<ProviderId, string>> = { ...state.providerKeys, ...(primaryKey ? { [primaryProvider]: primaryKey } : {}) };
    const chain = buildProviderChain(primaryProvider, state.model, effectiveKeys);
    let res: Response | null = null;
    let usedProvider: ProviderId | null = null;
    let streamUsageTokens = 0;
    let finishReason: string | null = null;
    let providerName = getProviderConfig(primaryProvider).name;
    let lastError = 'Eroare necunoscută';
    // One controller for the whole stream: Stop reaches the body too, while the
    // 60 s limit below only covers waiting for the provider to start answering.
    let controller = new AbortController();
    const onUserAbort = () => controller.abort(abortSignal?.reason);
    abortSignal?.addEventListener('abort', onUserAbort, { once: true });
    const cleanupAbort = () => abortSignal?.removeEventListener('abort', onUserAbort);

    for (let ci = 0; ci < chain.length; ci++) {
      const link = chain[ci];
      const cfg = getProviderConfig(link.provider);
      const linkMaxTokens = streamMaxTokens;
      const linkMessages = finalMessages;
      const linkTemperature = temperature;
      // A fresh wait per provider: a stalled first one must not leave the next with an already-expired signal.
      let timedOut = false;
      const startTimer = setTimeout(() => { timedOut = true; controller.abort(new DOMException('timeout', 'TimeoutError')); }, 60_000);
      try {
        const usageKey = `${link.provider}:${link.model}`;
        const openStream = (withUsage: boolean) => fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(link.key ? { Authorization: `Bearer ${link.key}` } : {}) },
          body: JSON.stringify({
            model: link.model,
            messages: linkMessages,
            temperature: linkTemperature,
            max_tokens: linkMaxTokens,
            stream: true,
            // Makes the provider close the stream with an exact token count (no more "≈" estimate).
            ...(withUsage ? { stream_options: { include_usage: true } } : {}),
          }),
          signal: controller.signal,
        });
        let wantUsage = !STREAM_USAGE_UNSUPPORTED.has(usageKey);
        let attempt = await openStream(wantUsage);
        // A provider that does not know `stream_options` answers 400/422: retry once without. It is
        // only remembered when the plain request then works, so an unrelated 400 does not disable it.
        if (!attempt.ok && wantUsage && (attempt.status === 400 || attempt.status === 422)) {
          wantUsage = false;
          attempt = await openStream(false);
          if (attempt.ok) STREAM_USAGE_UNSUPPORTED.add(usageKey);
        }
        // 429/5xx (e.g. Mistral "HTTP 503"): short backoff and retry on the same provider before moving on.
        const maxTries = attemptsForProvider(!!chain[ci + 1]);
        for (let tryNo = 1; !attempt.ok && isTransientStatus(attempt.status) && tryNo < maxTries; tryNo++) {
          const retryAfter = attempt.headers.get('retry-after');
          const waitSeconds = retryAfter ? Number(retryAfter) : 0;
          // A provider asking for a long wait is not worth holding the chat for: let the next provider answer.
          if (Number.isFinite(waitSeconds) && waitSeconds * 1000 > MAX_RATE_LIMIT_WAIT_MS) break;
          logAIDebug('groq:streamRetry', { provider: cfg.name, status: attempt.status, tryNo });
          await sleepMs(transientRetryDelayMs(tryNo - 1, retryAfter, Math.floor(Math.random() * 300)), abortSignal);
          attempt = await openStream(wantUsage);
        }
        clearTimeout(startTimer);
        if (attempt.ok) {
          res = attempt;
          usedProvider = link.provider;
          markServed(link.provider, link.model);
          options.onServed?.({ provider: link.provider, model: link.model });
          providerName = cfg.name;
          trackProviderOutcome(link.provider, primaryProvider, cfg.name, !isRequestSpecificError(lastError));
          break;
        }
        const failure = await extractApiErrorMessage(attempt);
        lastError = failure;
        logDiagnosticEvent({
          area: 'ai',
          level: 'warning',
          title: chain[ci + 1] ? 'Trec pe alt provider AI' : 'Stream AI oprit',
          detail: chain[ci + 1]
            ? `${cfg.name} indisponibil (${lastError}). Continui automat pe ${getProviderConfig(chain[ci + 1].provider).name}.`
            : lastError,
        });
      } catch (error) {
        clearTimeout(startTimer);
        if (abortSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          cleanupAbort();
          throw error;
        }
        if (timedOut) {
          lastError = `${cfg.name} nu a răspuns în 60 de secunde.`;
          controller = new AbortController();
        } else {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    if (!res) {
      cleanupAbort();
      throw new Error(`Eroare ${providerName} API: ${lastError}`);
    }
    if (!res.body) {
      cleanupAbort();
      throw new Error('Răspuns fără corp — încearcă din nou.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let carry = '';
    const push = (delta: string) => {
      full += delta;
      onChunk(delta);
    };

    try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = carry + decoder.decode();
        if (tail.trim()) {
          const trimmed = tail.replace(/^data: /, '').trim();
          if (trimmed && trimmed !== '[DONE]') {
            try {
              const json = JSON.parse(trimmed);
              const delta = json.choices?.[0]?.delta?.content ?? '';
              if (delta) push(delta);
              streamUsageTokens = readStreamUsage(json) || streamUsageTokens;
              finishReason = json.choices?.[0]?.finish_reason ?? finishReason;
            } catch (err) {
              console.error(err);
            }
          }
        }
        break;
      }
      const chunk = carry + decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.replace(/^data: /, '').trim();
        if (!trimmed || trimmed === '[DONE]') continue;
        try {
          const json = JSON.parse(trimmed);
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (delta) push(delta);
          streamUsageTokens = readStreamUsage(json) || streamUsageTokens;
              finishReason = json.choices?.[0]?.finish_reason ?? finishReason;
        } catch (err) {
          console.error(err);
        }
      }
    }
    } finally {
      cleanupAbort();
    }
    // Without `stream_options` support a streamed reply carries no token count: then this is an estimate (shown with "≈").
    if (usedProvider) {
      const exact = streamUsageTokens > 0;
      useAIUsageStore.getState().record(
        usedProvider,
        exact ? streamUsageTokens : estimateMessagesTokens(finalMessages) + estimateTokens(full),
        { estimated: !exact, window: parseRateHeaders(res.headers) },
      );
    }
    options.onFinish?.(finishReason);
    return full;
  });
}
