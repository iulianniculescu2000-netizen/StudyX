import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

export type EmptyStateAction = { label: string } & ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
}

/** Starea „nimic aici încă”: pictogramă, titlu, explicație și cel mult două acțiuni (link sau buton). */
export default function EmptyState({ icon: Icon, title, body, primary, secondary }: EmptyStateProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  const renderAction = (action: EmptyStateAction, kind: 'primary' | 'secondary') => {
    const className = kind === 'primary'
      ? 'press-feedback rounded-full px-5 py-2 text-[13px] font-semibold text-white'
      : 'press-feedback glass-panel rounded-full px-5 py-2 text-[13px] font-semibold';
    const style = kind === 'primary' ? { background: theme.accent } : { color: theme.accentText };
    if (action.to !== undefined) {
      return <Link to={action.to} className={className} style={style}>{action.label}</Link>;
    }
    return <button type="button" onClick={action.onClick} className={className} style={style}>{action.label}</button>;
  };

  return (
    <div className={`glass-panel rounded-2xl px-6 py-10 text-center ${calmMotion ? '' : 'fx-rise'}`}>
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]"
        style={{ background: `${theme.accent}18`, color: theme.accentText }}
      >
        <Icon size={24} aria-hidden="true" />
      </div>
      <h2 className="text-[16px] font-semibold" style={{ color: theme.text }}>{title}</h2>
      {body && <p className="mx-auto mt-1.5 max-w-md text-[13px]" style={{ color: theme.text3 }}>{body}</p>}
      {(primary || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primary && renderAction(primary, 'primary')}
          {secondary && renderAction(secondary, 'secondary')}
        </div>
      )}
    </div>
  );
}
