import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/aiStore', () => {
  const state = {
    provider: 'groq' as const,
    model: 'llama-3.3-70b-versatile',
    apiKey: 'gsk_test',
    setModel: vi.fn(),
  };
  return {
    useAIStore: {
      getState: () => state,
    },
  };
});

vi.mock('../../store/toastStore', () => {
  const state = { addToast: vi.fn() };
  return {
    useToastStore: {
      getState: () => state,
    },
  };
});

const { isModelUnavailableError, nextCandidateModel, healPrimaryModelChoice, checkModelAvailability } =
  await import('./modelHealing');
const { useAIStore } = await import('../../store/aiStore');
const { useToastStore } = await import('../../store/toastStore');

describe('isModelUnavailableError', () => {
  it('matches the exact Groq wording seen live', () => {
    expect(isModelUnavailableError(
      'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.',
    )).toBe(true);
  });

  it('matches decommissioned wording', () => {
    expect(isModelUnavailableError('This model has been decommissioned. Please use a different model.')).toBe(true);
  });

  it('matches OpenAI-style model_not_found', () => {
    expect(isModelUnavailableError('model_not_found: no such model')).toBe(true);
  });

  it('does not flag unrelated errors (rate limit, network, auth)', () => {
    expect(isModelUnavailableError('Rate limit reached for requests')).toBe(false);
    expect(isModelUnavailableError('Invalid API key provided')).toBe(false);
    expect(isModelUnavailableError('Failed to fetch')).toBe(false);
  });
});

describe('nextCandidateModel', () => {
  it('returns a different candidate for the same provider', () => {
    const next = nextCandidateModel('groq', 'llama-3.3-70b-versatile');
    expect(next).not.toBeNull();
    expect(next).not.toBe('llama-3.3-70b-versatile');
  });

  it('skips the exact model that just failed even if it is a normal candidate', () => {
    const next = nextCandidateModel('groq', 'openai/gpt-oss-120b');
    expect(next).toBe('openai/gpt-oss-20b');
  });
});

describe('healPrimaryModelChoice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists and notifies only when the dead model was the primary provider', () => {
    healPrimaryModelChoice('groq', 'groq', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'Groq');
    expect(useAIStore.getState().setModel).toHaveBeenCalledWith('openai/gpt-oss-120b');
    expect(useToastStore.getState().addToast).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the dead model belonged to a fallback provider, not the primary', () => {
    healPrimaryModelChoice('mistral', 'groq', 'mistral-small-latest', 'mistral-large-latest', 'Mistral AI');
    expect(useAIStore.getState().setModel).not.toHaveBeenCalled();
    expect(useToastStore.getState().addToast).not.toHaveBeenCalled();
  });
});

describe('checkModelAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('does nothing without an API key', async () => {
    useAIStore.getState().apiKey = '';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await checkModelAvailability();
    expect(fetchSpy).not.toHaveBeenCalled();
    useAIStore.getState().apiKey = 'gsk_test';
  });

  it('swaps the model when the configured one is missing from the live list', async () => {
    useAIStore.getState().model = 'llama-3.3-70b-versatile';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }] }),
    }));
    await checkModelAvailability();
    expect(useAIStore.getState().setModel).toHaveBeenCalledWith('openai/gpt-oss-120b');
  });

  it('leaves the model alone when it is still in the live list', async () => {
    useAIStore.getState().model = 'openai/gpt-oss-120b';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }] }),
    }));
    await checkModelAvailability();
    expect(useAIStore.getState().setModel).not.toHaveBeenCalled();
  });

  it('is throttled to once per day per provider', async () => {
    useAIStore.getState().model = 'llama-3.3-70b-versatile';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'openai/gpt-oss-120b' }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await checkModelAvailability();
    await checkModelAvailability();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fails silently on a network error', async () => {
    useAIStore.getState().model = 'llama-3.3-70b-versatile';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(checkModelAvailability()).resolves.toBeUndefined();
    expect(useAIStore.getState().setModel).not.toHaveBeenCalled();
  });

  it('fails silently on a non-ok response (e.g. bad key)', async () => {
    useAIStore.getState().model = 'llama-3.3-70b-versatile';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(checkModelAvailability()).resolves.toBeUndefined();
    expect(useAIStore.getState().setModel).not.toHaveBeenCalled();
  });
});
