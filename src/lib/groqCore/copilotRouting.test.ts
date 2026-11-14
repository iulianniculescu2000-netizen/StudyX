import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProviderChain, isCopilotEligibleTask } from './providers';
import { toCopilotMessages } from './copilotBridge';

const GROQ_KEY = `gsk_${'t'.repeat(32)}`;

describe('GitHub Copilot task eligibility & routing', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows only chat and explanation for Copilot', () => {
    expect(isCopilotEligibleTask('chat')).toBe(true);
    expect(isCopilotEligibleTask('explanation')).toBe(true);
    expect(isCopilotEligibleTask('questions')).toBe(false);
    expect(isCopilotEligibleTask('analysis')).toBe(false);
    expect(isCopilotEligibleTask('hint')).toBe(false);
    expect(isCopilotEligibleTask('mnemonic')).toBe(false);
    expect(isCopilotEligibleTask(undefined)).toBe(false);
  });

  it('places Copilot first only for chat & explanation when connected, excluding it elsewhere', () => {
    const keys = { groq: GROQ_KEY };

    const chatChain = buildProviderChain('copilot', 'copilot-auto', keys, {
      task: 'chat',
      copilotConnected: true,
    });
    expect(chatChain[0]).toEqual({ provider: 'copilot', key: '', model: 'copilot-auto' });
    expect(chatChain.some((l) => l.provider === 'groq')).toBe(true);

    const explanationChain = buildProviderChain('copilot', 'copilot-auto', keys, {
      task: 'explanation',
      copilotConnected: true,
    });
    expect(explanationChain[0].provider).toBe('copilot');

    for (const nonCopilotTask of ['questions', 'analysis', 'hint', 'mnemonic'] as const) {
      const chain = buildProviderChain('copilot', 'copilot-auto', keys, {
        task: nonCopilotTask,
        copilotConnected: true,
      });
      expect(chain.some((l) => l.provider === 'copilot')).toBe(false);
      expect(chain[0]?.provider).toBe('groq');
    }

    const disconnectedChain = buildProviderChain('copilot', 'copilot-auto', keys, {
      task: 'chat',
      copilotConnected: false,
    });
    expect(disconnectedChain.some((l) => l.provider === 'copilot')).toBe(false);
    expect(disconnectedChain[0]?.provider).toBe('groq');
  });

  it('never includes Copilot in getConfiguredProviderModels (judge / crossCheck remain cloud-only)', async () => {
    const { useAIStore, getConfiguredProviderModels } = await import('../../store/aiStore');
    useAIStore.setState({
      provider: 'copilot',
      model: 'copilot-auto',
      apiKey: '',
      copilotConnected: true,
      providerKeys: { groq: GROQ_KEY },
      providerModels: { copilot: 'copilot-auto', groq: 'openai/gpt-oss-120b' },
    });

    const configured = getConfiguredProviderModels(useAIStore.getState());
    expect(configured).toEqual([{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
    expect(configured.some((c) => (c.provider as string) === 'copilot')).toBe(false);
  });

  it('toCopilotMessages flattens multimodal text parts cleanly', () => {
    expect(
      toCopilotMessages([
        { role: 'system', content: 'Sistem' },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
            { type: 'text', text: 'Prima linie' },
            { type: 'text', text: 'A doua linie' },
          ],
        },
      ]),
    ).toEqual([
      { role: 'system', content: 'Sistem' },
      { role: 'user', content: 'Prima linie\nA doua linie' },
    ]);
  });

  it('routes explanation requests to Copilot and question generation strictly to cloud API keys', async () => {
    const { useAIStore } = await import('../../store/aiStore');
    const groqMod = await import('../groq');

    useAIStore.setState({
      provider: 'copilot',
      model: 'copilot-auto',
      apiKey: '',
      copilotConnected: true,
      copilotStatusInfo: { state: 'connected', isAuthenticated: true, login: 'med-user' },
      providerKeys: { groq: GROQ_KEY },
      providerModels: { copilot: 'copilot-auto', groq: 'openai/gpt-oss-120b' },
    });

    const copilotStreamMock = vi.fn(async (payload: { requestId: string }, onDelta?: (d: string) => void) => {
      expect(payload.requestId).toBeTruthy();
      onDelta?.('{"reason":"Corect [1]"}');
      return {
        ok: true,
        content: '{"reason":"Corect [1]"}',
        model: 'gpt-4.1',
        modelDisplayName: 'GPT-4.1',
        usage: { inputTokens: 120, outputTokens: 30, finishReason: 'stop' },
      };
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '[{"q":"Test"}]' } }], usage: { total_tokens: 40 } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const prevApi = window.electronAPI;
    window.electronAPI = {
      ...(prevApi as NonNullable<typeof prevApi>),
      copilotStream: copilotStreamMock,
      copilotAbort: vi.fn(async () => ({ ok: true })),
    };

    try {
      const expOut = await groqMod.groqRequest({
        task: 'explanation',
        jsonMode: true,
        skipLibraryContext: true,
        messages: [{ role: 'user', content: 'Explică grila' }],
      });
      expect(expOut).toBe('{"reason":"Corect [1]"}');
      expect(copilotStreamMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(groqMod.getLastServedModel()).toEqual({ provider: 'copilot', model: 'GPT-4.1' });

      const qOut = await groqMod.groqRequest({
        task: 'questions',
        skipLibraryContext: true,
        messages: [{ role: 'user', content: 'Generează grile' }],
      });
      expect(qOut).toBe('[{"q":"Test"}]');
      expect(copilotStreamMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      window.electronAPI = prevApi;
    }
  });

  it('rejects question generation cleanly when only Copilot is connected without cloud API keys', async () => {
    const { useAIStore } = await import('../../store/aiStore');
    const groqMod = await import('../groq');

    useAIStore.setState({
      provider: 'copilot',
      model: 'copilot-auto',
      apiKey: '',
      copilotConnected: true,
      providerKeys: {},
    });

    await expect(
      groqMod.groqRequest({
        task: 'questions',
        skipLibraryContext: true,
        messages: [{ role: 'user', content: 'Generează' }],
      }),
    ).rejects.toThrow(/cheie API/);
  });

  it('falls back from Copilot 429 quota_exhausted to Groq before first streamed delta and updates store state', async () => {
    const { useAIStore } = await import('../../store/aiStore');
    const groqMod = await import('../groq');

    useAIStore.setState({
      provider: 'copilot',
      model: 'copilot-auto',
      apiKey: '',
      copilotConnected: true,
      copilotStatusInfo: { state: 'connected', isAuthenticated: true, login: 'med-user' },
      providerKeys: { groq: GROQ_KEY },
      providerModels: { copilot: 'copilot-auto', groq: 'openai/gpt-oss-120b' },
    });

    const copilotStreamMock = vi.fn(async () => ({
      ok: false as const,
      errorCode: 'quota_exhausted' as const,
      error: 'Cota GitHub Copilot pentru chat a fost atinsă.',
    }));
    const fetchMock = vi.fn(async () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Răspuns fallback Groq' } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const prevApi = window.electronAPI;
    window.electronAPI = {
      ...(prevApi as NonNullable<typeof prevApi>),
      copilotStream: copilotStreamMock,
    };

    const chunks: string[] = [];
    try {
      const text = await groqMod.groqStream(
        [{ role: 'user', content: 'Explică AVC' }],
        (c) => chunks.push(c),
        0.5,
        undefined,
        true,
        { task: 'chat' },
      );
      expect(text).toBe('Răspuns fallback Groq');
      expect(chunks).toEqual(['Răspuns fallback Groq']);
      expect(useAIStore.getState().copilotStatusInfo.state).toBe('quota_exhausted');
      expect(groqMod.getLastServedModel()?.provider).toBe('groq');
    } finally {
      window.electronAPI = prevApi;
    }
  });

  it('forwards AbortSignal to copilotAbort and does not fall back on abort', async () => {
    const { useAIStore } = await import('../../store/aiStore');
    const groqMod = await import('../groq');

    useAIStore.setState({
      provider: 'copilot',
      model: 'copilot-auto',
      apiKey: '',
      copilotConnected: true,
      copilotStatusInfo: { state: 'connected', isAuthenticated: true },
      providerKeys: { groq: GROQ_KEY },
    });

    const abortMock = vi.fn(async () => ({ ok: true }));
    const controller = new AbortController();
    const copilotStreamMock = vi.fn(async () => {
      controller.abort();
      return { ok: false as const, errorCode: 'aborted' as const, error: 'Cerere oprită.' };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const prevApi = window.electronAPI;
    window.electronAPI = {
      ...(prevApi as NonNullable<typeof prevApi>),
      copilotStream: copilotStreamMock,
      copilotAbort: abortMock,
    };

    try {
      await expect(
        groqMod.groqStream(
          [{ role: 'user', content: 'Întrebare' }],
          () => {},
          0.5,
          controller.signal,
          true,
          { task: 'chat' },
        ),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(abortMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      window.electronAPI = prevApi;
    }
  });
});
