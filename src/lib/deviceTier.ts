export type DeviceTier = 'low' | 'mid' | 'high';
export type ResolvedPerformanceProfile = 'lite' | 'full';
export type PerformanceMode = 'auto' | 'lite' | 'full';

export interface DeviceCapabilities {
  tier: DeviceTier;
  reducedMotion: boolean;
  lowPowerPreference: boolean;
  hardwareConcurrency: number;
  deviceMemory: number;
  viewportWidth: number;
  viewportHeight: number;
}

function safeMatchMedia(query: string) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

function getDeviceMemory() {
  if (typeof navigator === 'undefined') return 8;
  return 'deviceMemory' in navigator
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    : 8;
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  const reducedMotion = safeMatchMedia('(prefers-reduced-motion: reduce)');
  const lowPowerPreference = safeMatchMedia('(prefers-reduced-data: reduce)');
  const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8;
  const deviceMemory = getDeviceMemory();
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;

  const lowSignals = [
    reducedMotion,
    lowPowerPreference,
    hardwareConcurrency <= 4,
    deviceMemory <= 4,
    viewportWidth <= 1280,
  ].filter(Boolean).length;

  const highSignals = [
    hardwareConcurrency >= 10,
    deviceMemory >= 8,
    viewportWidth >= 1600,
    viewportHeight >= 920,
    !reducedMotion,
  ].filter(Boolean).length;

  const tier: DeviceTier = lowSignals >= 2 ? 'low' : highSignals >= 4 ? 'high' : 'mid';

  return {
    tier,
    reducedMotion,
    lowPowerPreference,
    hardwareConcurrency,
    deviceMemory,
    viewportWidth,
    viewportHeight,
  };
}

export function resolvePerformanceProfile(
  capabilities: DeviceCapabilities,
  mode: PerformanceMode,
  lowPowerMode: boolean,
): ResolvedPerformanceProfile {
  if (mode === 'lite') return 'lite';
  if (mode === 'full') return 'full';
  if (lowPowerMode) return 'lite';
  return capabilities.tier === 'low' || capabilities.reducedMotion || capabilities.lowPowerPreference ? 'lite' : 'full';
}
