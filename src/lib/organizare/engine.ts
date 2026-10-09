/**
 * The study plan's logic, with no screen in it: which pass is running, which topic is next, how the
 * week looks, how the student is doing. Everything takes the plan, the student's state and "today"
 * as arguments and returns new values, so it can be tested and reused (the Rezidențiat card and the
 * AI assistant read the same summary the plan page does).
 */
import type { DayLog, Plan, PlanState, PlanSummary, RawPlan, Status, Topic, Week } from './types';

// ── Dates (always YYYY-MM-DD, anchored at noon so a daylight-saving hour never moves a day) ──────────

export const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export const parseDay = (day: string) => new Date(`${day}T12:00:00`);
export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (day: string, n: number) => toDay(new Date(parseDay(day).getTime() + n * DAY));
export const daysBetween = (from: string, to: string) => Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY);

/** Monday of the week that contains `day`. */
export function mondayOf(day: string): string {
  const offset = (parseDay(day).getDay() + 6) % 7;
  return toDay(new Date(parseDay(day).getTime() - offset * DAY));
}

/** The daily hour target, indexed by `Date#getDay()` (Sunday first): weekdays 2.5 h, Saturday 5.5 h, Sunday free. */
export const DAY_TARGET = [0, 2.5, 2.5, 2.5, 2.5, 2.5, 5.5];
export const targetFor = (day: string) => DAY_TARGET[parseDay(day).getDay()];

// ── Loading ─────────────────────────────────────────────────────────────────────────────────────────

export function normalizePlan(raw: RawPlan): Plan {
  const topics: Topic[] = raw.ch.map((c, index) => ({
    index,
    group: c.grp,
    book: c.b,
    chapter: c.cap,
    name: c.n,
    pages: c.p,
    quizzes: c.gr,
    src: c.src,
    pdf: c.pdf,
    resources: c.res,
    folder: c.fold,
    note: c.note,
    file: c.file,
    a: [c.a1, c.a2, c.a3, c.a4],
    b: [c.b1, c.b2, c.b3, c.b4],
    h: [c.h1, c.h2, c.h3, c.h4],
  }));
  return { ...raw, topics };
}

export function emptyState(plan: Plan): PlanState {
  return { ts: 0, s1: {}, s2: {}, s3: {}, s4: {}, exam: plan.exam, log: {}, wk: {}, dn: {} };
}

/** Fills whatever a saved or imported state lacks, and rejects anything that is not a plan state. */
export function readState(plan: Plan, raw: unknown): PlanState {
  const base = emptyState(plan);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Partial<PlanState>;
  return {
    ...base,
    ...r,
    s1: r.s1 ?? {}, s2: r.s2 ?? {}, s3: r.s3 ?? {}, s4: r.s4 ?? {},
    log: r.log ?? {}, wk: r.wk ?? {}, dn: r.dn ?? {},
    exam: typeof r.exam === 'string' && r.exam ? r.exam : plan.exam,
  };
}

/** True for a state that is worth saving (the student ticked, planned or logged something). */
export const hasProgress = (s: PlanState) =>
  [s.s1, s.s2, s.s3, s.s4, s.log, s.wk].some((part) => Object.keys(part).length > 0);

// ── Passes and statuses ────────────────────────────────────────────────────────────────────────────

export const PASS_NAMES = ['Prima parcurgere', 'A doua trecere', 'A treia trecere', 'Ultima trecere'];
export const PASS_HINTS = [
  'Învățare de la zero: citești sau faci planșa, apoi grile din capitol, apoi greșelile în caietul de erori.',
  'Mai repede: recapitulezi schemele și faci grile din fișierele tale (Grile pe capitole 2021-2025, Grile 3500, Kumar complement simplu).',
  'Rapid: scheme, caietul de erori și grilele greșite. Aici consolidezi ce se uită.',
  'Foarte rapid: doar ce nu știi încă. Caietul de erori e materialul principal.',
];

