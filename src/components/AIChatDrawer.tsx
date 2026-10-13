import { buildAnswerQuizRequest } from '../lib/ai/answerQuizRequest';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Brain,
  Loader2,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useUIStore } from '../store/uiStore';
import { useOrganizareStore } from '../store/organizareStore';
import { describeStudyPlan } from '../lib/organizare';
import { useUserStore } from '../store/userStore';
import { useStatsStore } from '../store/statsStore';
import { useQuizStore } from '../store/quizStore';
import { profileGuard } from '../store/profileEpoch';
import { useAIStore } from '../store/aiStore';
import { historyWithoutFailedTurns, isSwitchProviderRequest, nextConfiguredProvider } from '../lib/ai/providerRetry';
import { isAppQuestion } from '../lib/ai/routerPolicy';
import { looksTruncated } from '../ai/helpers/answerChecklist';
import type { ServedInfo } from './ai-chat/servedBadge';
import { useFolderStore } from '../store/folderStore';
import { isResidencySource, resolveResidencyPlacement } from '../lib/rezidentiatPlacement';
import { useToastStore } from '../store/toastStore';
import { useAgentJobsStore } from '../store/agentJobsStore';
import Mascot from './Mascot';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLauncherDock } from './ai-chat/useLauncherDock';
import { useViewportProfile } from '../hooks/useViewportProfile';
import { buildUserContextString } from '../lib/aiContext';
import { buildScopedPerformanceSummary, scopedWeakTopics } from '../lib/ai/studyScope';
import { checkAndComplete, clarificationFor, queryForRetrieval } from './ai-chat/localAssist';
import { WHOLE_DOCUMENT_HEADING } from '../lib/ai/chapterQuizGeneration';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { buildChapterContext, detectChapterInQuestion } from '../lib/ai/chapterContext';
import { detectChatIntent, shouldApplyIntent } from '../lib/ai/intentRouter';
import { getProfileSummaryText } from '../ai/UserProfile';
import {
  buildContinuityRecap,
  clearThreadSummary,
  deriveConversationTone,
  formatMemoryBlock,
  getThreadLastActive,
  isMemoryEnabled,
  loadMemories,
  loadThreadSummary,
  markMemoriesUsed,
  mergeMemories,
  needsClinicalVerification,
  rebaseCoveredCount,
  saveMemories,
  saveThreadSummary,
  selectRelevantMemories,
  touchThreadActivity,
} from '../ai/chatMemory';
import type { Question, Quiz } from '../types';
import { advanceChatVisualRun, deriveChatVisualState, type ChatVisualRun, type ChatVisualState } from './ai-chat/chatVisualState';
import FreeKeysNotice from './ai-chat/FreeKeysNotice';
import { diversifyChunks, extractRelevantExcerpt } from './ai-chat/chatHelpers';
import ChatMessageBubble, { type ChatMessageActions } from './ai-chat/ChatMessageBubble';
import ChatComposer from './ai-chat/ChatComposer';
import ChatHeader from './ai-chat/ChatHeader';
import { useOptionCards } from './ai-chat/useOptionCards';
import StudioPanel from './ai-chat/StudioPanel';
import { citationFromSource, openBookCitation } from './ai-chat/citations';
import { buildNumberedContext } from '../ai/contextBuilder';
import { CHAT_STORAGE_KEY, useChatMessages } from './ai-chat/useChatMessages';
import { useChatThread } from './ai-chat/useChatThread';
import { useScopedSource } from './ai-chat/useScopedSource';
import { useAgentCommands } from './ai-chat/useAgentCommands';
import { useChatGlass } from './ai-chat/useChatGlass';
import { useSidebarInset } from './ai-chat/useSidebarInset';
import { useWindowSize } from '../hooks/useWindowSize';
import ConfirmDialog from './ConfirmDialog';
import { useStudioGeneration } from './ai-chat/useStudioGeneration';
import { filterSourcesByScope, retrievalFiltersForScope, type SourceScope } from '../lib/ai/sourceScope';
import {
  CHAT_MODES,
  buildFollowUpSuggestions,
  buildProactiveGreeting,
  buildRecommendedActions,
  type ChatMessage,
  type ChatMode,
  type Citation,
} from './ai-chat/shared';

let aiChatRuntimePromise: Promise<{
  generateChatResponse: typeof import('../ai/AIEngine').generateChatResponse;
  generateChatResponseStream: typeof import('../ai/AIEngine').generateChatResponseStream;
  summarizeConversation: typeof import('../ai/AIEngine').summarizeConversation;
  extractMemoryCandidates: typeof import('../ai/chatMemoryAI').extractMemoryCandidates;
  verifyClinicalAnswer: typeof import('../ai/chatMemoryAI').verifyClinicalAnswer;
  retrieveRelevantChunks: typeof import('../ai/retriever').retrieveRelevantChunks;
  getVaultChunksBySource: typeof import('../ai/vectorStore').getVaultChunksBySource;
}> | null = null;

function loadAIChatRuntime() {
  if (!aiChatRuntimePromise) {
    aiChatRuntimePromise = Promise.all([
      import('../ai/AIEngine'),
      import('../ai/retriever'),
      import('../ai/vectorStore'),
      import('../ai/chatMemoryAI'),
    ]).then(([engine, retriever, vectorStore, memoryAI]) => ({
      generateChatResponse: engine.generateChatResponse,
      generateChatResponseStream: engine.generateChatResponseStream,
      summarizeConversation: engine.summarizeConversation,
      extractMemoryCandidates: memoryAI.extractMemoryCandidates,
      verifyClinicalAnswer: memoryAI.verifyClinicalAnswer,
      retrieveRelevantChunks: retriever.retrieveRelevantChunks,
      getVaultChunksBySource: vectorStore.getVaultChunksBySource,
    }));
  }

  return aiChatRuntimePromise;
}

// Once a thread passes this many messages, older turns are compressed into a
// running summary so we keep continuity without resending the whole transcript.
/** Character budget of the numbered library context sent with a chat question. */
// ≈2300 tokeni (era 9000 caractere ≈ 2800): 5 fragmente încap, iar dublurile sunt deja eliminate în buildNumberedContext.
const CHAT_CONTEXT_CHARS = 7400;
const CONVERSATION_SUMMARY_THRESHOLD = 12;
const CONVERSATION_RECENT_KEEP = 6;
// A few long answers should trigger compression as well, not only message count.
const CONVERSATION_SUMMARY_CHARS = 5000;
// Durable-fact extraction runs every N student messages (and when the drawer closes),
// not on every turn — free-tier keys have tight rate limits.
const MEMORY_EXTRACT_EVERY = 5;

type DrawerView = 'chat' | 'studio';

