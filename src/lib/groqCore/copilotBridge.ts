import { useAIStore } from '../../store/aiStore';
import { estimateTokens, useAIUsageStore } from '../../store/aiUsageStore';
import type { GroqMessage } from './types';

export interface CopilotBridgeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CopilotBridgeResult {
  content: string;
  servedModel: string;
  finishReason?: string;
}

export function toCopilotMessages(messages: Array<GroqMessage | CopilotBridgeMessage>): CopilotBridgeMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content:
      typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('\n'),
  }));
}

/** Cât așteptăm până reîncercăm Copilot după „cotă atinsă”, când contul nu spune o dată de resetare din viitor. */
const QUOTA_RETRY_MS = 15 * 60_000;

/** Momentul de la care Copilot merită reîncercat după ce a răspuns „cotă atinsă”. Doar în memorie: la repornire starea se recitește de la cont. */
let quotaRetryAt = 0;

function noteQuotaExhausted(resetDate?: string): void {
  const reset = resetDate ? Date.parse(resetDate) : Number.NaN;
  const now = Date.now();
  quotaRetryAt = Number.isFinite(reset) && reset > now ? reset : now + QUOTA_RETRY_MS;
}

/**
 * Cota atinsă scoate Copilot din lanț, iar cererile merg pe cheile API. Fără pasul acesta ar rămâne scos până când
 * utilizatorul apasă „Reîncearcă” în Setări AI. Când a trecut timpul de așteptare îl punem la loc o dată: dacă încă nu
 * are cotă, răspunde imediat cu aceeași eroare și cererea continuă pe următorul furnizor.
 */
export function reviveCopilotIfDue(): void {
  if (!quotaRetryAt || Date.now() < quotaRetryAt) return;
  quotaRetryAt = 0;
  const store = useAIStore.getState();
  if (store.copilotStatusInfo.state !== 'quota_exhausted') return;
  store.setCopilotStatusInfo({
    ...store.copilotStatusInfo,
    state: 'connected',
    isAuthenticated: true,
    statusMessage: 'Conectat la GitHub Copilot',
  });
}

function createAbortError(message = 'Cerere oprită.'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

export async function callCopilotBridge(
  messages: Array<GroqMessage | CopilotBridgeMessage>,
  _temperature?: number,
  signal?: AbortSignal,
  onChunk?: (delta: string) => void,
): Promise<CopilotBridgeResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api?.copilotStream) {
    throw new Error('GitHub Copilot necesită aplicația desktop StudyX.');
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const normalizedMessages = toCopilotMessages(messages);

  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `copilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let abortRequested = false;
  const onAbort = () => {
    abortRequested = true;
    void api.copilotAbort?.(requestId).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  let res: Awaited<ReturnType<NonNullable<typeof api.copilotStream>>> | undefined;
  try {
    res = await api.copilotStream({ requestId, messages: normalizedMessages }, onChunk);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  if (abortRequested || signal?.aborted || res?.errorCode === 'aborted') {
    throw createAbortError(res?.error || 'Cerere oprită.');
  }

  const store = useAIStore.getState();

  if (!res || !res.ok) {
    if (res?.errorCode === 'quota_exhausted') {
      const msg = res.error || 'Cota GitHub Copilot pentru chat a fost atinsă.';
      noteQuotaExhausted(store.copilotStatusInfo.quota?.resetDate);
      store.setCopilotStatusInfo({
        ...store.copilotStatusInfo,
        state: 'quota_exhausted',
        isAuthenticated: true,
        statusMessage: msg,
      });
      const err = new Error(msg) as Error & { status?: number; code?: string };
      err.status = 429;
      err.code = 'quota_exhausted';
      throw err;
    }

    if (res?.errorCode === 'auth_required') {
      const msg = res.error || 'Conectarea GitHub Copilot lipsește sau a expirat.';
      store.setCopilotStatusInfo({
        state: 'disconnected',
        isAuthenticated: false,
        login: null,
        authType: null,
        host: null,
        quota: null,
        lastModel: store.copilotStatusInfo.lastModel ?? null,
        statusMessage: msg,
      });
      const err = new Error(msg) as Error & { status?: number; code?: string };
      err.status = 401;
      err.code = 'auth_required';
      throw err;
    }

    // O eroare trecătoare (rețea, timp expirat, motor repornit) nu schimbă starea conectării: cererea aceasta cade pe
    // următorul furnizor, iar următoarea încearcă din nou Copilot. Altfel o singură eroare l-ar scoate din uz până la
    // o reîncercare manuală din Setări AI.
    throw new Error(res?.error || 'Eroare GitHub Copilot.');
  }

  const content = res.content ?? '';
  const servedModel = res.modelDisplayName || res.model || 'copilot-auto';
  const finishReason = res.usage?.finishReason;
  const quota = res.usage?.quota ?? undefined;
  const quotaExhausted =
    quota != null &&
    !quota.isUnlimitedEntitlement &&
    typeof quota.remainingPercentage === 'number' &&
    quota.remainingPercentage <= 0;
  if (quotaExhausted) noteQuotaExhausted(quota?.resetDate);

  store.setCopilotStatusInfo({
    ...store.copilotStatusInfo,
    state: quotaExhausted ? 'quota_exhausted' : 'connected',
    isAuthenticated: true,
    lastModel: servedModel,
    ...(quota !== undefined ? { quota } : {}),
    statusMessage: quotaExhausted
      ? 'Cota GitHub Copilot pentru chat a fost atinsă.'
      : 'Conectat la GitHub Copilot',
  });

  const inputTokens = res.usage?.inputTokens;
  const outputTokens = res.usage?.outputTokens;
  const hasExactTokens = typeof inputTokens === 'number' || typeof outputTokens === 'number';
  const totalTokens = hasExactTokens
    ? (inputTokens ?? 0) + (outputTokens ?? 0)
    : estimateTokens(`${normalizedMessages.map((m) => m.content).join('\n')}\n${content}`);
  useAIUsageStore.getState().record('copilot', totalTokens, { estimated: !hasExactTokens });

  return {
    content,
    servedModel,
    finishReason,
  };
}