const passState = (s: PlanState, ph: number) => [s.s1, s.s2, s.s3, s.s4][ph - 1];
export const statusOf = (s: PlanState, ph: number, i: number): Status => passState(s, ph)[i] ?? 0;

/** 1–4 while a study pass is running on `today`, 5 once simulations and the final week begin. */
export function activePhase(plan: Plan, today: string): number {
  for (let p = 1; p <= 4; p += 1) if (today <= plan.ends[p - 1]) return p;
  return 5;
}

/** The pass a week works on: its own for a study week, the running one for buffer and simulation weeks. */
export function weekPhase(plan: Plan, w: Week, today: string): number {
  return /[1-4]/.test(w.k) ? Number(w.k) : Math.min(activePhase(plan, today), 4);
}

export function countStatus(plan: Plan, s: PlanState, ph: number, v: Status): number {
  return plan.topics.reduce((n, c) => n + (statusOf(s, ph, c.index) === v ? 1 : 0), 0);
}

export const totalPages = (plan: Plan) => plan.topics.reduce((n, c) => n + c.pages, 0);

export function donePages(plan: Plan, s: PlanState, ph: number): number {
  return plan.topics.reduce((n, c) => n + (statusOf(s, ph, c.index) === 2 ? c.pages : 0), 0);
}

/** A copy of `s` with one topic's status set; finishing records the day, un-finishing forgets it. */
export function withStatus(s: PlanState, ph: number, i: number, v: Status, today: string): PlanState {
  const key = `s${ph}` as 's1' | 's2' | 's3' | 's4';
  const dn = { ...s.dn };
  if (v === 2) dn[`${ph}:${i}`] = today;
  else delete dn[`${ph}:${i}`];
  return { ...s, [key]: { ...s[key], [i]: v }, dn };
}

/** Tapping the circle: to do → in progress → done → to do. */
export const nextStatus = (v: Status): Status => ((v + 1) % 3) as Status;

// ── Weeks and the student's own picks ──────────────────────────────────────────────────────────────

export function weekIndex(plan: Plan, day: string): number {
  const m = mondayOf(day);
  return plan.weeks.findIndex((w) => w.d === m);
}

export interface Windows {
  /** a[ph - 1][topic]: first day the topic is planned in that pass; b: last day */
  a: string[][];
  b: string[][];
}

/**
 * When each topic is planned in each pass. The plan proposes dates; a topic the student picks for a
 * week is moved into that week (and stretched if picked in several).
 */
export function computeWindows(plan: Plan, s: PlanState, today: string): Windows {
  const a = [0, 1, 2, 3].map((p) => plan.topics.map((t) => t.a[p]));
  const b = [0, 1, 2, 3].map((p) => plan.topics.map((t) => t.b[p]));
  const seen = new Set<string>();
  for (const w of plan.weeks) {
    const picks = s.wk[w.d];
    if (!picks || picks.length === 0) continue;
    const ph = weekPhase(plan, w, today);
    const from = w.d;
    const to = addDays(w.d, 6);
    for (const k of picks) {
      if (k < 0 || k >= plan.topics.length) continue;
      const key = `${ph}:${k}`;
      if (!seen.has(key)) {
        seen.add(key);
        a[ph - 1][k] = from;
        b[ph - 1][k] = to;
      } else {
        if (from < a[ph - 1][k]) a[ph - 1][k] = from;
        if (to > b[ph - 1][k]) b[ph - 1][k] = to;
      }
    }
  }
  return { a, b };
}

/** The topics the plan itself would put in a week (before the student moves anything). */
export function suggestFor(plan: Plan, w: Week): number[] {
  if (!/[1-4]/.test(w.k)) return [];
  const from = w.d;
  const to = addDays(w.d, 6);
  const p = Number(w.k) - 1;
  return plan.topics.filter((c) => c.a[p] <= to && c.b[p] >= from && c.pages > 0).map((c) => c.index);
}

