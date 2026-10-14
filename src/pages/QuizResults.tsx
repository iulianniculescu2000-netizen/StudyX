import { useFolderStore } from '../store/folderStore';
import { folderNamesOf } from '../lib/topicMastery';
import TopicProgressCard from '../components/quiz-results/TopicProgressCard';
import { topicMasteryDelta } from '../lib/topicMasteryDelta';
import { EXAM_SIM_TAG } from '../lib/examSimulation';
import { useBack } from '../hooks/useBack';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { RotateCcw, Home, Check, X, Star, Download, Bot, Loader2, MessageSquare, BookOpen, Trophy, ThumbsUp, Lightbulb } from 'lucide-react';
import type { QuizSession, Question, QuestionStat } from '../types';
import type { WrongOptionAnalysis } from '../ai/types';
import { useQuizStore } from '../store/quizStore';
import { upsertGeneratedQuiz } from '../lib/generatedQuiz';
import { useStatsStore } from '../store/statsStore';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore } from '../store/aiStore';
import { useUserStore } from '../store/userStore';
import { useUIStore } from '../store/uiStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import TourHelpButton from '../tutorial/TourHelpButton';
import ResultHero from './results/ResultHero';
import { countUnanswered, disciplineBreakdownWithUnanswered, isUnanswered } from './results/unanswered';
import { buildClarificationFallback, cleanQuestionExplanation, getAnswerTextForOptionIds, getCorrectAnswerText } from '../helpers/quizAi';
import { explainAnswerInline } from '../lib/groq';
import AIRichText from '../components/ai-chat/AIRichText';
import { buildAdaptiveExamQuiz, buildMistakeFlashcardQuiz, buildWeaknessRecoveryQuiz } from '../lib/adaptiveStudy';

