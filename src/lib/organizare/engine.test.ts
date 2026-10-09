import { describe, expect, it } from 'vitest';
import raw from '../../data/organizare/plan.json';
import {
  accuracySeries, activePhase, addPicks, buildSummary, computeWindows, countStatus, currentIndex, daysBetween,
  emptyState, focusNow, heatGrid, insights, mondayOf, nextStatus, normalizePlan, readState, removePick, statusOf,
  studyStats, suggestFor, toggleGroup, togglePick, upNext, weekIndex, weekProgress, withDay, withStatus,
} from './engine';
import type { RawPlan } from './types';

const plan = normalizePlan(raw as unknown as RawPlan);
const S = () => emptyState(plan);

describe('dates', () => {
  it('finds the Monday of any day of the week', () => {
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
  });

  it('counts days to the exam like the plan page did (412 days, 59 weeks from 5 Oct 2026)', () => {
    const days = daysBetween('2026-10-05', plan.exam);
    expect(days).toBe(412);
    expect(Math.ceil(days / 7)).toBe(59);
  });
});

describe('passes', () => {
  it('moves through the four passes and then into simulations', () => {
    expect(activePhase(plan, '2026-10-05')).toBe(1);
    expect(activePhase(plan, '2027-03-13')).toBe(1);
    expect(activePhase(plan, '2027-03-14')).toBe(2);
    expect(activePhase(plan, '2027-10-23')).toBe(4);
    expect(activePhase(plan, '2027-10-24')).toBe(5);
  });

  it('loads 555 topics and 59 weeks', () => {
    expect(plan.topics).toHaveLength(555);
    expect(plan.weeks).toHaveLength(59);
  });
});

describe('status', () => {
  it('cycles to do, in progress, done, and back', () => {
    expect(nextStatus(0)).toBe(1);
    expect(nextStatus(1)).toBe(2);
    expect(nextStatus(2)).toBe(0);
  });

  it('records the day a topic was finished, and forgets it when it is reopened', () => {
    const done = withStatus(S(), 1, 3, 2, '2026-10-20');
    expect(statusOf(done, 1, 3)).toBe(2);
    expect(done.dn['1:3']).toBe('2026-10-20');
    expect(countStatus(plan, done, 1, 2)).toBe(1);
    const reopened = withStatus(done, 1, 3, 0, '2026-10-21');
    expect(reopened.dn['1:3']).toBeUndefined();
    expect(countStatus(plan, reopened, 1, 2)).toBe(0);
  });

  it('does not touch the other passes', () => {
    const done = withStatus(S(), 2, 5, 2, '2027-04-01');
    expect(statusOf(done, 1, 5)).toBe(0);
    expect(statusOf(done, 2, 5)).toBe(2);
  });
});

describe('what to do now', () => {
  it('waits for the first day, then follows the plan', () => {
    const s = S();
    const before = focusNow(plan, s, computeWindows(plan, s, '2026-10-05'), '2026-10-05');
    expect(before).toMatchObject({ kind: 'before', ix: 0 });
    const first = focusNow(plan, s, computeWindows(plan, s, '2026-10-06'), '2026-10-06');
    expect(first).toMatchObject({ kind: 'topic', ix: 0, label: 'Topicul de azi' });
  });

  it('skips topics already finished', () => {
    let s = S();
    s = withStatus(s, 1, 0, 2, '2026-10-06');
    const f = focusNow(plan, s, computeWindows(plan, s, '2026-10-06'), '2026-10-06');
    expect(f.kind === 'topic' && f.ix).toBeGreaterThan(0);
  });

  it('shows simulations after the last pass and maintenance in the final week', () => {
    const s = S();
    expect(focusNow(plan, s, computeWindows(plan, s, '2027-11-01'), '2027-11-01')).toEqual({ kind: 'simulations' });
    expect(focusNow(plan, s, computeWindows(plan, s, '2027-11-16'), '2027-11-16')).toEqual({ kind: 'maintenance' });
  });

  it('prefers the topics the student chose for this week', () => {
    let s = S();
    s = addPicks(s, '2026-10-12', [200, 201]);
    const win = computeWindows(plan, s, '2026-10-14');
    expect(focusNow(plan, s, win, '2026-10-14')).toMatchObject({ kind: 'topic', ix: 200, label: 'Alegerea ta pentru săptămâna aceasta' });
    s = withStatus(s, 1, 200, 2, '2026-10-14');
    expect(focusNow(plan, s, computeWindows(plan, s, '2026-10-14'), '2026-10-14')).toMatchObject({ ix: 201 });
  });

  it('lists the next topics without repeating the current one', () => {
    const s = S();
    const win = computeWindows(plan, s, '2026-10-06');
    const next = upNext(plan, s, win, '2026-10-06');
    expect(next).toHaveLength(4);
    expect(next).not.toContain(currentIndex(plan, win, 1, '2026-10-06'));
  });
});

