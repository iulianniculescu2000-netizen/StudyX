import { ChevronRight, Loader2 } from 'lucide-react';
import type { Theme } from '../../theme/themes';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide"
      style={{ color: 'var(--text3, #86868b)' }}
    >
      {children}
    </h2>
  );
}

export function ResourceRow({
  icon,
  title,
  detail,
  onClick,
  busy,
  first,
  iconBg,
  iconColor,
  theme,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  busy?: boolean;
  first?: boolean;
  iconBg: string;
  iconColor: string;
  theme: Theme;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="fine-row flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
      style={{ borderRadius: 0, borderTop: first ? undefined : '1px solid var(--hairline)' }}
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
        style={{ background: iconBg, color: iconColor }}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold" style={{ color: theme.text }}>
          {title}
        </div>
        <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
          {detail}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: theme.text3 }} />
    </button>
  );
}