export default function AIChatDrawer() {
  const theme = useTheme();
  const open = useUIStore((state) => state.chatOpen);
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const floatingUiSuppressed = useUIStore((state) => state.floatingUILocks.length > 0);
  // job.result lives in the global store (not local component state) so the
  // "jump straight in" CTA survives this drawer unmounting mid-job — see the
  // comment on AgentJob.result in agentJobsStore.ts.
  const agentJobs = useAgentJobsStore((state) => state.jobs);
  const hasRunningAgentJob = agentJobs.some((job) => job.status === 'running');
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const quizzes = useQuizStore((state) => state.quizzes);
  const addQuiz = useQuizStore((state) => state.addQuiz);
  const knowledgeSources = useAIStore((state) => state.knowledgeSources);
  const hasKey = useAIStore((state) => state.hasKey);
  const providerKeys = useAIStore((state) => state.providerKeys);
  const recordAIInteraction = useAIStore((state) => state.recordAIInteraction);
  const memoryContext = useAIStore((state) => (
    activeProfileId ? state.getAIMemoryContext(activeProfileId) : ''
  ));
  const memoryInteractions = useAIStore((state) =>
    activeProfileId ? (state.studyMemory[activeProfileId]?.interactions ?? 0) : 0
  );
  const addToast = useToastStore((state) => state.addToast);
  const questionStats = useStatsStore((state) => state.questionStats);
  const streak = useStatsStore((state) => state.streak);
  const { calmMotion, performanceLite, t } = useAdaptiveMotion();
  const { mobile } = useViewportProfile();
  // Full-window glass mode: the chat fills the window next to the app sidebar, with
  // adjustable transparency + blur. Desktop only — phones already get a full-width sheet.
  const glass = useChatGlass();
  const immersive = glass.settings.immersive && !mobile;
  const sidebarInset = useSidebarInset(open && immersive);
  const windowSize = useWindowSize();
  const quizFolders = useFolderStore((state) => state.folders);
  const aiLibraryFolders = useAIStore((state) => state.libraryFolders);
  const [glassPanelOpen, setGlassPanelOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const { scopedSource, setScopedSource, contextCacheRef } = useScopedSource();
  // Rezidențiat gets its own isolated conversation, live anywhere inside that
  // section (the Residency page, its folders, its quizzes) — not just on
  // the /rezidentiat route itself.
  const chatThread = useChatThread();
  const { messages, setMessages, messagesRef, chatEndRef } = useChatMessages({ open, calmMotion, thread: chatThread });
  
  const [activeQuizContext, setActiveQuizContext] = useState<{
    questionText: string;
    correctAnswerText: string;
    userAnswerText: string;
    studyFocus?: string;
  } | null>(null);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [visualRun, setVisualRun] = useState<ChatVisualRun | null>(null);
  const visualRunId = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualContext = `${activeProfileId ?? ''}:${chatThread}`;
  const visualState = deriveChatVisualState(visualRun, visualContext, hasKey);
  const beginVisualRun = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    const id = ++visualRunId.current;
    setVisualRun({ id, context: visualContext, state: 'waiting' });
    return id;
  };
  const updateVisualRun = (id: number, state: ChatVisualState) => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    setVisualRun((run) => advanceChatVisualRun(run, id, state));
    if (state === 'success') {
      successTimerRef.current = setTimeout(() => {
        setVisualRun((run) => (run?.id === id && run?.state === 'success' ? { ...run, state: 'idle' } : run));
      }, 3500);
    }
  };

  useEffect(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    setVisualRun(null);
  }, [activeProfileId, chatThread, open]);

  useEffect(() => {
    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);
  const [thinkingPhase, setThinkingPhase] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('grounded');
  const [manualMode, setManualMode] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const navigate = useNavigate();
  const [activeCitationKey, setActiveCitationKey] = useState<string | null>(null);
  const [view, setView] = useState<DrawerView>('chat');
  /** Chat sheet widened to studio size — schemas and tables need the room. */
  const [wideChat, setWideChat] = useState(false);
  /** Secondary header controls (widen, regenerate, clear) live behind one "⋯" instead of competing icons. */
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  /** Markup of a schema/table opened full-screen from a message. */
  const [zoomedBlock, setZoomedBlock] = useState<string | null>(null);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  // Curriculum chapter (name, book, pages, indexed text) sent by an Organizare topic action; used for the whole conversation.
  const chapterContextRef = useRef('');
  /** Chapter heading the student is working in; boosts matching book chunks in retrieval. */
  const chapterScopeRef = useRef<{ headings: string[]; sourceId?: string } | null>(null);
  // Set when the user hits Stop — lets non-abortable generators (flashcards /
  // grile) discard their result instead of surprising the user after a stop.
  const generationAbortedRef = useRef(false);
  const generationStopCountRef = useRef(0);
  // Running compressed summary of older turns + how many messages it covers.
  const conversationSummaryRef = useRef<string>('');
  const summaryCoveredCountRef = useRef<number>(0);
  const summarizingRef = useRef<boolean>(false);
  // Which thread the summary refs currently belong to — an in-flight summarization
  // that finishes after a thread switch must not overwrite the other thread's summary.
  const summaryThreadRef = useRef<string>(chatThread);
  const extractingRef = useRef(false);
  const extractedUpToRef = useRef(0);
  const wasOpenRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  const [recapDismissed, setRecapDismissed] = useState(false);

  // Each chat thread only sees its own library: Rezidențiat books never show up in the general chat (or its Studio), and vice versa.
  const sourceScope: SourceScope = chatThread === 'rezidentiat' ? 'rezidentiat' : 'general';
  const readySources = useMemo(
    () => filterSourcesByScope(knowledgeSources.filter((source) => source.indexStatus === 'ready'), aiLibraryFolders, sourceScope),
    [knowledgeSources, aiLibraryFolders, sourceScope],
  );

  // A document in focus from the other library (e.g. after moving between the general chat and Rezidențiat) is dropped.
  useEffect(() => {
    if (!scopedSource) return;
    const known = knowledgeSources.find((source) => source.id === scopedSource.id);
    if (known && filterSourcesByScope([known], aiLibraryFolders, sourceScope).length === 0) setScopedSource(null);
  }, [scopedSource, knowledgeSources, aiLibraryFolders, sourceScope, setScopedSource]);

  const studio = useStudioGeneration({
    readySources,
    hasKey,
    activeProfileId,
    scopedSource,
    setScopedSource,
    contextCacheRef,
    setMessages,
    setThinkingPhase,
    setView,
    generationAbortedRef,
    generationStopCountRef,
    loadAIChatRuntime,
    isResidencyThread: chatThread === 'rezidentiat',
  });
  const {
    setStudioSourceId,
    studioHeading, setStudioHeading,
    studioPackCount,
    studioQuestionsPerPack,
    setStudioExamStyle,
    setStudioGenerating,
    selectedStudioSource,
    tryHandleStudioCommand,
    tryHandleFlashcardCommand,
  } = studio;

  // Where Studio will file the generated packs for Rezidențiat material (shown instead of a folder picker).
  const studioResidencyPlacement = useMemo(() => {
    if (!selectedStudioSource) return null;
    if (chatThread !== 'rezidentiat' && !isResidencySource(selectedStudioSource, aiLibraryFolders)) return null;
    return resolveResidencyPlacement(
      selectedStudioSource.name,
      studioHeading === WHOLE_DOCUMENT_HEADING ? null : studioHeading,
      quizFolders,
    );
  }, [selectedStudioSource, chatThread, aiLibraryFolders, studioHeading, quizFolders]);

  const {
    runAgentJob,
    tryHandleAgentCommand,
    tryHandleAnswerDispute,
    cancelAgentJob,
    editAgentStepParams,
    undoAgentJob,
    retryAgentJob,
  } = useAgentCommands({
    hasKey,
    messagesRef,
    setMessages,
    setThinkingPhase,
    studioPackCount,
    studioQuestionsPerPack,
    chatThread,
  });

  const { tryHandleOptionRequest, editOptionCard, submitOptionCard, cancelOptionCard } = useOptionCards({ setMessages, messagesRef, chatThread });

  const activeModeConfig = useMemo(
    () => CHAT_MODES.find((entry) => entry.id === mode) ?? CHAT_MODES[0],
    [mode],
  );

  // What each chat knows about progress is limited to its own material (general vs Rezidențiat quizzes).
  const performanceSummary = useMemo(
    () => buildScopedPerformanceSummary(sourceScope, questionStats, streak, quizzes),
    [sourceScope, questionStats, quizzes, streak],
  );

  const weakTopics = useMemo(() => {
    const answeredCount = Object.keys(questionStats).length;
    const quizCount = quizzes.length;
    const streakCount = streak.currentStreak;
    if (!activeProfileId || (answeredCount === 0 && quizCount === 0 && streakCount === 0)) {
      return [];
    }
    return scopedWeakTopics(activeProfileId, sourceScope, quizzes, 4, questionStats);
  }, [activeProfileId, questionStats, quizzes, sourceScope, streak.currentStreak]);

  const planSummary = useOrganizareStore((state) => (activeProfileId ? state.byProfile[activeProfileId]?.summary : undefined));

  const studyContext = useMemo(() => {
    const baseContext = buildUserContextString(performanceSummary);
    const planText = describeStudyPlan(planSummary, new Date());
    const focusText = weakTopics.length > 0
      ? `Focus recomandat acum: ${weakTopics.map((topic) => `${topic.topic} ${topic.accuracy}%`).join(', ')}.`
      : '';
    const longTermMemory = activeProfileId ? getProfileSummaryText(activeProfileId) : '';
    const longTermText = longTermMemory ? `Memorie pe termen lung: ${longTermMemory}` : '';
    return [baseContext, focusText, planText, memoryContext, longTermText].filter(Boolean).join(' ');
  }, [activeProfileId, memoryContext, performanceSummary, planSummary, weakTopics]);

  const recommendedActions = useMemo(
    () => buildRecommendedActions(weakTopics, performanceSummary.dueCount, scopedSource?.name),
    [performanceSummary.dueCount, scopedSource?.name, weakTopics],
  );

  const smartMode = useMemo<ChatMode>(() => {
    if (scopedSource) return 'summarize';
    if (performanceSummary.dueCount > 0) return 'summarize';
    return 'grounded';
  }, [performanceSummary.dueCount, scopedSource]);


  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        prompt?: string;
        mode?: ChatMode;
        open?: boolean;
        sourceId?: string;
        sourceName?: string;
        heading?: string;
        chapterContext?: string;
        resetConversation?: boolean;
        view?: DrawerView;
        examStyle?: 'residency';
        quizContext?: {
          questionText: string;
          correctAnswerText: string;
          userAnswerText: string;
          studyFocus?: string;
        };
      }>).detail;

      if (!detail?.prompt && !detail?.quizContext) return;
      if (detail.open) setChatOpen(true);
      if (detail.view) setView(detail.view);
      // Explicit request (Residency page) — the Studio's exam-style track is
      // its own toggle, not derived from the prompt text, so a chapter
      // generation dispatched as exam-scoped has to set it directly.
      if (detail.examStyle) setStudioExamStyle(detail.examStyle);
      // Only a chapter-scoped event may move the Studio's chapter selection.
      // Resetting unconditionally meant any plain chat prompt ("Discută
      // răspunsul", "Debrief cu AI Coach") silently threw away a chapter the
      // user had picked in Studio.
      chapterContextRef.current = detail.chapterContext ?? '';
      chapterScopeRef.current = detail.chapterContext && detail.heading && detail.heading !== WHOLE_DOCUMENT_HEADING
        ? { headings: [detail.heading], ...(detail.sourceId ? { sourceId: detail.sourceId } : {}) }
        : null;
      if (detail.heading) setStudioHeading(detail.heading);
      else if (detail.sourceId) setStudioHeading(WHOLE_DOCUMENT_HEADING);

      if (detail.resetConversation) {
        setMessages([]);
        setActiveCitationKey(null);
        setManualMode(false);
        setActiveQuizContext(null);
        contextCacheRef.current.clear();
        conversationSummaryRef.current = '';
        summaryCoveredCountRef.current = 0;
        extractedUpToRef.current = 0;
        if (activeProfileId) clearThreadSummary(activeProfileId, chatThread);
      }

      if (detail.quizContext) {
        setActiveQuizContext(detail.quizContext);
      }

      if (detail.sourceId && detail.sourceName) {
        setScopedSource({ id: detail.sourceId, name: detail.sourceName });
        setStudioSourceId(detail.sourceId);
        contextCacheRef.current.clear();
      } else if (detail.resetConversation) {
        setScopedSource(null);
      }

      if (detail.mode) {
        setMode(detail.mode);
        setManualMode(true);
      }

      if (detail.prompt) setInput(detail.prompt);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    window.addEventListener('studyx:ai-prompt', handler as EventListener);
    return () => window.removeEventListener('studyx:ai-prompt', handler as EventListener);
  }, [activeProfileId, chatThread, contextCacheRef, setChatOpen, setMessages, setScopedSource, setStudioHeading, setStudioSourceId, setStudioExamStyle]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
  }, [input]);

  useEffect(() => {
    if (!open || manualMode || mode === smartMode) return;
    setMode(smartMode);
  }, [manualMode, mode, open, smartMode]);

  const buildScopedContext = async (text: string, sourceIdOverride?: string | null) => {
    const { retrieveRelevantChunks } = await loadAIChatRuntime();
    const targetSourceId = sourceIdOverride ?? scopedSource?.id ?? null;
    // „Unde găsesc butonul de reindexare?” nu se caută în cărți: ar aduce și cita fragmente medicale fără legătură.
    if (!targetSourceId && isAppQuestion(text)) return [];
    // Ajutător cu cost 0 (implicit activ doar cu AI local): abrevieri/sinonime/fără formule de comandă pentru regăsire.
    const searchText = queryForRetrieval(text);

    if (!targetSourceId) {
      const scopeFilters = retrievalFiltersForScope(knowledgeSources, aiLibraryFolders, sourceScope);
      if (scopeFilters === null) return [];
      const candidates = await retrieveRelevantChunks(searchText, null, 8, { ...scopeFilters, ...(chapterScopeRef.current ? { activeScope: chapterScopeRef.current } : {}) });
      return diversifyChunks(candidates, 5);
    }

    const scopedChunks = await retrieveRelevantChunks(searchText, null, 5, { sourceIds: [targetSourceId] });
    if (scopedChunks.length > 0) {
      return scopedChunks.slice(0, 5);
    }

    // Retrieval-ul semantic nu a găsit nimic relevant în sursa scopată. NU injectăm primele N chunk-uri cu
    // score forțat — ar ancora modelul în text posibil nerelevant (cuprins/introducere) și ar da răspunsuri
    // înșelătoare. Lăsăm răspunsul neancorat (chatul anunță că nu a găsit context).
    return [];
  };

  const stopGeneration = () => {
    updateVisualRun(visualRunId.current, 'stopped');
    // Abort the streaming chat if one is live…
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    // …and signal the non-streaming generators (flashcards / grile) to drop their
    // result, then release the UI immediately so the button always does something.
    generationAbortedRef.current = true;
    generationStopCountRef.current += 1;
    setLoading(false);
    setThinkingPhase(null);
    setStudioGenerating(false);
  };

  // Background context compression: once the thread is long, fold all but the
  // most recent turns into a running summary. Non-blocking — runs after a reply.
  const maybeCompressConversation = async () => {
    if (summarizingRef.current) return;
    const current = messagesRef.current;
    const uncoveredChars = current.slice(summaryCoveredCountRef.current).reduce((sum, m) => sum + m.content.length, 0);
    if (current.length < CONVERSATION_SUMMARY_THRESHOLD && uncoveredChars < CONVERSATION_SUMMARY_CHARS) return;
    if (current.length - summaryCoveredCountRef.current < CONVERSATION_RECENT_KEEP) return;

    const cutoff = current.length - CONVERSATION_RECENT_KEEP;
    const olderSlice = current
      .slice(0, cutoff)
      .filter((m) => !m.agentJobId && m.content.trim())
      .map(({ role, content }) => ({ role, content }));
    if (olderSlice.length === 0) return;

    const startedThread = summaryThreadRef.current;
    const startedProfile = activeProfileId;
    summarizingRef.current = true;
    try {
      const { summarizeConversation } = await loadAIChatRuntime();
      const summary = await summarizeConversation(olderSlice, conversationSummaryRef.current);
      if (summary) {
        if (startedProfile) {
          saveThreadSummary(startedProfile, startedThread, { summary, covered: cutoff, total: current.length });
        }
        // The thread may have changed while we waited — only the live one owns the refs.
        if (summaryThreadRef.current === startedThread) {
          conversationSummaryRef.current = summary;
          summaryCoveredCountRef.current = cutoff;
        }
      }
    } catch {
      // best-effort — keep the previous summary
    } finally {
      summarizingRef.current = false;
    }
  };

  // Long-term memory: distill durable facts about the student (goals, preferences,
  // recurring difficulties) from the newest exchanges. Background, best-effort.
  const maybeExtractMemory = async (force = false) => {
    if (!activeProfileId || !isMemoryEnabled() || extractingRef.current) return;
    const current = messagesRef.current;
    const from = extractedUpToRef.current > current.length ? 0 : extractedUpToRef.current;
    const fresh = current.slice(from).filter((m) => !m.agentJobId && m.content.trim());
    const studentTurns = fresh.filter((m) => m.role === 'user').length;
    if (studentTurns === 0 || (!force && studentTurns < MEMORY_EXTRACT_EVERY)) return;

    const profileId = activeProfileId;
    const scannedUpTo = current.length;
    extractingRef.current = true;
    try {
      const { extractMemoryCandidates } = await loadAIChatRuntime();
      const candidates = await extractMemoryCandidates(
        fresh.map(({ role, content }) => ({ role, content })),
        loadMemories(profileId),
      );
      extractedUpToRef.current = scannedUpTo;
      if (candidates.length > 0) saveMemories(profileId, mergeMemories(loadMemories(profileId), candidates));
    } catch {
      // best-effort — the same turns are retried next time
    } finally {
      extractingRef.current = false;
    }
  };

  // Second look at answers carrying doses/thresholds/scores. Runs after the reply is
  // already on screen and only appends a note when a claim is confidently wrong.
  const verifyAnswerInBackground = async (answer: string, grounding: string) => {
    if (!needsClinicalVerification(answer)) return;
    try {
      const { verifyClinicalAnswer } = await loadAIChatRuntime();
      const issues = await verifyClinicalAnswer(answer, grounding);
      if (issues.length === 0) return;
      const note = '\n\n**Verificare automată** (poate greși și ea — confirmă în curs sau ghid):\n'
        + issues.map((issue) => `- «${issue.claim}» — ${issue.reason}`).join('\n');
      setMessages((prev) => {
        const index = prev.map((m) => m.content).lastIndexOf(answer);
        if (index < 0) return prev;
        const next = [...prev];
        next[index] = { ...next[index], content: answer + note };
        return next;
      });
    } catch {
      // fail open — no note
    }
  };

  // Restore the persisted summary of whichever thread is live; the summary used to
  // live only in refs, so it vanished on reload and leaked across thread switches.
  useEffect(() => {
    summaryThreadRef.current = chatThread;
    const saved = activeProfileId ? loadThreadSummary(activeProfileId, chatThread) : null;
    conversationSummaryRef.current = saved?.summary ?? '';
    summaryCoveredCountRef.current = saved ? rebaseCoveredCount(saved, messagesRef.current.length) : 0;
    // History that was already on disk was scanned in an earlier session.
    extractedUpToRef.current = messagesRef.current.length;
  }, [activeProfileId, chatThread, messagesRef]);

  // Closing the drawer flushes pending compression + memory extraction.
  useEffect(() => {
    flushRef.current = () => {
      void maybeCompressConversation();
      void maybeExtractMemory(true);
    };
  });
  useEffect(() => {
    if (wasOpenRef.current && !open) flushRef.current();
    wasOpenRef.current = open;
  }, [open]);

  // Deterministic "where we left off" card after a break (no LLM call).
  const continuityRecap = useMemo(() => {
    if (!open || !activeProfileId || !isMemoryEnabled()) return null;
    return buildContinuityRecap({
      memories: loadMemories(activeProfileId),
      summary: loadThreadSummary(activeProfileId, chatThread)?.summary ?? '',
      dueCount: performanceSummary.dueCount,
      weakTopic: weakTopics[0]?.topic,
      lastActiveAt: getThreadLastActive(activeProfileId, chatThread),
    });
  }, [open, activeProfileId, chatThread, performanceSummary.dueCount, weakTopics]);

  useEffect(() => {
    if (open) setRecapDismissed(false);
  }, [open, chatThread]);

  const sendMessage = async (overrideText?: string, modeOverride?: ChatMode) => {
    const text = (overrideText || input).trim();
    if ((!text && !pastedImage) || loading) return;
    generationAbortedRef.current = false;
    const visualId = beginVisualRun();
    // Delegated commands handle their own outcome; only a completed answer is celebrated.
    let visualOutcome: ChatVisualState = 'idle';
    let chunkFrame = 0;

    // Auto-detect the conversational mode from the message unless the user has
    // explicitly pinned one (manualMode) or an override is passed in. We apply it
    // to this message's activeMode only (not the persistent `mode` chip) so it
    // doesn't fight the default-mode effect; the chosen mode is surfaced as a
    // badge on the assistant reply.
    let activeMode = modeOverride ?? mode;
    let autoDetectedMode = false;
    if (!modeOverride && !manualMode && text) {
      const intent = detectChatIntent(text);
      if (shouldApplyIntent(intent)) {
        activeMode = intent.mode;
        autoDetectedMode = activeMode !== mode;
      }
    }
    const imageSnapshot = pastedImage;
    const userMsg: ChatMessage = { role: 'user', content: text || 'Imagine atașată', mode: activeMode, ...(imageSnapshot ? { hadImage: true } : {}) };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPastedImage(null);
    setLoading(true);
    setThinkingPhase('Mă gândesc…');
    setActiveCitationKey(null);
    // recordAIInteraction is called after citations are available (below in the streaming path).

    const abortCtrl = new AbortController();
    streamAbortRef.current = abortCtrl;

    try {
      // In-quiz answer disputes take priority over everything else, but only
      // fire when useQuizChatContextStore actually has an active question —
      // otherwise this never intercepts normal conversation.
      // „Comutarea la alt AI” is a command for the app, not a question for the (possibly failing) model.
      if (!imageSnapshot && isSwitchProviderRequest(text)) {
        const note = switchToNextProvider();
        setMessages((prev) => [...prev, { role: 'assistant', content: note, mode: activeMode }]);
        return;
      }
      const disputeHandled = !imageSnapshot && await tryHandleAnswerDispute(text, activeMode);
      if (disputeHandled) return;

      // Flashcard requests are handled deterministically first so they work even
      // when the LLM planner is rate-limited, and never get misrouted to grile.
      // „Fă-mi flashcarduri / grile despre X”: întreabă nivelul, numărul și folderul (sau generează direct dacă a spus tot).
      const optionHandled = !imageSnapshot && tryHandleOptionRequest(text);
      if (optionHandled) return;

      const flashcardHandled = !imageSnapshot && await tryHandleFlashcardCommand(text, activeMode);
      if (flashcardHandled) return;

      const agentHandled = !imageSnapshot && await tryHandleAgentCommand(text, activeMode);
      if (agentHandled) return;

      const commandHandled = !imageSnapshot && await tryHandleStudioCommand(text, activeMode);
      if (commandHandled) return;

      // A normal question sent while the Studio drawer is open would stream its answer
      // behind the drawer's backdrop, so bring the conversation back into view.
      if (view === 'studio') setView('chat');

      // ── Vision path: user pasted an image ────────────────────────────────
      if (imageSnapshot) {
        const { groqVisionRequest, supportsVision } = await import('../lib/groq');
        const { useAIStore: store } = await import('../store/aiStore');
        if (!supportsVision(store.getState().provider)) {
          visualOutcome = 'error';
          addToast('Vision necesită Groq. Schimbă providerul în Setări AI.', 'warning');
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: 'Analiza imaginilor necesită Groq ca provider. Schimbă în Setări AI.',
          }]);
          return;
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: '', mode: activeMode }]);
        const visionPrompt = text
          ? `${text}\n\nContextul imaginii atașate:`
          : 'Analizează această imagine medicală/clinică. Descrie ce observi, ce diagnostic sau interpretare sugerezi, și ce aspecte sunt relevante pentru un student la medicină.';
        const visionResponse = await groqVisionRequest(imageSnapshot, visionPrompt, abortCtrl.signal);
        visualOutcome = 'success';
        updateVisualRun(visualId, 'streaming');
        const words = visionResponse.split(' ');
        let current = '';
        for (let i = 0; i < words.length; i += 10) {
          current += (current ? ' ' : '') + words.slice(i, i + 10).join(' ');
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: current };
            return next;
          });
          if (i + 10 < words.length) await new Promise((r) => setTimeout(r, 30));
        }
        return;
      }

      // Mesaj fără niciun subiect („explică-mi asta” fără istoric): o întrebare scurtă, 0 tokeni, în loc de un răspuns slab.
      const clarification = clarificationFor(text, {
        hasHistory: messages.some((m) => m.role === 'assistant' && m.content.trim().length > 0),
        hasScopedSource: !!scopedSource,
      });
      if (clarification) {
        setMessages((prev) => [...prev, { role: 'assistant', content: clarification, mode: activeMode }]);
        return;
      }

      // ── Regular streaming chat path ───────────────────────────────────────
      setThinkingPhase(readySources.length > 0 ? 'Caut în biblioteca ta…' : 'Pregătesc răspunsul…');
      const { generateChatResponseStream } = await loadAIChatRuntime();
      const contextCacheKey = `${text.slice(0, 120)}::${scopedSource?.id ?? ''}`;
      const cachedChunks = contextCacheRef.current.get(contextCacheKey);
      const contextChunks = cachedChunks ?? await buildScopedContext(text);
      if (!cachedChunks) contextCacheRef.current.set(contextCacheKey, contextChunks);
      // Numbered sources: the model cites them inline as [n]; the same list drives the clickable chips.
      const numbered = buildNumberedContext(contextChunks, CHAT_CONTEXT_CHARS);
      const citations: Citation[] = numbered.sources.map((source) => {
        const chunk = contextChunks.find((entry) => entry.id === source.id);
        return {
          ...citationFromSource(source, chunk?.topic),
          excerpt: chunk ? extractRelevantExcerpt(chunk.text, text) : source.excerpt,
        };
      });

      const contextSummary = numbered.context;

      // The engine trims this to a character budget; hand it a generous tail.
      const historyForAI = [...historyWithoutFailedTurns(messages).slice(-24), userMsg]
        .map(({ role, content }) => ({ role, content }));
      const previousUserText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const relevantMemories = activeProfileId && isMemoryEnabled()
        ? selectRelevantMemories(loadMemories(activeProfileId), `${text} ${previousUserText}`)
        : [];
      if (activeProfileId && relevantMemories.length > 0) {
        markMemoriesUsed(activeProfileId, relevantMemories.map((m) => m.id));
      }
      const tone = deriveConversationTone(text, new Date().getHours());
      let streamedAnswer = '';
      setRecapDismissed(true);
      if (activeProfileId) touchThreadActivity(activeProfileId, chatThread);
      const scopePrefix = scopedSource ? `Document țintă: ${scopedSource.name}\n` : '';
      const chapterFromQuestion = chapterContextRef.current ? null : detectChapterInQuestion(text);
      const chapterBlock = chapterContextRef.current
        || (chapterFromQuestion ? (await buildChapterContext(chapterFromQuestion)).context : '');
      const chapterPrefix = chapterBlock ? `${chapterBlock}\n\n` : '';
      const quizContextPrefix = activeQuizContext 
        ? `[CONTEXT TUTOR]\nUtilizatorul rezolvă o grilă și discută despre ea.\nÎntrebare: ${activeQuizContext.questionText}\nRăspuns corect: ${activeQuizContext.correctAnswerText}\nRăspunsul utilizatorului: ${activeQuizContext.userAnswerText}\nFocus recomandat: ${activeQuizContext.studyFocus ?? 'Niciunul'}\n\n` 
        : '';

      const suggestions = buildFollowUpSuggestions(
        text,
        citations,
        activeMode,
        scopedSource?.name,
        weakTopics[0]?.topic,
      );

      if (activeProfileId) {
        recordAIInteraction(activeProfileId, {
          mode: activeMode,
          prompt: text,
          scopedSourceName: scopedSource?.name,
          citationsCount: citations.length,
        });
      }

      // Add empty assistant message then fill it via streaming.
      setMessages((prev) => [...prev, { role: 'assistant', content: '', citations, suggestions, mode: activeMode, autoMode: autoDetectedMode }]);

      // Tokens arrive dozens of times a second; the list is repainted at most once per frame with everything
      // that arrived since, and flushed synchronously when the stream ends or is stopped.
      let pendingChunk = '';
      chunkFrame = 0;
      const flushChunk = () => {
        chunkFrame = 0;
        const piece = pendingChunk;
        pendingChunk = '';
        if (!piece) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + piece };
          }
          return next;
        });
      };
      try {
      // `as`: variabilele se schimbă în callback-uri, iar TypeScript le-ar îngusta la `null`.
      let servedInfo = null as ServedInfo | null;
      let finishReason = null as string | null;
      let hasStreamed = false;
      const finalText = await generateChatResponseStream(
        text,
        `${chapterPrefix}${quizContextPrefix}${scopePrefix}${contextSummary}`,
        historyForAI,
        (chunk) => {
          if (abortCtrl.signal.aborted) return;
          if (chunk && !hasStreamed) {
            hasStreamed = true;
            updateVisualRun(visualId, 'streaming');
          }
          streamedAnswer += chunk;
          pendingChunk += chunk;
          if (!chunkFrame) chunkFrame = requestAnimationFrame(flushChunk);
        },
        {
          mode: activeMode,
          hasContext: contextChunks.length > 0,
          scopedSourceName: scopedSource?.name,
          studyContext,
          focusTopics: weakTopics.map((topic) => topic.topic),
          conversationSummary: conversationSummaryRef.current,
          personalMemory: formatMemoryBlock(relevantMemories),
          tone,
          onServed: (info) => { servedInfo = { provider: info.provider, model: info.model, local: false }; },
          onFinish: (reason) => { finishReason = reason; },
        },
        abortCtrl.signal,
      );
      if (!abortCtrl.signal.aborted) {
        // Modelele mici pot intra în buclă: valoarea întoarsă de flux e cea curățată, deci o păstrăm pe ea (nu pe ce s-a afișat deja).
        if (finalText && finalText !== streamedAnswer) streamedAnswer = finalText;
        // Ajutător gratuit (0 tokeni): neutralizează afirmațiile inventate („am salvat/am creat”).
        let finalTextOverride: string | undefined;
        if (streamedAnswer.trim()) {
          try {
            const cleaned = await checkAndComplete({ answer: streamedAnswer });
            if (cleaned !== streamedAnswer) {
              streamedAnswer = cleaned;
              finalTextOverride = cleaned;
            }
          } catch {
            // ajutătorul nu are voie să strice răspunsul deja primit
          }
        }
        // „Continuă”: furnizorul a oprit la limita de lungime sau, când nu spune nimic, răspunsul pare tăiat la mijloc de propoziție.
        const answerTruncated = finishReason === 'length' || (finishReason === null && looksTruncated(finalTextOverride ?? streamedAnswer));
        // Insigna „cine a răspuns”.
        const servedMeta: ServedInfo | undefined = servedInfo ?? undefined;
        // Ce era încă în așteptare de afișat nu mai are rost: textul final îl înlocuiește (altfel s-ar adăuga a doua oară).
        if (finalText) {
          if (chunkFrame) cancelAnimationFrame(chunkFrame);
          chunkFrame = 0;
          pendingChunk = '';
        }
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            const shownText = finalTextOverride ?? finalText;
            next[next.length - 1] = {
              ...last,
              ...(shownText ? { content: shownText } : {}),
              ...(answerTruncated ? { truncated: true } : {}),
              ...(servedMeta ? { served: servedMeta } : {}),
            };
          }
          return next;
        });
      }
      } finally {
        if (chunkFrame) cancelAnimationFrame(chunkFrame);
        flushChunk();
      }

      visualOutcome = streamedAnswer.trim() ? 'success' : 'error';

      // If stream finished but produced no content (API hiccup), show a fallback.
      if (!abortCtrl.signal.aborted) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last.role === 'assistant' && !last.content.trim()) {
            next[next.length - 1] = { ...last, content: 'Nu am primit un răspuns de la AI. Verifică conexiunea și încearcă din nou.' };
          }
          return next;
        });
        // Refresh the compressed conversation memory in the background.
        void maybeCompressConversation();
        void maybeExtractMemory();
        void verifyAnswerInBackground(streamedAnswer, contextSummary);
        // Remember who wrote the answer, so "Verifică cu alt model" can pick a different provider.
        const { getLastServedModel } = await import('../lib/groq');
        const served = getLastServedModel();
        if (served) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, producer: served };
            return next;
          });
        }
      }
    } catch (err: unknown) {
      visualOutcome = 'error';
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        visualOutcome = 'stopped';
        // Stopped before the first chunk: don't leave an empty bubble behind (it was also being saved).
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === 'assistant' && !last.content ? prev.slice(0, -1) : prev;
        });
        return;
      }
      const errorMessage = friendlyAIError(err);
      setMessages((prev) => {
        // The streaming path already pushed an empty assistant placeholder before the request
        // could fail. Replace it with a plain error message, dropping the placeholder's
        // citations/suggestions, which would otherwise render context chips and quiz/flashcard
        // actions under an error text.
        const last = prev[prev.length - 1];
        const errorBubble = { role: 'assistant' as const, content: errorMessage, isError: true };
        if (last?.role === 'assistant' && !last.content) return [...prev.slice(0, -1), errorBubble];
        return [...prev, errorBubble];
      });
    } finally {
      if (chunkFrame) {
        cancelAnimationFrame(chunkFrame);
        chunkFrame = 0;
      }
      updateVisualRun(visualId, abortCtrl.signal.aborted ? 'stopped' : visualOutcome);
      if (streamAbortRef.current === abortCtrl) {
        streamAbortRef.current = null;
        setLoading(false);
        setThinkingPhase(null);
      }
    }
  };

  const closeChat = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    setVisualRun(null);
    setChatOpen(false);
    setScopedSource(null);
    setActiveCitationKey(null);
    setManualMode(false);
    setView('chat');
    contextCacheRef.current.clear();
  };

  const clearConversation = () => {
    setVisualRun(null);
    setMessages([]);
    setActiveCitationKey(null);
    conversationSummaryRef.current = '';
    summaryCoveredCountRef.current = 0;
    extractedUpToRef.current = 0;
    if (activeProfileId) clearThreadSummary(activeProfileId, chatThread);
    const activeStorageKey = chatThread === 'rezidentiat' ? `${CHAT_STORAGE_KEY}:rezidentiat` : CHAT_STORAGE_KEY;
    try { localStorage.removeItem(activeStorageKey); } catch { /* ignore */ }
  };

  // ── Per-response actions (hover) ───────────────────────────────────────────
  const copyMessageToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      addToast('Răspuns copiat.', 'success');
    } catch {
      addToast('Nu am putut copia răspunsul.', 'error');
    }
  };

  const saveAnswerAsFlashcard = (index: number) => {
    const answer = messages[index];
    const prev = messages[index - 1];
    const front = (prev?.role === 'user' ? prev.content : '').trim() || 'Recapitulare din chat';
    const back = answer.content.trim();
    if (!back) return;
    const card: Question = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      text: front,
      multipleCorrect: false,
      difficulty: 'medium',
      explanation: '',
      options: [{ id: 'a', text: back, isCorrect: true }],
    };
    const deck: Quiz = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      title: `Flashcard din chat · ${new Date().toLocaleDateString('ro-RO')}`,
      description: 'Salvat din conversația cu StudyX AI.',
      emoji: '🃏',
      color: 'purple',
      category: 'AI Flashcards',
      kind: 'flashcard',
      folderId: null,
      shuffleQuestions: false,
      shuffleAnswers: false,
      tags: ['flashcard', 'ai', 'chat'],
      questions: [card],
      createdAt: Date.now(),
    };
    addQuiz(deck);
    addToast('Am salvat un flashcard din răspuns.', 'success');
  };

  /** Moves the active provider to the next one that has a key; returns a sentence for the user. */
  const switchToNextProvider = (): string => {
    const names: Record<string, string> = { groq: 'Groq', google: 'Google Gemini', mistral: 'Mistral' };
    const store = useAIStore.getState();
    const keys = { ...store.providerKeys, [store.provider]: store.apiKey };
    const next = nextConfiguredProvider(store.provider, keys);
    if (!next) return 'Nu ai încă o cheie pentru alt furnizor AI. Adaugă una în Setări AI (Groq, Google Gemini sau Mistral) și apoi pot comuta.';
    store.setProvider(next);
    return `Am trecut pe ${names[next] ?? next}. Următoarele răspunsuri vin de la acest furnizor.`;
  };

  /** Error bubble actions: ask again (optionally on another provider) without piling up a duplicate question. */
  const retryFailedAnswer = (index: number, otherModel: boolean) => {
    if (loading) return;
    const prev = messages[index - 1];
    if (prev?.role !== 'user' || prev.hadImage) {
      addToast('Retrimite mesajul din nou.', 'warning');
      return;
    }
    if (otherModel) {
      const note = switchToNextProvider();
      if (note.startsWith('Nu ai')) { addToast(note, 'warning'); return; }
      addToast(note, 'info');
    }
    setMessages((cur) => cur.slice(0, index - 1));
    void sendMessage(prev.content, messages[index]?.mode ?? prev.mode);
  };

  const regenerateAnswer = (index: number) => {
    const prev = messages[index - 1];
    if (prev?.role !== 'user') {
      addToast('Nu găsesc întrebarea de regenerat.', 'warning');
      return;
    }
    // The image itself is never kept in history — resending prev.content alone
    // would silently drop it and produce a reply about nothing in particular.
    if (prev.hadImage) {
      addToast('Nu pot regenera un răspuns pentru o imagine — atașeaz-o din nou și retrimite mesajul.', 'warning');
      return;
    }
    void sendMessage(prev.content, messages[index]?.mode);
  };

  /** „Continuă”: răspunsul s-a oprit la limita de lungime. Istoricul conține deja partea scrisă, deci modelul reia de acolo. */
  const continueAnswer = (index: number) => {
    if (loading) return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, truncated: false } : m)));
    void sendMessage('Continuă exact de unde ai rămas, fără să repeți ce ai scris deja.', messages[index]?.mode);
  };

  const makeQuizFromAnswer = async (index: number) => {
    if (loading) return;
    const assertSameProfile = profileGuard();
    const prev = messages[index - 1];
    if (!hasKey) {
      addToast('Pentru a genera un set ai nevoie de o cheie AI în Setări.', 'warning');
      return;
    }
    setLoading(true);
    setThinkingPhase('Generez un set din răspuns…');
    const visualId = beginVisualRun();
    let visualOutcome: ChatVisualState = 'success';
    try {
      const { generateQuestions, getUserProfile } = await import('../ai/AIEngine');
      const profile = activeProfileId ? getUserProfile(activeProfileId) : undefined;
      // Grilele se ancorează în răspunsul de pe ecran, nu în căutarea din bibliotecă pe textul cererii și nu în topicurile slabe:
      // acelea mutau întrebările pe altă patologie decât cea explicată.
      const { subject, prefetchedContext } = buildAnswerQuizRequest(prev?.role === 'user' ? prev.content : '', messages[index].content);
      const result = await generateQuestions({
        context: subject,
        prefetchedContext,
        subject,
        count: 5,
        userProfile: profile,
        mode: 'standard',
      });
      if (result.questions.length === 0) {
        visualOutcome = 'error';
        addToast('Nu am putut genera un set din acest subiect.', 'error');
        return;
      }
      assertSameProfile();
      const quizId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      addQuiz({
        id: quizId,
        title: `Test din chat · ${new Date().toLocaleDateString('ro-RO')}`,
        description: `${result.questions.length} grile generate din conversația cu StudyX AI.`,
        emoji: '🧪',
        color: 'blue',
        category: 'AI Studio',
        kind: 'quiz',
        folderId: null,
        shuffleQuestions: true,
        shuffleAnswers: true,
        tags: ['ai', 'chat'],
        questions: result.questions,
        createdAt: Date.now(),
      });
      setMessages((prev2) => [...prev2, {
        role: 'assistant',
        content: `Am creat **${result.questions.length} grile** pe baza acestui subiect. Le poți rezolva acum.`,
        openRoute: { route: `/play/${quizId}`, label: 'Începe testul' },
      }]);
    } catch (error) {
      visualOutcome = 'error';
      addToast(error instanceof Error ? error.message : 'Generarea a eșuat.', 'error');
    } finally {
      updateVisualRun(visualId, visualOutcome);
      setLoading(false);
      setThinkingPhase(null);
    }
  };

  // Escape closes the zoom overlay before anything else reacts to the key.
  useEffect(() => {
    if (!zoomedBlock) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setZoomedBlock(null);
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [zoomedBlock]);

  // Ctrl/Cmd+Shift+F toggles the full-window glass chat; Esc steps back to the small sheet
  // (it never closes the chat, and it leaves an open zoom overlay/menu to their own Esc).
  const toggleImmersive = glass.toggleImmersive;
  const setImmersive = glass.setImmersive;
  useEffect(() => {
    if (!open || mobile) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleImmersive();
        return;
      }
      if (event.key !== 'Escape' || !immersive || zoomedBlock) return;
      // Peel one layer per press: open popovers first, then the full-window mode itself.
      if (glassPanelOpen) setGlassPanelOpen(false);
      else if (overflowMenuOpen) setOverflowMenuOpen(false);
      else setImmersive(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, mobile, immersive, zoomedBlock, overflowMenuOpen, glassPanelOpen, toggleImmersive, setImmersive]);

  useEffect(() => {
    if (!open || view !== 'studio') return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || zoomedBlock || glassPanelOpen || overflowMenuOpen) return;
      // A dropdown inside the form handles its own Escape first.
      if (event.defaultPrevented) return;
      event.stopPropagation();
      setView('chat');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, view, zoomedBlock, glassPanelOpen, overflowMenuOpen, setView]);

  useEffect(() => {
    if (!open || !immersive) setGlassPanelOpen(false);
  }, [open, immersive]);

  // Dialog behaviour: focus moves into the sheet on open and back out on close, Tab stays inside.
  // Esc is handled below (the trap's own Esc handling is left off) because it must yield to the layers
  // that have their own Esc: the zoom viewer, popovers, the clear confirmation, Studio and full-window mode.
  const sheetRef = useFocusTrap(open);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [launcherPeek, setLauncherPeek] = useState(false);
  const launcherDocked = useLauncherDock(!open && !floatingUiSuppressed) && !launcherPeek;

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // IME composition uses Esc to cancel the candidate, not to leave the chat.
      if (event.isComposing || event.keyCode === 229) return;
      if (immersive || view !== 'chat' || zoomedBlock || glassPanelOpen || overflowMenuOpen || confirmClearOpen) return;
      if (document.querySelector('[data-tour-keyboard-layer]')) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && sheetRef.current?.contains(selection.anchorNode)) {
        // First Esc only drops the text selection.
        selection.removeAllRanges();
        return;
      }
      closeChat();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // closeChat only touches state setters and refs, so it is safe to read the latest one through the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, immersive, view, zoomedBlock, glassPanelOpen, overflowMenuOpen, confirmClearOpen]);

  // The launcher is unmounted while the chat is open, so the trap cannot give focus back to it:
  // do it once it is mounted again (unless the user already moved focus somewhere real).
  const launcherWasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = launcherWasOpenRef.current;
    launcherWasOpenRef.current = open;
    if (!wasOpen || open) return;
    // The launcher mounts again only after the drawer's exit animation, so retry for up to ~1 s.
    let tries = 0;
    let timer = 0;
    const restore = () => {
      const active = document.activeElement;
      // Focus still inside the exiting drawer (or nowhere) counts as lost; anything else the user picked is kept.
      const lost = !active || active === document.body || !active.isConnected || !!active.closest('[role="dialog"]');
      if (!lost) return;
      if (launcherRef.current && active?.closest('[role="dialog"]') == null) { launcherRef.current.focus({ preventScroll: true }); return; }
      if (++tries < 20) timer = window.setTimeout(restore, 50);
    };
    timer = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  /**
   * Message bodies are injected as HTML, so schemas and wide tables can't carry
   * React handlers. One delegated click lifts the block the user tapped into a
   * full-screen overlay instead.
   */
  const handleZoomableClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const block = target?.closest?.('[data-sx-zoom]') as HTMLElement | null;
    if (!block) return;
    if (target?.closest('a')) return; // links inside a table keep working
    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-sx-hint]').forEach((hint) => hint.remove());
    setZoomedBlock(clone.innerHTML);
  };

  // One stable object for every bubble: its methods always call the latest handlers, so React.memo on the
  // bubbles holds while a token streams in and only the last message re-renders.
  const latestActions = useRef<ChatMessageActions | null>(null);
  // No dependency list on purpose: the bubbles call through this ref, so it must always hold the latest handlers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    latestActions.current = {
      toggleCitation: setActiveCitationKey,
      openBook: openBookCitation,
      copy: (content) => void copyMessageToClipboard(content),
      saveFlashcard: saveAnswerAsFlashcard,
      makeQuiz: makeQuizFromAnswer,
      regenerate: regenerateAnswer,
      continueAnswer,
      retryError: (index) => retryFailedAnswer(index, false),
      switchModel: (index) => retryFailedAnswer(index, true),
      suggest: (text, suggestionMode) => void sendMessage(text, suggestionMode),
      setCrossCheck: (index, crossCheck) => setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, crossCheck } : m))),
      runAgent: (jobId) => void runAgentJob(jobId),
      cancelAgent: cancelAgentJob,
      undoAgent: undoAgentJob,
      retryAgent: (jobId) => void retryAgentJob(jobId),
      editAgentParams: editAgentStepParams,
      go: (route) => { setChatOpen(false); navigate(route); },
      editOptionCard,
      submitOptionCard,
      cancelOptionCard,
    };
  });
  const bubbleActions = useMemo<ChatMessageActions>(() => {
    const call = <K extends keyof ChatMessageActions>(key: K) => ((...args: Parameters<ChatMessageActions[K]>) => {
      (latestActions.current?.[key] as ((...a: Parameters<ChatMessageActions[K]>) => void) | undefined)?.(...args);
    }) as ChatMessageActions[K];
    return {
      toggleCitation: call('toggleCitation'), openBook: call('openBook'), copy: call('copy'), saveFlashcard: call('saveFlashcard'),
      makeQuiz: call('makeQuiz'), regenerate: call('regenerate'), continueAnswer: call('continueAnswer'), retryError: call('retryError'), switchModel: call('switchModel'), suggest: call('suggest'), setCrossCheck: call('setCrossCheck'),
      runAgent: call('runAgent'), cancelAgent: call('cancelAgent'), undoAgent: call('undoAgent'), retryAgent: call('retryAgent'),
      editAgentParams: call('editAgentParams'), go: call('go'),
      editOptionCard: call('editOptionCard'), submitOptionCard: call('submitOptionCard'), cancelOptionCard: call('cancelOptionCard'),
    };
  }, []);

  const renderMessageList = (compact = false) => {
    const threadMessages = messages;
    // The user message each answer replies to (for „Verifică cu alt model”), computed once per render instead of per bubble.
    const questionFor: string[] = [];
    let lastUserText = '';
    for (const [i, entry] of threadMessages.entries()) {
      questionFor[i] = lastUserText;
      if (entry.role === 'user') lastUserText = entry.content;
    }
    const recentSourceName = scopedSource?.name
      ?? [...readySources].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))[0]?.name
      ?? null;
    const greeting = buildProactiveGreeting(weakTopics, performanceSummary.dueCount, recentSourceName);

    return (
    <div className={`${compact ? 'space-y-4' : 'space-y-5'}${immersive ? ' mx-auto w-full max-w-[800px]' : ''}`} onClick={handleZoomableClick}>
      {continuityRecap && !recapDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="luxe-card rounded-[var(--r-lg)] p-4 text-left"
          style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: theme.text3 }}>
            <Sparkles size={12} /> Unde am rămas
          </div>
          <ul className="mb-3 space-y-1 text-[13px] leading-relaxed" style={{ color: theme.text2 }}>
            {continuityRecap.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className="press-feedback rounded-full px-4 py-2 text-[12px] font-bold"
              style={{ background: theme.accent, color: '#fff' }}
              onClick={() => { setRecapDismissed(true); void sendMessage(continuityRecap.prompt); }}
            >
              Continuăm
            </button>
            <button
              type="button"
              className="press-feedback rounded-full px-4 py-2 text-[12px] font-bold"
              style={{ color: theme.text2, border: `1px solid ${theme.border}` }}
              onClick={() => setRecapDismissed(true)}
            >
              Nu acum
            </button>
          </div>
        </motion.div>
      )}
      {threadMessages.length === 0 ? (
        <div className={`text-center ${compact ? 'py-6' : 'py-8'}`}>
          <FreeKeysNotice
            theme={theme}
            configuredCount={Object.values(providerKeys).filter((key) => (key ?? '').trim().length > 0).length}
            onNavigate={closeChat}
          />
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-5 flex h-12 items-center justify-center" style={{ color: theme.accent }}>
            <Brain size={44} aria-hidden="true" />
          </motion.div>
          <h4 className="mb-2 text-[1.25rem] font-black tracking-tight" style={{ color: theme.text }}>
            {greeting.title}
          </h4>
          <p className="mb-6 text-sm font-medium leading-relaxed opacity-70" style={{ color: theme.text }}>
            {greeting.proactive
              ? greeting.subtitle
              : mode === 'grounded'
                ? 'Îți răspund pe baza bibliotecii tale, explic concepte medicale și păstrez contextul util pentru examen.'
                : `Ești în modul „${activeModeConfig.label}”. Îți adaptez răspunsul la stilul de lucru ales, fără să pierd contextul util.`}
          </p>

          {(recommendedActions.length > 0 || weakTopics.length > 0 || performanceSummary.dueCount > 0) && (
            <div
              className="luxe-card mb-5 rounded-[var(--r-lg)] p-4 text-left"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="citation-pill inline-flex items-center gap-1.5">
                  <Sparkles size={12} />
                  Focus recomandat
                </span>
                {performanceSummary.dueCount > 0 && (
                  <span className="premium-chip rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: theme.text3 }}>
                    {performanceSummary.dueCount} de recapitulat
                  </span>
                )}
                {weakTopics[0] && (
                  <span className="premium-chip rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: theme.text3 }}>
                    {weakTopics[0].topic} · {weakTopics[0].accuracy}%
                  </span>
                )}
              </div>

              <div className="grid gap-2.5">
                {recommendedActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      setMode(action.mode);
                      setManualMode(true);
                      void sendMessage(action.prompt, action.mode);
                    }}
                    className="premium-card-hover flex items-center justify-between rounded-[var(--r-lg)] border px-4 py-3 text-left press-feedback"
                    style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: theme.text }}>
                        {action.label}
                      </div>
                      <div className="mt-1 text-xs font-medium opacity-65" style={{ color: theme.text }}>
                        {action.helper}
                      </div>
                    </div>
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl"
                      style={{ background: `${action.mode === 'test' ? theme.danger : action.mode === 'mnemonic' ? theme.warning : theme.accent}16` }}
                    >
                      <Target
                        size={16}
                        color={action.mode === 'test' ? theme.danger : action.mode === 'mnemonic' ? theme.warning : theme.accent}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 px-1">
            {activeModeConfig.emptyPrompts.map((item, index) => (
              <motion.button
                key={item}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.08 }}
                onClick={() => void sendMessage(item, mode)}
                className="premium-card-hover w-full rounded-[var(--r-lg)] border p-4 text-left text-[11px] font-black uppercase tracking-wider transition-colors press-feedback"
                style={{ background: theme.surface2, borderColor: theme.border, color: theme.text }}
              >
                {item}
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {threadMessages.map((message, index) => {
            const isLastAssistant = message.role === 'assistant' && index === threadMessages.length - 1;
            const jobId = message.agentJobId;
            return (
              <ChatMessageBubble
                key={`${message.role}-${index}`}
                message={message}
                index={index}
                isLastAssistant={isLastAssistant}
                streaming={isLastAssistant && loading}
                question={questionFor[index]}
                activeCitationKey={activeCitationKey?.startsWith(`${index}-`) ? activeCitationKey : null}
                agentResult={jobId ? agentJobs.find((job) => job.id === jobId)?.result ?? null : null}
                fallbackMode={mode}
                theme={theme}
                calmMotion={calmMotion}
                actions={bubbleActions}
              />
            );
          })}

          {loading && threadMessages[threadMessages.length - 1]?.role === 'user' && (
            <div className="flex items-start gap-2.5 justify-start">
              <div className="mt-0.5">
                <Mascot accent={theme.accent} size={28} static expression="waiting" calm={calmMotion} />
              </div>
              <div
                className="flex items-center gap-2.5 rounded-[var(--r-lg)] border px-4 py-3"
                style={{ background: theme.surface2, borderColor: theme.border }}
              >
                <Loader2 size={16} className="animate-spin" style={{ color: theme.accentText }} />
                <span className="text-[13px] font-semibold" style={{ color: theme.text2 }}>
                  {thinkingPhase ?? 'Mă gândesc…'}
                </span>
                <button
                  onClick={stopGeneration}
                  title="Oprește generarea"
                  className="ml-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors hover:opacity-80"
                  style={{ background: `${theme.danger}15`, color: theme.danger, border: `1px solid ${theme.danger}30` }}
                >
                  ⬛ Stop
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <div ref={chatEndRef} />
    </div>
    );
  };

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === 'assistant') return i;
    return undefined;
  }, [messages]);

  // The panel's position is always spelled out in px (sheet or full window) so switching
  // between the two can animate as one smooth morph instead of jumping between CSS models.
  const sheetWidth = view === 'studio'
    ? Math.min(mobile ? 600 : 1080, windowSize.width - (mobile ? 20 : 28))
    : mobile
      ? Math.min(520, windowSize.width - 20)
      : Math.min(wideChat ? 1080 : 560, windowSize.width - 28);
  const sheetHeight = view === 'studio' || (wideChat && view === 'chat')
    ? Math.min(windowSize.height * 0.88, 880)
    : Math.min(windowSize.height * 0.85, 860);
  // The Electron window is frameless: minimize/maximize/close float at the top-right,
  // so the full-window chat starts below them instead of covering (and stealing clicks from) them.
  const immersiveTop = typeof window !== 'undefined' && window.electronAPI ? 54 : 12;
  // Wide enough: Studio is a real column next to the conversation (nothing is covered, and the form
  // gets the full height). Narrow: it stays a slide-over drawer above the messages.
  const panelInnerWidth = immersive ? windowSize.width - sidebarInset - 24 : sheetWidth;
  const studioAsColumn = view === 'studio' && !mobile && panelInnerWidth >= 820;
  const panelGeometry = immersive
    ? {
        left: sidebarInset + 12,
        top: immersiveTop,
        width: windowSize.width - sidebarInset - 24,
        height: windowSize.height - immersiveTop - 12,
        borderRadius: 'var(--r-xl)',
      }
    : {
        left: windowSize.width - 20 - sheetWidth,
        top: windowSize.height - 20 - sheetHeight,
        width: sheetWidth,
        height: sheetHeight,
        borderRadius: 'var(--r-xl)',
      };

  if (floatingUiSuppressed && !open) {
    return null;
  }

  return (
    <>
      {!open && (
        <motion.button
          initial={calmMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: launcherDocked ? 60 : 0 }}
          transition={t.panel}
          whileHover={calmMotion ? undefined : { scale: 1.04 }}
          whileTap={calmMotion ? undefined : { scale: 0.95 }}
          ref={launcherRef}
          onPointerEnter={() => setLauncherPeek(true)}
          onPointerLeave={() => setLauncherPeek(false)}
          onFocus={() => setLauncherPeek(true)}
          onBlur={() => setLauncherPeek(false)}
          onClick={() => setChatOpen(true)}
          aria-label="Deschide chatul AI"
          data-tutorial="ai-chat-button"
          className="fixed right-6 z-[9998] flex h-14 w-14 items-center justify-center rounded-full press-feedback focus-ring"
          style={{
            bottom: '24px',
          }}
        >
          <Mascot accent={theme.accent} thinking={loading || hasRunningAgentJob} calm={calmMotion} size={72} />
          <span
            className={`absolute -right-1.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)]`}
            style={{ background: theme.success }}
          />
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <>
            {/* The dimming backdrop would swallow clicks meant for the app sidebar, so the
                full-window mode leaves it out: the page stays visible (blurred) behind the glass. */}
            {!immersive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={t.pop}
                onClick={closeChat}
                className="fixed inset-0 z-[9996] bg-[var(--overlay)]"
              />
            )}

            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={t.modal}
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="Asistent AI StudyX"
              className={`assistant-sheet fixed z-[9999] flex flex-col overflow-hidden${immersive ? ' immersive-chat' : ''}${calmMotion ? '' : ' chat-panel-morph'}`}
              style={immersive ? {
                ...panelGeometry,
                background: `color-mix(in srgb, ${theme.bg} ${Math.round(glass.settings.opacity * 100)}%, transparent)`,
                // Glass over a large surface is repainted on every streamed token: keep it light while the answer is written.
                backdropFilter: `blur(${loading ? Math.min(glass.settings.blur, 8) : performanceLite ? Math.min(glass.settings.blur, 10) : glass.settings.blur}px) saturate(150%)`,
                WebkitBackdropFilter: `blur(${loading ? Math.min(glass.settings.blur, 8) : performanceLite ? Math.min(glass.settings.blur, 10) : glass.settings.blur}px) saturate(150%)`,
                border: `1px solid ${theme.border}`,
                boxShadow: 'var(--elev-4), inset 0 1px 0 var(--glass-highlight)',
              } : {
                ...panelGeometry,
                background: `color-mix(in srgb, ${theme.bg} 90%, transparent)`,
                backdropFilter: loading ? 'blur(8px) saturate(150%)' : 'blur(var(--blur-3)) saturate(165%)',
                border: `1px solid ${theme.border}`,
                boxShadow: 'var(--elev-4), inset 0 1px 0 var(--glass-highlight)',
              }}
            >
              {!immersive && <div className="sheet-handle" />}
              <div className="relative z-10 flex h-full flex-col">
                <ChatHeader
                  theme={theme}
                  calmMotion={calmMotion}
                  popTransition={t.pop}
                  chatThread={chatThread}
                  loading={loading}
                  visualState={visualState}
                  immersive={immersive}
                  mobile={mobile}
                  view={view}
                  onViewChange={setView}
                  scopedSourceName={scopedSource?.name ?? null}
                  weakTopics={weakTopics}
                  memoryInteractions={memoryInteractions}
                  glass={glass}
                  glassPanelOpen={glassPanelOpen}
                  setGlassPanelOpen={setGlassPanelOpen}
                  overflowMenuOpen={overflowMenuOpen}
                  setOverflowMenuOpen={setOverflowMenuOpen}
                  wideChat={wideChat}
                  setWideChat={setWideChat}
                  hasMessages={messages.length > 0}
                  lastAssistantIndex={lastAssistantIndex}
                  onRegenerate={regenerateAnswer}
                  onClearRequest={() => setConfirmClearOpen(true)}
                  onClose={closeChat}
                />

                <div className="relative flex min-h-0 flex-1">
                  <div
                    className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5"
                    style={view === 'chat'
                      ? {
                          background: 'linear-gradient(180deg, var(--glass-sheen), transparent 28%)',
                          // On glass the text should dissolve under the header/composer, not get sliced by a hard edge.
                          ...(immersive ? {
                            maskImage: 'linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 26px), transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 26px), transparent 100%)',
                          } : {}),
                        }
                      : undefined}
                  >
                    {view === 'studio' && scopedSource && (
                      <div
                        className="mb-4 rounded-[var(--r-lg)] border p-4"
                        style={{ background: theme.surface2, borderColor: theme.border }}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="citation-pill inline-flex items-center gap-1.5">
                            <BookOpen size={12} />
                            Sursă activă
                          </span>
                          <span className="premium-chip rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: theme.text3 }}>
                            {scopedSource.name}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: theme.text }}>
                          Poți discuta liber despre documentul selectat și, din panoul „Studio", să generezi pachete de grile direct în folderul ales.
                        </p>
                      </div>
                    )}
                    {renderMessageList(view === 'studio')}
                  </div>

                  {/*
                    Studio used to be a permanent 340px grid column whenever its tab was
                    active — it now overlays the chat instead (backdrop + slide-in drawer),
                    so chat keeps full width until you actually open Studio.
                  */}
                  <StudioPanel
                    studio={studio}
                    theme={theme}
                    calmMotion={calmMotion}
                    t={t}
                    view={view}
                    setView={setView}
                    mobile={mobile}
                    studioAsColumn={studioAsColumn}
                    weakTopics={weakTopics}
                    readySources={readySources}
                    studioResidencyPlacement={studioResidencyPlacement}
                    contextCacheRef={contextCacheRef}
                    setScopedSource={setScopedSource}
                  />
                </div>

                {/* Studio as an overlay covers the whole body: the composer would only peek out beside it. */}
                {!(view === 'studio' && !studioAsColumn) && (
                <ChatComposer
                  theme={theme}
                  immersive={immersive}
                  view={view}
                  input={input}
                  onInputChange={setInput}
                  pastedImage={pastedImage}
                  onPastedImage={setPastedImage}
                  textareaRef={textareaRef}
                  placeholder={view === 'studio'
                    ? 'Discută despre document, capcane, ce vrei să generezi...'
                    : activeModeConfig.placeholder}
                  loading={loading}
                  onSend={() => void sendMessage()}
                  onStop={stopGeneration}
                  mode={mode}
                  manualMode={manualMode}
                  modeLabel={activeModeConfig.shortLabel}
                  modePickerOpen={modePickerOpen}
                  onModePickerOpen={setModePickerOpen}
                  onAutoMode={() => { setManualMode(false); setModePickerOpen(false); }}
                  onPickMode={(entryMode) => { setMode(entryMode); setManualMode(true); setModePickerOpen(false); }}
                  quizContext={activeQuizContext}
                  onClearQuizContext={() => setActiveQuizContext(null)}
                  showStudioShortcuts={readySources.length > 0}
                  onStudioShortcut={(kind) => {
                    setView('chat');
                    setMode(kind === 'diagram' ? 'diagram' : 'summarize');
                    setManualMode(true);
                    if (selectedStudioSource) {
                      setScopedSource({ id: selectedStudioSource.id, name: selectedStudioSource.name });
                      setInput(kind === 'diagram'
                        ? `Fă-mi o schemă logică din documentul "${selectedStudioSource.name}", cu noduri de examen și capcane.`
                        : `Rezumă-mi documentul "${selectedStudioSource.name}" în idei-cheie și capcane de examen.`);
                    }
                  }}
                />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zoomedBlock && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomedBlock(null)}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-8"
            transition={t.pop}
            style={{ background: 'var(--overlay)' }}
          >
            <motion.div
              initial={calmMotion ? { opacity: 0 } : { scale: 0.985, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.985, opacity: 0, y: 8 }}
              transition={t.modal}
              onClick={(event) => event.stopPropagation()}
              className="relative max-h-full w-full max-w-[1200px] overflow-auto rounded-[var(--r-xl)] p-5 sm:p-7 shadow-2xl"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text }}
            >
              <button
                onClick={() => setZoomedBlock(null)}
                aria-label="Închide"
                className="fine-row absolute right-3 top-3 rounded-2xl p-2 transition-colors hover:bg-[var(--hover-fill)]"
                style={{ color: theme.text3 }}
              >
                <X size={18} />
              </button>
              <div dangerouslySetInnerHTML={{ __html: zoomedBlock }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Golești conversația?"
        description="Mesajele din acest fir se șterg de pe acest dispozitiv și nu mai pot fi recuperate."
        confirmLabel="Golește"
        onConfirm={() => { setConfirmClearOpen(false); clearConversation(); }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </>
  );
}
