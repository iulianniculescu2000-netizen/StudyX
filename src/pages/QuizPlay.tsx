import { playableQuestions } from '../lib/bankDedup';
import { useBack } from '../hooks/useBack';
import { motion, AnimatePresence } from 'framer-motion';
import ProgressBar from '../components/fx/ProgressBar';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useAIStore } from '../store/aiStore';
import { useUserStore } from '../store/userStore';
import { useFocusModeStore } from '../store/focusModeStore';
import { useQuizChatContextStore } from '../store/quizChatContextStore';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import { dur, ease } from '../theme/motion';
import { useViewportProfile } from '../hooks/useViewportProfile';
import type { Quiz, QuizSession, Question, Confidence } from '../types';
import ConfidenceButtons from './quiz-play/ConfidenceButtons';
import { recordQuizSession } from '../ai/UserProfile';
import {
  cleanQuestionExplanation,
  getAnswerTextForOptionIds,
  getCorrectAnswerText,
} from '../helpers/quizAi';
import { evaluateSelection, getCorrectOptionIds, shuffleArray } from './quiz-play/helpers';
import { AIExplanationPanel, HintPanel, MnemonicPanel } from './quiz-play/ai-panels';
import { getFocusTokens, getQuizPlayLayout } from './quiz-play/layout';
import { penalizedScore, scoreAnswers } from './quiz-play/scoring';
import { useQuizTimers } from './quiz-play/hooks/useQuizTimers';
import { useQuizKeyboard } from './quiz-play/hooks/useQuizKeyboard';
import { useQuizAssist } from './quiz-play/hooks/useQuizAssist';
import { useAnswerFeedback } from './quiz-play/hooks/useAnswerFeedback';
import SessionHero from './quiz-play/components/SessionHero';
import QuestionCard from './quiz-play/components/QuestionCard';
import OptionList from './quiz-play/components/OptionList';
import NoteBox from './quiz-play/components/NoteBox';
import ChatContinuePanel from './quiz-play/components/ChatContinuePanel';
import { ActionDock, InlineConfirm } from './quiz-play/components/ActionDock';
import RelevantDocModal from './quiz-play/RelevantDocModal';

interface PlayRouteState {
  mode?: string;
  wrongQuestionsOnly?: string[];
  practiceCount?: number;
  blockStart?: number;
  examMinutes?: number;
}

export default function QuizPlay() {
  const { id } = useParams<{ id: string }>();
  const goBack = useBack('/quizzes');
  const location = useLocation();
  const hydrated = useStoresHydrated('quiz');
  const quiz = useQuizStore((s) => s.quizzes.find((q) => q.id === id));
  const state = location.state as PlayRouteState | null;
  const targetQuestionId = new URLSearchParams(location.search).get('question');
  const examMode = state?.mode === 'exam';
  const timedMode = state?.mode === 'timed';
  /** Simulare completă: timp total, nu per întrebare. La 0 sesiunea se încheie singură. */
  const examMinutes = examMode && state?.examMinutes && state.examMinutes > 0 ? state.examMinutes : 0;
  const wrongQuestionsOnly = state?.wrongQuestionsOnly;
  const practiceCount = state?.practiceCount;
  const blockStart = state?.blockStart ?? 0;

  // Build shuffled question/option order once
  const orderedQuestions = useMemo<Question[]>(() => {
    if (!quiz) return [];
    // A note points at one exact question, even if duplicate filtering normally hides it.
    // A stale link must not silently start the entire quiz.
    if (targetQuestionId !== null) {
      const target = quiz.questions.find((question) => question.id === targetQuestionId);
      return target ? [target] : [];
    }
    // Dublatele ascunse nu se joacă; dacă tot testul e ascuns, îl deschidem întreg (utilizatorul l-a ales explicit).
    const playable = playableQuestions(quiz);
    const pool = playable.length > 0 ? playable : quiz.questions;
    let qs = quiz.shuffleQuestions ? shuffleArray(pool) : [...pool];
    if (wrongQuestionsOnly && wrongQuestionsOnly.length > 0) {
      const uniqueWrongIds = Array.from(new Set(wrongQuestionsOnly));
      qs = qs.filter(q => uniqueWrongIds.includes(q.id));
    }
    if (practiceCount && practiceCount > 0) {
      const safeStart = Math.max(0, Math.min(blockStart, Math.max(0, qs.length - 1)));
      qs = qs.slice(safeStart, safeStart + practiceCount);
    }
    if (quiz.shuffleAnswers) {
      return qs.map((q) => ({ ...q, options: shuffleArray(q.options) }));
    }
    return qs;
  }, [quiz, targetQuestionId, wrongQuestionsOnly, practiceCount, blockStart]);

  // A new question set (different quiz, filters or shuffle) restarts the whole session: the
  // session component is remounted instead of resetting a dozen pieces of state by hand.
  const [seenSet, setSeenSet] = useState(orderedQuestions);
  const [sessionVersion, setSessionVersion] = useState(0);
  if (seenSet !== orderedQuestions) {
    setSeenSet(orderedQuestions);
    setSessionVersion((v) => v + 1);
  }

  if (!hydrated) return <PageSkeleton blocks={3} />;

  if (!quiz || orderedQuestions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={BookOpen}
            title={quiz && targetQuestionId !== null ? 'Întrebarea nu a fost găsită' : 'Grila nu a fost găsită'}
            body={quiz && targetQuestionId !== null ? 'Întrebarea a fost ștearsă sau linkul nu mai este valid.' : 'Poate a fost ștearsă sau nu are întrebări.'}
            primary={{ label: 'Toate grilele', to: '/quizzes' }}
            secondary={{ label: 'Înapoi', onClick: goBack }}
          />
        </div>
      </div>
    );
  }

  return (
    <QuizPlaySession
      key={sessionVersion}
      quiz={quiz}
      orderedQuestions={orderedQuestions}
      examMode={examMode}
      timedMode={timedMode}
      examMinutes={examMinutes}
      recoveryMode={!!wrongQuestionsOnly && wrongQuestionsOnly.length > 0}
      standaloneQuestion={targetQuestionId !== null}
    />
  );
}

