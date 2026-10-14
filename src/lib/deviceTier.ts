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

  // Mărimea ferestrei NU e un semnal de dispozitiv slab: aplicația desktop rulează adesea într-o fereastră de ≤1280 px (laptop,
  // scalare Windows 125-150%), iar asta o arunca în profilul „economic” (sticlă plată, fără animații), pe când în browser, pe tot
  // ecranul, arăta complet. Mișcarea redusă și economia de date sunt tratate separat, în resolvePerformanceProfile.
  const lowSignals = [
    hardwareConcurrency <= 4,
    deviceMemory <= 4,
  ].filter(Boolean).length;

  const highSignals = [
    hardwareConcurrency >= 10,
    deviceMemory >= 8,
    viewportWidth >= 1600,
    viewportHeight >= 920,
    !reducedMotion,
  ].filter(Boolean).length;

  const tier: DeviceTier = lowSignals >= 2 ? 'low' : highSignals >= 3 ? 'high' : 'mid';

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

/** De ce e activ profilul economic (sticlă plată, fără animații); `null` când aspectul e complet. Apare în Setări › Performanță. */
export function liteReason(
  capabilities: DeviceCapabilities,
  mode: PerformanceMode,
  lowPowerMode: boolean,
): string | null {
  if (resolvePerformanceProfile(capabilities, mode, lowPowerMode) === 'full') return null;
  if (mode === 'lite') return 'ales de tine (Performanță: Economic)';
  if (lowPowerMode) return 'economisire de energie activă pentru această sesiune';
  if (capabilities.reducedMotion) return 'Windows are animațiile oprite (mișcare redusă)';
  if (capabilities.lowPowerPreference) return 'sistemul cere economie de date';
  return 'calculator cu puține resurse (≤4 thread-uri și ≤4 GB RAM)';
}
