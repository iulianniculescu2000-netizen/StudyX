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

    const msg = res?.error || 'Eroare GitHub Copilot.';
    store.setCopilotStatusInfo({
      ...store.copilotStatusInfo,
      state: 'error',
      statusMessage: msg,
    });
    throw new Error(msg);
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
