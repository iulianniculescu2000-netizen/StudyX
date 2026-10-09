import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useBack } from '../../hooks/useBack';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { useFolderStore } from '../../store/folderStore';
import type { QuestionStat, Quiz } from '../../types';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { buildClarificationFallback, getCorrectAnswerText } from '../../helpers/quizAi';
import { explainWrongAnswer } from '../../lib/groq';
import { isFlashcardDeck } from '../../lib/deckKind';
import { buildDueQueue, isDueSessionId, parseDueSelection, DUE_NEW_DEFAULT } from '../../lib/flashcardDueQueue';
import type { CardItem, SessionMeta, Rating } from './sessionTypes';
import { shuffleArr } from './sessionUtils';

export function useFlashcardSession() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const goBack = useBack('/flashcards');
  const { calmMotion } = useAdaptiveMotion();
  const quizzes = useQuizStore((s) => s.quizzes);
  const questionStats = useStatsStore((s) => s.questionStats);
  const folders = useFolderStore((s) => s.folders);
  const recordAnswer = useStatsStore((s) => s.recordAnswer);
  const recordStudySession = useStatsStore((s) => s.recordStudySession);


  const modeAll = searchParams.get('mode') === 'all';
  // Sesiune „virtuală” peste mai multe pachete (id `due` / `due-group`): coada se reconstruiește din store-uri
  // la fiecare montare, deci refresh-ul și „înapoi” din browser funcționează fără stare ținută doar în memorie.
  const isDue = isDueSessionId(id);
  const dueSelection = useMemo(() => parseDueSelection(searchParams), [searchParams]);

  // `now` este captat o singură dată la montare — cardurile „due" sunt calculate
  // la începutul sesiunii și nu se schimbă în timpul ei. Dacă `now` ar fi în
  // state (actualizat din minut în minut) ar invalida `initialCards` și ar
  // recalcula întreaga coadă de carduri în fundal la fiecare 60 s, schimbând
  // silențios sesiunea activă.
  const sessionStartRef = useRef(Date.now());

  const buildDueSession = useCallback((now: number, quizList: Quiz[], stats: Record<string, QuestionStat>) => {
    const queue = buildDueQueue({
      quizzes: quizList,
      stats,
      now,
      deckIds: dueSelection.deckIds,
      folderId: dueSelection.folderId,
      folders,
      includeNew: dueSelection.includeNew,
    });
    const items: CardItem[] = queue.items.map((item) => ({
      question: item.question, quiz: item.quiz, groupKey: item.groupKey, groupLabel: item.groupLabel, isNew: item.isNew,
    }));
    return { items, meta: { totalDue: queue.totalDue, totalNew: queue.totalNew, remainingDue: queue.remainingDue } };
  }, [dueSelection, folders]);

  const initialSession = useMemo<{ items: CardItem[]; meta: SessionMeta | null }>(() => {
    const sessionNow = sessionStartRef.current;
    if (isDue) return buildDueSession(sessionNow, quizzes, questionStats);
    if (id === 'all') {
      const items: CardItem[] = [];
      // Only real flashcard decks belong in a flip-card session. Without this
      // filter "Recapitulează tot" swept in every multiple-choice grilă in the
      // app and showed it as a card with a single visible answer.
      quizzes
        .filter((quiz) => !quiz.archived && quiz.questions.length > 0 && isFlashcardDeck(quiz))
        .forEach((quiz) => {
        quiz.questions.forEach((question) => {
          const stat = questionStats[`${quiz.id}:${question.id}`];
          if (!stat || (stat.nextReview > 0 && stat.nextReview <= sessionNow)) {
            items.push({ question, quiz });
          }
        });
      });
      return { items: shuffleArr(items), meta: null };
    }

    const quiz = quizzes.find((item) => item.id === id);
    if (!quiz) return { items: [], meta: null };

    const items: CardItem[] = quiz.questions
      .filter((question) => {
        if (modeAll) return true;
        const stat = questionStats[`${quiz.id}:${question.id}`];
        return !stat || (stat.nextReview > 0 && stat.nextReview <= sessionNow);
      })
      .map((question) => ({ question, quiz }));

    return { items: modeAll ? items : shuffleArr(items), meta: null };
  }, [id, isDue, buildDueSession, quizzes, questionStats, modeAll]); // `sessionStartRef` e stabil — nu e nevoie în deps
  const initialCards = initialSession.items;


  const sessionRouteKey = `${id ?? 'all'}:${modeAll ? 'all' : 'due'}${isDue ? `:${dueSelection.deckIds?.join(',') ?? ''}:${dueSelection.folderId ?? ''}:${dueSelection.includeNew}` : ''}`;
  const [activeRouteKey, setActiveRouteKey] = useState(sessionRouteKey);
  const [cards, setCards] = useState<CardItem[]>(initialCards);
  const [meta, setMeta] = useState<SessionMeta | null>(initialSession.meta);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [sessionDone, setSessionDone] = useState(false);
  const [cardKey, setCardKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const startTime = useRef(Date.now());
  const answerScrollRef = useRef<HTMLDivElement | null>(null);
  /**
   * Single-level undo for the last rating. Re-calling recordAnswer for a
   * "changed my mind" re-rate would double-count the SM-2 review (it mutates
   * timesCorrect/timesWrong and recomputes the interval from the CURRENT
   * stat each time) — so instead of re-invoking the algorithm, this snapshots
   * the question's stat right before rating it and restores that exact
   * snapshot on undo, then lets the real rating flow run again cleanly.
   */
  const lastRatingSnapshotRef = useRef<{ key: string; prevStat: QuestionStat | undefined } | null>(null);
  const [canUndoRating, setCanUndoRating] = useState(false);

  useEffect(() => {
    const shouldResetForRoute = activeRouteKey !== sessionRouteKey;
    const shouldHydrateEmptySession = cards.length === 0 && initialCards.length > 0;
    if (!shouldResetForRoute && !shouldHydrateEmptySession) return;

    setCards(initialCards);
    setMeta(initialSession.meta);
    setCurrentIdx(0);
    setFlipped(false);
    setRatings([]);
    setSessionDone(false);
    setCardKey((key) => key + 1);
    setElapsed(0);
    setAiExplanation(null);
    setAiLoading(false);
    lastRatingSnapshotRef.current = null;
    setCanUndoRating(false);
    startTime.current = Date.now();
    setActiveRouteKey(sessionRouteKey);
  }, [activeRouteKey, cards.length, initialCards, initialSession.meta, sessionRouteKey]);

  // „Continuă": o nouă rundă din restantele rămase, construită din starea de acum a store-urilor.
  const handleContinue = useCallback(() => {
    const next = buildDueSession(Date.now(), useQuizStore.getState().quizzes, useStatsStore.getState().questionStats);
    setCards(next.items);
    setMeta(next.meta);
    setCurrentIdx(0);
    setFlipped(false);
    setRatings([]);
    setSessionDone(false);
    setCardKey((key) => key + 1);
    setElapsed(0);
    setAiExplanation(null);
    lastRatingSnapshotRef.current = null;
    setCanUndoRating(false);
    startTime.current = Date.now();
  }, [buildDueSession]);

  const toggleNewCards = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (dueSelection.includeNew > 0) next.delete('new'); else next.set('new', String(DUE_NEW_DEFAULT));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, dueSelection.includeNew]);

  const getElapsedSeconds = useCallback(() => {
    return Math.max(1, Math.floor((Date.now() - startTime.current) / 1000));
  }, []);

  const handleRating = useCallback((rating: Rating) => {
    if (!cards[currentIdx]) return;
    const { question, quiz } = cards[currentIdx];

    const key = `${quiz.id}:${question.id}`;
    lastRatingSnapshotRef.current = { key, prevStat: useStatsStore.getState().questionStats[key] };
    setCanUndoRating(true);

    const isCorrect = rating !== 'hard';
    // „Ușor" = siguranță deplină → quality 5 (interval SM-2 mai lung), „Bine" → quality 4, „Greu" → greșit.
    recordAnswer(quiz.id, question.id, isCorrect, rating === 'easy' ? 'confident' : undefined);
    setRatings((prev) => [...prev, rating]);

    if (currentIdx + 1 < cards.length) {
      setFlipped(false);
      setAiExplanation(null);
      setCurrentIdx((index) => index + 1);
      setCardKey((key) => key + 1);
    } else {
      const finalElapsed = getElapsedSeconds();
      recordStudySession(finalElapsed);
      setElapsed(finalElapsed);
      setSessionDone(true);
    }
  }, [cards, currentIdx, recordAnswer, recordStudySession, getElapsedSeconds]);

  // Restore the exact pre-rating stat snapshot (not a second recordAnswer call —
  // see the ref comment above) and drop back onto the card you just rated, still
  // flipped, so a misclick has a real way out instead of being permanent.
  const handleUndoLastRating = useCallback(() => {
    const snapshot = lastRatingSnapshotRef.current;
    if (!snapshot || currentIdx === 0) return;
    useStatsStore.setState((s) => {
      const next = { ...s.questionStats };
      if (snapshot.prevStat) next[snapshot.key] = snapshot.prevStat;
      else delete next[snapshot.key];
      return { questionStats: next };
    });
    lastRatingSnapshotRef.current = null;
    setCanUndoRating(false);
    setRatings((prev) => prev.slice(0, -1));
    setAiExplanation(null);
    setCurrentIdx((index) => index - 1);
    setFlipped(true);
    setCardKey((key) => key + 1);
  }, [currentIdx]);

  const remainingDue = useMemo(() => {
    if (!isDue || !sessionDone) return 0;
    return buildDueQueue({
      quizzes, stats: questionStats, now: Date.now(), deckIds: dueSelection.deckIds,
      folderId: dueSelection.folderId, folders, cap: 0,
    }).totalDue;
  }, [isDue, sessionDone, quizzes, questionStats, dueSelection, folders]);

  const handleExplain = async () => {
    if (aiLoading || !cards[currentIdx]) return;
    setAiLoading(true);
    const { question } = cards[currentIdx];
    const correctText = getCorrectAnswerText(question);
    const { getAccuracy } = useStatsStore.getState();
    const userCtx = `Utilizatorul a parcurs ${cards.length} flashcard-uri în această sesiune. Acuratețe globală: ${getAccuracy()}%.`;

    try {
      const explanation = await explainWrongAnswer(question.text, 'Am uitat contextul', correctText, userCtx);
      setAiExplanation(explanation);
    } catch {
      setAiExplanation(buildClarificationFallback(question, 'Am uitat contextul', correctText));
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (sessionDone) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // A focused button/field keeps its own Enter/Space.
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('button, a, input, textarea, select, [role="button"]'))) return;

      if (event.code === 'Space' || event.key === 'Enter') {
        event.preventDefault();
        if (!flipped) setFlipped(true);
      }

      if (flipped) {
        if (event.key === '1') { event.preventDefault(); handleRating('hard'); }
        if (event.key === '2') { event.preventDefault(); handleRating('good'); }
        if (event.key === '3') { event.preventDefault(); handleRating('easy'); }
      }

      if (event.key.toLowerCase() === 'u' && canUndoRating && currentIdx > 0) {
        event.preventDefault();
        handleUndoLastRating();
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [flipped, handleRating, sessionDone, canUndoRating, currentIdx, handleUndoLastRating]);

  useEffect(() => {
    if (!flipped) return;
    answerScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [cardKey, flipped]);

  useEffect(() => {
    if (!aiExplanation || !answerScrollRef.current) return;
    const scroller = answerScrollRef.current;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: calmMotion ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiExplanation, calmMotion]);

  // Câte carduri noi ar fi dacă selecția goală ar include și cardurile nevăzute (pentru propunerea din starea goală).
  const dueEmptyNew = useMemo(() => (isDue && cards.length === 0
    ? buildDueQueue({
        quizzes, stats: questionStats, now: sessionStartRef.current, deckIds: dueSelection.deckIds,
        folderId: dueSelection.folderId, folders, cap: 0, includeNew: 1,
      }).totalNew
    : 0), [isDue, cards.length, quizzes, questionStats, dueSelection, folders]);

  // Ieșire în mijlocul sesiunii: înregistrează timpul petrecut, altfel tot studiul dispare din statistici.
  const exitSession = () => {
    recordStudySession(getElapsedSeconds());
    goBack();
  };

  return {
    isDue, modeAll, dueSelection, toggleNewCards, goBack, exitSession,
    dueEmptyNew,
    cards, meta, currentIdx, flipped, setFlipped, ratings, sessionDone, cardKey, elapsed,
    aiExplanation, aiLoading, answerScrollRef, canUndoRating,
    handleContinue, handleRating, handleUndoLastRating, remainingDue, handleExplain,
  };
}
