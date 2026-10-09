import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useRuntimeStore } from '../store/runtimeStore';
import { resolve } from '../theme/motion';

export function useAdaptiveMotion() {
  const reducedMotion = useReducedMotion();
  const lowPowerMode = useRuntimeStore((state) => state.lowPowerMode);
  const performanceLite = (
    typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-performance') === 'lite'
  ) || lowPowerMode;
  const calmMotion = !!reducedMotion || performanceLite;
  // Tranzițiile rezolvate (instantanee când mișcarea e calmă): `const { t } = useAdaptiveMotion()`.
  const t = useMemo(() => resolve(calmMotion), [calmMotion]);

  return {
    reducedMotion,
    performanceLite,
    calmMotion: reducedMotion || performanceLite,
    t,
  };
}
