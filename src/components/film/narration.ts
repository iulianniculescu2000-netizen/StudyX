export interface NarrationEntry { id: string; text?: string; durationMs?: number }

/** Accept an array, { scenes: [...] }, or scene-id keyed records. Ignore malformed entries. */
export function parseNarration(value: unknown): NarrationEntry[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const source = record.scenes ?? value;
  const entries = Array.isArray(source) ? source : Object.entries(source).map(([id, entry]) => (
    typeof entry === 'string' ? { id, text: entry } : entry && typeof entry === 'object' ? { ...entry, id } : { id }
  ));
  return entries.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string') return [];
    return [{ id: item.id,
      text: typeof item.text === 'string' && item.text.trim() ? item.text : undefined,
      durationMs: typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) && item.durationMs > 0 ? item.durationMs : undefined,
    }];
  });
}

// Optional author-owned data: no unresolved static import when the file is absent.
const scripts = import.meta.glob('./narration.json', { eager: true, import: 'default' });
export const SCRIPT_NARRATION = parseNarration(scripts['./narration.json']);
// Bundle optional metadata as text too: fetch(file://...) is unavailable in Electron.
// Audio itself remains a public asset, so no recording is included in the JS bundle.
const manifests = import.meta.glob('../../../public/audio/intro/manifest.json', { eager: true, query: '?raw', import: 'default' });
function bundledManifest(): NarrationEntry[] {
  const raw = manifests['../../../public/audio/intro/manifest.json'];
  if (typeof raw !== 'string') return [];
  try { return parseNarration(JSON.parse(raw)); } catch { return []; }
}
export const BUNDLED_NARRATION = bundledManifest();
export const audioPath = (sceneId: string) => `${import.meta.env.BASE_URL}audio/intro/${sceneId}.mp3`;
