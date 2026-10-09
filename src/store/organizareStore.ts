import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanSummary } from '../lib/organizare/types';

export type { PlanSummary };

export interface ProfilePlan {
  /** The student's progress (ticks, weekly picks, daily log). Read through `readState`, which also accepts older or imported shapes. */
  state: object | null;
  summary: PlanSummary | null;
  /** Folder that holds the user's study files (Capitole, Carti, …), for "Deschide fișierul". */
  root: string | null;
  /** PDF-uri din „Capitole” din care sincronizarea AI nu a putut scoate text (relPath → mărime), ca să nu fie reîncercate. */
  aiUnreadable?: Record<string, number>;
}

export const EMPTY_PLAN: ProfilePlan = { state: null, summary: null, root: null };

interface OrganizareStore {
  /** profile id → plan. Each profile keeps its own progress. */
  byProfile: Record<string, ProfilePlan>;
  setState: (profileId: string, state: object) => void;
  setSummary: (profileId: string, summary: PlanSummary) => void;
  setRoot: (profileId: string, root: string | null) => void;
  markAiUnreadable: (profileId: string, entries: Record<string, number>) => void;
}

const patch = (store: OrganizareStore, profileId: string, change: Partial<ProfilePlan>) => ({
  byProfile: { ...store.byProfile, [profileId]: { ...(store.byProfile[profileId] ?? EMPTY_PLAN), ...change } },
});

/** The summary changes on every render of the plan; only a real difference should write to storage. */
const sameSummary = (a: PlanSummary | null, b: PlanSummary) => !!a && JSON.stringify({ ...a, ts: 0 }) === JSON.stringify({ ...b, ts: 0 });

export const useOrganizareStore = create<OrganizareStore>()(
  persist(
    (set) => ({
      byProfile: {},
      setState: (profileId, state) => set((s) => patch(s, profileId, { state })),
      setSummary: (profileId, summary) => set((s) => (
        sameSummary(s.byProfile[profileId]?.summary ?? null, summary) ? s : patch(s, profileId, { summary })
      )),
      setRoot: (profileId, root) => set((s) => patch(s, profileId, { root })),
      markAiUnreadable: (profileId, entries) => set((s) => patch(s, profileId, {
        aiUnreadable: { ...(s.byProfile[profileId]?.aiUnreadable ?? {}), ...entries },
      })),
    }),
    { name: 'studyx-organizare', version: 1, partialize: (s) => ({ byProfile: s.byProfile }) },
  ),
);
