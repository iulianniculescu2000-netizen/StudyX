import type { AIKnowledgeSource } from '../../store/aiStore';
import type { useTheme } from '../../theme/ThemeContext';

export default function SourceStatusBadge({
  source,
  theme,
}: {
  source: AIKnowledgeSource;
  theme: ReturnType<typeof useTheme>;
}) {
  if (source.indexStatus === 'ready' || source.indexStatus === undefined) return null;
  const isError = source.indexStatus === 'error';
  const color = isError ? theme.danger : theme.accent;
  return (
    <span
      className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: `${color}18`, color }}
    >
      {isError ? 'Eroare' : `Indexare ${Math.round(source.indexProgress ?? 0)}%`}
    </span>
  );
}
