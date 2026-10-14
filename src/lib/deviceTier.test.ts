import { describe, expect, it } from 'vitest';
import { liteReason, resolvePerformanceProfile, type DeviceCapabilities } from './deviceTier';

const base: DeviceCapabilities = {
  tier: 'mid', reducedMotion: false, lowPowerPreference: false,
  hardwareConcurrency: 8, deviceMemory: 8, viewportWidth: 1100, viewportHeight: 700,
};

describe('profilul de performanță', () => {
  it('o fereastră îngustă pe un calculator bun rămâne complet (ca în browser)', () => {
    expect(resolvePerformanceProfile(base, 'auto', false)).toBe('full');
    expect(liteReason(base, 'auto', false)).toBeNull();
  });
  it('calculatorul slab trece pe economic și spune de ce', () => {
    const weak = { ...base, tier: 'low' as const, hardwareConcurrency: 4, deviceMemory: 4 };
    expect(resolvePerformanceProfile(weak, 'auto', false)).toBe('lite');
    expect(liteReason(weak, 'auto', false)).toContain('puține resurse');
  });
  it('mișcarea redusă din Windows e numită ca motiv', () => {
    expect(liteReason({ ...base, reducedMotion: true }, 'auto', false)).toContain('animațiile oprite');
  });
  it('alegerea explicită bate detectarea', () => {
    expect(resolvePerformanceProfile({ ...base, reducedMotion: true }, 'full', false)).toBe('full');
    expect(liteReason(base, 'lite', false)).toContain('ales de tine');
  });
});