interface QuizPlaySessionProps {
  quiz: Quiz;
  orderedQuestions: Question[];
  examMode: boolean;
  timedMode: boolean;
  examMinutes: number;
  /** Replaying only previously-wrong questions (label only). */
  recoveryMode: boolean;
  /** A direct link from a note is practice for one question, not a full-quiz attempt. */
  standaloneQuestion: boolean;
}

function QuizPlaySession({ quiz, orderedQuestions, examMode, timedMode, examMinutes, recoveryMode, standaloneQuestion }: QuizPlaySessionProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const viewport = useViewportProfile();
  const { mobile, compact, crampedHeight } = viewport;
  const addSession = useQuizStore((s) => s.addSession);
  const recordAnswer = useStatsStore((s) => s.recordAnswer);
  const recordStudySession = useStatsStore((s) => s.recordStudySession);
  const hasKey = useAIStore((s) => s.hasKey);
  const activeProfileId = useUserStore((s) => s.activeProfileId);
  const focusMode = useFocusModeStore((s) => s.focusMode);
  const toggleFocusMode = useFocusModeStore((s) => s.toggleFocusMode);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [questionQueue, setQuestionQueue] = useState<Question[]>(orderedQuestions);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [selectedNow, setSelectedNow] = useState<string[]>([]); // for current question
  const [revealed, setRevealed] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [autoAdvance, setAutoAdvance] = useState(false);
  // "User is still reading" flag, scoped to the question it was raised on.
  const [holdIdx, setHoldIdx] = useState<number | null>(null);
  if (holdIdx !== null && holdIdx !== currentIdx) setHoldIdx(null);
  const autoAdvanceHold = holdIdx === currentIdx;
  const setAutoAdvanceHold = useCallback(() => setHoldIdx(currentIdx), [currentIdx]);
  /** Question whose countdown already triggered an auto-advance, so it can't fire twice. */
  const autoAdvancedQuestionRef = useRef<string | null>(null);
  // Self-assessment captured after reveal. Kept in a ref so finishQuiz
  // reads the latest rating synchronously when grading the last card.
  const confidenceRef = useRef<Record<string, Confidence>>({});

  const question = questionQueue[currentIdx];
  const isLast = currentIdx === questionQueue.length - 1;
  const answeredCount = Object.keys(answers).length;
  const progress = questionQueue.length > 0 ? (answeredCount / questionQueue.length) * 100 : 0;
  const isMultiple = question?.multipleCorrect ?? false;

  // Forwarded lazily: the time-up handler needs finishQuiz, which is declared further down.
  const timeUpRef = useRef<() => void>(() => {});
  const { timeElapsed, examSecondsLeft, questionTimer } = useQuizTimers({
    examMode, timedMode, examMinutes, startedAt, currentIdx, revealed,
    onTimeUp: () => timeUpRef.current(),
  });
  const { shakeId, feedbackAnim, answerStreak, clearFeedback, playFeedback } = useAnswerFeedback();
  const assist = useQuizAssist({ question, revealed, examMode, currentIdx, answers, selectedNow, activeProfileId });
  const { aiText, aiLoading, mnemonicLoading, resetAssistiveState: resetAssist } = assist;

  // Let the general AI chat know "which question we're on" once the answer is
  // revealed, so a message like "cred că e corect și varianta C" resolves to
  // this exact question without the user re-typing it. Cleared on unmount so a
  // stray chat message sent from outside a quiz never targets a stale question.
  useEffect(() => {
    if (!quiz || !question || !revealed) return;
    useQuizChatContextStore.getState().setContext(quiz, question);
    return () => useQuizChatContextStore.getState().clearContext();
  }, [quiz, question, revealed]);

  // Finishing must run once per play: key auto-repeat, a click racing the exam timer or the
  // last-question timeout can all call it twice, which would save two sessions and double the stats.
  // The session component is remounted (key) for every new play, so the ref starts fresh each time.
  const finishedRef = useRef(false);
  const finishQuiz = useCallback((finalAnswers: Record<string, string[]>) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const { score, partialAnswerIds } = scoreAnswers(questionQueue, finalAnswers);
    questionQueue.forEach((q) => {
      const answer = finalAnswers[q.id];
      // Întrebările nevăzute (examen expirat / sărite) NU intră în statistici ca „greșite".
      if (answer === undefined) return;
      const result = evaluateSelection(answer, getCorrectOptionIds(q.options));
      // Partial counts as wrong for spaced-repetition tracking
      recordAnswer(quiz.id, q.id, result === 'correct', confidenceRef.current[q.id]);
    });
    const duration = Math.floor((Date.now() - startedAt) / 1000);
    recordStudySession(duration);

    // Single canonical write of the AI personalization profile (topic accuracy, weak/strong
    // topics, study patterns, mistake bank) — recordAnswer above already updated the SM-2
    // stats store, so questionStats is fresh by the time we read it here.
    if (activeProfileId) {
      const finishedAt = Date.now();
      const allQuestions = useQuizStore.getState().quizzes.flatMap((item) =>
        item.questions.map((q) => ({ ...q, category: item.category })),
      );
      const sessionItems = questionQueue.map((q) => {
        const userAnswers = finalAnswers[q.id] ?? [];
        const correctIds = getCorrectOptionIds(q.options);
        return {
          questionId: q.id,
          correct: evaluateSelection(userAnswers, correctIds) === 'correct',
          confidence: confidenceRef.current[q.id],
          userAnswer: getAnswerTextForOptionIds(q.options, userAnswers),
          correctAnswer: getCorrectAnswerText(q),
        };
      });
      recordQuizSession(activeProfileId, {
        stats: useStatsStore.getState().questionStats,
        questions: allQuestions,
        streak: useStatsStore.getState().streak.currentStreak,
        sessionItems,
        durationSeconds: duration,
        finishedAt,
      });
    }

    const session: QuizSession = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      quizId: quiz.id,
      answers: finalAnswers,
      startedAt,
      finishedAt: Date.now(),
      score,
      total: questionQueue.length,
      mode: examMode ? 'exam' : timedMode ? 'test' : 'study',
      // Rezidențiat penalty scoring: only when quiz.penaltyMode is on.
      ...(quiz.penaltyMode ? { penalizedScore: penalizedScore(questionQueue, finalAnswers) } : {}),
      ...(partialAnswerIds.length > 0 ? { partialAnswers: partialAnswerIds } : {}),
    };
    // A one-question note review must not become the quiz's best score or a
    // completed attempt. The result still receives this session via route state.
    if (!standaloneQuestion) addSession(session);
    navigate(`/results/${quiz.id}${standaloneQuestion ? '?single=1' : ''}`, { replace: true, state: { session, orderedQuestions: questionQueue } });
  }, [questionQueue, quiz, startedAt, addSession, navigate, recordAnswer, recordStudySession, examMode, timedMode, activeProfileId, standaloneQuestion]);

  const resetAssistiveState = useCallback(() => {
    resetAssist(); // also discards any AI reply still in flight
    clearFeedback();
  }, [resetAssist, clearFeedback]);

  const handleSkipQuestion = useCallback(() => {
    // Skip is only meaningful in study mode before revealing the answer.
    if (examMode || timedMode || revealed || questionQueue.length <= 1 || isLast) return;
    resetAssistiveState();
    setQuestionQueue((prev) => {
      const next = [...prev];
      const [skipped] = next.splice(currentIdx, 1);
      next.push(skipped);
      return next;
    });
    setSelectedNow([]);
    setRevealed(false);
  }, [examMode, timedMode, revealed, questionQueue.length, isLast, currentIdx, resetAssistiveState]);

  const handleSelect = useCallback((optId: string) => {
    if (revealed || finishedRef.current) return;
    if (isMultiple) {
      setSelectedNow((prev) =>
        prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
      );
      return;
    }

    setSelectedNow([optId]);
    if (examMode) {
      const newAnswers = { ...answers, [question.id]: [optId] };
      setAnswers(newAnswers);
      if (isLast) finishQuiz(newAnswers);
      else {
        setCurrentIdx((i) => i + 1);
        setSelectedNow([]);
      }
    }
  }, [revealed, isMultiple, examMode, answers, question, isLast, finishQuiz]);

  const confirmSelection = useCallback(() => {
    if (selectedNow.length === 0 || finishedRef.current) return;
    const newAnswers = { ...answers, [question.id]: selectedNow };
    setAnswers(newAnswers);
    if (examMode) {
      if (isLast) finishQuiz(newAnswers);
      else { setCurrentIdx((i) => i + 1); setSelectedNow([]); }
    } else {
      setRevealed(true);
      const correctIdsForQuestion = getCorrectOptionIds(question.options);
      const result = evaluateSelection(selectedNow, correctIdsForQuestion);
      playFeedback(result, selectedNow.find((id) => !correctIdsForQuestion.includes(id)) ?? selectedNow[0] ?? null);
    }
  }, [selectedNow, question, answers, examMode, isLast, finishQuiz, playFeedback]);

  const handleNext = useCallback(() => {
    resetAssistiveState();
    if (isLast) {
      finishQuiz(answers);
    } else {
      setCurrentIdx((i) => i + 1);
      setSelectedNow([]);
      setRevealed(false);
    }
  }, [isLast, answers, finishQuiz, resetAssistiveState]);

  // Go back to review or change an already-answered question — every real exam
  // simulator allows this before final submission. Restores that question's own
  // recorded selection/reveal state rather than resetting it.
  const handleGoPrevious = useCallback(() => {
    if (currentIdx === 0) return;
    resetAssistiveState();
    const prevIdx = currentIdx - 1;
    const prevQuestion = questionQueue[prevIdx];
    const prevAnswer = answers[prevQuestion.id];
    setCurrentIdx(prevIdx);
    setSelectedNow(prevAnswer ?? []);
    // Exam mode never reveals correctness mid-session; study/timed modes show
    // the same reveal state you'd have seen the first time you answered it.
    setRevealed(!examMode && prevAnswer !== undefined);
  }, [currentIdx, questionQueue, answers, examMode, resetAssistiveState]);

  // Record the self-assessment for the current question, then advance. The ref
  // is updated synchronously so finishQuiz sees the rating of the last card.
  const handleConfidence = useCallback((level: Confidence) => {
    if (!revealed || !question) return;
    confidenceRef.current = { ...confidenceRef.current, [question.id]: level };
    handleNext();
  }, [revealed, question, handleNext]);

  // Auto-advance still needs a confidence rating for spaced repetition to work —
  // silently calling handleNext() would leave confidenceRef empty for the question
  // and degrade the SM-2 scheduling. Infer a reasonable rating from correctness
  // instead of skipping it (the user can always tap a real rating before this fires).
  const handleAutoAdvance = useCallback(() => {
    if (!revealed || !question) return;
    const selection = answers[question.id] ?? selectedNow;
    const result = evaluateSelection(selection, getCorrectOptionIds(question.options));
    const inferred: Confidence = result === 'correct' ? 'confident' : result === 'partial' ? 'guess' : 'blackout';
    handleConfidence(inferred);
  }, [revealed, question, answers, selectedNow, handleConfidence]);

  // Auto-advance after reveal. Gives enough time to actually read before moving on,
  // and backs off entirely (autoAdvanceHold) the moment the user shows they're still
  // engaging with the question — see the interaction-cancel effect below.
  useEffect(() => {
    if (!revealed || !autoAdvance || examMode || aiLoading || mnemonicLoading || autoAdvanceHold) return;
    const hasExplanation = !!cleanQuestionExplanation(question?.explanation);
    // Longer once AI explanation text is showing (more to read), shorter for a bare reveal.
    const delay = aiText ? 6500 : hasExplanation ? 4500 : 3200;
    const timer = setTimeout(handleAutoAdvance, delay);
    return () => clearTimeout(timer);
  }, [revealed, autoAdvance, handleAutoAdvance, examMode, aiLoading, mnemonicLoading, aiText, autoAdvanceHold, question]);

  // Any sign the user is still engaging with the revealed question — clicking into the
  // explanation/AI/mnemonic panels, writing a note, scrolling to read — cancels the pending
  // auto-advance instead of yanking them to the next question mid-read. Manually tapping a
  // confidence rating or the Next button still advances immediately (unaffected: the effect
  // above cleans itself up once `revealed` flips).
  useEffect(() => {
    if (!revealed || !autoAdvance || autoAdvanceHold) return;
    const cancel = () => setAutoAdvanceHold();
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchmove', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    window.addEventListener('pointerdown', cancel);
    return () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('pointerdown', cancel);
    };
  }, [revealed, autoAdvance, autoAdvanceHold, setAutoAdvanceHold]);

  // Timed mode: when the per-question timer hits 0, record what was selected (a partial pick beats nothing —
  // dacă utilizatorul a selectat ceva, păstrăm selecția) and move on. The countdown re-arms by itself when
  // the index changes, so one expired timer can never blank the next question too.
  useEffect(() => {
    timeUpRef.current = () => {
      if (autoAdvancedQuestionRef.current === question.id) return;
      autoAdvancedQuestionRef.current = question.id;
      const newAnswers = { ...answers, [question.id]: selectedNow };
      setAnswers(newAnswers);
      setSelectedNow([]);
      if (isLast) finishQuiz(newAnswers);
      else setCurrentIdx((i) => i + 1);
    };
  });

  // Simulare: când expiră timpul total, se încheie cu ce ai răspuns până atunci (selecția curentă se păstrează).
  const examExpiredRef = useRef(false);
  useEffect(() => {
    if (!examMinutes || examSecondsLeft > 0 || examExpiredRef.current || !question?.id) return;
    examExpiredRef.current = true;
    finishQuiz(selectedNow.length > 0 ? { ...answers, [question.id]: selectedNow } : answers);
  }, [examMinutes, examSecondsLeft, question, selectedNow, answers, finishQuiz]);

  useQuizKeyboard({
    question, revealed, examMode, currentIdx,
    onSelect: handleSelect,
    onConfirm: confirmSelection,
    onNext: handleNext,
    onHint: assist.handleGetHint,
    onConfidence: handleConfidence,
    onPrevious: handleGoPrevious,
  });

  const segments = useMemo(
    () => questionQueue.map((q, i) => ({ done: answers[q.id] !== undefined, current: i === currentIdx })),
    [questionQueue, answers, currentIdx],
  );

  const correctIds = getCorrectOptionIds(question.options);
  const currentSelection = answers[question.id] ?? selectedNow;
  const selectionResult = evaluateSelection(currentSelection, correctIds);
  const wasWrong = currentSelection.length > 0 && selectionResult === 'wrong';
  const wasPartial = currentSelection.length > 0 && selectionResult === 'partial';
  const selectedAnswerText = getAnswerTextForOptionIds(question.options, currentSelection);
  const correctAnswerText = getCorrectAnswerText(question);
  const { analysisResult, nextTopicHint } = assist;
  const studyFocusTopic = analysisResult?.recommendedTopic ?? analysisResult?.missingConcept ?? nextTopicHint ?? question.tags?.[0] ?? null;
  const autoAdvanceDelayMs = (!revealed || !autoAdvance || examMode || aiLoading || mnemonicLoading || autoAdvanceHold)
    ? undefined
    : aiText ? 6500 : cleanQuestionExplanation(question.explanation) ? 4500 : 3200;
  const focus = getFocusTokens(theme, focusMode);
  const layout = getQuizPlayLayout(viewport);
  const { denseLayout, shellPaddingClass, contentCardPaddingClass, questionWidthClass } = layout;
  const modeLabel = examMode
    ? 'Simulare examen'
    : timedMode
      ? 'Test cronometrat'
      : recoveryMode
        ? 'Recuperare greșeli'
        : 'Studiu ghidat';
  const timerTone = questionTimer <= 10 ? theme.danger : timedMode ? theme.warning : theme.accent;
  const showActionDock = compact || crampedHeight || mobile;
  const total = questionQueue.length;

  return (
    <div className="premium-shell no-fab-gap h-full overflow-y-auto relative">
      {/* Dark overlay for Focus Mode */}
      <AnimatePresence>
        {focusMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-0 pointer-events-none"
            style={{
              background: `rgb(var(--shadow-rgb) / ${theme.isDark ? 0.26 : 0.08})`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Top thin progress bar */}
      <div className="fixed top-0 left-0 w-full z-[100] pointer-events-none">
        <ProgressBar percent={progress} track={`${theme.accent}10`} color={theme.accent}
          transition={{ duration: dur.slow, ease: ease.emphasized }} label="Progres test" />
      </div>

      <div className={`min-h-full relative z-10 ${shellPaddingClass}`}>
        <div className="max-w-[1120px] mx-auto shell-main-stage">
          <SessionHero
            quiz={quiz}
            theme={theme}
            layout={layout}
            mobile={mobile}
            pageTransition={t.page}
            modeLabel={modeLabel}
            examMode={examMode}
            timedMode={timedMode}
            examMinutes={examMinutes}
            examSecondsLeft={examSecondsLeft}
            timeElapsed={timeElapsed}
            questionTimer={questionTimer}
            autoAdvance={autoAdvance}
            focusMode={focusMode}
            revealed={revealed}
            isLast={isLast}
            isMultiple={isMultiple}
            currentIdx={currentIdx}
            total={total}
            answeredCount={answeredCount}
            progress={progress}
            segments={segments}
            onToggleAuto={() => setAutoAdvance((v) => !v)}
            onToggleFocus={toggleFocusMode}
            onPrevious={handleGoPrevious}
            onSkip={handleSkipQuestion}
          />

          {/* Question */}
          <div className={`${questionWidthClass} mx-auto w-full flex flex-col`}>
            <div
              className={`glass-panel rounded-[var(--r-xl)] ${contentCardPaddingClass}`}
              style={focusMode ? { background: focus.surface, borderColor: focus.border, boxShadow: focus.panelShadow } : undefined}
            >
              <AnimatePresence mode="wait">
                <motion.div key={`${question.id}-${currentIdx}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={t.pop}
                  className={`flex-1 flex flex-col ${feedbackAnim === 'wrong' ? 'anim-shake' : feedbackAnim === 'correct' ? 'anim-bounce' : feedbackAnim === 'partial' ? 'anim-pulse-partial' : ''}`}
                >
                  <QuestionCard
                    question={question}
                    theme={theme}
                    layout={layout}
                    focusMode={focusMode}
                    modeLabel={modeLabel}
                    currentIdx={currentIdx}
                    total={total}
                    isMultiple={isMultiple}
                    revealed={revealed}
                  />

                  <HintPanel
                    calmMotion={calmMotion}
                    examMode={examMode}
                    usesRemoteAI={hasKey}
                    hintLevel={assist.hintLevel}
                    hintData={assist.hintData}
                    hintLoading={assist.hintLoading}
                    revealed={revealed}
                    showSmartNudge={assist.showSmartNudge}
                    onGetHint={assist.handleGetHint}
                    theme={theme}
                  />

                  <OptionList
                    options={question.options}
                    correctIds={correctIds}
                    selectedNow={selectedNow}
                    revealed={revealed}
                    isMultiple={isMultiple}
                    wasPartial={wasPartial}
                    shakeId={shakeId}
                    theme={theme}
                    layout={layout}
                    focusMode={focusMode}
                    calmMotion={calmMotion}
                    onSelect={handleSelect}
                  />

                  {/* Confirm button */}
                  <AnimatePresence>
                    {showActionDock ? null : ((!revealed && !examMode) || (isMultiple && examMode && !revealed)) ? (
                      <InlineConfirm
                        theme={theme}
                        calmMotion={calmMotion}
                        examMode={examMode}
                        isMultiple={isMultiple}
                        selectedCount={selectedNow.length}
                        onConfirm={confirmSelection}
                      />
                    ) : null}
                  </AnimatePresence>

                  {/* Explanation */}
                  <AnimatePresence>
                    {revealed && !examMode && cleanQuestionExplanation(question.explanation) && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 p-4 rounded-2xl overflow-hidden"
                        style={{ background: `${theme.accent}0C`, border: `1px solid ${theme.accent}25` }}
                      >
                        <p className="explanation-body text-sm" style={{ color: theme.text2 }}>
                          <span className="font-semibold" style={{ color: theme.accentText }}>Explicație: </span>
                          {cleanQuestionExplanation(question.explanation)}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Explanation and Mnemonic used to be able to stack expanded at once — a single
                      tab switcher keeps one active at a time when both are relevant (wrong answer). */}
                  {revealed && !examMode && wasWrong && (
                    <div className="mb-3 flex items-center gap-2">
                      {(['explanation', 'mnemonic'] as const).map((panel) => (
                        <button
                          key={panel}
                          onClick={() => assist.setActiveAIPanel(panel)}
                          className="fine-chip rounded-full px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.1em]"
                          data-active={assist.activeAIPanel === panel}
                          style={{ color: assist.activeAIPanel === panel ? undefined : theme.text3 }}
                        >
                          {panel === 'explanation' ? 'Explicație' : 'Mnemonic'}
                        </button>
                      ))}
                    </div>
                  )}

                  {assist.activeAIPanel === 'explanation' && (
                    <AIExplanationPanel
                      aiLoading={aiLoading}
                      aiText={aiText}
                      analysisResult={analysisResult}
                      examMode={examMode}
                      usesRemoteAI={hasKey}
                      nextTopicHint={nextTopicHint}
                      revealed={revealed}
                      onExplain={assist.handleAIExplain}
                      theme={theme}
                    />
                  )}

                  {assist.activeAIPanel === 'mnemonic' && (
                    <MnemonicPanel
                      examMode={examMode}
                      usesRemoteAI={hasKey}
                      mnemonicLoading={mnemonicLoading}
                      mnemonicText={assist.mnemonicText}
                      revealed={revealed}
                      wasWrong={wasWrong}
                      onGenerate={assist.handleGenerateMnemonic}
                      theme={theme}
                    />
                  )}

                  <AnimatePresence>
                    {revealed && !examMode && hasKey && (
                      <ChatContinuePanel
                        theme={theme}
                        question={question}
                        analysisResult={analysisResult}
                        studyFocusTopic={studyFocusTopic}
                        correctAnswerText={correctAnswerText}
                        selectedAnswerText={selectedAnswerText}
                        wasWrong={wasWrong}
                        wasPartial={wasPartial}
                      />
                    )}
                  </AnimatePresence>

                  {/* Personal note */}
                  <AnimatePresence>
                    {revealed && !examMode && <NoteBox questionId={question.id} theme={theme} />}
                  </AnimatePresence>

                  {/* Confidence rating (replaces the plain Next button in study modes) */}
                  <AnimatePresence>
                    {revealed && !showActionDock && (
                      <ConfidenceButtons
                        onRate={handleConfidence}
                        theme={theme}
                        calmMotion={calmMotion}
                        isLast={isLast}
                        denseLayout={denseLayout}
                        autoAdvanceMs={autoAdvanceDelayMs}
                        onCancelAutoAdvance={setAutoAdvanceHold}
                      />
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {showActionDock && (
                      <ActionDock
                        theme={theme}
                        layout={layout}
                        mobile={mobile}
                        calmMotion={calmMotion}
                        examMode={examMode}
                        timedMode={timedMode}
                        revealed={revealed}
                        isLast={isLast}
                        isMultiple={isMultiple}
                        selectedCount={selectedNow.length}
                        answerStreak={answerStreak}
                        questionTimer={questionTimer}
                        timerTone={timerTone}
                        currentIdx={currentIdx}
                        total={total}
                        onRate={handleConfidence}
                        onNext={handleNext}
                        onConfirm={confirmSelection}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <RelevantDocModal
        open={assist.relevantDocModalOpen}
        chunk={assist.relevantDocChunk}
        onClose={() => assist.setRelevantDocModalOpen(false)}
      />
    </div>
  );
}
