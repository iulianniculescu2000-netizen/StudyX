import { useCallback, useState } from 'react';

const STORAGE_KEY = 'studyx-chat-glass';

export interface ChatGlassSettings {
  /** Chat fills the window (next to the app sidebar) instead of the small floating sheet. */
  immersive: boolean;
  /** Opacity of the glass panel, 0.25 (see-through) … 0.95 (almost solid). */
  opacity: number;
  /** Blur radius of what shows through the panel, in px. */
  blur: number;
}

export const GLASS_LIMITS = { opacity: { min: 0.25, max: 0.95 }, blur: { min: 0, max: 30 } } as const;

export const GLASS_PRESETS = {
  clar: { label: 'Clar', opacity: 0.35, blur: 22 },
  sticla: { label: 'Sticlă', opacity: 0.58, blur: 18 },
  mat: { label: 'Mat', opacity: 0.88, blur: 8 },
} as const;

export type GlassPresetId = keyof typeof GLASS_PRESETS;

export const DEFAULT_GLASS: ChatGlassSettings = { immersive: false, opacity: GLASS_PRESETS.sticla.opacity, blur: GLASS_PRESETS.sticla.blur };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Turns whatever is in storage into valid settings; anything unusable falls back to the default. */
export function sanitizeGlass(raw: unknown): ChatGlassSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_GLASS };
  const value = raw as Partial<ChatGlassSettings>;
  const opacity = typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? value.opacity : DEFAULT_GLASS.opacity;
  const blur = typeof value.blur === 'number' && Number.isFinite(value.blur) ? value.blur : DEFAULT_GLASS.blur;
  return {
    immersive: value.immersive === true,
    opacity: clamp(opacity, GLASS_LIMITS.opacity.min, GLASS_LIMITS.opacity.max),
    blur: clamp(Math.round(blur), GLASS_LIMITS.blur.min, GLASS_LIMITS.blur.max),
  };
}

function load(): ChatGlassSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitizeGlass(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_GLASS };
  }
}

/**
 * Preferences for the full-screen glass chat. Kept per device (localStorage): how
 * transparent the panel is depends on the screen and taste, not on the study profile.
 */
export function useChatGlass() {
  const [settings, setSettings] = useState<ChatGlassSettings>(load);

  const update = useCallback((patch: Partial<ChatGlassSettings>) => {
    setSettings((current) => {
      const next = sanitizeGlass({ ...current, ...patch });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage blocked — the choice lasts for this visit
      }
      return next;
    });
  }, []);

  const setImmersive = useCallback((immersive: boolean) => update({ immersive }), [update]);
  const toggleImmersive = useCallback(() => {
    setSettings((current) => {
      const next = { ...current, immersive: !current.immersive };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const applyPreset = useCallback((id: GlassPresetId) => update({ opacity: GLASS_PRESETS[id].opacity, blur: GLASS_PRESETS[id].blur }), [update]);

  return { settings, update, setImmersive, toggleImmersive, applyPreset };
}
