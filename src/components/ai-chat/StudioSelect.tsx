import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dropdownFitStyle, useDropdownFit } from '../../hooks/useDropdownFit';

export type StudioOption = {
  value: string;
  label: string;
  hint?: string;
};

/** Dropdown picker used across AI Studio's source/chapter/folder fields. */
export default function StudioSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  theme,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: StudioOption[];
  placeholder: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useAdaptiveMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useDropdownFit(open, rootRef);
  const selected = options.find((option) => option.value === value) ?? null;
  const isDisabled = options.length === 0;

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1.5 block text-[11.5px] font-semibold" style={{ color: theme.text3 }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => {
          if (!isDisabled) {
            setOpen((current) => !current);
          }
        }}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
        style={{
          background: theme.surface2,
          borderColor: open ? `${theme.accent}55` : theme.border,
          color: theme.text,
          opacity: isDisabled ? 0.55 : 1,
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {selected?.label ?? placeholder}
          </div>
          {(selected?.hint || isDisabled) && (
            <div className="mt-0.5 truncate text-[11.5px]" style={{ color: theme.text3 }}>
              {selected?.hint ?? 'Nu există opțiuni disponibile.'}
            </div>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={t.pop} style={{ color: theme.text3 }}>
          <ChevronDown size={16} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && !isDisabled && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: t.pop }}
            exit={{ opacity: 0, y: 4, transition: t.popExit }}
            className="custom-scrollbar absolute left-0 right-0 z-30 rounded-[var(--r-lg)] border p-2"
            style={{
              background: theme.modalBg,
              borderColor: theme.border,
              boxShadow: 'var(--elev-3)',
              ...dropdownFitStyle(fit),
            }}
          >
            <div className="space-y-1">
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
                    className="fine-row flex w-full items-center gap-3 rounded-[var(--r-lg)] px-3 py-2.5 text-left transition-colors"
                    style={{
                      ...(active ? { background: theme.accent } : {}),
                      color: active ? '#fff' : theme.text,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {option.label}
                      </div>
                      {option.hint && (
                        <div className="mt-0.5 truncate text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.76)' : theme.text3 }}>
                          {option.hint}
                        </div>
                      )}
                    </div>
                    {active && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
