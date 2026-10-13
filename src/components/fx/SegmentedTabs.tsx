import { useEffect, useRef, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { spring } from '../../theme/motion';
import { useScrollFade } from '../ui/useScrollFade';

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Culoare pentru un punct mic în fața etichetei (ex. fazele din Organizare). */
  dot?: string;
}

export interface SegmentedTabsProps<T extends string> {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Unic per grup de taburi de pe ecran: pilula activă alunecă între taburi prin acest `layoutId`. */
  layoutId: string;
  ariaLabel?: string;
  /** `md` = control compact (Rezidențiat, Realizări); `lg` = cu butoane mai înalte (treceri în Organizare). */
  size?: 'md' | 'lg';
  /** Dacă e dat, taburile primesc `id="{idPrefix}-tab-{id}"` și cel activ `aria-controls="{idPrefix}-panel-{id}"`. */
  idPrefix?: string;
  className?: string;
  /** `bare`: fără fundalul gri al pistei, pentru când tabul stă într-un container de sticlă. */
  variant?: 'track' | 'bare';
}

/**
 * Control segmentat cu o pilulă activă care alunecă între taburi. Săgețile, Home și End mută selecția
 * (tabindex rulant: Tab intră doar pe tabul activ), ca la orice `tablist`.
 */
export default function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
  ariaLabel,
  size = 'md',
  idPrefix,
  className = '',
  variant = 'track',
}: SegmentedTabsProps<T>) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const large = size === 'lg';
  const [stripRef, stripFade] = useScrollFade<HTMLDivElement>();
  const activeIndex = tabs.findIndex((tab) => tab.id === value);

  // Pe ecran îngust banda derulează: tabul activ trebuie să rămână la vedere.
  useEffect(() => {
    const strip = stripRef.current;
    const button = buttons.current[activeIndex];
    if (!strip || !button || strip.scrollWidth <= strip.clientWidth) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < strip.scrollLeft + 28) strip.scrollTo?.({ left: Math.max(0, left - 28), behavior: 'smooth' });
    else if (right > strip.scrollLeft + strip.clientWidth - 28) strip.scrollTo?.({ left: right - strip.clientWidth + 28, behavior: 'smooth' });
  }, [activeIndex, stripRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`relative flex overflow-x-auto p-0.5 ${large ? 'rounded-[var(--r-md)]' : 'rounded-[var(--r-sm)]'} ${className}`}
      style={{ background: variant === 'bare' ? 'transparent' : 'var(--fill-subtle)', scrollbarWidth: 'none', ...stripFade }}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(el) => { buttons.current[index] = el; }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            {...(idPrefix === 'gamification' && tab.id === 'self' ? { 'data-tutorial': 'gamification-tab-self' } : idPrefix ? { 'data-tutorial': `${idPrefix}-tab-${tab.id}` } : {})}
            aria-selected={active}
            aria-controls={idPrefix && active ? `${idPrefix}-panel-${tab.id}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`focus-ring relative flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--r-sm)] transition-colors ${large ? 'px-2 py-2 text-[13px]' : 'px-3 py-1.5 text-[12.5px]'}`}
            style={{ color: active ? theme.text : theme.text2, fontWeight: active ? 600 : 500 }}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[var(--r-sm)]"
                style={{ background: theme.surface, boxShadow: 'var(--hairline-ring), var(--elev-1)' }}
                transition={calmMotion ? { duration: 0 } : spring.nav}
              />
            )}
            {Icon && <Icon className="relative h-3.5 w-3.5" aria-hidden="true" />}
            <span className="relative inline-flex items-center gap-1.5">
              {tab.dot && <span className="h-2 w-2 rounded-full" style={{ background: tab.dot }} aria-hidden="true" />}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