export function picksOf(s: PlanState, week: string): number[] {
  return s.wk[week] ?? [];
}

function withPicksFor(s: PlanState, week: string, picks: number[]): PlanState {
  const wk = { ...s.wk };
  if (picks.length === 0) delete wk[week];
  else wk[week] = picks;
  return { ...s, wk };
}

export const togglePick = (s: PlanState, week: string, k: number) => {
  const cur = picksOf(s, week);
  return withPicksFor(s, week, cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
};
export const addPicks = (s: PlanState, week: string, ks: number[]) => {
  const cur = picksOf(s, week);
  const add = ks.filter((k) => !cur.includes(k));
  return add.length ? withPicksFor(s, week, [...cur, ...add]) : s;
};
export const removePick = (s: PlanState, week: string, k: number) =>
  withPicksFor(s, week, picksOf(s, week).filter((x) => x !== k));
/** Adds a whole group, or removes it when every topic of the group is already there. */
export function toggleGroup(plan: Plan, s: PlanState, week: string, group: number): PlanState {
  const ks = plan.topics.filter((c) => c.group === group).map((c) => c.index);
  const cur = picksOf(s, week);
  return ks.every((k) => cur.includes(k))
    ? withPicksFor(s, week, cur.filter((k) => !ks.includes(k)))
    : withPicksFor(s, week, [...cur, ...ks.filter((k) => !cur.includes(k))]);
}

/** Topics the student picked for the week that holds `today`, within pass `ph`. */
export function todayPicks(plan: Plan, s: PlanState, today: string, ph: number): number[] {
  const i = weekIndex(plan, today);
  const w = plan.weeks[i];
  if (!w || weekPhase(plan, w, today) !== ph) return [];
  return s.wk[w.d] ?? [];
}

// ── What to do now ─────────────────────────────────────────────────────────────────────────────────

/** The topic whose planned start is the latest one that has already begun. */
export function currentIndex(plan: Plan, win: Windows, ph: number, today: string): number {
  const A = win.a[ph - 1];
  let best = -1;
  for (let i = 0; i < plan.topics.length; i += 1) {
    if (A[i] <= today && (best < 0 || A[i] > A[best])) best = i;
  }
  return best;
}

export type Focus =
  | { kind: 'simulations' }
  | { kind: 'maintenance' }
  /** Before the first day: the plan starts with the first topic. */
  | { kind: 'before'; ix: number; ph: number }
  | { kind: 'topic'; ix: number; ph: number; label: string };

export function focusNow(plan: Plan, s: PlanState, win: Windows, today: string): Focus {
  const ap = activePhase(plan, today);
  if (ap === 5) return { kind: today >= plan.maint0 ? 'maintenance' : 'simulations' };
  const ph = ap;
  const n = plan.topics.length;
  const picks = todayPicks(plan, s, today, ph);
  if (picks.length) {
    const open = picks.filter((k) => statusOf(s, ph, k) < 2);
    return open.length
      ? { kind: 'topic', ix: open[0], ph, label: 'Alegerea ta pentru săptămâna aceasta' }
      : { kind: 'topic', ix: picks[0], ph, label: 'Ai terminat alegerea din săptămâna aceasta' };
  }
  const cur = currentIndex(plan, win, ph, today);
  if (cur < 0) return { kind: 'before', ix: 0, ph };
  let ix = cur;
  let label = 'Topicul de azi';
  if (win.b[ph - 1][ix] < today && ix + 1 < n) {
    ix += 1;
    label = 'Urmează · azi e zi de recapitulare';
  }
  while (statusOf(s, ph, ix) === 2 && ix + 1 < n) ix += 1;
  return { kind: 'topic', ix, ph, label };
}

/** The next few topics to come, not counting the one already shown as the focus. */
export function upNext(plan: Plan, s: PlanState, win: Windows, today: string, limit = 4): number[] {
  const ph = Math.min(activePhase(plan, today), 4);
  const A = win.a[ph - 1];
  const B = win.b[ph - 1];
  const cur = currentIndex(plan, win, ph, today);
  const picks = todayPicks(plan, s, today, ph);
  const open = picks.filter((k) => statusOf(s, ph, k) < 2);
  const skip = new Set<number>(open.length ? [open[0]] : cur >= 0 && picks.length === 0 ? [cur] : []);
  const candidates: number[] = [];
  for (const c of plan.topics) {
    if (c.pages > 0 && statusOf(s, ph, c.index) < 2 && B[c.index] >= today) candidates.push(c.index);
  }
  candidates.sort((x, y) => (A[x] < A[y] ? -1 : A[x] > A[y] ? 1 : x - y));
  return candidates.filter((i) => !skip.has(i)).slice(0, limit);
}

// ── The student's rhythm ───────────────────────────────────────────────────────────────────────────

export const hoursOn = (s: PlanState, day: string) => s.log[day]?.h ?? 0;
export const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, k) => addDays(today, -(n - 1 - k)));

