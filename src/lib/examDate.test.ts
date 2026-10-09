import { describe, expect, it } from 'vitest';
import type { AILibraryFolder } from '../store/aiStore';
import { resolveExamDate } from './examDate';
import type { PlanSummary } from './organizare/types';

const TODAY = '2026-10-05';

const summary = (exam: string): PlanSummary => ({ ts: 0, exam, phase: 1, done: 0, total: 10, pct: 0, streak: 0, today: null });

const folder = (id: string, name: string, examDate?: string): AILibraryFolder => ({
  id,
  name,
  emoji: '',
  parentId: null,
  createdAt: 0,
  examPlan: examDate ? { examDate, targetGrade: 10, generatedAt: 0, sourceIds: [], sessions: [] } : null,
});

const resolve = (over: Partial<Parameters<typeof resolveExamDate>[0]> = {}) =>
  resolveExamDate({ organizareState: null, organizareSummary: null, folders: [], today: TODAY, ...over });

describe('resolveExamDate', () => {
  it('prefers the exam stored in the Organizare state', () => {
    const { primary } = resolve({ organizareState: { exam: '2027-11-21' }, organizareSummary: summary('2027-01-01') });
    expect(primary).toMatchObject({ date: '2027-11-21', source: 'organizare', daysLeft: 412, passed: false });
    expect(primary?.label).toBe('Examen rezidențiat (estimare)');
    expect(primary?.estimate).toBe(true);
  });

  it('does not call a date the student chose an estimate', () => {
    const { primary } = resolve({ organizareState: { exam: '2027-10-30' } });
    expect(primary).toMatchObject({ estimate: false, label: 'Examen rezidențiat (din Organizare)' });
  });

  it('falls back to the summary when the state holds a bad date', () => {
    const { primary } = resolve({ organizareState: { exam: 'abc' }, organizareSummary: summary('2027-01-01') });
    expect(primary).toMatchObject({ date: '2027-01-01', source: 'organizare', estimate: true });
  });

  it('rejects dates that match the pattern but do not exist', () => {
    const { primary } = resolve({ organizareState: { exam: '2027-02-31' } });
    expect(primary).toBeNull();
  });

  it('survives garbage in the state', () => {
    expect(resolve({ organizareState: 'oops' }).primary).toBeNull();
    expect(resolve({ organizareState: { exam: 5 } }).primary).toBeNull();
  });

  it('uses the nearest upcoming folder exam plan when Organizare has no date', () => {
    const { primary, others } = resolve({ folders: [folder('b', 'Chirurgie', '2026-12-01'), folder('a', 'Cardiologie', '2026-10-20')] });
    expect(primary).toMatchObject({ date: '2026-10-20', source: 'plan-folder', daysLeft: 15, label: 'Examen — Cardiologie' });
    expect(others.map((o) => o.date)).toEqual(['2026-12-01']);
  });

  it('keeps folder exams as others when Organizare provides the primary', () => {
    const { primary, others } = resolve({
      organizareSummary: summary('2027-06-01'),
      folders: [folder('b', 'Chirurgie', '2026-12-01'), folder('a', 'Cardiologie', '2026-10-20')],
    });
    expect(primary?.source).toBe('organizare');
    expect(others.map((o) => o.label)).toEqual(['Examen — Cardiologie', 'Examen — Chirurgie']);
  });

  it('returns no primary when nothing is set', () => {
    expect(resolve()).toEqual({ primary: null, others: [] });
  });

  it('marks a past Organizare exam as passed', () => {
    const { primary } = resolve({ organizareState: { exam: '2026-10-01' } });
    expect(primary).toMatchObject({ passed: true, daysLeft: -4 });
  });

  it('ignores past folder exam plans', () => {
    const { primary, others } = resolve({
      organizareState: { exam: '2027-01-01' },
      folders: [folder('a', 'Vechi', '2026-09-01'), folder('b', 'Fără plan')],
    });
    expect(primary?.source).toBe('organizare');
    expect(others).toEqual([]);
    expect(resolve({ folders: [folder('a', 'Vechi', '2026-09-01')] }).primary).toBeNull();
  });

  it('keeps a passed Organizare exam as primary and a future folder exam in others', () => {
    const { primary, others } = resolve({
      organizareState: { exam: '2026-10-01' },
      folders: [folder('a', 'Cardiologie', '2026-10-20'), folder('b', 'Vechi', '2026-09-01')],
    });
    expect(primary).toMatchObject({ passed: true, daysLeft: -4, source: 'organizare' });
    expect(others.map((o) => [o.label, o.daysLeft, o.passed])).toEqual([['Examen — Cardiologie', 15, false]]);
  });

  it('counts an exam today as 0 days left and not passed', () => {
    expect(resolve({ organizareState: { exam: TODAY } }).primary).toMatchObject({ daysLeft: 0, passed: false });
  });
});

describe('DEFAULT_PLAN_EXAM', () => {
  it('matches the exam date of the base plan, so the estimate flag is right', async () => {
    const { DEFAULT_PLAN_EXAM } = await import('./examDate');
    const plan = (await import('../data/organizare/plan.json')).default as { exam: string };
    expect(DEFAULT_PLAN_EXAM).toBe(plan.exam);
  });
});
