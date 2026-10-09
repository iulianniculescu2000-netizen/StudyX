import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { dur, ease } from '../../theme/motion';
import { dropdownFitStyle, useDropdownFit } from '../../hooks/useDropdownFit';

export function LibrarySourceSelect({
  sources,
  value,
  disabled,
  theme,
  onChange,
}: {
  sources: Array<{ id: string; name: string }>;
  value: string;
  disabled?: boolean;
  theme: Theme;
  onChange: (sourceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useDropdownFit(open, rootRef);
  const selected = sources.find((source) => source.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-[var(--r-sm)] border px-3 py-2.5 text-left transition-colors disabled:opacity-60"
        style={{
          background: theme.surface,
          borderColor: open ? `${theme.accent}55` : theme.border,
          color: theme.text,
        }}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-bold">
          {selected?.name ?? 'Alege un curs'}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} style={{ color: theme.text3 }}>
          <ChevronDown size={14} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: dur.fast, ease: ease.standard }}
            className="custom-scrollbar absolute left-0 right-0 z-40 rounded-[var(--r-md)] border p-1.5 elev-3"
            style={{
              background: theme.modalBg,
              borderColor: theme.border,
              backdropFilter: 'blur(18px) saturate(160%)',
              ...dropdownFitStyle(fit, '0.4rem'),
            }}
          >
            <div>
              {sources.map((source) => {
                const active = source.id === value;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => {
                      onChange(source.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left transition-colors"
                    style={{
                      background: active ? theme.accent : 'transparent',
                      color: active ? '#fff' : theme.text,
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-bold">{source.name}</span>
                    {active && <Check size={14} />}
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
