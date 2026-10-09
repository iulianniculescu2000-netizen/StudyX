import { Search } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';

export default function GlobalSearchTrigger() {
  const theme = useTheme();

  return (
    <button
      data-tutorial="global-search"
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
      className="press-feedback focus-ring flex items-center gap-2 rounded-[var(--r-md)] px-3 py-1.5 text-xs transition-colors hover:opacity-80"
      style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text3 }}
    >
      <Search size={13} />
      <span>Caută</span>
      <kbd className="font-mono ml-1" style={{ opacity: 0.6 }}>Ctrl+K</kbd>
    </button>
  );
}
