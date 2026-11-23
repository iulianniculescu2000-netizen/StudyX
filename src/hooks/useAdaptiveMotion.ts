import { useMemo, useSyncExternalStore } from 'react';
import { useReducedMotion } from 'framer-motion';
import { detectDeviceCapabilities, resolvePerformanceProfile } from '../lib/deviceTier';
import { useRuntimeStore } from '../store/runtimeStore';
import { resolve } from '../theme/motion';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REDUCED_DATA_QUERY = '(prefers-reduced-data: reduce)';

function subscribeDeviceSignals(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  const dataQuery = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_DATA_QUERY) : null;

  motionQuery?.addEventListener?.('change', onChange);
  dataQuery?.addEventListener?.('change', onChange);
  window.addEventListener('resize', onChange, { passive: true });

  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute('data-theme-mode')) {
        onChange();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-performance'],
    });
  }

  return () => {
    motionQuery?.removeEventListener?.('change', onChange);
    dataQuery?.removeEventListener?.('change', onChange);
    window.removeEventListener('resize', onChange);
    observer?.disconnect();
  };
}

function getDeviceSignalSnapshot(): string {
  const caps = detectDeviceCapabilities();
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  // Când ThemeProvider nu este montat (ex. teste izolate care setează manual `data-performance`),
  // păstrăm compatibilitatea cu atributul de pe <html>; în aplicația live ThemeContext setează
  // `data-theme-mode`, deci evităm decalajul de un cadru la comutarea Auto / Lite / Full.
  const domPerf = root && !root.hasAttribute('data-theme-mode')
    ? root.getAttribute('data-performance') ?? ''
    : '';
  return `${caps.tier}|${caps.reducedMotion}|${caps.lowPowerPreference}|${domPerf}`;
}

function getServerDeviceSignalSnapshot(): string {
  return 'mid|false|false|';
}

export function useAdaptiveMotion() {
  const framerReducedMotion = useReducedMotion();
  const performanceMode = useRuntimeStore((state) => state.performanceMode);
  const lowPowerMode = useRuntimeStore((state) => state.lowPowerMode);
  const signalSnapshot = useSyncExternalStore(
    subscribeDeviceSignals,
    getDeviceSignalSnapshot,
    getServerDeviceSignalSnapshot,
  );

  const capabilities = detectDeviceCapabilities();
  const reducedMotion = Boolean(framerReducedMotion) || capabilities.reducedMotion;
  const domFallbackLite = performanceMode === 'auto' && signalSnapshot.endsWith('|lite');
  const performanceLite =
    resolvePerformanceProfile(capabilities, performanceMode, lowPowerMode) === 'lite' || domFallbackLite;
  const calmMotion = reducedMotion || performanceLite;
  // Tranzițiile rezolvate (instantanee când mișcarea e calmă): `const { t } = useAdaptiveMotion()`.
  const t = useMemo(() => resolve(calmMotion), [calmMotion]);

  return {
    reducedMotion,
    performanceLite,
    calmMotion,
    t,
  };
}
