import { create } from 'zustand';
import type { AgentPlan } from '../lib/ai/agent';

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export type AgentJobStatus = 'planning' | 'awaiting-confirm' | 'running' | 'done' | 'error' | 'cancelled';

export interface AgentJobStepParams {
  packCount?: number;
  questionsPerPack?: number;
  count?: number;
  difficulty?: 'auto' | 'easy' | 'medium' | 'hard';
  questionType?: 'single' | 'multiple';
}

export interface AgentJobStep {
  id: string;
  label: string;
  status: AgentStepStatus;
  detail?: string;
  /** Action type, present so the confirm UI knows which controls to offer for editing. */
  action?: string;
  /** Editable generation params, only meaningful while status is 'pending' and the job awaits confirm. */
  params?: AgentJobStepParams;
}

/** How closely a generated set matches the real exam (see examConformance). */
export interface AgentJobConformance {
  score: number;
  label: string;
  /** Metrics that missed their target, already phrased for the user. */
  issues: string[];
}

export interface AgentJob {
  id: string;
  command: string;
  status: AgentJobStatus;
  steps: AgentJobStep[];
  createdAt: number;
  finishedAt?: number;
  summary?: string;
  conformance?: AgentJobConformance;
  /**
   * The full plan, kept around for retryAgentJob/editAgentStepParams. This
   * USED to live only in a useAgentCommands ref, local to the AIChatDrawer
   * component instance — AIChatDrawer fully unmounts (returns null) whenever
   * another part of the app suppresses the floating chat button while it's
   * closed (e.g. QuizDetail's own embedded chat panel calls setChatOpen(false)
   * + lockFloatingUI while the user is looking at a different quiz). A job
   * that failed and got its plan orphaned that way made "REÎNCEARCĂ" a silent
   * no-op — the button rendered fine (this job record is fine, it's in the
   * global store), but retryAgentJob's plan lookup came back empty. Storing
   * the plan here instead of in a component-local ref survives that unmount.
   */
  plan?: AgentPlan;
  /** Post-success "jump straight in" CTA — same survive-a-remount reasoning as `plan`. */
  result?: { route: string; label: string };
  /** Reverts what this job created — same survive-a-remount reasoning as `plan`. */
  undo?: (() => void) | null;
}

interface AgentJobsStore {
  jobs: AgentJob[];
  createJob: (command: string, steps: AgentJobStep[], status?: AgentJobStatus, plan?: AgentPlan) => string;
  setJobStatus: (jobId: string, status: AgentJobStatus, summary?: string) => void;
  setJobConformance: (jobId: string, conformance: AgentJobConformance) => void;
  setJobResult: (jobId: string, result: AgentJob['result']) => void;
  setJobPlan: (jobId: string, plan: AgentPlan) => void;
  setJobUndo: (jobId: string, undo: (() => void) | null) => void;
  setStepStatus: (jobId: string, stepId: string, status: AgentStepStatus, detail?: string) => void;
  setSteps: (jobId: string, steps: AgentJobStep[]) => void;
  updateStep: (jobId: string, stepId: string, patch: Partial<AgentJobStep>) => void;
  clearFinished: () => void;
}

function patchJob(jobs: AgentJob[], jobId: string, patch: (job: AgentJob) => AgentJob) {
  return jobs.map((job) => (job.id === jobId ? patch(job) : job));
}

export const useAgentJobsStore = create<AgentJobsStore>((set) => ({
  jobs: [],

  createJob: (command, steps, status = 'running', plan) => {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    set((state) => ({
      jobs: [{ id, command, status, steps, plan, createdAt: Date.now() }, ...state.jobs].slice(0, 20),
    }));
    return id;
  },

  setJobStatus: (jobId, status, summary) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({
      ...job,
      status,
      summary: summary ?? job.summary,
      finishedAt: status === 'done' || status === 'error' || status === 'cancelled' ? Date.now() : job.finishedAt,
    })),
  })),

  setJobConformance: (jobId, conformance) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({ ...job, conformance })),
  })),

  setJobResult: (jobId, result) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({ ...job, result })),
  })),

  setJobPlan: (jobId, plan) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({ ...job, plan })),
  })),

  setJobUndo: (jobId, undo) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({ ...job, undo })),
  })),

  setStepStatus: (jobId, stepId, status, detail) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({
      ...job,
      steps: job.steps.map((step) => (step.id === stepId ? { ...step, status, detail: detail ?? step.detail } : step)),
    })),
  })),

  setSteps: (jobId, steps) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({ ...job, steps })),
  })),

  updateStep: (jobId, stepId, patch) => set((state) => ({
    jobs: patchJob(state.jobs, jobId, (job) => ({
      ...job,
      steps: job.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    })),
  })),

  clearFinished: () => set((state) => ({
    jobs: state.jobs.filter((job) => job.status === 'running' || job.status === 'planning' || job.status === 'awaiting-confirm'),
  })),
}));
