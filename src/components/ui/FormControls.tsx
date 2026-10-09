import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import type { HelpTipId } from '../../tutorial/helpTips';
import HelpTip from './HelpTip';

/** Eticheta mică de deasupra unui câmp: aceeași în toate formularele (litere normale, discretă). */
export function FieldLabel({ children, help }: { children: ReactNode; /** Adaugă lângă etichetă un „?” cu explicația din registru. */ help?: HelpTipId }) {
  const theme = useTheme();
  if (help) {
    return (
      <span className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: theme.text3 }}>
        {children}
        <HelpTip id={help} size={16} />
      </span>
    );
  }
  return <span className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.text3 }}>{children}</span>;
}

/** Alegere între puține variante, în formă de pastilă; varianta aleasă stă pe o suprafață ridicată. */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full p-0.5" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className="flex-1 rounded-full px-2 py-1.5 text-[12px] font-semibold transition-colors"
            style={{
              background: active ? theme.surface : 'transparent',
              color: active ? theme.text : theme.text3,
              boxShadow: active ? 'var(--elev-1)' : 'none',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** − 10 + : mai rapid și mai sigur decât un câmp numeric, nu iese niciodată din interval. */
export function Stepper({ label, value, min, max, step = 1, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const stepButton = (delta: number, disabled: boolean, icon: ReactNode, aria: string) => (
    <button
      type="button"
      onClick={() => onChange(clamp(value + delta))}
      disabled={disabled}
      aria-label={aria}
      className="press-feedback grid h-8 w-8 place-items-center rounded-full disabled:opacity-35"
      style={{ background: theme.surface, color: theme.text2, boxShadow: 'var(--elev-1)' }}
    >
      {icon}
    </button>
  );
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center justify-between rounded-full p-1" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
        {stepButton(-step, value <= min, <Minus size={14} />, `Mai puține: ${label}`)}
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: theme.text }} aria-live="polite">{value}</span>
        {stepButton(step, value >= max, <Plus size={14} />, `Mai multe: ${label}`)}
      </div>
    </div>
  );
}
