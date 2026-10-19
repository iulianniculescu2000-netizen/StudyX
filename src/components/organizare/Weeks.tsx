import { useMemo, useState } from 'react';
import { Check, Plus, Search, Sparkles, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import {
  addDays, addPicks, picksOf, removePick, statusOf, suggestFor, toggleGroup, togglePick, weekIndex, weekPhase,
} from '../../lib/organizare/engine';
import { dayRange, fold, monthName, withoutNumber } from '../../lib/organizare/format';
import type { Status, Week } from '../../lib/organizare/types';
import { useOrganizare } from './context';
import { pages, usePassColors } from './helpers';
import { Card, Chevron, Collapse, GhostButton, StatusCheck } from './ui';

const KIND_TAG: Partial<Record<Week['k'], string>> = { t: 'Tampon', s: 'Simulare', m: 'Final' };

/** "Sepsisul · Terapie intensivă (2)" — the groups a set of topics comes from, with a count when only some topics are in. */
function groupsLabel(topics: number[], plan: ReturnType<typeof useOrganizare>['plan']): string {
  const by = new Map<number, number>();
  topics.forEach((k) => by.set(plan.topics[k].group, (by.get(plan.topics[k].group) ?? 0) + 1));
  return [...by.entries()].map(([g, n]) => {
    const total = plan.topics.filter((t) => t.group === g && t.pages > 0).length;
    return withoutNumber(plan.groups[g]) + (n < total ? ` (${n})` : '');
  }).join(' · ');
}

function Picker({ weekIx, week }: { weekIx: number; week: Week }) {
  const theme = useTheme();
  const { plan, state, update } = useOrganizare();
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});
  const picks = picksOf(state, week.d);
  const needle = fold(query.trim());
  const hits = needle.length >= 2
    ? plan.topics.filter((t) => t.pages > 0 && fold(`${t.name} ${plan.groups[t.group]}`).includes(needle)).slice(0, 8)
    : [];

  return (
    <div className="mt-3 space-y-2">
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: theme.text3 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caută un topic de adăugat"
          aria-label={`Caută un topic pentru săptămâna ${weekIx + 1}`}
          className="focus-ring elev-1 w-full rounded-full py-2 pl-9 pr-3 text-[13px] outline-none"
          style={{ background: theme.surface2, color: theme.text }}
        />
      </label>
      {hits.map((t) => (
        <button
          key={t.index}
          type="button"
          onClick={() => { update((s) => addPicks(s, week.d, [t.index])); setQuery(''); }}
          className="fine-row press-feedback flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px]"
        >
          <span className="min-w-0 truncate" style={{ color: theme.text }}>{t.name}</span>
          <span className="flex flex-shrink-0 items-center gap-1 text-[11.5px]" style={{ color: theme.text3 }}>{withoutNumber(plan.groups[t.group]).slice(0, 28)} <Plus size={13} /></span>
        </button>
      ))}
      <div className="glass-panel max-h-72 overflow-y-auto rounded-2xl">
        {plan.groups.map((name, g) => {
          const ks = plan.topics.filter((t) => t.group === g);
          const inWeek = ks.filter((t) => picks.includes(t.index)).length;
          const open = !!openGroups[g];
          return (
            <div key={g} style={{ borderTop: g === 0 ? undefined : '1px solid var(--hairline)' }}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setOpenGroups((o) => ({ ...o, [g]: !open }))}
                  aria-expanded={open}
                  className="fine-row flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-[13px]"
                  style={{ borderRadius: 0 }}
                >
                  <Chevron open={open} />
                  <span className="min-w-0 truncate" style={{ color: theme.text }}>{name}</span>
                  <small className="flex-shrink-0 tabular-nums" style={{ color: theme.text3 }}>{inWeek ? `${inWeek}/` : ''}{ks.length}</small>
                </button>
                <button
                  type="button"
                  onClick={() => update((s) => toggleGroup(plan, s, week.d, g))}
                  className="press-feedback mr-2 flex-shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                  style={{ background: 'var(--accent-soft)', color: theme.accentText }}
                >
                  {inWeek === ks.length ? 'Scoate' : 'Adaugă tot'}
                </button>
              </div>
              <Collapse open={open}>
                <div className="pb-1">
                  {ks.map((t) => {
                    const on = picks.includes(t.index);
                    return (
                      <button
                        key={t.index}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update((s) => togglePick(s, week.d, t.index))}
                        className="fine-row flex w-full items-center gap-2.5 px-3 py-1.5 pl-9 text-left text-[12.5px]"
                        style={{ borderRadius: 0, color: on ? theme.accentText : theme.text2 }}
                      >
                        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px]" style={{ background: on ? theme.accent : 'transparent', border: on ? 'none' : '1.5px solid var(--hairline)' }}>
                          {on && <span className="text-[10px] font-bold leading-none text-white">✓</span>}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <small className="flex-shrink-0" style={{ color: theme.text3 }}>{t.pages > 0 ? pages(t.pages) : 'opțional'}</small>
                      </button>
                    );
                  })}
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekBody({ weekIx }: { weekIx: number }) {
  const theme = useTheme();
  const { plan, state, today, update, setStatus } = useOrganizare();
  const week = plan.weeks[weekIx];
  const ph = weekPhase(plan, week, today);
  const suggestion = suggestFor(plan, week);
  const picks = picksOf(state, week.d);
  const colors = usePassColors();
  const [picker, setPicker] = useState(false);

  return (
    <div className="space-y-3 px-4 pb-4 pt-1 sm:px-5">
      {suggestion.length > 0 ? (
        <div className="rounded-xl px-3.5 py-3" style={{ background: 'var(--fill-subtle)' }}>
          <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: theme.text3 }}><Sparkles size={13} /> Sugestia planului (poți s-o ignori)</div>
          <p className="mt-1 text-[13px]" style={{ color: theme.text }}>{groupsLabel(suggestion, plan)}</p>
          <div className="mt-2.5">
            {suggestion.every((k) => picks.includes(k)) ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: theme.success }}><Check size={14} /> Sugestia e în alegerea ta</span>
            ) : (
              <GhostButton tone="accent" onClick={() => update((s) => addPicks(s, week.d, suggestion))}>Preia sugestia ({suggestion.length})</GhostButton>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: theme.text2 }}>{week.t}</p>
      )}

      <div>
        <div className="mb-1 text-[12px] font-medium" style={{ color: theme.text3 }}>
          Alegerea mea{picks.length ? ` · ${picks.filter((k) => statusOf(state, ph, k) === 2).length}/${picks.length} gata` : ''}
        </div>
        {picks.length === 0 ? (
          <p className="text-[13px]" style={{ color: theme.text3 }}>Nimic ales încă. Alege ce faci în săptămâna asta: o grupă întreagă sau topicuri separate, din orice parte a materiei.</p>
        ) : (
          picks.map((k) => {
            const t = plan.topics[k];
            const status = statusOf(state, ph, k);
            return (
              <div key={k} className="flex items-center gap-3 py-1.5">
                <StatusCheck status={status} color={colors[ph - 1]} label={t.name} size={24} onCycle={(origin) => setStatus(ph, k, ((status + 1) % 3) as Status, origin)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px]" style={{ color: theme.text }}>{t.name}</div>
                  <div className="text-[11.5px]" style={{ color: theme.text3 }}>{withoutNumber(plan.groups[t.group])} · {pages(t.pages)}</div>
                </div>
                <button type="button" aria-label="Scoate din săptămână" onClick={() => update((s) => removePick(s, week.d, k))} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ color: theme.text3 }}>
                  <X size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={() => setPicker((o) => !o)}
        aria-expanded={picker}
        className="fine-row press-feedback flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium"
        style={{ border: '1px dashed var(--hairline)', color: theme.accentText }}
      >
        {picker ? 'Închide lista' : 'Alege din toată materia'} <Chevron open={picker} />
      </button>
      <Collapse open={picker}>{picker && <Picker weekIx={weekIx} week={week} />}</Collapse>
    </div>
  );
}

/** The calendar: months fold open into weeks; in each week the student can take the plan's suggestion or choose their own topics. */
export default function Weeks() {
  const theme = useTheme();
  const { plan, state, today } = useOrganizare();
  const colors = usePassColors();
  const current = weekIndex(plan, today);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({});

  const months = useMemo(() => {
    const out: Array<{ key: string; weeks: number[] }> = [];
    plan.weeks.forEach((w, i) => {
      const key = w.d.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.weeks.push(i);
      else out.push({ key, weeks: [i] });
    });
    return out;
  }, [plan]);
  const currentMonth = current >= 0 ? plan.weeks[current].d.slice(0, 7) : months[0]?.key;

  return (
    <div className="space-y-3">
      <div className="px-1">
        <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>Calendar</div>
        <h2 className="display mt-0.5 text-[1.5rem] font-bold tracking-tight" style={{ color: theme.text }}>Săptămâni</h2>
        <p className="mt-1 max-w-prose text-[13px]" style={{ color: theme.text2 }}>
          Alege o lună, apoi o săptămână. Planul îți sugerează topicurile, dar tu hotărăști: preiei sugestia sau îți organizezi singur săptămâna.
        </p>
      </div>

      {months.map(({ key, weeks }, mi) => {
        const open = openMonths[key] ?? key === currentMonth;
        const picked = weeks.reduce((n, i) => n + picksOf(state, plan.weeks[i].d).length, 0);
        const done = weeks.reduce((n, i) => {
          const w = plan.weeks[i];
          return n + picksOf(state, w.d).filter((k) => statusOf(state, weekPhase(plan, w, today), k) === 2).length;
        }, 0);
        const past = current >= 0 && weeks[weeks.length - 1] < current;
        return (
          <Card key={key} padded={false} spot={false} index={Math.min(mi, 6)} className="overflow-hidden" style={{ opacity: past && !open ? 0.7 : 1 }}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenMonths((o) => ({ ...o, [key]: !open }))}
              className="fine-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left sm:px-5"
              style={{ borderRadius: 0 }}
            >
              <span>
                <span className="block text-[15px] font-semibold" style={{ color: theme.text }}>{monthName(`${key}-15`)}</span>
                <span className="block text-[12px]" style={{ color: theme.text3 }}>{weeks.length} săpt.{picked ? ` · ${done}/${picked} gata` : ' · nimic ales încă'}</span>
              </span>
              <Chevron open={open} />
            </button>
            <Collapse open={open}>
              <div style={{ borderTop: '1px solid var(--hairline)' }}>
                {weeks.map((i, n) => {
                  const w = plan.weeks[i];
                  const isNow = i === current;
                  const wOpen = openWeeks[i] ?? isNow;
                  const picks = picksOf(state, w.d);
                  const ph = weekPhase(plan, w, today);
                  const tag = KIND_TAG[w.k];
                  return (
                    <div key={w.d} style={{ borderTop: n === 0 ? undefined : '1px solid var(--hairline)', background: isNow ? 'var(--accent-soft)' : undefined }}>
                      <button
                        type="button"
                        aria-expanded={wOpen}
                        onClick={() => setOpenWeeks((o) => ({ ...o, [i]: !wOpen }))}
                        className="fine-row grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left sm:px-5"
                        style={{ borderRadius: 0 }}
                      >
                        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                          {isNow && <span className="absolute h-2.5 w-2.5 animate-ping rounded-full opacity-60" style={{ background: colors[ph - 1] }} />}
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tag ? theme.text3 : colors[ph - 1] }} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold tabular-nums" style={{ color: theme.text }}>
                            {dayRange(w.d, addDays(w.d, 6))}{tag && <span className="ml-2 text-[11px] font-medium" style={{ color: theme.text3 }}>{tag}</span>}
                          </span>
                          <span className="block truncate text-[12px]" style={{ color: theme.text3 }}>
                            {picks.length ? groupsLabel(picks, plan) : tag ? w.t : 'Liberă · alegi tu ce faci'}
                          </span>
                        </span>
                        <span className="text-[12px] tabular-nums" style={{ color: theme.text3 }}>
                          {picks.length ? `${picks.filter((k) => statusOf(state, ph, k) === 2).length}/${picks.length}` : ''}
                        </span>
                        <Chevron open={wOpen} />
                      </button>
                      <Collapse open={wOpen}>{wOpen && <WeekBody weekIx={i} />}</Collapse>
                    </div>
                  );
                })}
              </div>
            </Collapse>
          </Card>
        );
      })}
    </div>
  );
}
