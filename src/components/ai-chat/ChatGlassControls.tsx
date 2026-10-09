import { useTheme } from '../../theme/ThemeContext';
import {
  GLASS_LIMITS,
  GLASS_PRESETS,
  type ChatGlassSettings,
  type GlassPresetId,
} from './useChatGlass';

/** Transparency + blur controls for the full-screen glass chat: three presets and two sliders. */
export default function ChatGlassControls({
  settings,
  onChange,
  onPreset,
}: {
  settings: ChatGlassSettings;
  onChange: (patch: Partial<ChatGlassSettings>) => void;
  onPreset: (id: GlassPresetId) => void;
}) {
  const theme = useTheme();
  const transparency = Math.round((1 - settings.opacity) * 100);
  const activePreset = (Object.keys(GLASS_PRESETS) as GlassPresetId[]).find(
    (id) => Math.abs(GLASS_PRESETS[id].opacity - settings.opacity) < 0.005 && GLASS_PRESETS[id].blur === settings.blur,
  );

  return (
    <div className="w-64 space-y-3 p-2 text-[12px]" style={{ color: theme.text }}>
      <div className="flex gap-1.5" role="group" aria-label="Presetări sticlă">
        {(Object.keys(GLASS_PRESETS) as GlassPresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onPreset(id)}
            aria-pressed={activePreset === id}
            className="press-feedback flex-1 rounded-xl px-2 py-1.5 font-bold"
            style={{
              background: activePreset === id ? theme.accent : theme.surface2,
              color: activePreset === id ? '#fff' : theme.text2,
              border: `1px solid ${activePreset === id ? theme.accent : theme.border}`,
            }}
          >
            {GLASS_PRESETS[id].label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 flex justify-between font-bold" style={{ color: theme.text2 }}>
          Transparență <span style={{ color: theme.text3 }}>{transparency}%</span>
        </span>
        <input
          type="range"
          className="w-full"
          min={Math.round((1 - GLASS_LIMITS.opacity.max) * 100)}
          max={Math.round((1 - GLASS_LIMITS.opacity.min) * 100)}
          step={1}
          value={transparency}
          onChange={(event) => onChange({ opacity: 1 - Number(event.target.value) / 100 })}
          aria-label="Transparență panou"
        />
      </label>

      <label className="block">
        <span className="mb-1 flex justify-between font-bold" style={{ color: theme.text2 }}>
          Estompare <span style={{ color: theme.text3 }}>{settings.blur}px</span>
        </span>
        <input
          type="range"
          className="w-full"
          min={GLASS_LIMITS.blur.min}
          max={GLASS_LIMITS.blur.max}
          step={1}
          value={settings.blur}
          onChange={(event) => onChange({ blur: Number(event.target.value) })}
          aria-label="Estompare fundal"
        />
      </label>
    </div>
  );
}
