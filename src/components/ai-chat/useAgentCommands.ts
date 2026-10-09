import { useRef } from 'react';
import {
  describeStep,
  executeAgentPlan,
  isRetryPhrase,
  looksLikeAgentCommand,
  looksLikeAnswerDispute,
  looksLikePlaceThemRequest,
  PLACE_THEM_QUESTION,
  grantsGeneralKnowledgePermission,
  planAgentCommand,
  proposeAnswerCorrection,
  type AgentPlan,
  type AgentStep,
} from '../../lib/ai/agent';
import { isFlashcardDeck } from '../../lib/deckKind';
import { EXAM_STYLE_META, type ExamStyle } from '../../lib/ai/examStyle';
import { scoreExamConformance } from '../../lib/ai/examConformance';
import { desktopNotify } from '../../lib/desktopNotify';
import { isDocumentHidden } from '../../lib/asyncGuard';
import { useQuizStore } from '../../store/quizStore';
import { useUIStore } from '../../store/uiStore';
import { useToastStore } from '../../store/toastStore';
import { useAgentJobsStore } from '../../store/agentJobsStore';
import { useQuizChatContextStore } from '../../store/quizChatContextStore';
import { buildAgentFollowUps, type ChatMessage, type ChatMode } from './shared';
import type { ChatThread } from './useChatMessages';

interface UseAgentCommandsOptions {
  hasKey: boolean;
  messagesRef: React.RefObject<ChatMessage[]>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setThinkingPhase: (phase: string | null) => void;
  /** Fallback pack size when a plan step doesn't specify one — the Studio panel's current settings. */
  studioPackCount: number;
  studioQuestionsPerPack: number;
  /** Which conversation is live — decides the default exam format (residency vs. simple) when the user doesn't say. */
  chatThread: ChatThread;
}

/**
 * Everything about turning a chat message into an agent plan and running it:
 * command detection, the LLM planner call, the confirm-card job lifecycle
 * (run/cancel/undo/edit-params), and the in-quiz answer-dispute flow. Shares
 * the message thread with the rest of the drawer (via `messagesRef`/
 * `setMessages`) but owns every other piece of agent-specific state itself.
 */