export default function QuizResults() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const singleQuestionResult = new URLSearchParams(location.search).get('single') === '1';
  const navigate = useNavigate();
  const goBack = useBack('/quizzes');
  const quizzes = useQuizStore((s) => s.quizzes);
  const sessions = useQuizStore((s) => s.sessions);
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const hydrated = useStoresHydrated('quiz');
  // Hooks must be called unconditionally — before any early returns
  const hasKey = useAIStore((s) => s.hasKey);
  const questionStats = useStatsStore((s) => s.questionStats);
  const folders = useFolderStore((s) => s.folders);
  const folderNames = useMemo(() => folderNamesOf(folders), [folders]);
  const getAccuracy = useStatsStore((s) => s.getAccuracy);
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [optionAnalysis, setOptionAnalysis] = useState<Record<string, WrongOptionAnalysis[]>>({});
  const [optionAnalysisLoading, setOptionAnalysisLoading] = useState<Record<string, boolean>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [followUpLoading, setFollowUpLoading] = useState<'flashcards' | 'recovery' | 'exam' | null>(null);

  const state = location.state as { session: QuizSession; orderedQuestions?: Question[] } | QuizSession | undefined;
  let session: QuizSession | undefined;
  let orderedQuestions: Question[] | undefined;

  if (state && 'session' in state) {
    session = state.session;
    orderedQuestions = state.orderedQuestions;
  } else {
    session = state as QuizSession | undefined;
  }

  const fallbackSession = useMemo(() => {
    if (!id || singleQuestionResult) return undefined;
    return sessions
      .filter((item) => item.quizId === id)
      .sort((left, right) => (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt))[0];
  }, [id, sessions, singleQuestionResult]);

  session = session ?? fallbackSession;

  const quiz = quizzes.find((q) => q.id === id);
  const questions = useMemo(() => orderedQuestions ?? quiz?.questions ?? [], [orderedQuestions, quiz?.questions]);
  // „Exersare: <subiect>” / „Grile noi: <subiect>”: cât s-a mișcat stăpânirea subiectului prin sesiunea asta.
  const masteryDelta = useMemo(
    () => (quiz && session && !singleQuestionResult ? topicMasteryDelta(quizzes, questionStats, quiz, session.answers, Date.now(), folderNames) : null),
    [quizzes, questionStats, quiz, session, singleQuestionResult, folderNames],
  );
  const isAdaptiveExam = quiz?.tags?.includes('adaptive-exam') ?? false;
  const isRecoverySession = quiz?.tags?.includes('recovery') ?? false;
  const isMistakeDeck = quiz?.tags?.includes('mistake-bank') ?? false;
  const isExamSimulation = quiz?.tags?.includes(EXAM_SIM_TAG) ?? false;
  const disciplineResults = useMemo(() => {
    if (!isExamSimulation) return [];
    return disciplineBreakdownWithUnanswered(questions, session?.answers, (question) => {
      const given = session?.answers[question.id] ?? [];
      const correct = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      return given.length === correct.length && correct.every((entry) => given.includes(entry));
    });
  }, [isExamSimulation, questions, session?.answers]);
  const wrongEntries = useMemo(() => questions
    .map((question) => {
      const userAnswerIds = session?.answers[question.id] ?? [];
      const correctIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const isCorrect = userAnswerIds.length === correctIds.length && correctIds.every((entry) => userAnswerIds.includes(entry));
      return { question, isCorrect };
    })
    // Întrebările fără răspuns (examen expirat) nu sunt greșeli de revizuit.
    .filter((entry) => !entry.isCorrect && !isUnanswered(session?.answers, entry.question)), [questions, session?.answers]);
  const unansweredCount = useMemo(() => countUnanswered(session?.answers, questions), [questions, session?.answers]);

  // `?? 1` only guards `undefined`; a session with total 0 (imported/legacy data,
  // or a quiz whose questions were later deleted) still gave 0/0 = NaN, which
  // rendered as "NaN%" and poisoned the score ring's strokeDashoffset.
  const pct = session && session.total > 0
    ? Math.round((session.score / session.total) * 100)
    : 0;

  if (!hydrated) return <PageSkeleton blocks={3} />;

  if (!session || !quiz) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={BookOpen}
            title="Sesiunea nu a fost găsită"
            body={singleQuestionResult ? 'Rezultatul acestei întrebări nu se păstrează în istoricul grilei.' : 'Rezultatul nu mai există sau linkul nu mai este valid.'}
            primary={{ label: 'Toate grilele', to: '/quizzes' }}
            secondary={{ label: 'Înapoi', onClick: goBack }}
          />
        </div>
      </div>
    );
  }

  const duration = session.finishedAt ? Math.round((session.finishedAt - session.startedAt) / 1000) : 0;

  const handleExplain = async (q: Question, userAnswerText: string, correctText: string) => {
    if (aiLoading[q.id] || aiExplanations[q.id]) return;
    setAiLoading((p) => ({ ...p, [q.id]: true }));
    const total = Object.values(questionStats).reduce((s, qs: QuestionStat) => (qs.retired ? s : s + qs.timesCorrect + qs.timesWrong), 0);
    const userContext = total > 0 ? `Student medical: ${total} grile rezolvate, acuratețe ${getAccuracy()}%.` : undefined;
    try {
      // Streams, and — unlike the previous explainer — first checks whether the
      // marked answer is medically correct at all, saying so loudly when it
      // isn't. Imported banks do carry mis-keyed questions.
      let streamed = '';
      await explainAnswerInline(
        q.text,
        q.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
        (chunk) => {
          streamed += chunk;
          setAiExplanations((p) => ({ ...p, [q.id]: streamed }));
        },
        undefined,
        userContext,
      );
      if (!streamed.trim()) {
        setAiExplanations((p) => ({ ...p, [q.id]: buildClarificationFallback(q, userAnswerText, correctText) }));
      }
    } catch {
      setAiExplanations((p) => ({ ...p, [q.id]: buildClarificationFallback(q, userAnswerText, correctText) }));
    } finally {
      setAiLoading((p) => ({ ...p, [q.id]: false }));
    }
  };

  /** Per-distractor breakdown: why each wrong option fails, and when it wouldn't. */
  const handleExplainOptions = async (q: Question) => {
    if (optionAnalysisLoading[q.id] || optionAnalysis[q.id]) return;
    setOptionAnalysisLoading((p) => ({ ...p, [q.id]: true }));
    try {
      const { explainWrongOptions } = await import('../ai/AIEngine');
      const options = await explainWrongOptions(q);
      setOptionAnalysis((p) => ({ ...p, [q.id]: options }));
    } catch {
      setOptionAnalysis((p) => ({ ...p, [q.id]: [] }));
    } finally {
      setOptionAnalysisLoading((p) => ({ ...p, [q.id]: false }));
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };
  const openResultsDebrief = (prompt: string, mode: 'explain' | 'summarize' | 'test' = 'summarize') => {
    setChatOpen(true);
    window.dispatchEvent(new CustomEvent('studyx:ai-prompt', {
      detail: {
        open: true,
        view: 'chat', // a debrief is a conversation, never the Studio pane
        mode,
        resetConversation: true,
        prompt,
      },
    }));
  };

  const grade =
    pct >= 90 ? { label: 'Excelent!', Icon: Trophy, color: theme.accentText }
    : pct >= 70 ? { label: 'Bine!', Icon: Star, color: theme.success }
    : pct >= 50 ? { label: 'Satisfăcător', Icon: ThumbsUp, color: theme.warning }
    : { label: 'Mai încearcă!', Icon: BookOpen, color: theme.danger };

  const exportResults = () => {
    const data = {
      quiz: quiz.title,
      date: new Date(session!.startedAt).toLocaleString('ro-RO'),
      score: `${session!.score}/${session!.total} (${pct}%)`,
      duration: formatTime(duration),
      questions: questions.map((q) => {
        const userAnswers = session!.answers[q.id] ?? [];
        const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
        return {
          question: q.text,
          correct: userAnswers.length === correctIds.length && correctIds.every((i) => userAnswers.includes(i)),
          yourAnswer: getAnswerTextForOptionIds(q.options, userAnswers),
          correctAnswer: getCorrectAnswerText(q),
        };
      }),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rezultate-${quiz.title.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const launchFollowUp = (mode: 'flashcards' | 'recovery' | 'exam') => {
    if (!activeProfileId) return;
    setFollowUpLoading(mode);
    try {
      const nextQuiz =
        mode === 'flashcards'
          ? buildMistakeFlashcardQuiz(activeProfileId, quizzes, questionStats)
          : mode === 'recovery'
            ? buildWeaknessRecoveryQuiz(activeProfileId, quizzes, questionStats)
            : buildAdaptiveExamQuiz(activeProfileId, quizzes, questionStats);

      if (!nextQuiz) return;
      // Același set generat se reîmprospătează, nu se înmulțește în bibliotecă la fiecare lansare.
      const nextId = upsertGeneratedQuiz(nextQuiz);
      navigate(
        mode === 'flashcards' ? `/flashcards/session/${nextId}?mode=all` : `/play/${nextId}`,
        mode === 'exam' ? { state: { mode: 'exam' } } : undefined,
      );
    } finally {
      setFollowUpLoading(null);
    }
  };

  const insightTitle = isAdaptiveExam
    ? (pct >= 85 ? 'Simulare foarte solidă' : pct >= 65 ? 'Ai o bază bună de examen' : 'Mai e loc clar de consolidare')
    : isRecoverySession
      ? (pct >= 80 ? 'Recuperarea a prins bine' : 'Mai merită o rundă focalizată')
      : isMistakeDeck
        ? (pct >= 85 ? 'Greșelile vechi se fixează' : 'Flashcards-urile mai au valoare pentru consolidare')
        : (pct >= 85 ? 'Ritm excelent' : 'Poți împinge și mai sus sesiunea următoare');

  const insightText = isAdaptiveExam
    ? 'Examen adaptiv ți-a calibrat dificultatea după istoricul tău. Pasul următor bun este o sesiune scurtă pe punctele slabe sau un deck de fixare din greșeli.'
    : isRecoverySession
      ? 'Recuperarea punctelor slabe a extras exact zonele unde ai nevoie de consolidare. Dacă mai sunt goluri, transformă-le direct în flashcards sau treci într-o simulare de examen.'
      : isMistakeDeck
        ? 'Deck-ul din greșeli e excelent pentru fixare rapidă. După ce scorul urcă, continuă cu o recuperare focalizată sau cu un examen adaptiv.'
        : 'Poți continua inteligent: recuperezi punctele slabe, creezi flashcards din greșeli sau intri direct într-un examen adaptiv.';
  // Chatul nu vede sesiunea: întrebările greșite intră în mesaj, ca debrief-ul să fie despre ele și nu un răspuns general.
  const missedSummary = wrongEntries.slice(0, 8).map(({ question }, index) => {
    const given = session.answers[question.id] ?? [];
    const chosen = question.options.filter((option) => given.includes(option.id)).map((option) => option.text).join(' / ') || 'niciun răspuns';
    const correct = question.options.filter((option) => option.isCorrect).map((option) => option.text).join(' / ');
    return `${index + 1}. ${question.text} | răspunsul meu: ${chosen} | corect: ${correct}`;
  }).join('\n');
  const debriefPrompt = wrongEntries.length > 0
    ? `Vreau un debrief al sesiunii "${quiz.title}". Am obținut ${session.score}/${session.total} (${pct}%). Mă interesează mai ales unde am greșit și ce trebuie să corectez prioritar pentru examen.

Întrebările pe care le-am pierdut:
${missedSummary}${wrongEntries.length > 8 ? `
(și încă ${wrongEntries.length - 8})` : ''}`
    : `Vreau un debrief scurt al sesiunii "${quiz.title}". Am obținut ${session.score}/${session.total} (${pct}%). Spune-mi ce am făcut bine și cum să păstrez nivelul.`;

  return (
    <div className="premium-shell h-full overflow-y-auto">
    <div className="min-h-full pt-6 pb-20 px-4 sm:px-6 relative z-10">
      <div className="max-w-3xl mx-auto shell-main-stage">

        <div className="mb-2 flex justify-end"><TourHelpButton tour="quizResults" label="Ghid pentru rezultatele grilei" /></div>
        <div data-tutorial="quiz-results-score">
        <ResultHero key={session.id} quiz={quiz} session={session} sessions={sessions}
          pct={pct} grade={grade} duration={duration} formatTime={formatTime}
          wrongCount={wrongEntries.length} unansweredCount={unansweredCount} disciplineResults={disciplineResults} />
        </div>
        {masteryDelta && <TopicProgressCard delta={masteryDelta} />}
        {singleQuestionResult && (
          <p className="-mt-4 mb-6 rounded-[var(--r-md)] px-4 py-3 text-center text-xs leading-relaxed"
            style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }}>
            Ai exersat o singură întrebare. Rezultatul acesta nu se păstrează în istoricul grilei.
          </p>
        )}

        <motion.div
          data-tutorial="quiz-results-next"
          initial={calmMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t.page}
          className="editorial-hero luxe-card rounded-[var(--r-xl)] p-5 mb-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(180deg, ${theme.surface}, ${theme.surface2})`,
            border: `1px solid ${theme.border}`,
            boxShadow: 'var(--elev-1)',
          }}>
          {!calmMotion && <div
            className="absolute -top-10 right-0 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: `${theme.accent}10` }}
          />}
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.18em] font-black mb-2" style={{ color: theme.accentText }}>
              Continuă inteligent
            </div>
            <h2 className="text-xl font-black tracking-tight mb-1" style={{ color: theme.text }}>{insightTitle}</h2>
            <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: theme.text2 }}>{insightText}</p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => launchFollowUp('flashcards')}
                disabled={!activeProfileId || followUpLoading !== null}
                className="rounded-2xl px-4 py-3 text-sm font-semibold text-left transition-[background-color,border-color,color,opacity,transform] disabled:opacity-55"
                style={{ background: `${theme.warning}12`, border: `1px solid ${theme.warning}30`, color: theme.text }}>
                {followUpLoading === 'flashcards' ? 'Generez flashcards...' : 'Flashcards din greșeli'}
              </button>
              <button
                onClick={() => launchFollowUp('recovery')}
                disabled={!activeProfileId || followUpLoading !== null}
                className="rounded-2xl px-4 py-3 text-sm font-semibold text-left transition-[background-color,border-color,color,opacity,transform] disabled:opacity-55"
                style={{ background: `${theme.success}10`, border: `1px solid ${theme.success}28`, color: theme.text }}>
                {followUpLoading === 'recovery' ? 'Construiesc sesiunea...' : 'Recuperare puncte slabe'}
              </button>
              <button
                onClick={() => launchFollowUp('exam')}
                disabled={!activeProfileId || followUpLoading !== null}
                className="rounded-2xl px-4 py-3 text-sm font-semibold text-left transition-[background-color,border-color,color,opacity,transform] disabled:opacity-55"
                style={{ background: `${theme.accent}10`, border: `1px solid ${theme.accent}28`, color: theme.text }}>
                {followUpLoading === 'exam' ? 'Pregătesc simularea...' : 'Simulare adaptivă'}
              </button>
            </div>
            {hasKey && (
              <button
                onClick={() => openResultsDebrief(debriefPrompt, wrongEntries.length > 0 ? 'explain' : 'summarize')}
                className="premium-card-hover press-feedback mt-4 inline-flex items-center gap-2 rounded-[var(--r-lg)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white"
                style={{ background: theme.accent, boxShadow: 'var(--elev-2)' }}
              >
                <MessageSquare size={14} />
                Debrief cu AI Coach
              </button>
            )}
          </div>
        </motion.div>

        {/* Question review */}
        <motion.div initial={calmMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={t.page}
          className="luxe-card rounded-[var(--r-xl)] p-5 mb-6"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          <h2 data-tutorial="quiz-results-answers" className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text2 }}>
            <Star size={13} />Revizuire răspunsuri
          </h2>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const userAnswerIds = session!.answers[q.id] ?? [];
              const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
              const isCorrect =
                userAnswerIds.length === correctIds.length &&
                correctIds.every((id) => userAnswerIds.includes(id));

              const skipped = !isCorrect && userAnswerIds.length === 0;
              const userAnswerTexts = getAnswerTextForOptionIds(q.options, userAnswerIds, '');
              const correctTexts = getCorrectAnswerText(q);

              return (
                <motion.div key={q.id}
                  initial={calmMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={t.pop}
                  className="premium-card-hover flex items-start gap-3 p-4 rounded-[var(--r-lg)]"
                  style={{
                    background: isCorrect ? `${theme.success}08` : skipped ? theme.surface2 : `${theme.danger}08`,
                    border: `1px solid ${isCorrect ? `${theme.success}20` : skipped ? theme.border : `${theme.danger}20`}`,
                  }}>
                  <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                    style={{ background: isCorrect ? `${theme.success}18` : skipped ? theme.surface2 : `${theme.danger}18` }}>
                    {isCorrect
                      ? <Check size={12} style={{ color: theme.success }} />
                      : <X size={12} style={{ color: skipped ? theme.text3 : theme.danger }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-1" style={{ color: theme.text }}>
                      {i + 1}. {q.text}
                    </p>
                    {q.imageUrl && (
                      <img src={q.imageUrl} alt="Imagine întrebare"
                        className="max-h-28 object-contain rounded-xl mb-2"
                        style={{ border: `1px solid ${theme.border}` }} />
                    )}
                    {skipped && (
                      <p className="text-xs mb-0.5" style={{ color: theme.text3 }}>Fără răspuns</p>
                    )}
                    {!isCorrect && userAnswerTexts && (
                      <p className="text-xs mb-0.5" style={{ color: theme.danger }}>
                        Răspunsul tău: {userAnswerTexts}
                      </p>
                    )}
                    {!isCorrect && (
                      <p className="text-xs" style={{ color: theme.success }}>
                        Corect: {correctTexts}
                      </p>
                    )}
                    {isCorrect && (
                      <p className="text-xs" style={{ color: theme.success }}><Check size={12} className="inline-block align-text-bottom mr-1" />{userAnswerTexts}</p>
                    )}
                    {cleanQuestionExplanation(q.explanation) && (
                      <p className="text-xs mt-1" style={{ color: theme.text3 }}>
                        <Lightbulb size={12} className="inline-block align-text-bottom mr-1" />{cleanQuestionExplanation(q.explanation)}
                      </p>
                    )}
                    {/* AI Explainer — only for wrong answers */}
          {!isCorrect && (
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-2">
                          {!aiExplanations[q.id] ? (
                            <button
                              onClick={() => handleExplain(q, userAnswerTexts, correctTexts)}
                              disabled={aiLoading[q.id]}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-[background-color,border-color,color,opacity,transform]"
                              style={{
                                background: `${theme.accent}14`,
                                color: aiLoading[q.id] ? theme.text3 : theme.accent,
                                border: `1px solid ${theme.accent}30`,
                              }}>
                              {aiLoading[q.id]
                                ? <><Loader2 size={11} className={calmMotion ? undefined : 'animate-spin'} />Generez explicație...</>
                                : <><Bot size={11} />{hasKey ? 'Explică cu AI' : 'Explică smart'}</>}
                            </button>
                          ) : (
                            <AnimatePresence>
                              <motion.div
                                initial={calmMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={t.pop}
                                className="mt-1 p-2.5 rounded-xl text-xs leading-relaxed overflow-hidden"
                                style={{ background: `${theme.accent}0d`, border: `1px solid ${theme.accent}20`, color: theme.text2 }}>
                                <span className="font-semibold flex items-center gap-1 mb-1" style={{ color: theme.accentText }}>
                                  <Bot size={11} />{hasKey ? 'Explicație AI' : 'Explicație ghidată'}
                                </span>
                                <AIRichText text={aiExplanations[q.id]} />
                              </motion.div>
                            </AnimatePresence>
                          )}

                          {hasKey && (optionAnalysis[q.id] ? (
                            <div
                              className="mt-1 space-y-2 rounded-xl p-2.5 text-xs leading-relaxed"
                              style={{ background: `${theme.warning}0d`, border: `1px solid ${theme.warning}20` }}
                            >
                              <span className="mb-1 flex items-center gap-1 font-semibold" style={{ color: theme.warning }}>
                                <Bot size={11} /> De ce pică fiecare variantă
                              </span>
                              {optionAnalysis[q.id].length === 0 ? (
                                <p style={{ color: theme.text3 }}>Nu am putut analiza variantele acum.</p>
                              ) : optionAnalysis[q.id].map((entry) => (
                                <div key={entry.option} style={{ color: theme.text2 }}>
                                  <div className="font-semibold" style={{ color: theme.text }}>{entry.option}</div>
                                  <div>{entry.whyWrong}</div>
                                  {entry.whenCorrect && <div className="mt-0.5 opacity-80">Ar fi corectă când: {entry.whenCorrect}</div>}
                                  {entry.classicConfusion && <div className="mt-0.5 opacity-80">Confuzie clasică: {entry.classicConfusion}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleExplainOptions(q)}
                              disabled={optionAnalysisLoading[q.id]}
                              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,opacity,transform] disabled:opacity-60"
                              style={{ background: `${theme.warning}12`, color: theme.warning, border: `1px solid ${theme.warning}28` }}
                            >
                              <Bot size={11} />
                              {optionAnalysisLoading[q.id] ? 'Analizez variantele...' : 'De ce pică fiecare variantă'}
                            </button>
                          ))}

                          <button
                            onClick={() => openResultsDebrief(
                              `Explică-mi pe scurt de ce am greșit întrebarea: "${q.text}". Răspunsul meu a fost "${userAnswerTexts || 'niciun răspuns'}", iar răspunsul corect este "${correctTexts}". Dă-mi și o regulă scurtă de reținut.`,
                              'explain',
                            )}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,opacity,transform]"
                            style={{
                              background: `${theme.accent2}12`,
                              color: theme.accent2,
                              border: `1px solid ${theme.accent2}28`,
                            }}
                          >
                            <MessageSquare size={11} />
                            Continuă în chat
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div initial={calmMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={t.page} className="space-y-2">
          {/* Primary: retry */}
          <Link to={`/play/${quiz.id}`}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-white transition-[background-color,border-color,color,opacity,transform] hover:opacity-90"
            style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}>
            <RotateCcw size={15} />
            Încearcă din nou
          </Link>
          {/* Secondary row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link to="/"
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-medium text-sm transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text2 }}>
              <Home size={14} />Acasă
            </Link>
            <button onClick={exportResults}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-medium text-sm transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text2 }}>
              <Download size={14} />Export
            </button>
            <Link to={`/quiz/${quiz.id}`}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-medium text-sm transition-[background-color,border-color,color,opacity,transform] hover:opacity-80"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text2 }}>
              <BookOpen size={14} />Detalii
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
    </div>
  );
}