export interface Accuracy { g: number; ok: number; p: number | null }

export interface StudyStats {
  /** Days that have a log entry, oldest first. */
  days: string[];
  h7: number;
  t7: number;
  total: number;
  streak: number;
  last14: Accuracy;
  prev14: Accuracy;
  /** Average hours per weekday (index = getDay), null where nothing was logged. */
  weekdayAvg: Array<number | null>;
}

export function studyStats(s: PlanState, today: string): StudyStats {
  const days = Object.keys(s.log).sort();
  const week = lastDays(today, 7);
  const h7 = week.reduce((a, d) => a + hoursOn(s, d), 0);
  const t7 = week.reduce((a, d) => a + targetFor(d), 0);
  const total = days.reduce((a, d) => a + (s.log[d].h ?? 0), 0);

  // A day with hours extends the streak; Sunday and today itself may be empty without breaking it.
  let streak = 0;
  for (let k = 0; k < 400; k += 1) {
    const d = addDays(today, -k);
    if (hoursOn(s, d) > 0) streak += 1;
    else if (k === 0 || parseDay(d).getDay() === 0) continue;
    else break;
  }

  const accuracy = (from: string, to: string): Accuracy => {
    let g = 0;
    let ok = 0;
    for (const d of days) {
      if (d >= from && d <= to) {
        g += s.log[d].g ?? 0;
        ok += s.log[d].ok ?? 0;
      }
    }
    return { g, ok, p: g ? ok / g : null };
  };

  const byDay: number[][] = [[], [], [], [], [], [], []];
  for (const d of days) if ((s.log[d].h ?? 0) > 0) byDay[parseDay(d).getDay()].push(s.log[d].h ?? 0);
  const weekdayAvg = byDay.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null));

  return {
    days, h7, t7, total, streak,
    last14: accuracy(addDays(today, -13), today),
    prev14: accuracy(addDays(today, -27), addDays(today, -14)),
    weekdayAvg,
  };
}

/** One week at a glance: hours logged against the target, and how many of the chosen topics are finished. */
export function weekProgress(plan: Plan, s: PlanState, today: string) {
  const m = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, k) => addDays(m, k));
  const hours = days.reduce((a, d) => a + hoursOn(s, d), 0);
  const target = days.reduce((a, d) => a + targetFor(d), 0);
  const picks = picksOf(s, m);
  const ph = Math.min(activePhase(plan, today), 4);
  return { monday: m, hours, target, picks: picks.length, picksDone: picks.filter((i) => statusOf(s, ph, i) === 2).length };
}

// ── Insights (plain sentences; `bold` parts are the figures) ───────────────────────────────────────

export type Segment = string | { b: string };
const WEEKDAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const num = (x: number, d = 1) => x.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });

