import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';

const CHIP_CLASS = 'fine-chip press-feedback inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium disabled:opacity-50';

/** Acțiune mică pe un capitol (buton). */
export function ChapterAction({
  icon,
  label,
  onClick,
  busy,
  disabled,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const theme = useTheme();
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} title={title} className={CHIP_CLASS} style={{ color: theme.text2 }}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

/** Aceeași acțiune, dar ca legătură către altă pagină. */
export function ChapterLink({ icon, label, to }: { icon: ReactNode; label: string; to: string }) {
  const theme = useTheme();
  return (
    <Link to={to} className={CHIP_CLASS} style={{ color: theme.text2 }}>
      {icon}
      {label}
    </Link>
  );
}
