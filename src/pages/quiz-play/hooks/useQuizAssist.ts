import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastStore } from '../../../store/toastStore';
import type { Question } from '../../../types';
import type { AIAnalysisResult, HintResult } from '../../../ai/types';
import type { BookPassage, PassageQuery } from '../../../lib/bookPassage';
import { AGENT_STEP_LABEL, type AgentCall, type AgentStep, type AiProblem } from '../../../lib/bookAgent';
import { AGENT_SYSTEM_PROMPT } from '../../../lib/bookAgent/prompts';
import {
  buildAnalysisFallback,
  buildHintFallback,
  buildMnemonicFallback,
  getAnswerTextForOptionIds,
  getCorrectAnswerText,
} from '../../../helpers/quizAi';
import { getCorrectOptionIds, isCorrectSelection } from '../helpers';

const loadAIEngine = () => import('../../../ai/AIEngine');

/** Starea butonului „Vezi în carte”: `ai-*` = AI-ul n-a putut verifica și local nu s-a găsit o potrivire sigură. */
export type BookSourceStatus = 'idle' | 'loading' | 'none' | 'ai-rate-limit' | 'ai-unavailable';

/** Ce susține grila: răspunsul corect și explicația. Fragmentul din carte trebuie să aibă legătură cu ele, nu doar cu enunțul. */
const correctTextOf = (question: Question) => question.options.filter((option) => option.isCorrect).map((option) => option.text).join(', ');

/** Ce știe agentul „Vezi în carte” despre grilă: enunțul, răspunsul corect, explicația și variantele greșite. */
const queryOf = (question: Question): PassageQuery => ({
  question: question.text,
  answer: correctTextOf(question),
  explanation: question.explanation,
  wrongAnswers: question.options.filter((option) => !option.isCorrect).map((option) => option.text),
});

/** Cât așteaptă agentul fiecare pas: localizatorul e un ajutor (se renunță repede la el), judecătorul decide pasajul. */
const AGENT_CALL_TIMEOUT_MS: Record<AgentCall, number> = { locate: 15_000, judge: 40_000 };

/**
 * O cerere a agentului „Vezi în carte”: JSON strict, buget mare de tokeni (modelele de raționament îl consumă pe gândire înainte
 * de răspuns) și anulată la timp, ca un model care tace să nu țină studentul în așteptare. La anulare agentul arată cel mai bun
 * pasaj găsit fără AI, dacă scorul îl justifică.
 */