export function insights(plan: Plan, s: PlanState, today: string): Segment[][] {
  const st = studyStats(s, today);
  if (st.days.length === 0) {
    return [['Nu ai încă nicio zi înregistrată. După primele zile, aici apar ritmul, regularitatea și acuratețea ta.']];
  }
  const out: Segment[][] = [];
  const ph = Math.min(activePhase(plan, today), 4);

  out.push([
    'În ultimele 7 zile ai înregistrat ', { b: `${num(st.h7)} h` }, ` din ${num(st.t7)} h țintă (`,
    { b: `${st.t7 ? Math.round((st.h7 / st.t7) * 100) : 0}%` }, ').',
  ]);
  out.push(st.streak
    ? ['Regularitate: ', { b: `${st.streak} ${st.streak === 1 ? 'zi' : 'zile'}` }, ' la rând (duminica liberă nu rupe seria).']
    : ['Seria s-a întrerupt. Pornește-o din nou cu o zi scurtă, chiar și 1 h.']);

  if (st.last14.p !== null) {
    const diff = st.prev14.p !== null
      ? ` (${st.last14.p >= st.prev14.p ? '+' : ''}${Math.round((st.last14.p - st.prev14.p) * 100)} puncte procentuale față de cele 14 zile dinainte)`
      : '';
    out.push(['Grile, ultimele 14 zile: ', { b: `${Math.round(st.last14.p * 100)}%` }, ` corecte din ${st.last14.g}${diff}.`]);
  }

  const withData = st.weekdayAvg.map((v, k) => [v, k] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  if (st.days.length >= 7 && withData.length > 2) {
    const best = withData.reduce((p, q) => (q[0] > p[0] ? q : p));
    const weekdays = withData.filter(([, k]) => k !== 0);
    if (weekdays.length) {
      const low = weekdays.reduce((p, q) => (q[0] < p[0] ? q : p));
      out.push(['Cea mai productivă zi: ', { b: WEEKDAYS[best[1]] }, ` (în medie ${num(best[0])} h). Cea mai slabă: `, { b: WEEKDAYS[low[1]] }, ` (${num(low[0])} h).`]);
    }
  }

  if (today >= plan.starts[ph - 1] && today <= plan.ends[ph - 1]) {
    const done = donePages(plan, s, ph);
    const planned = plan.topics.reduce((a, c) => a + (c.b[ph - 1] <= today ? c.pages : 0), 0);
    out.push([
      `Față de plan, Faza ${ph}: ai `, { b: num(done, 0) }, ' pagini terminate, planul cerea până azi ', { b: num(planned, 0) },
      planned ? ` (${done >= planned ? `cu ${num(done - planned, 0)} în față` : `în urmă cu ${num(planned - done, 0)}`}).` : '.',
    ]);
    const elapsed = daysBetween(plan.starts[ph - 1], today);
    if (done > 0 && elapsed >= 7) {
      const rate = done / elapsed;
      const left = Math.ceil((totalPages(plan) - done) / rate);
      const finish = addDays(today, left);
      const late = daysBetween(plan.ends[ph - 1], finish);
      out.push([
        `La ritmul actual (${num(rate * 7, 0)} pagini/săptămână) termini Faza ${ph} pe `,
        { b: parseDay(finish).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) },
        `, adică ${late === 0 ? 'exact la termen' : late > 0 ? `${late} zile după plan` : `${Math.abs(late)} zile înaintea planului`}.`,
      ]);
    }
  }
  return out;
}

// ── Series for the charts ──────────────────────────────────────────────────────────────────────────

export interface HourBar { day: string; hours: number; target: number }
export const hoursSeries = (s: PlanState, today: string, n = 28): HourBar[] =>
  lastDays(today, n).map((day) => ({ day, hours: hoursOn(s, day), target: targetFor(day) }));

export interface ProgressSeries {
  from: string;
  to: string;
  /** [day, share of the pass's pages] — what the plan expects, and what the student finished. */
  plan: Array<[string, number]>;
  actual: Array<[string, number]>;
}

