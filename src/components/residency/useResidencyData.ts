import { useMemo, useState } from 'react';
import { useAIStore, type AIKnowledgeSource } from '../../store/aiStore';
import { useQuizStore } from '../../store/quizStore';
import { useFolderStore } from '../../store/folderStore';
import { useStatsStore } from '../../store/statsStore';
import { findRezidentiatRootFolder, isUnderRezidentiatRoot } from '../../lib/rezidentiatRoot';
import { useOrganizareStore } from '../../store/organizareStore';
import { useUserStore } from '../../store/userStore';
import { basePlan, curriculumChapters, type CurriculumChapter } from '../../lib/curriculum';
import { activePhase, computeWindows, focusNow, hasProgress, readState, toDay } from '../../lib/organizare/engine';
import type { PlanState, Topic } from '../../lib/organizare/types';
import { buildRezidentiatOverview, type RezidentiatOverview } from '../../lib/rezidentiatOverview';

/** The Rezidențiat discipline/specialty tree plus the user's progress through it. */
export function useRezidentiatOverview(): RezidentiatOverview {
  const folders = useFolderStore((state) => state.folders);
  const quizzes = useQuizStore((state) => state.quizzes);
  const sessions = useQuizStore((state) => state.sessions);
  const questionStats = useStatsStore((state) => state.questionStats);
  return useMemo(
    () => sharedOverview(folders, quizzes, questionStats, sessions),
    [folders, quizzes, questionStats, sessions],
  );
}

/** Ultimul rezultat, păstrat între pagini: Residency, BookShelf și Organizare cer același calcul pe aceleași date. */
let lastOverview: { args: Parameters<typeof buildRezidentiatOverview>; result: RezidentiatOverview } | null = null;
function sharedOverview(...args: Parameters<typeof buildRezidentiatOverview>): RezidentiatOverview {
  if (lastOverview && lastOverview.args.every((value, index) => value === args[index])) return lastOverview.result;
  const result = buildRezidentiatOverview(...args);
  lastOverview = { args, result };
  return result;
}

/** Reference books filed under the Rezidențiat section of the AI library, and where to add more. */
export function useResidencyBooks(): { books: AIKnowledgeSource[]; hasLibraryRoot: boolean } {
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  const libraryFolders = useAIStore((state) => state.libraryFolders);
  const root = useMemo(() => findRezidentiatRootFolder(libraryFolders), [libraryFolders]);
  const books = useMemo(
    () => (root ? knowledgeSources.filter((source) => !!source.folderId && isUnderRezidentiatRoot(source.folderId, libraryFolders)) : []),
    [knowledgeSources, libraryFolders, root],
  );
  return { books, hasLibraryRoot: !!root };
}

export interface PlanFocus {
  chapter: CurriculumChapter;
  topic: Topic;
  /** Trecerea în care se află capitolul (1–4). */
  phase: number;
  /** Motivul din Organizare („Topicul de azi”, „Alegerea ta pentru săptămâna aceasta”…). */
  label: string;
}

export interface PlanProgress {
  profileId: string;
  /** Progresul din Organizare, doar după ce planul a fost deschis cel puțin o dată (altfel nu există nimic de arătat). */
  state: PlanState | null;
  /** Trecerea activă azi (1–4; în simulări rămâne ultima). */
  phase: number;
  /** Capitolul la care ai rămas, sau null fără plan / în simulări. */
  focus: PlanFocus | null;
}

/** Progresul real din Organizare pentru profilul activ, pe capitolele din `curriculum`. */
export function usePlanProgress(): PlanProgress {
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const entry = useOrganizareStore((state) => state.byProfile[profileId]);
  const [today] = useState(() => toDay(new Date()));
  return useMemo(() => {
    const plan = basePlan();
    const opened = !!entry?.summary || (!!entry?.state && hasProgress(readState(plan, entry.state)));
    if (!opened) return { profileId, state: null, phase: 1, focus: null };
    const state = readState(plan, entry?.state);
    const phase = Math.min(activePhase(plan, today), 4);
    const focus = focusNow(plan, state, computeWindows(plan, state, today), today);
    if (focus.kind !== 'topic' && focus.kind !== 'before') return { profileId, state, phase, focus: null };
    const topic = plan.topics[focus.ix];
    return {
      profileId,
      state,
      phase,
      focus: {
        chapter: curriculumChapters()[topic.group],
        topic,
        phase: focus.ph,
        label: focus.kind === 'topic' ? focus.label : 'Începutul planului',
      },
    };
  }, [entry, profileId, today]);
}
