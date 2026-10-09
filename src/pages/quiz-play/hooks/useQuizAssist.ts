import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '../../../store/toastStore';
import type { Question } from '../../../types';
import type { AIAnalysisResult, HintResult } from '../../../ai/types';
import {
  buildAnalysisFallback,
  buildHintFallback,
  buildMnemonicFallback,
  getAnswerTextForOptionIds,
  getCorrectAnswerText,
} from '../../../helpers/quizAi';
import { getCorrectOptionIds, isCorrectSelection } from '../helpers';

const loadAIEngine = () => import('../../../ai/AIEngine');

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
  const navigate = useNavigate();
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
  /**
   * Generation token for in-flight AI requests. The AI helpers are plain promises with no abort
   * support, so bumping this invalidates any reply still in flight (otherwise a slow explanation
   * would repopulate the panel against the WRONG question).
   */
  const aiRequestIdRef = useRef(0);
  /** Tracks which questions already triggered a proactive vault lookup, so a wrong answer toasts at most once. */
  const vaultCheckedRef = useRef<Set<string>>(new Set());

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

  // Proactive RAG: when a study-mode answer is wrong, quietly check the Knowledge Vault for a
  // relevant document and offer to open it via a toast. Silent when the vault is empty, the
  // match is weak, or on any error.
  useEffect(() => {
    if (!revealed || examMode || !question) return;
    if (vaultCheckedRef.current.has(question.id)) return;
    const currentAnswers = answers[question.id] ?? selectedNow;
    if (currentAnswers.length === 0) return;
    if (isCorrectSelection(currentAnswers, getCorrectOptionIds(question.options))) return;

    vaultCheckedRef.current.add(question.id);
    const questionText = question.text;
    let cancelled = false;
    (async () => {
      try {
        const { retrieveRelevantChunks } = await import('../../../ai/retriever');
        const hits = await retrieveRelevantChunks(questionText, null, 1);
        if (cancelled) return;
        const top = hits[0];
        // Require a confident match so we never surface an irrelevant document.
        if (!top || top.score < 0.35 || !top.sourceId) return;
        const sourceId = top.sourceId;
        addToast(
          `Ai un document relevant: "${top.source}"`,
          'info',
          7000,
          { label: 'Deschide', onClick: () => navigate(`/vault?source=${encodeURIComponent(sourceId)}`) },
        );
      } catch {
        // Proactive nicety — never disrupt the session on failure.
      }
    })();
    return () => { cancelled = true; };
  }, [revealed, examMode, question, answers, selectedNow, navigate, addToast]);

  return {
    aiText, aiLoading, mnemonicText, mnemonicLoading, activeAIPanel, setActiveAIPanel,
    analysisResult, nextTopicHint, hintLevel, hintData, hintLoading, showSmartNudge,
    handleGetHint, handleAIExplain, handleGenerateMnemonic, resetAssistiveState, resetForNewSet,
  };
}