export function progressSeries(plan: Plan, s: PlanState, win: Windows, ph: number, today: string): ProgressSeries {
  const from = plan.starts[ph - 1];
  const end = plan.ends[ph - 1];
  const to = today > end ? today : end;
  const total = totalPages(plan) || 1;
  const B = win.b[ph - 1];

  let cum = 0;
  const planned: Array<[string, number]> = [[from, 0]];
  [...plan.topics].sort((x, y) => (B[x.index] < B[y.index] ? -1 : B[x.index] > B[y.index] ? 1 : 0))
    .forEach((c) => { cum += c.pages; planned.push([B[c.index], cum / total]); });

  const events: Array<[string, number]> = [];
  for (const c of plan.topics) {
    const day = s.dn[`${ph}:${c.index}`];
    if (day && statusOf(s, ph, c.index) === 2) events.push([day, c.pages]);
  }
  events.sort((p, q) => (p[0] < q[0] ? -1 : 1));
  let acc = 0;
  const actual: Array<[string, number]> = [[from, 0]];
  events.forEach(([day, pages]) => { acc += pages; actual.push([day < from ? from : day, acc / total]); });
  if (events.length) actual.push([today < from ? from : today, acc / total]);
  return { from, to, plan: planned, actual };
}

export interface AccuracyPoint { week: string; g: number; p: number | null }
export function accuracySeries(s: PlanState, today: string, weeks = 10): AccuracyPoint[] {
  const out: AccuracyPoint[] = [];
  let m = mondayOf(today);
  for (let k = 0; k < weeks; k += 1) {
    let g = 0;
    let ok = 0;
    for (let j = 0; j < 7; j += 1) {
      const l = s.log[addDays(m, j)];
      if (l) { g += l.g ?? 0; ok += l.ok ?? 0; }
    }
    out.unshift({ week: m, g, p: g ? ok / g : null });
    m = addDays(m, -7);
  }
  return out;
}

export interface HeatCell { day: string; hours: number; level: number }
/** `weeks` columns of 7 days (Monday first); days after today are left out. */
export function heatGrid(s: PlanState, today: string, weeks = 14): Array<Array<HeatCell | null>> {
  const first = addDays(mondayOf(today), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, k) => {
    const day = addDays(first, w * 7 + k);
    if (day > today) return null;
    const hours = hoursOn(s, day);
    const target = DAY_TARGET[(k + 1) % 7];
    return { day, hours, level: hours > 0 ? Math.min(1, target ? hours / target : 1) : 0 };
  }));
}

// ── Saving a day, and the summary the rest of the app reads ────────────────────────────────────────

export function withDay(s: PlanState, day: string, rec: DayLog | null): PlanState {
  const log = { ...s.log };
  if (rec && Object.keys(rec).length) log[day] = rec;
  else delete log[day];
  return { ...s, log };
}

export function buildSummary(plan: Plan, s: PlanState, today: string, now: number): PlanSummary {
  const ap = activePhase(plan, today);
  const ph = Math.min(ap, 4);
  const win = computeWindows(plan, s, today);
  const f = focusNow(plan, s, win, today);
  let topic: PlanSummary['today'] = null;
  let chapter: PlanSummary['chapter'];
  if (f.kind === 'topic' || f.kind === 'before') {
    const c = plan.topics[f.ix];
    topic = { n: c.name, g: plan.groups[c.group].replace(/^\d+\.\s*/, ''), src: c.src, pages: c.pages };
    const siblings = plan.topics.filter((t) => t.group === c.group);
    chapter = { index: c.group, done: siblings.filter((t) => statusOf(s, ph, t.index) === 2).length, total: siblings.length };
  }
  return {
    ts: now,
    exam: s.exam,
    phase: ap,
    done: countStatus(plan, s, ph, 2),
    total: plan.topics.length,
    pct: Math.round((donePages(plan, s, ph) / (totalPages(plan) || 1)) * 100),
    streak: studyStats(s, today).streak,
    today: topic,
    ...(chapter ? { chapter } : {}),
  };
}
