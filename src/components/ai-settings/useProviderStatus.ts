import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAIStore } from '../../store/aiStore';
import { MODEL_OPTIONS, type ProviderId } from '../../lib/ai/modelCatalog';
import {
  PROVIDER_IDS, getDiscoveredModels, getModelStatus, lastProbeKind, healRetiredSelection, verifyAllProviders,
  type DiscoveredModel, type ModelStatus,
} from '../../lib/ai/providerStatus';

export interface ProviderStatusApi {
  now: number;
  /** Furnizorul în curs de verificare, „all” pentru toți, null când nu rulează nimic. */
  running: ProviderId | 'all' | null;
  hasKey: (provider: ProviderId) => boolean;
  statusOf: (provider: ProviderId, model: string) => ModelStatus;
  discovered: (provider: ProviderId) => DiscoveredModel[];
  /** Ultimul rezultat de ping al modelului (rămâne și după ce limita de cereri a trecut). */
  lastKind: (provider: ProviderId, model: string) => ReturnType<typeof lastProbeKind>;
  verify: (only?: ProviderId) => Promise<void>;
  cancel: () => void;
}

/** Starea modelelor pentru Setări AI: citește verificările păstrate, rulează verificări anulabile și ține ceasul pentru „peste N s”. */
export function useProviderStatus(open: boolean): ProviderStatusApi {
  const providerKeys = useAIStore((s) => s.providerKeys);
  const activeProvider = useAIStore((s) => s.provider);
  const activeKey = useAIStore((s) => s.apiKey);
  const [now, setNow] = useState(() => Date.now());
  const [version, setVersion] = useState(0);
  const [running, setRunning] = useState<ProviderId | 'all' | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const keyOf = useCallback((provider: ProviderId) => (providerKeys[provider] ?? (provider === activeProvider ? activeKey : '') ?? '').trim(), [providerKeys, activeProvider, activeKey]);

  const statuses = useMemo(() => {
    const map = new Map<string, ModelStatus>();
    // `version` și `now` fac recalcularea la fiecare verificare și la fiecare tic.
    void version;
    for (const provider of PROVIDER_IDS) {
      const key = keyOf(provider);
      for (const option of MODEL_OPTIONS[provider]) map.set(`${provider}:${option.id}`, getModelStatus(provider, option.id, key, now));
    }
    return map;
  }, [keyOf, now, version]);

  const needsTick = running !== null || [...statuses.values()].some((status) => status.kind === 'rate');

  useEffect(() => {
    if (!open) return undefined;
    // Ceasul se aduce la zi imediat după deschidere, apoi la 5 s (la 1 s cât timp numără o limită de cereri).
    const first = setTimeout(() => { setNow(Date.now()); healRetiredSelection(Date.now()); }, 0);
    const interval = setInterval(() => setNow(Date.now()), needsTick ? 1000 : 5000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [open, needsTick]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const verify = useCallback(async (only?: ProviderId) => {
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(only ?? 'all');
    try {
      await verifyAllProviders({
        signal: controller.signal,
        only,
        onProgress: () => { setVersion((v) => v + 1); setNow(Date.now()); },
      });
    } catch {
      /* anulat sau căzut: ce s-a aflat până acum rămâne păstrat, restul rămâne „nu e verificat” */
    } finally {
      abortRef.current = null;
      setRunning(null);
      setVersion((v) => v + 1);
      setNow(Date.now());
    }
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return {
    now,
    running,
    hasKey: (provider) => keyOf(provider).length > 0,
    statusOf: (provider, model) => statuses.get(`${provider}:${model}`) ?? getModelStatus(provider, model, keyOf(provider), now),
    discovered: (provider) => getDiscoveredModels(provider, keyOf(provider)),
    lastKind: (provider, model) => lastProbeKind(provider, model, keyOf(provider)),
    verify,
    cancel,
  };
}
