import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Moon, Target } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { dur, ease } from '../../theme/motion';
import { useCountUp } from '../../hooks/useCountUp';
import {
  activePhase, addDays, countStatus, daysBetween, donePages, focusNow, parseDay, statusOf, totalPages, upNext, weekProgress,
} from '../../lib/organizare/engine';
import { dayRange, longDay, shortDay, weekdayDay, withoutNumber } from '../../lib/organizare/format';
import ProgressRing from '../fx/ProgressRing';
import TopicActions from './TopicActions';
import { useOrganizare } from './context';
import { number, pages, usePassColors } from './helpers';
import { Bar, Card, GhostButton } from './ui';

/** The topic to work on now (or what the final weeks are about), with its status and everything one can do with it. */
function FocusCard() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const { plan, state, win, today, setStatus } = useOrganizare();
  const colors = usePassColors();
  const focus = focusNow(plan, state, win, today);

  let body;
  if (focus.kind === 'simulations' || focus.kind === 'maintenance') {
    const final = focus.kind === 'maintenance';
    body = (
      <div className="relative flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--r-md)]" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>
          {final ? <Moon size={22} /> : <Target size={22} />}
        </div>
        <div>
          <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>Acum</div>
          <div className="display text-[22px] font-bold leading-tight" style={{ color: theme.text }}>
            {final ? 'Ultima săptămână: menținere' : 'Simulări cronometrate'}
          </div>
          <p className="mt-1 text-[13.5px]" style={{ color: theme.text2 }}>
            {final
              ? 'Anki, o simulare ușoară, odihnă. Fără materie nouă.'
              : 'O simulare pe săptămână: 200 de grile în 4 ore, apoi analiza greșelilor.'}
          </p>
        </div>
      </div>
    );
  } else {
    const topic = plan.topics[focus.ix];
    const ph = focus.ph;
    const status = statusOf(state, ph, focus.ix);
    const started = focus.kind === 'topic';
    const eyebrow = started ? `${focus.label} · Faza ${ph}` : `Începe ${weekdayDay(win.a[ph - 1][topic.index])} · Faza ${ph}`;
    const meta = [
      withoutNumber(plan.groups[topic.group]),
      topic.src,
      pages(topic.pages),
      started ? dayRange(win.a[ph - 1][topic.index], win.b[ph - 1][topic.index]) : `~${number(topic.h[ph - 1], 1)} ore`,
      topic.resources && started ? topic.resources.replace(/^Video: /, '') : '',
    ].filter(Boolean).join(' · ');

    body = (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${ph}:${topic.index}`}
          initial={calmMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={calmMotion ? undefined : { opacity: 0, y: -8 }}
          transition={t.modal}
          className="relative space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: colors[ph - 1] }}>{eyebrow}</div>
              <div className="display mt-1 text-[clamp(1.35rem,3.4vw,1.85rem)] font-bold leading-tight tracking-tight" style={{ color: theme.text }}>{topic.name}</div>
              <p className="mt-1.5 text-[13px]" style={{ color: theme.text2 }}>{meta}</p>
            </div>
            {started && (
              <div className="flex flex-shrink-0 items-center gap-2">
                {status < 1 && <GhostButton onClick={() => setStatus(ph, topic.index, 1)}>Încep</GhostButton>}
                {status < 2 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setStatus(ph, topic.index, 2, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                    }}
                    className="press-feedback fx-lift rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                    style={{ background: theme.accent, boxShadow: 'var(--glow-1)' }}
                  >
                    Marchează gata
                  </button>
                ) : (
                  <span className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold" style={{ background: `color-mix(in srgb, ${theme.success} 16%, transparent)`, color: theme.success }}>
                    Gata
                  </span>
                )}
              </div>
            )}
          </div>
          <TopicActions topic={topic} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <Card className="relative overflow-hidden" lift index={0}>
      {/* a soft light that drifts behind the text */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(closest-side, var(--accent-glow), transparent)' }}
        animate={calmMotion ? undefined : { x: [0, -24, 0], y: [0, 18, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      {body}
    </Card>
  );
}

function Tile({ value, label, suffix, index }: { value: number; label: string; suffix?: string; index: number }) {
  const theme = useTheme();
  return (
    <Card lift index={index + 1} className="!p-4">
      <div className="display text-[2rem] font-bold leading-none tracking-tight tabular-nums" style={{ color: theme.text }}>
        {number(value)}
        {suffix && <span className="ml-1 text-[1.05rem] font-semibold" style={{ color: theme.text3 }}>{suffix}</span>}
      </div>
      <div className="mt-1.5 text-[12.5px]" style={{ color: theme.text3 }}>{label}</div>
    </Card>
  );
}

function Tiles() {
  const theme = useTheme();
  const { plan, state, today } = useOrganizare();
  const ph = Math.min(activePhase(plan, today), 4);
  const days = Math.max(0, daysBetween(today, state.exam));
  const weeks = Math.ceil(days / 7);
  const done = countStatus(plan, state, ph, 2);
  const pct = Math.round((donePages(plan, state, ph) / (totalPages(plan) || 1)) * 100);
  const aDays = useCountUp(days, 900);
  const aWeeks = useCountUp(weeks, 900);
  const aDone = useCountUp(done, 700);
  const aPct = useCountUp(pct, 700);

  return (
    <div data-tutorial="organizare-panel" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile value={aDays} label="zile până la examen" index={0} />
      <Tile value={aWeeks} label="săptămâni rămase" index={1} />
      <Tile value={aDone} suffix={`/ ${plan.topics.length}`} label={`topicuri gata · Faza ${ph}`} index={2} />
      <Card lift index={4} className="flex items-center gap-3 !p-4">
        <ProgressRing value={pct} size={52} stroke={6} label={`${pct}% din pagini`} />
        <div>
          <div className="display text-[1.6rem] font-bold leading-none tracking-tight tabular-nums" style={{ color: theme.text }}>{aPct}%</div>
          <div className="mt-1 text-[12.5px]" style={{ color: theme.text3 }}>din pagini · Faza {ph}</div>
        </div>
      </Card>
    </div>
  );
}

/** The whole run to the exam in one bar: four passes, the simulations, and a marker for today. */
function Timeline() {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const { plan, state, today } = useOrganizare();
  const colors = usePassColors();
  const t0 = parseDay(plan.start).getTime();
  const t1 = parseDay(state.exam).getTime();
  const span = Math.max(1, t1 - t0);
  const at = (day: string) => Math.max(0, Math.min(100, ((parseDay(day).getTime() - t0) / span) * 100));
  const segments: Array<[string, string, string]> = [
    ['Faza 1', plan.start, plan.ends[0]],
    ['Faza 2', addDays(plan.ends[0], 1), plan.ends[1]],
    ['Faza 3', addDays(plan.ends[1], 1), plan.ends[2]],
    ['Faza 4', addDays(plan.ends[2], 1), plan.ends[3]],
    ['Simulări', plan.sim0, state.exam],
  ];
  const todayPos = ((parseDay(today).getTime() - t0) / span) * 100;

  const months: Array<{ left: number; label: string }> = [];
  const cursor = parseDay(plan.start);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() < t1) {
    months.push({
      left: ((cursor.getTime() - t0) / span) * 100,
      label: cursor.toLocaleDateString('ro-RO', { month: 'short' }).replace('.', ''),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <Card index={5}>
      <div className="mb-9 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Cele patru treceri</h2>
        <span className="text-[12px]" style={{ color: theme.text3 }}>{shortDay(plan.start)} {parseDay(plan.start).getFullYear()} – {longDay(state.exam)}</span>
      </div>
      <div className="relative h-8 rounded-xl" style={{ background: 'var(--fill-subtle)', boxShadow: 'inset 0 1px 2px var(--hairline)' }}>
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          {segments.map(([label, from, to], i) => {
            const left = at(from);
            const width = at(to) - left;
            if (width <= 0) return null;
            return (
              <motion.div
                key={label}
                className="absolute inset-y-0 flex items-center justify-center whitespace-nowrap text-[11px] font-semibold text-white"
                style={{ left: `${left}%`, width: `${width}%`, background: colors[i], originX: 0 }}
                initial={calmMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.15 + i * 0.09, duration: dur.slow, ease: ease.emphasized }}
              >
                {width > 7 ? label : ''}
              </motion.div>
            );
          })}
        </div>
        {todayPos >= 0 && todayPos <= 100 && (
          <motion.div
            className="absolute -bottom-2 -top-2 w-0.5 rounded-full"
            style={{ left: `${todayPos}%`, background: theme.text }}
            initial={calmMotion ? false : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, type: 'spring', stiffness: 380, damping: 18 }}
          >
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: theme.text, color: theme.bg }}>Azi</span>
          </motion.div>
        )}
      </div>
      <div className="relative mt-3 h-4">
        {months.map((m) => (
          <span key={m.left} className="absolute -translate-x-1/2 text-[10.5px] max-sm:[&:nth-child(even)]:hidden" style={{ left: `${m.left}%`, color: theme.text3 }}>{m.label}</span>
        ))}
      </div>
    </Card>
  );
}

function UpNextCard() {
  const theme = useTheme();
  const { plan, state, win, today, goTo } = useOrganizare();
  const ph = Math.min(activePhase(plan, today), 4);
  const items = upNext(plan, state, win, today);
  return (
    <Card index={6} className="!p-0 overflow-hidden">
      <div className="px-4 pt-4 sm:px-5"><h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Urmează</h2></div>
      <div className="mt-2">
        {items.length === 0 && <p className="px-4 pb-4 text-[13px] sm:px-5" style={{ color: theme.text3 }}>Nu mai sunt topicuri în această trecere.</p>}
        {items.map((i) => {
          const topic = plan.topics[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo('topicuri', ph)}
              className="fine-row flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left sm:px-5"
              style={{ borderRadius: 0, borderTop: '1px solid var(--hairline)' }}
            >
              <span className="min-w-0 truncate text-[13.5px]" style={{ color: theme.text }}>{topic.name}</span>
              <span className="flex flex-shrink-0 items-center gap-1 text-[12px] tabular-nums" style={{ color: theme.text3 }}>
                {shortDay(win.a[ph - 1][i])} <ChevronRight size={14} />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ThisWeekCard() {
  const theme = useTheme();
  const { plan, state, today, goTo } = useOrganizare();
  const w = weekProgress(plan, state, today);
  return (
    <Card index={7}>
      <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Săptămâna aceasta</h2>
      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1.5 flex justify-between text-[13px]">
            <span style={{ color: theme.text2 }}>Ore înregistrate</span>
            <span className="tabular-nums" style={{ color: theme.text }}>{number(w.hours, 1)} / {number(w.target, 1)} h</span>
          </div>
          <Bar value={w.target ? (w.hours / w.target) * 100 : 0} />
        </div>
        <div className="flex justify-between text-[13px]">
          <span style={{ color: theme.text2 }}>Topicuri alese de tine</span>
          <span className="tabular-nums" style={{ color: theme.text }}>{w.picks ? `${w.picksDone} / ${w.picks}` : 'niciunul'}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <GhostButton tone="accent" onClick={() => goTo('saptamani')}>Alege ce faci</GhostButton>
        <GhostButton onClick={() => goTo('ritm')}>Înregistrează ziua</GhostButton>
      </div>
    </Card>
  );
}

export default function Overview() {
  return (
    <div className="space-y-4">
      <FocusCard />
      <Tiles />
      <Timeline />
      <div className="grid gap-4 md:grid-cols-2">
        <UpNextCard />
        <ThisWeekCard />
      </div>
    </div>
  );
}
