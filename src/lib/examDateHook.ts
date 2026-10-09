import { useMemo, useState } from 'react';
import { useAIStore } from '../store/aiStore';
import { EMPTY_PLAN, useOrganizareStore } from '../store/organizareStore';
import { useUserStore } from '../store/userStore';
import { resolveExamDate, type ExamDateInfo } from './examDate';
import { localDateStr } from './studyPlan';

/**
 * Data examenului din sursa unică: Organizare, apoi planul de examen al unui folder.
 * Doar citește; nu scrie nimic în Organizare sau în Biblioteca AI.
 */
export function useExamDate(): { primary: ExamDateInfo | null; others: ExamDateInfo[] } {
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const plan = useOrganizareStore((state) => state.byProfile[profileId] ?? EMPTY_PLAN);
  const folders = useAIStore((state) => state.libraryFolders);
  const [today] = useState(() => localDateStr());

  return useMemo(
    () => resolveExamDate({ organizareState: plan.state, organizareSummary: plan.summary, folders, today }),
    [plan.state, plan.summary, folders, today],
  );
}
