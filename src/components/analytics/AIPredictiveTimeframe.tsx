import { useRef, type KeyboardEvent } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { PERIODS, type PeriodDays } from '../../lib/analyticsStats';

interface AIPredictiveTimeframeProps {
  value: PeriodDays;
  onChange: (days: PeriodDays) => void;
}

/** Perioada de analiză: control segmentat cu o singură opțiune activă; săgețile mută selecția, Tab intră doar pe cea activă. */
export default function AIPredictiveTimeframe({ value, onChange }: AIPredictiveTimeframeProps) {
  const theme = useTheme();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % PERIODS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + PERIODS.length) % PERIODS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = PERIODS.length - 1;
    else return;
    event.preventDefault();
    onChange(PERIODS[next].days);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Perioadă de analiză" className="flex flex-wrap items-center gap-1.5">
      {PERIODS.map((period, index) => {
        const active = value === period.days;
        return (
          <button
            key={period.days}
            ref={(el) => { buttons.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-active={active}
            onClick={() => onChange(period.days)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ color: active ? undefined : theme.text2 }}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