describe('weekly picks', () => {
  it('moves a chosen topic into its week and stretches it over several', () => {
    let s = S();
    s = addPicks(s, '2026-10-12', [300]);
    let win = computeWindows(plan, s, '2026-10-06');
    expect(win.a[0][300]).toBe('2026-10-12');
    expect(win.b[0][300]).toBe('2026-10-18');
    s = addPicks(s, '2026-10-19', [300]);
    win = computeWindows(plan, s, '2026-10-06');
    expect(win.a[0][300]).toBe('2026-10-12');
    expect(win.b[0][300]).toBe('2026-10-25');
  });

  it('adds, removes and toggles picks and whole groups', () => {
    let s = S();
    s = togglePick(s, '2026-10-12', 5);
    expect(s.wk['2026-10-12']).toEqual([5]);
    s = removePick(s, '2026-10-12', 5);
    expect(s.wk['2026-10-12']).toBeUndefined();
    const group0 = plan.topics.filter((c) => c.group === 0).map((c) => c.index);
    s = toggleGroup(plan, s, '2026-10-12', 0);
    expect(s.wk['2026-10-12']).toEqual(group0);
    s = toggleGroup(plan, s, '2026-10-12', 0);
    expect(s.wk['2026-10-12']).toBeUndefined();
  });

  it('suggests the plan’s own topics only for study weeks', () => {
    expect(suggestFor(plan, plan.weeks[0])).toContain(0);
    const sim = plan.weeks.find((w) => w.k === 's');
    expect(sim && suggestFor(plan, sim)).toEqual([]);
    expect(weekIndex(plan, '2026-10-08')).toBe(0);
  });
});

describe('rhythm', () => {
  it('counts a streak across days, letting an empty Sunday and an empty today pass', () => {
    let s = S();
    s = withDay(s, '2026-10-10', { h: 3 });
    s = withDay(s, '2026-10-09', { h: 2 });
    expect(studyStats(s, '2026-10-12').streak).toBe(2);
    expect(studyStats(s, '2026-10-13').streak).toBe(0);
  });

  it('adds the last seven days against the target', () => {
    let s = S();
    s = withDay(s, '2026-10-12', { h: 2 });
    s = withDay(s, '2026-10-11', { h: 1.5 });
    const st = studyStats(s, '2026-10-12');
    expect(st.h7).toBe(3.5);
    expect(st.total).toBe(3.5);
  });

  it('compares accuracy of the last two weeks with the two before', () => {
    let s = S();
    s = withDay(s, '2026-10-12', { h: 1, g: 40, ok: 30 });
    s = withDay(s, '2026-09-25', { h: 1, g: 40, ok: 20 });
    const st = studyStats(s, '2026-10-12');
    expect(st.last14.p).toBeCloseTo(0.75);
    expect(st.prev14.p).toBeCloseTo(0.5);
    expect(accuracySeries(s, '2026-10-12').filter((p) => p.p !== null)).toHaveLength(2);
  });

  it('reports hours and chosen topics for the current week', () => {
    let s = S();
    s = withDay(s, '2026-10-12', { h: 2 });
    s = addPicks(s, '2026-10-12', [1, 2]);
    s = withStatus(s, 1, 1, 2, '2026-10-12');
    expect(weekProgress(plan, s, '2026-10-14')).toMatchObject({ monday: '2026-10-12', hours: 2, target: 18, picks: 2, picksDone: 1 });
  });

  it('writes plain sentences, with the figures marked', () => {
    expect(insights(plan, S(), '2026-10-12')[0][0]).toContain('Nu ai încă nicio zi');
    const s = withDay(S(), '2026-10-12', { h: 2.5, g: 10, ok: 8 });
    const lines = insights(plan, s, '2026-10-12');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0].some((part) => typeof part === 'object' && part.b.includes('2,5'))).toBe(true);
  });

  it('draws the heat grid up to today only', () => {
    const grid = heatGrid(withDay(S(), '2026-10-12', { h: 2.5 }), '2026-10-12');
    expect(grid).toHaveLength(14);
    expect(grid[13][0]).toMatchObject({ day: '2026-10-12', level: 1 });
    expect(grid[13][1]).toBeNull();
  });
});

describe('state and summary', () => {
  it('reads old or broken saved data safely', () => {
    expect(readState(plan, null)).toEqual(S());
    expect(readState(plan, [1, 2])).toEqual(S());
    const old = readState(plan, { s1: { 4: 2 }, exam: '2027-11-20' });
    expect(old.s1[4]).toBe(2);
    expect(old.exam).toBe('2027-11-20');
    expect(old.log).toEqual({});
  });

  it('summarises where the student is', () => {
    let s = S();
    const start = buildSummary(plan, s, '2026-10-05', 1);
    expect(start).toMatchObject({ phase: 1, done: 0, total: 555, pct: 0, streak: 0 });
    expect(start.today?.n).toBe('1. Abilități clinice în infecții și sepsis');
    s = withStatus(s, 1, 0, 2, '2026-10-06');
    expect(buildSummary(plan, s, '2026-10-06', 1)).toMatchObject({ done: 1, today: { n: '2. Introducerea și recunoașterea sepsisului' } });
    expect(buildSummary(plan, s, '2027-11-01', 1).today).toBeNull();
  });

  it('says which chapter the current topic is in and how much of it is done', () => {
    let s = S();
    const chapter = buildSummary(plan, s, '2026-10-05', 1).chapter;
    expect(chapter).toMatchObject({ index: 0, done: 0 });
    expect(chapter!.total).toBeGreaterThan(1);
    s = withStatus(s, 1, 0, 2, '2026-10-06');
    expect(buildSummary(plan, s, '2026-10-06', 1).chapter).toMatchObject({ index: 0, done: 1 });
    expect(buildSummary(plan, s, '2027-11-01', 1).chapter).toBeUndefined();
  });
});
