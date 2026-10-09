import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAIStore } from '../store/aiStore';
import { useOrganizareStore } from '../store/organizareStore';
import { useUserStore } from '../store/userStore';
import { useExamDate } from './examDateHook';

const plan = (exam: string) => ({ state: { exam }, summary: null, root: null });

describe('useExamDate', () => {
  beforeEach(() => {
    useUserStore.setState({ activeProfileId: null });
    useOrganizareStore.setState({ byProfile: {} });
    useAIStore.setState({ libraryFolders: [] });
  });

  it('has no exam when nothing is set', () => {
    const { result } = renderHook(() => useExamDate());
    expect(result.current).toEqual({ primary: null, others: [] });
  });

  it('follows the active profile', () => {
    useOrganizareStore.setState({ byProfile: { default: plan('2099-05-01'), p2: plan('2099-06-15') } });
    const { result } = renderHook(() => useExamDate());
    expect(result.current.primary?.date).toBe('2099-05-01');
    act(() => useUserStore.setState({ activeProfileId: 'p2' }));
    expect(result.current.primary?.date).toBe('2099-06-15');
    act(() => useUserStore.setState({ activeProfileId: 'p3' }));
    expect(result.current.primary).toBeNull();
  });

  it('reads folder exam plans as the fallback and as other exams', () => {
    const folder = (id: string, name: string, examDate: string) => ({
      id, name, emoji: '', parentId: null, createdAt: 0,
      examPlan: { examDate, targetGrade: 10, generatedAt: 0, sourceIds: [], sessions: [] },
    });
    useAIStore.setState({ libraryFolders: [folder('a', 'Cardio', '2099-03-01'), folder('b', 'Chirurgie', '2099-04-01')] });
    const { result } = renderHook(() => useExamDate());
    expect(result.current.primary).toMatchObject({ source: 'plan-folder', label: 'Examen — Cardio' });
    expect(result.current.others.map((o) => o.label)).toEqual(['Examen — Chirurgie']);
    act(() => useOrganizareStore.setState({ byProfile: { default: plan('2099-12-31') } }));
    expect(result.current.primary?.source).toBe('organizare');
    expect(result.current.others).toHaveLength(2);
  });
});
