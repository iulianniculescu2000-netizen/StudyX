import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import Portal from './Portal';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  icon?: React.ReactNode;
  /** Numele câmpului pentru cititoarele de ecran (ex. „Sortare”). */
  label?: string;
}

export default function PremiumSelect({ options, value, onChange, icon, label }: Props) {
  const theme = useTheme();
  const { t } = useAdaptiveMotion();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 280,
  });

  const selected = options.find(o => o.value === value) || options[0];

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const desired = 280;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const openUp = below < Math.min(desired, options.length * 44 + 12) && above > below;
      const width = Math.max(rect.width, 200);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      const maxHeight = Math.max(120, Math.min(desired, openUp ? above : below));
      setCoords(
        openUp
          ? { bottom: window.innerHeight - rect.top + gap, left, width, maxHeight }
          : { top: rect.bottom + gap, left, width, maxHeight },
      );
    }
  };

  useEffect(() => {
    if (!open) return;
    // rAF: măsurăm layout-ul după render, nu sincron în body-ul efectului.
    const raf = requestAnimationFrame(updateCoords);
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [open]);

  // Esc închide lista și duce focusul înapoi la buton; la deschidere focusul intră pe opțiunea activă.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      (list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    }, 0);
    return () => { document.removeEventListener('keydown', onKey, true); window.clearTimeout(timer); };
  }, [open]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? Math.min(items.length - 1, current + 1) : Math.max(0, current - 1);
    items[next].focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label && selected ? `${label}: ${selected.label}` : undefined}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all hover:opacity-80 active:scale-[0.98]"
        style={{ background: theme.surface2, border: `1px solid ${theme.border2}` }}
      >
        {icon}
        <span className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap" style={{ color: theme.text2 }}>
          {selected?.label}
        </span>
        <ChevronDown size={12} style={{ color: theme.text3 }} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <Portal>
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop to close */}
              <div 
                className="fixed inset-0 z-[9998]" 
                onClick={() => setOpen(false)} 
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
                  width: coords.width,
                  zIndex: 9999,
                  background: theme.modalBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--elev-3)',
                  overflow: 'hidden',
                  backdropFilter: 'blur(var(--blur-2))',
                }}
              >
                <div ref={listRef} role="listbox" aria-label={label} onKeyDown={moveFocus} className="custom-scrollbar p-1.5 flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: coords.maxHeight }}>
                  {options.map((opt) => {
                    const isActive = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                        }}
                        className="fine-row flex items-center justify-between px-3 py-2.5 rounded-[var(--r-sm)] text-left transition-colors group"
                        data-active={isActive ? 'true' : undefined}
                        style={isActive ? { background: `${theme.accent}15` } : undefined}
                      >
                        <span className="text-xs font-bold" style={{ color: isActive ? theme.accentText : theme.text2 }}>
                          {opt.label}
                        </span>
                        {isActive && <Check size={14} style={{ color: theme.accentText }} />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
