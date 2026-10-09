import type { AgentContext, AgentPlan, AgentStep, ExecuteCallbacks } from '../types';
import type { Folder } from '../../../../types';
import type { useFolderStore } from '../../../../store/folderStore';
import type { useAIStore } from '../../../../store/aiStore';

/** Everything a single plan step may touch (shared state of one executeAgentPlan run). */
export interface StepEnv {
  plan: AgentPlan;
  step: AgentStep;
  index: number;
  ctx: AgentContext;
  callbacks: ExecuteCallbacks;
  folderStore: ReturnType<typeof useFolderStore.getState>;
  aiStore: ReturnType<typeof useAIStore.getState>;
  activeProfileId: string | null;
  assertSameProfile: () => void;
  createdFolderByName: Map<string, Folder>;
  createdQuizIds: string[];
  errors: string[];
  undoOps: Array<() => void>;
  summaryParts: string[];
  resolveQuizFolder: (folderName: string | undefined) => Folder | null;
  defaultParentFolder: () => Folder | null;
  defaultLibraryParent: () => { id: string; name: string } | null;
  resolveOrCreateQuizFolder: (folderName: string | undefined) => Folder | null;
}
