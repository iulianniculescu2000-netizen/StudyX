import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { PASS_HINTS, PASS_NAMES, activePhase, currentIndex, statusOf } from '../../lib/organizare/engine';
import { dayRange, dayYear, fold, pageRange } from '../../lib/organizare/format';
import { BOOK_NAME } from '../../lib/organizare/actions';
import type { Status, Topic } from '../../lib/organizare/types';
import SegmentedTabs from '../fx/SegmentedTabs';
import TopicActions from './TopicActions';
import { useOrganizare } from './context';
import { number, pages, useBookColor, usePassColors } from './helpers';
import { Bar, Card, Chevron, Collapse, Label, StatusCheck } from './ui';

const FILTERS: Array<{ id: '' | Status; label: string }> = [
  { id: '', label: 'Toate' },
  { id: 0, label: 'De făcut' },
  { id: 1, label: 'În curs' },
  { id: 2, label: 'Gata' },
];

/** The topics the plan could not fully match with the PDFs; flagged so the student knows to check. */
const needsCheck = (t: Topic) => /^(LIPSE|PAR|În afara|Parțial)/.test(t.note);

function TopicRow({ topic, ph, now, expanded, onToggle, flash }: { topic: Topic; ph: number; now: boolean; expanded: boolean; onToggle: () => void; flash?: boolean }) {
  const theme = useTheme();
  const { state, win, setStatus } = useOrganizare();
  const bookColor = useBookColor();
  const colors = usePassColors();
  const status = statusOf(state, ph, topic.index);
  const from = win.a[ph - 1][topic.index];
  const to = win.b[ph - 1][topic.index];

  return (
    <div id={`organizare-topic-${topic.index}`} style={{ background: now || flash ? 'var(--accent-soft)' : undefined, transition: 'background 0.4s ease' }}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:px-5">
        <StatusCheck
          status={status}
          color={colors[ph - 1]}
          label={topic.name}
          onCycle={(origin) => setStatus(ph, topic.index, ((status + 1) % 3) as Status, origin)}
        />
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: bookColor(topic.book) }} />
            <span className="truncate text-[14px] font-medium" style={{ color: status === 2 ? theme.text3 : theme.text, textDecoration: status === 2 ? 'line-through' : 'none', textDecorationColor: 'var(--hairline)' }}>
              {topic.name}
            </span>
            {needsCheck(topic) && (
              <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `color-mix(in srgb, ${theme.warning} 16%, transparent)`, color: theme.warning }}>verifică</span>
            )}
          </div>
          <div className="mt-0.5 pl-4 text-[11.5px] tabular-nums" style={{ color: theme.text3 }}>
            {BOOK_NAME[topic.book]} p.{pageRange(topic.src)} · {pages(topic.pages)} · {number(topic.h[ph - 1], 1)} h
          </div>
        </button>
        <span className="hidden text-[12px] tabular-nums sm:block" style={{ color: theme.text3 }}>{dayRange(from, to)}</span>
      </div>
      <Collapse open={expanded}>
        <div className="space-y-3 px-4 pb-4 pl-[3.6rem] text-[12.5px] sm:px-5 sm:pl-[3.9rem]" style={{ color: theme.text2 }}>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt style={{ color: theme.text3 }}>Carte</dt><dd>{topic.chapter}</dd>
            <dt style={{ color: theme.text3 }}>Pagini în carte</dt><dd>{pageRange(topic.src)} ({pages(topic.pages)} în tematică)</dd>
            <dt style={{ color: theme.text3 }}>În PDF-ul tău</dt><dd>{topic.pdf ? `pag. ${topic.pdf}` : 'nu e inclus'}</dd>
            {topic.file && (<><dt style={{ color: theme.text3 }}>Fișier</dt><dd className="break-words">{topic.file.replace(/^Carti\/Kumar\/Kumar - capitole\//, 'Kumar - capitole/')}</dd></>)}
            <dt style={{ color: theme.text3 }}>Grile</dt><dd>{topic.quizzes || 'nu există în planner'}</dd>
            <dt style={{ color: theme.text3 }}>Perioadă</dt><dd>{dayYear(from)} – {dayYear(to)}</dd>
            {topic.resources && (<><dt style={{ color: theme.text3 }}>Resurse</dt><dd>{topic.resources.replace(/^Video: /, '')}</dd></>)}
          </dl>
          {topic.note && (
            <p className="fine-chip flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: `color-mix(in srgb, ${theme.warning} 12%, transparent)`, color: theme.warning }}>
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> <span>{topic.note}</span>
            </p>
          )}
          <TopicActions topic={topic} />
        </div>
      </Collapse>
    </div>
  );
}

/** One pass over the syllabus: chapters as folding groups, each topic with its status. */
export default function Passes({ pass, onPass, focus = null, onFocusDone }: {
  pass: number;
  onPass: (pass: number) => void;
  /** Deep link target (already validated against the plan): chapter = group index, topic = Topic.index. */
  focus?: { chapter: number; topic: number | null } | null;
  onFocusDone?: () => void;
}) {
  const theme = useTheme();
  const { plan, state, win, today } = useOrganizare();
  const colors = usePassColors();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'' | Status>('');
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    if (!focus) return;
    setQuery('');
    setFilter('');
    setOpened((o) => ({ ...o, [`${pass}:${focus.chapter}`]: true }));
    setSeen((s) => ({ ...s, [`${pass}:${focus.chapter}`]: true }));
    if (focus.topic !== null) {
      const key = `${pass}:${focus.topic}`;
      setExpanded((e) => ({ ...e, [key]: true }));
      setFlash(focus.topic);
    }
    const target = focus.topic !== null ? `organizare-topic-${focus.topic}` : `organizare-group-${focus.chapter}`;
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 380);
    window.setTimeout(() => setFlash(null), 2600);
    onFocusDone?.();
    // Runs once per link: the params are dropped right after, so `focus` becomes null (timers must outlive that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.chapter, focus?.topic]);

  const current = currentIndex(plan, win, pass, today);
  const live = pass === activePhase(plan, today);
  const needle = fold(query.trim());
  const filtering = needle !== '' || filter !== '';

  const groups = useMemo(() => plan.groups.map((name, g) => {
    const all = plan.topics.filter((t) => t.group === g);
    const done = all.filter((t) => statusOf(state, pass, t.index) === 2).length;
    const shown = all.filter((t) => {
      const status = statusOf(state, pass, t.index);
      if (filter !== '' && status !== filter) return false;
      return !needle || fold(`${t.name} ${t.src} ${t.chapter} ${name} ${t.file}`).includes(needle);
    });
    return { g, name, all, done, shown };
  }), [plan, state, pass, filter, needle]);

  const totals = useMemo(() => {
    let p = 0; let q = 0; let h = 0;
    groups.forEach(({ shown }) => shown.forEach((t) => { p += t.pages; q += t.quizzes; h += t.h[pass - 1]; }));
    return { p, q, h, last: plan.topics.reduce((m, t) => (win.b[pass - 1][t.index] > m ? win.b[pass - 1][t.index] : m), '') };
  }, [groups, plan, win, pass]);

  const isOpen = (g: number, firstOfCurrent: boolean) => filtering || (opened[`${pass}:${g}`] ?? firstOfCurrent);

  return (
    <div className="space-y-4">
      {/* the four passes, with a pill that slides to the chosen one */}
      <SegmentedTabs
        size="lg"
        layoutId="organizare-pass-pill"
        ariaLabel="Trecerea"
        tabs={[1, 2, 3, 4].map((p) => ({ id: String(p), label: `Faza ${p}`, dot: colors[p - 1] }))}
        value={String(pass)}
        onChange={(id) => onPass(Number(id))}
      />

      <div className="px-1">
        <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: colors[pass - 1] }}>
          {dayYear(plan.starts[pass - 1])} – {dayYear(plan.ends[pass - 1])}
        </div>
        <h2 className="display mt-0.5 text-[1.5rem] font-bold tracking-tight" style={{ color: theme.text }}>{PASS_NAMES[pass - 1]}</h2>
        <p className="mt-1 max-w-prose text-[13px]" style={{ color: theme.text2 }}>{PASS_HINTS[pass - 1]}</p>
      </div>

      <Card className="flex flex-wrap items-center gap-3 !p-3" spot={false}>
        <label className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: theme.text3 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută un topic"
            aria-label="Caută un topic"
            className="focus-ring elev-1 w-full rounded-full py-2 pl-9 pr-8 text-[13.5px] outline-none"
            style={{ background: theme.surface2, color: theme.text }}
          />
          {query && (
            <button type="button" aria-label="Șterge căutarea" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: theme.text3 }}>
              <X size={14} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="fine-chip press-feedback rounded-full px-3 py-1.5 text-[12.5px] font-medium"
              style={{ color: filter === f.id ? theme.accentText : theme.text2 }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      <Card padded={false} spot={false} className="overflow-hidden">
        {groups.every((g) => g.shown.length === 0) && (
          <p className="px-5 py-8 text-center text-[13px]" style={{ color: theme.text3 }}>Niciun topic nu se potrivește cu filtrele.</p>
        )}
        {groups.map(({ g, name, all, done, shown }, idx) => {
          if (shown.length === 0) return null;
          // The group the student is in (or the first one, before the pass starts) is open by default.
          const open = isOpen(g, shown.some((t) => t.index === Math.max(current, 0)));
          return (
            <div key={g} id={`organizare-group-${g}`} style={{ borderTop: idx === 0 ? undefined : '1px solid var(--hairline)' }}>
              <button
                type="button"
                onClick={() => {
                  setSeen((s) => ({ ...s, [`${pass}:${g}`]: true }));
                  setOpened((o) => ({ ...o, [`${pass}:${g}`]: !open }));
                }}
                aria-expanded={open}
                className="fine-row grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-4 py-3.5 text-left sm:px-5"
                style={{ borderRadius: 0 }}
              >
                <span className="truncate text-[14.5px] font-semibold" style={{ color: theme.text }}>{name}</span>
                <span className="text-[12.5px] tabular-nums" style={{ color: theme.text3 }}>{done}/{all.length}</span>
                <span className="hidden w-20 sm:block"><Bar value={(done / all.length) * 100} color={done === all.length ? theme.success : colors[pass - 1]} height={4} /></span>
                <Chevron open={open} />
              </button>
              <Collapse open={open}>
                <div style={{ borderTop: '1px solid var(--hairline)' }}>
                  {(open || seen[`${pass}:${g}`]) && shown.map((t, n) => (
                    <div key={t.index} style={{ borderTop: n === 0 ? undefined : '1px solid var(--hairline)' }}>
                      <TopicRow
                        topic={t}
                        ph={pass}
                        flash={flash === t.index}
                        now={live && t.index === current && win.b[pass - 1][t.index] >= today}
                        expanded={!!expanded[`${pass}:${t.index}`]}
                        onToggle={() => setExpanded((e) => ({ ...e, [`${pass}:${t.index}`]: !e[`${pass}:${t.index}`] }))}
                      />
                    </div>
                  ))}
                </div>
              </Collapse>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-[12.5px] sm:px-5" style={{ borderTop: '1px solid var(--hairline)', color: theme.text3 }}>
          <span><b className="tabular-nums" style={{ color: theme.text }}>{number(totals.p)}</b> pagini</span>
          <span><b className="tabular-nums" style={{ color: theme.text }}>{number(totals.q)}</b> grile</span>
          <span><b className="tabular-nums" style={{ color: theme.text }}>{number(totals.h, 1)}</b> ore</span>
          <span>Final: <b style={{ color: theme.text }}>{dayYear(totals.last)}</b></span>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px]" style={{ color: theme.text3 }}>
        <Label className="!px-0">Cărți</Label>
        {(['K', 'L', 'S'] as const).map((b) => <BookKey key={b} book={b} />)}
        <span>Cercul schimbă starea: gol, pe jumătate, bifat.</span>
      </div>
    </div>
  );
}

function BookKey({ book }: { book: 'K' | 'L' | 'S' }) {
  const bookColor = useBookColor();
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="h-2 w-2 rounded-full" style={{ background: bookColor(book) }} />
      {BOOK_NAME[book]}
    </span>
  );
}