export function useAgentCommands({
  hasKey,
  messagesRef,
  setMessages,
  setThinkingPhase,
  studioPackCount,
  studioQuestionsPerPack,
  chatThread,
}: UseAgentCommandsOptions) {
  const open = useUIStore((state) => state.chatOpen);
  const addToast = useToastStore((state) => state.addToast);

  // Last genuine agent command, so a follow-up "mai încearcă" re-runs it instead
  // of letting the planner invent a new (wrong) request from "mai încearcă".
  const lastAgentCommandRef = useRef<string>('');
  // True right after the agent asked a clarifying question ("Despre ce curs
  // vrei grilele?"). The user's next reply ("Cardiologie") won't look like a
  // command on its own — this forces it through the planner anyway (with the
  // question+answer already in history) instead of falling through to normal
  // chat and getting a generic non-answer.
  const pendingClarificationRef = useRef(false);

  const runAgentJob = async (jobId: string) => {
    const plan = useAgentJobsStore.getState().jobs.find((job) => job.id === jobId)?.plan;
    if (!plan) return;
    const jobs = useAgentJobsStore.getState();
    jobs.setJobStatus(jobId, 'running');

    const result = await executeAgentPlan(
      plan,
      {
        defaultPackCount: studioPackCount,
        defaultQuestionsPerPack: studioQuestionsPerPack,
        residencyScope: chatThread === 'rezidentiat',
      },
      {
        onStep: (index, status, detail) => {
          useAgentJobsStore.getState().setStepStatus(jobId, `s${index}`, status, detail);
        },
      },
    );

    useAgentJobsStore.getState().setJobUndo(jobId, result.undo);
    const failedAll = result.errors.length > 0 && result.createdQuizIds.length === 0;
    jobs.setJobStatus(jobId, failedAll ? 'error' : 'done', result.summary);

    // Measure what was just generated against the real exam, so the student sees
    // whether the set actually looks like rezidențiat instead of taking it on faith.
    const createdSets = useQuizStore.getState().quizzes
      .filter((quiz) => result.createdQuizIds.includes(quiz.id) && !isFlashcardDeck(quiz));
    const createdQuestions = createdSets.flatMap((quiz) => quiz.questions);
    if (createdQuestions.length >= 3) {
      const style: ExamStyle = createdSets.some((quiz) => quiz.tags?.includes(EXAM_STYLE_META.simple.tag))
        ? 'simple'
        : 'residency';
      const report = scoreExamConformance(createdQuestions, style);
      jobs.setJobConformance(jobId, {
        score: report.score,
        label: EXAM_STYLE_META[style].short,
        issues: report.metrics.filter((metric) => !metric.ok).map((metric) => metric.label),
      });
    }

    // Close the loop: if the agent created sets, offer to jump straight in.
    if (!failedAll && result.createdQuizIds.length > 0) {
      const firstId = result.createdQuizIds[0];
      const created = useQuizStore.getState().quizzes.find((q) => q.id === firstId);
      const isFlashcard = created ? isFlashcardDeck(created) : false;
      const many = result.createdQuizIds.length > 1;
      useAgentJobsStore.getState().setJobResult(jobId, {
        route: isFlashcard ? `/flashcards/session/${firstId}?mode=all` : `/play/${firstId}`,
        label: isFlashcard ? 'Începe sesiunea' : many ? 'Începe primul set' : 'Începe acum',
      });
    }

    // If the plan generated a study plan text, surface it in chat now (after execution)
    const studyPlanText = plan.reply && plan.steps.some(s => s.action === 'create_study_plan') ? plan.reply : null;
    // The plan stays on the job on failure (a rate limit, a transient network
    // error) so retryAgentJob can re-run the exact same steps instead of
    // forcing the user to retype the whole command — no need to clear it here
    // either way; a successful job just never reads it again.

    // The confirm-card message's text was frozen at "I'm about to do X" (set
    // once in presentAgentPlan, before execution) — the ACTUAL outcome only
    // ever lived in AgentJobCard, a live UI component reading straight from
    // useAgentJobsStore, never as plain text. That's fine for a human looking
    // at the card, but the model building `historyForAI` from `messages`
    // never saw it: a later "de ce nu a mers?" had nothing to go on except a
    // message that still read as if the job were still pending/just-declared,
    // so it fell through to ordinary RAG chat and answered about something
    // else entirely (confirmed live — asking about "agentul" after a failed
    // run got interpreted as "agent patogen", a medical term, because that's
    // what the book-grounded context actually contained). Rewriting the
    // message with the real outcome each time (initial run AND every retry —
    // this same code path runs for both) gives every later turn real
    // grounding to reason from instead of stale intent text.
    const introText = plan.reply || (plan.needsConfirm ? 'Am pregătit un plan. Confirmă ca să îl execut.' : 'Execut planul...');
    const outcomeText = failedAll
      ? `Nu a mers: ${result.errors.join(' ')}`
      : result.errors.length > 0
        ? `${result.summary} — cu observații: ${result.errors.join(' ')}`
        : result.summary;
    // Sugestii potrivite cu ce tocmai s-a făcut (nu cele generice de chat).
    const firstStep = plan.steps[0];
    const followUps = buildAgentFollowUps({
      quizCount: createdSets.length,
      deckCount: result.createdQuizIds.length - createdSets.length,
      topic: firstStep?.topic ?? firstStep?.source ?? null,
      placedInFolder: createdSets.length > 0 && createdSets.every((quiz) => !!quiz.folderId),
      failedAll,
    });
    setMessages((prev) => prev.map((message) => (
      message.agentJobId === jobId ? { ...message, content: `${introText}\n\n${outcomeText}`, suggestions: followUps } : message
    )));

    addToast(result.summary, failedAll ? 'error' : result.errors.length ? 'warning' : 'success');
    if (isDocumentHidden() || !open) {
      void desktopNotify('StudyX — agent', result.summary);
    }

    if (studyPlanText && !failedAll) {
      setMessages((prev) => [...prev, { role: 'assistant', content: studyPlanText }]);
    }
  };

  /**
   * Turns an AgentPlan into a chat message: a confirm-card job when it proposes
   * steps, or just the plain reply when it doesn't (e.g. "no course found, want
   * me to guess?"). Shared by the folder/generation planner and the in-quiz
   * answer-dispute flow so both render through the same AgentJobCard UI.
   * Returns the created job id, or null when no job was created.
   */
  const presentAgentPlan = (plan: AgentPlan, originalText: string, activeMode: ChatMode): string | null => {
    if (plan.steps.length === 0) {
      if (plan.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: plan.reply, mode: activeMode }]);
      }
      return null;
    }

    const steps = plan.steps.map((step, index) => ({
      id: `s${index}`,
      label: describeStep(step),
      status: 'pending' as const,
      action: step.action,
      params: {
        packCount: step.packCount,
        questionsPerPack: step.questionsPerPack,
        count: step.count,
        difficulty: step.difficulty,
        questionType: step.questionType,
      },
    }));
    const jobId = useAgentJobsStore.getState().createJob(
      originalText,
      steps,
      plan.needsConfirm ? 'awaiting-confirm' : 'running',
      plan,
    );
    if (plan.needsConfirm) {
      useAgentJobsStore.getState().setJobStatus(jobId, 'awaiting-confirm', plan.confirmReason);
    }

    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: plan.reply || (plan.needsConfirm ? 'Am pregătit un plan. Confirmă ca să îl execut.' : 'Execut planul...'),
      mode: activeMode,
      agentJobId: jobId,
    }]);

    return jobId;
  };

  const tryHandleAgentCommand = async (text: string, activeMode: ChatMode): Promise<boolean> => {
    if (!hasKey) return false;

    // "mai încearcă" → re-run the last real command (same course/count). If there
    // is nothing to retry, let it fall through to normal chat.
    const retry = isRetryPhrase(text);
    const awaitingClarification = pendingClarificationRef.current;
    let commandText = text;
    if (retry) {
      if (!lastAgentCommandRef.current) return false;
      commandText = lastAgentCommandRef.current;
    } else if (!looksLikeAgentCommand(text) && !awaitingClarification) {
      // A reply to a clarifying question ("Cardiologie") rarely contains a verb
      // the regex would catch — but we just asked, so route it through the
      // planner anyway instead of treating it as small talk.
      return false;
    } else if (!awaitingClarification) {
      // Remember this genuine command so a later "mai încearcă" can repeat it.
      lastAgentCommandRef.current = text;
    }

    // Give the planner the recent thread so partial follow-ups resolve in context.
    const history = messagesRef.current
      .filter((message) => !message.agentJobId && message.content.trim())
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));

    setThinkingPhase(retry ? 'Reiau comanda anterioară…' : 'Analizez comanda…');
    let plan: AgentPlan;
    try {
      plan = await planAgentCommand(commandText, history, chatThread === 'rezidentiat' ? 'residency' : 'simple');
    } catch {
      return false;
    }

    if (!plan.isCommand || plan.steps.length === 0) {
      if (plan.needsClarification && plan.reply) {
        pendingClarificationRef.current = true;
        setMessages((prev) => [...prev, { role: 'assistant', content: plan.reply, mode: activeMode }]);
        return true;
      }
      // „Bagă-le în folder” fără țintă: nu lăsa chatul simplu să afirme că a salvat ceva; cere folderul.
      if (!plan.needsClarification && looksLikePlaceThemRequest(text)) {
        pendingClarificationRef.current = true;
        setMessages((prev) => [...prev, { role: 'assistant', content: PLACE_THEM_QUESTION, mode: activeMode }]);
        return true;
      }
      pendingClarificationRef.current = false;
      return false;
    }
    pendingClarificationRef.current = false;

    const jobId = presentAgentPlan(plan, text, activeMode);
    if (jobId && !plan.needsConfirm) {
      await runAgentJob(jobId);
    }
    return true;
  };

  /**
   * "Cred că e corect și varianta C" while looking at a quiz question — checks
   * the library first, proposes a correction (confirm-card) if warranted, and
   * NEVER falls back to general medical knowledge unless the student explicitly
   * allowed it in this same message (grantsGeneralKnowledgePermission).
   */
  const tryHandleAnswerDispute = async (text: string, activeMode: ChatMode): Promise<boolean> => {
    if (!hasKey) return false;
    if (!useQuizChatContextStore.getState().context) return false;
    if (!looksLikeAnswerDispute(text)) return false;

    setThinkingPhase('Verific afirmația ta…');
    let plan: AgentPlan;
    try {
      plan = await proposeAnswerCorrection(text, grantsGeneralKnowledgePermission(text));
    } catch {
      return false;
    }
    if (!plan.isCommand) return false;

    const jobId = presentAgentPlan(plan, text, activeMode);
    if (jobId && !plan.needsConfirm) {
      await runAgentJob(jobId);
    }
    return true;
  };

  /** Re-runs a failed job's original plan (e.g. after a rate-limit error) without making the user retype the command. */
  const retryAgentJob = async (jobId: string) => {
    const plan = useAgentJobsStore.getState().jobs.find((job) => job.id === jobId)?.plan;
    if (!plan) return;
    // Reset step statuses so the card doesn't show the previous attempt's
    // error/done icons while the retry is in flight.
    useAgentJobsStore.getState().setSteps(jobId, plan.steps.map((step, index) => ({
      id: `s${index}`,
      label: describeStep(step),
      status: 'pending' as const,
      action: step.action,
      params: {
        packCount: step.packCount,
        questionsPerPack: step.questionsPerPack,
        count: step.count,
        difficulty: step.difficulty,
        questionType: step.questionType,
      },
    })));
    await runAgentJob(jobId);
  };

  const cancelAgentJob = (jobId: string) => {
    useAgentJobsStore.getState().setJobStatus(jobId, 'cancelled', 'Anulat de utilizator.');
  };

  // Lets the confirm card tweak count/difficulty/type before execution instead of
  // forcing a cancel + retype when the planner guessed a parameter wrong.
  const editAgentStepParams = (jobId: string, stepId: string, patch: Partial<AgentStep>) => {
    const plan = useAgentJobsStore.getState().jobs.find((job) => job.id === jobId)?.plan;
    if (!plan) return;
    const index = Number(stepId.slice(1));
    const step = plan.steps[index];
    if (!step) return;
    const updated = { ...step, ...patch };
    const updatedPlan: AgentPlan = { ...plan, steps: plan.steps.map((s, i) => (i === index ? updated : s)) };
    useAgentJobsStore.getState().setJobPlan(jobId, updatedPlan);
    useAgentJobsStore.getState().updateStep(jobId, stepId, {
      label: describeStep(updated),
      params: {
        packCount: updated.packCount,
        questionsPerPack: updated.questionsPerPack,
        count: updated.count,
        difficulty: updated.difficulty,
        questionType: updated.questionType,
      },
    });
  };

  const undoAgentJob = (jobId: string) => {
    const undo = useAgentJobsStore.getState().jobs.find((job) => job.id === jobId)?.undo;
    if (!undo) return;
    undo();
    useAgentJobsStore.getState().setJobUndo(jobId, null);
    useAgentJobsStore.getState().setJobStatus(jobId, 'cancelled', 'Acțiunile au fost anulate (undo).');
    addToast('Am anulat acțiunile agentului.', 'info');
  };

  return {
    runAgentJob,
    presentAgentPlan,
    tryHandleAgentCommand,
    tryHandleAnswerDispute,
    cancelAgentJob,
    editAgentStepParams,
    undoAgentJob,
    retryAgentJob,
  };
}
