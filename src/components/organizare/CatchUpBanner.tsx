import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useToastStore } from '../../store/toastStore';
import { plural } from '../../lib/plural';
import { addDays, applyCatchUp, catchUpPlan } from '../../lib/organizare/engine';
import { dayRange, withoutNumber } from '../../lib/organizare/format';
import { useOrganizare } from './context';
import { number } from './helpers';
import { Card, Collapse, GhostButton } from './ui';

const SHOWN = 6;

/**
 * Appears only when topics of the running pass are past their dates. It never changes the plan on its own:
 * „Reface planul” opens a preview of the weeks that would change, and only „Aplică” writes the new weekly picks.
 */
export default function CatchUpBanner() {
  const theme = useTheme();
  const { plan, state, today, update } = useOrganizare();
  const addToast = useToastStore((s) => s.addToast);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const catchUp = useMemo(() => catchUpPlan(plan, state, today), [plan, state, today]);

  if (hidden || !catchUp || catchUp.status === 'on-track' || catchUp.moved === 0) return null;

  const changed = catchUp.weeks.filter((w) => w.before.length !== w.after.length || w.before.some((i) => !w.after.includes(i)));
  const apply = () => {
    update((s) => applyCatchUp(plan, s, catchUp));
    setOpen(false);
    addToast(`Planul a fost refăcut: ${plural(catchUp.moved, 'subiect mutat', 'subiecte mutate')}.`, 'success', 3600);
  };
  const tight = catchUp.status === 'tight';

  return (
    <Card className="mb-5 !p-4" spot={false} style={{ transition: 'box-shadow var(--dur-base) var(--ease-standard)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>
          <CalendarClock size={18} />
        </div>
        <div className="min-w-0 flex-1" role="status">
          <div className="text-[14px] font-semibold" style={{ color: theme.text }}>
            Ai rămas în urmă cu {plural(catchUp.behind, 'subiect', 'subiecte')}
          </div>
          <div className="text-[12.5px]" style={{ color: theme.text3 }}>
            ~{number(catchUp.behindHours, 1)} ore de recuperat · {plural(catchUp.remaining, 'subiect rămas', 'subiecte rămase')} în {plural(catchUp.weeks.length, 'săptămână', 'săptămâni')}
          </div>
        </div>
        <div className="flex gap-2">
          <GhostButton tone="accent" onClick={() => setOpen((v) => !v)} label={open ? 'Ascunde previzualizarea planului refăcut' : 'Previzualizează planul refăcut'}>
            {open ? 'Ascunde' : 'Reface planul'}
          </GhostButton>
          {!open && <GhostButton onClick={() => setHidden(true)} label="Ascunde mesajul până la următoarea deschidere">Nu acum</GhostButton>}
        </div>
      </div>

      <Collapse open={open}>
        {open && (
          <div className="pt-4">
            {tight && (
              <p className="mb-3 text-[12.5px]" style={{ color: theme.text2 }}>
                Nici așa nu încape tot: sunt ~{number(catchUp.remainingHours, 0)} ore de făcut și ritmul tău dă ~{number(catchUp.capacityHours, 0)} până la capătul trecerii. Ultima săptămână preia surplusul; poți muta și data examenului.
              </p>
            )}
            <p className="mb-2 text-[12.5px]" style={{ color: theme.text3 }}>
              Subiectele nebifate se reîmpart pe săptămânile rămase, în aceeași ordine și în ritmul tău zilnic. Nu se schimbă nimic până nu aplici.
            </p>
            <ul className="divide-y" style={{ borderColor: 'var(--hairline, transparent)' }}>
              {changed.slice(0, SHOWN).map((w) => {
                const first = w.after[0] !== undefined ? withoutNumber(plan.topics[w.after[0]].name) : '';
                return (
                  <li key={w.week} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-[12.5px]">
                    <span className="font-medium" style={{ color: theme.text }}>{dayRange(w.week, addDays(w.week, 6))}</span>
                    <span className="min-w-0 flex-1 truncate" style={{ color: theme.text3 }}>{first && `de la „${first}”`}</span>
                    <span className="tabular-nums" style={{ color: theme.text2 }}>{w.before.length} → {w.after.length} · {number(w.hours, 1)} h</span>
                  </li>
                );
              })}
            </ul>
            {changed.length > SHOWN && (
              <p className="mt-1 text-[12px]" style={{ color: theme.text3 }}>și încă {plural(changed.length - SHOWN, 'săptămână', 'săptămâni')}</p>
            )}
            <div className="mt-3 flex gap-2">
              <GhostButton tone="accent" onClick={apply}>Aplică</GhostButton>
              <GhostButton onClick={() => setOpen(false)}>Renunț</GhostButton>
            </div>
          </div>
        )}
      </Collapse>
    </Card>
  );
}
