import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_GLASS, GLASS_LIMITS, GLASS_PRESETS, sanitizeGlass, useChatGlass } from './useChatGlass';

describe('sanitizeGlass', () => {
  it('falls back to defaults for missing or malformed data', () => {
    expect(sanitizeGlass(null)).toEqual(DEFAULT_GLASS);
    expect(sanitizeGlass('nope')).toEqual(DEFAULT_GLASS);
    expect(sanitizeGlass({ opacity: 'x', blur: NaN, immersive: 'yes' })).toEqual(DEFAULT_GLASS);
  });

  it('clamps out-of-range values so the panel can never become invisible or unreadable', () => {
    expect(sanitizeGlass({ opacity: 0, blur: 500 })).toMatchObject({ opacity: GLASS_LIMITS.opacity.min, blur: GLASS_LIMITS.blur.max });
    expect(sanitizeGlass({ opacity: 5, blur: -4 })).toMatchObject({ opacity: GLASS_LIMITS.opacity.max, blur: 0 });
  });

  it('keeps valid values', () => {
    expect(sanitizeGlass({ immersive: true, opacity: 0.4, blur: 12 })).toEqual({ immersive: true, opacity: 0.4, blur: 12 });
  });
});

describe('useChatGlass', () => {
  beforeEach(() => localStorage.clear());

  it('starts on the small sheet and remembers the choice', () => {
    const { result, unmount } = renderHook(() => useChatGlass());
    expect(result.current.settings.immersive).toBe(false);

    act(() => result.current.toggleImmersive());
    expect(result.current.settings.immersive).toBe(true);
    unmount();

    const again = renderHook(() => useChatGlass());
    expect(again.result.current.settings.immersive).toBe(true);
  });

  it('applies a preset and clamps slider input', () => {
    const { result } = renderHook(() => useChatGlass());
    act(() => result.current.applyPreset('clar'));
    expect(result.current.settings).toMatchObject({ opacity: GLASS_PRESETS.clar.opacity, blur: GLASS_PRESETS.clar.blur });
    act(() => result.current.update({ opacity: 0.01 }));
    expect(result.current.settings.opacity).toBe(GLASS_LIMITS.opacity.min);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('studyx-chat-glass', '{broken');
    const { result } = renderHook(() => useChatGlass());
    expect(result.current.settings).toEqual(DEFAULT_GLASS);
  });
});
