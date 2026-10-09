import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import Portal from './Portal';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: ThemedSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 'md' for full-size form fields, 'sm' for compact inline pickers. */
  size?: 'sm' | 'md';
  /** Open the list immediately on mount (for inline "edit" affordances). */
  defaultOpen?: boolean;
  /** Called when the dropdown closes without a selection (outside click / Esc). */
  onRequestClose?: () => void;
  className?: string;
}

/**
 * App-themed replacement for a native <select>. The option list renders in a
 * Portal positioned under the trigger, so it never inherits the OS-native white
 * popup and is never clipped by a parent modal's overflow.
 */
export default function ThemedSelect({
  options,
  value,
  onChange,
  placeholder = 'Alege...',
  disabled,
  size = 'md',
  defaultOpen = false,
  onRequestClose,
  className,
}: Props) {
  const theme = useTheme();
  const { t } = useAdaptiveMotion();
  const [open, setOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 0, maxHeight: 240 });

  const selected = options.find((option) => option.value === value);

  // Adapt the popover to the viewport: open downward when there is room,
  // otherwise flip upward, and always cap the height to the available space so
  // the list is never cut off on small screens.
  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    const gap = 6;
    const desired = 240;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openUp = spaceBelow < Math.min(desired, options.length * 40 + 12) && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 180);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const maxHeight = Math.max(120, Math.min(desired, openUp ? spaceAbove : spaceBelow));
    setCoords(
      openUp
        ? { bottom: window.innerHeight - rect.top + gap, left, width: rect.width, maxHeight }
        : { top: rect.bottom + gap, left, width: rect.width, maxHeight },
    );
  };

  useLayoutEffect(() => {
    // Measure the trigger to position the portal popover under it. Setting state
    // here is intentional (DOM measurement after open), not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onScrollOrResize = () => updateCoords();
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        onRequestClose?.();
      }
    };
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open, onRequestClose]);

  const isSm = size === 'sm';

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 border text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-60 ${
          isSm ? 'rounded-[var(--r-sm)] px-2 py-1 text-[10px] font-bold' : 'rounded-[var(--r-md)] px-4 py-3 text-sm font-bold'
        } ${className ?? ''}`}
        style={{
          background: theme.surface2,
          borderColor: open ? `${theme.accent}55` : theme.border,
          color: theme.text,
        }}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={t.pop} style={{ color: theme.text3 }}>
          <ChevronDown size={isSm ? 12 : 16} />
        </motion.div>
      </button>

      <Portal>
        <AnimatePresence>
          {open && (
            <>
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => { setOpen(false); onRequestClose?.(); }}
              />
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: t.pop }}
                exit={{ opacity: 0, y: 4, transition: t.popExit }}
                style={{
                  position: 'fixed',
                  top: coords.top,
                  bottom: coords.bottom,
                  left: coords.left,
                  width: Math.max(coords.width, 180),
                  zIndex: 9999,
                  background: theme.modalBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--elev-3)',
                  overflow: 'hidden',
                  backdropFilter: 'blur(var(--blur-2)) saturate(160%)',
                }}
              >
                <div
                  className="custom-scrollbar flex flex-col gap-0.5 overflow-y-auto p-1.5"
                  style={{ maxHeight: coords.maxHeight }}
                >
                  {options.map((option) => {
                    const active = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                        className="fine-row flex items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2.5 text-left transition-colors"
                        data-active={active ? 'true' : undefined}
                        style={active ? { background: `${theme.accent}18` } : undefined}
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-xs font-bold"
                          style={{ color: active ? theme.accent : theme.text2 }}
                        >
                          {option.label}
                        </span>
                        {active && <Check size={14} style={{ color: theme.accentText }} />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