async function askBookAgentModel(
  request: typeof import('../../../lib/groq').groqRequest,
  prompt: string,
  call: AgentCall,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), AGENT_CALL_TIMEOUT_MS[call]);
  try {
    return await request({
      task: 'analysis',
      messages: [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 2500,
      jsonMode: true,
      skipLibraryContext: true,
      abortSignal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface Options {
  question: Question | undefined;
  revealed: boolean;
  examMode: boolean;
  currentIdx: number;
  answers: Record<string, string[]>;
  selectedNow: string[];
  activeProfileId: string | null;
}

/**
 * Everything "assistive" around the current question: staged hints, the AI explanation,
 * the mnemonic, the per-question analysis and the proactive Knowledge Vault toast.
 */
export function useQuizAssist({ question, revealed, examMode, currentIdx, answers, selectedNow, activeProfileId }: Options) {
  const addToast = useToastStore((s) => s.addToast);

  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [mnemonicText, setMnemonicText] = useState<string | null>(null);
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  /** Which post-reveal AI panel is showing — explanation and mnemonic used to be able to stack at once. */
  const [activeAIPanel, setActiveAIPanel] = useState<'explanation' | 'mnemonic'>('explanation');
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [analysisQuestionId, setAnalysisQuestionId] = useState<string | null>(null);
  const [nextTopicHint, setNextTopicHint] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0); // 0: none, 1: light, 2: medium, 3: full
  const [hintData, setHintData] = useState<HintResult | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [showSmartNudge, setShowSmartNudge] = useState(false);
  /** Pasajul din cărțile incluse găsit de agent pentru întrebarea curentă. */
  const [relevantPassage, setRelevantPassage] = useState<BookPassage | null>(null);
  const [relevantDocModalOpen, setRelevantDocModalOpen] = useState(false);
  /** Întrebarea pentru care e valabil `relevantPassage`: un pasaj găsit la o întrebare nu se arată la următoarea. */
  const [relevantDocQuestionId, setRelevantDocQuestionId] = useState<string | null>(null);
  const [sourceLookup, setSourceLookup] = useState<{ questionId: string; status: 'loading' | 'none' | 'ai-down'; step?: AgentStep; aiProblem?: AiProblem } | null>(null);
  /**
   * Generation token for in-flight AI requests. The AI helpers are plain promises with no abort
   * support, so bumping this invalidates any reply still in flight (otherwise a slow explanation
   * would repopulate the panel against the WRONG question).
   */
  const aiRequestIdRef = useRef(0);
  /** Tracks which questions already triggered a proactive vault lookup, so a wrong answer toasts at most once. */
  const vaultCheckedRef = useRef<Set<string>>(new Set());
  /** Toast-ul proactiv e creat într-un efect, dar trebuie să deschidă aceeași căutare ca butonul „Vezi în carte”. */
  const openSourceRef = useRef<() => Promise<void>>(async () => undefined);

  // Smart nudge: if the user is stuck for >12s, pulse the hint button
  useEffect(() => {
    if (revealed || examMode || hintLevel > 0) {
      setShowSmartNudge(false);
      return;
    }
    const timer = setTimeout(() => setShowSmartNudge(true), 12000);
    return () => clearTimeout(timer);
  }, [currentIdx, revealed, examMode, hintLevel]);

  useEffect(() => {
    setHintLevel(0);
    setHintData(null);
  }, [currentIdx]);

  const clearAssist = useCallback(() => {
    setAiText(null);
    setAiLoading(false);
    setMnemonicText(null);
    setMnemonicLoading(false);
    setAnalysisResult(null);
    setAnalysisQuestionId(null);
    setNextTopicHint(null);
    setHintLevel(0);
    setHintData(null);
    setActiveAIPanel('explanation');
    setRelevantDocModalOpen(false);
  }, []);

  /** Between questions: discard anything still in flight, then clear. */
  const resetAssistiveState = useCallback(() => {
    aiRequestIdRef.current += 1;
    clearAssist();
  }, [clearAssist]);

  /** A brand-new question set was built: clear everything incl. the vault-lookup memory. */
  const resetForNewSet = useCallback(() => {
    vaultCheckedRef.current.clear();
    clearAssist();
  }, [clearAssist]);

  const handleGetHint = useCallback(async () => {
    if (!question || hintLoading || hintLevel >= 3) return;

    if (hintLevel > 0 && hintData) {
      setHintLevel((prev) => prev + 1);
      return;
    }

    setHintLoading(true);
    try {
      const { generateHint } = await loadAIEngine();
      const result = await generateHint(question);
      setHintData(result);
      setHintLevel(1);
    } catch {
      setHintData(buildHintFallback(question));
      setHintLevel(1);
    } finally {
      setHintLoading(false);
    }
  }, [question, hintLoading, hintLevel, hintData]);

  const handleAIExplain = useCallback(async () => {
    if (!question || aiLoading) return;
    if (analysisResult?.explanation && analysisQuestionId === question.id) {
      setAiText(analysisResult.explanation);
      return;
    }
    const requestId = ++aiRequestIdRef.current;
    const isStale = () => aiRequestIdRef.current !== requestId;
    setAiLoading(true);
    const currentAnswers = answers[question.id] ?? selectedNow;
    const userAnswer = getAnswerTextForOptionIds(question.options, currentAnswers);
    const correctAnswer = getCorrectAnswerText(question);
    const isCorrect = isCorrectSelection(currentAnswers, getCorrectOptionIds(question.options));
    const applyFallback = () => {
      const fallbackAnalysis = buildAnalysisFallback({ question, userAnswer, correctAnswer, isCorrect });
      setAnalysisResult(fallbackAnalysis);
      setAnalysisQuestionId(question.id);
      setAiText(fallbackAnalysis.explanation);
      setNextTopicHint(fallbackAnalysis.recommendedTopic ?? null);
    };
    try {
      if (!activeProfileId) {
        applyFallback();
        return;
      }
      const { analyzeAnswer } = await loadAIEngine();
      const { analysis } = await analyzeAnswer(activeProfileId, { question, userAnswer, correctAnswer, isCorrect });
      if (isStale()) return; // user moved on — this answer belongs to a past question
      setAnalysisResult(analysis);
      setAnalysisQuestionId(question.id);
      setAiText(analysis.explanation);
    } catch {
      if (isStale()) return;
      applyFallback();
    } finally {
      // Leave the spinner alone if a newer request owns it now.
      if (!isStale()) setAiLoading(false);
    }
  }, [question, aiLoading, activeProfileId, analysisResult, analysisQuestionId, answers, selectedNow]);

  const handleGenerateMnemonic = useCallback(async () => {
    if (!question) return;
    const requestId = ++aiRequestIdRef.current;
    const isStale = () => aiRequestIdRef.current !== requestId;
    setMnemonicLoading(true);
    const correctAnswer = getCorrectAnswerText(question);
    const concept = analysisResult?.missingConcept || analysisResult?.recommendedTopic || correctAnswer || question.text;
    try {
      if (!activeProfileId) {
        setMnemonicText(buildMnemonicFallback(concept, correctAnswer));
        return;
      }
      const { getUserProfile, generateMnemonicForConcept } = await loadAIEngine();
      const profile = getUserProfile(activeProfileId);
      const repeatedMistake = profile.mistakeBank.find((entry) => entry.questionId === question.id)?.wrongCount ?? 0;
      const targetConcept = repeatedMistake >= 2 ? concept : `${correctAnswer} | ${question.text}`;
      const mnemonic = await generateMnemonicForConcept(targetConcept, correctAnswer);
      if (isStale()) return; // belongs to a question the user already left
      setMnemonicText(mnemonic);
    } catch {
      if (isStale()) return;
      setMnemonicText(buildMnemonicFallback(concept, correctAnswer));
    } finally {
      if (!isStale()) setMnemonicLoading(false);
    }
  }, [question, analysisResult, activeProfileId]);

  useEffect(() => {
    if (!revealed || examMode || !question || analysisQuestionId === question.id) return;
    const currentAnswers = answers[question.id] ?? selectedNow;
    if (currentAnswers.length === 0) return;
    const isCorrect = isCorrectSelection(currentAnswers, getCorrectOptionIds(question.options));

    setAnalysisQuestionId(question.id);
    if (!isCorrect) {
      setNextTopicHint(question.tags?.[0] ?? question.difficulty ?? null);
    }
  }, [revealed, examMode, question, analysisQuestionId, answers, selectedNow]);

  // La un răspuns greșit în modul de studiu, verifică discret (fără AI, fără cost) dacă una dintre cele trei cărți incluse
  // are un pasaj clar pentru grilă și oferă să-l deschidă. Tăcut când nu găsește nimic sau la orice eroare.
  useEffect(() => {
    if (!revealed || examMode || !question) return;
    if (vaultCheckedRef.current.has(question.id)) return;
    const currentAnswers = answers[question.id] ?? selectedNow;
    if (currentAnswers.length === 0) return;
    if (isCorrectSelection(currentAnswers, getCorrectOptionIds(question.options))) return;

    vaultCheckedRef.current.add(question.id);
    const query = queryOf(question);
    let cancelled = false;
    (async () => {
      try {
        const [{ findPassageCandidates }, { FALLBACK_MIN_SCORE }] = await Promise.all([import('../../../lib/bookPassage'), import('../../../lib/bookAgent')]);
        const [best] = await findPassageCandidates(query, 1);
        if (cancelled || !best || best.score < FALLBACK_MIN_SCORE) return;
        addToast(
          'Ai un pasaj relevant în carte pentru această grilă',
          'info',
          7500,
          { label: 'Vezi în carte', onClick: () => { void openSourceRef.current(); } },
        );
      } catch {
        // Doar o amabilitate: nu întrerupe niciodată sesiunea.
      }
    })();
    return () => { cancelled = true; };
  }, [revealed, examMode, question, answers, selectedNow, addToast]);

  /**
   * „Vezi în carte”, la cerere: agentul înțelege grila, caută în Kumar, Lawrence și Sinopsis, alege pasajul care susține
   * răspunsul corect și îl marchează. Un pasaj găsit pentru întrebare se redeschide fără altă căutare.
   */
  const openQuestionSource = useCallback(async () => {
    if (!question) return;
    if (relevantPassage && relevantDocQuestionId === question.id) {
      setRelevantDocModalOpen(true);
      return;
    }
    if (sourceLookup?.status === 'loading') return;
    const questionId = question.id;
    setSourceLookup({ questionId, status: 'loading', step: 'understand' });
    try {
      const [{ runBookAgentDetailed }, { groqRequest }] = await Promise.all([import('../../../lib/bookAgent'), import('../../../lib/groq')]);
      const { passage, aiProblem } = await runBookAgentDetailed(
        queryOf(question),
        (prompt, call) => askBookAgentModel(groqRequest, prompt, call),
        { onStep: (step) => setSourceLookup((current) => (current && current.questionId === questionId ? { ...current, step } : current)) },
      );
      if (!passage) {
        // Fără pasaj: dacă AI-ul n-a putut judeca, spunem asta (altfel „cartea nu are pasajul” ar fi fals) și lăsăm „Încearcă din nou”.
        setSourceLookup(aiProblem ? { questionId, status: 'ai-down', aiProblem } : { questionId, status: 'none' });
        return;
      }
      setRelevantPassage(passage);
      setRelevantDocQuestionId(questionId);
      setSourceLookup(null);
      setRelevantDocModalOpen(true);
    } catch {
      setSourceLookup({ questionId, status: 'ai-down', aiProblem: 'unavailable' });
    }
  }, [question, relevantPassage, relevantDocQuestionId, sourceLookup?.status]);
  useEffect(() => { openSourceRef.current = openQuestionSource; }, [openQuestionSource]);

  const sourceStatus: BookSourceStatus = !question || !sourceLookup || sourceLookup.questionId !== question.id
    ? 'idle'
    : sourceLookup.status === 'ai-down' ? (sourceLookup.aiProblem === 'rate-limit' ? 'ai-rate-limit' : 'ai-unavailable') : sourceLookup.status;
  const sourceStepLabel = sourceStatus === 'loading' && sourceLookup?.step ? AGENT_STEP_LABEL[sourceLookup.step] : 'Caut în carte…';

  return {
    aiText, aiLoading, mnemonicText, mnemonicLoading, activeAIPanel, setActiveAIPanel,
    analysisResult, nextTopicHint, hintLevel, hintData, hintLoading, showSmartNudge,
    handleGetHint, handleAIExplain, handleGenerateMnemonic, resetAssistiveState, resetForNewSet,
    relevantPassage, relevantDocModalOpen, setRelevantDocModalOpen,
    openQuestionSource, sourceStatus, sourceStepLabel,
  };
}
