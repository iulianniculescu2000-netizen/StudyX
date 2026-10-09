/**
 * Fațada realizărilor definitive. Starea (`earned`, reperele nivelului) stă în `statsStore` ca să se salveze
 * odată cu statisticile profilului, fără să atingă `profileStorage`; aici sunt hook-urile de citire și
 * urmăritorul care o actualizează: rulează la modificările din seturi, sesiuni și statistici, cu o mică
 * întârziere (profilul se încarcă în pași succesivi: nu evaluăm niciodată o stare pe jumătate încărcată).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQuizStore } from './quizStore';
import { useStatsStore } from './statsStore';
import { useToastStore } from './toastStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { buildAchievements } from '../components/gamification/gamificationCatalog';
import { evaluateAchievements, permanentLevelInput, type AchievementsState } from '../lib/gamificationAchievements';
import { buildGamificationMetrics } from '../lib/gamificationMetrics';
import { computeStudyLevel, countOwnSets, type LevelInfo } from '../lib/gamificationProgress';
import { celebrate } from '../lib/fxConfetti';

const SETTLE_MS = 600;

export function useAchievementsState(): AchievementsState {
  return useStatsStore((state) => state.achievements);
}

/** Nivelul definitiv: maximul dintre valorile curente și cele atinse vreodată (nu scade la ștergere, arhivare sau împărțire). */
export function useStudyLevel(): LevelInfo {
  const quizzes = useQuizStore((state) => state.quizzes);
  const sessionCount = useQuizStore((state) => state.sessions.length);
  const longestStreak = useStatsStore((state) => state.streak.longestStreak);
  const marks = useStatsStore((state) => state.achievements.marks);
  return useMemo(
    () => computeStudyLevel(permanentLevelInput({ quizCount: countOwnSets(quizzes), sessionCount, longestStreak }, marks)),
    [quizzes, sessionCount, longestStreak, marks],
  );
}

/** O singură evaluare, pe starea curentă a store-urilor. Întoarce realizările câștigate acum (gol la prima rulare). */
export function runAchievementEvaluation(now: number = Date.now()): { id: string; title: string }[] {
  const quiz = useQuizStore.getState();
  if (!quiz._hasHydrated) return [];
  const stats = useStatsStore.getState();
  const metrics = buildGamificationMetrics(
    { quizzes: quiz.quizzes, sessions: quiz.sessions, streak: stats.streak, questionStats: stats.questionStats },
    now,
  );
  const done = buildAchievements(metrics).filter((item) => item.done).map((item) => ({ id: item.id, title: item.title }));
  const result = evaluateAchievements(
    stats.achievements,
    done,
    { sets: countOwnSets(quiz.quizzes), sessions: quiz.sessions.length, longestStreak: stats.streak.longestStreak },
    now,
  );
  if (result.changed) stats.setAchievements(result.state);
  return result.newlyEarned;
}

/**
 * Urmărește store-urile și înregistrează realizările (pagini cu realizări și nivel; o a doua montare e inofensivă:
 * ce e înregistrat nu se mai anunță). Sărbătoarea e un toast (plus confetti doar cu mișcare normală).
 */
export function useAchievementWatcher(): void {
  const { calmMotion } = useAdaptiveMotion();
  const calmRef = useRef(calmMotion);
  useEffect(() => { calmRef.current = calmMotion; }, [calmMotion]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const earned = runAchievementEvaluation();
        if (earned.length === 0) return;
        const message = earned.length === 1
          ? `Realizare câștigată definitiv: ${earned[0].title}`
          : `${earned.length} realizări câștigate definitiv: ${earned.map((item) => item.title).join(', ')}`;
        useToastStore.getState().addToast(message, 'success', 6000);
        if (!calmRef.current) celebrate();
      }, SETTLE_MS);
    };
    schedule();
    const unsubscribers = [
      useQuizStore.subscribe(schedule),
      useStatsStore.subscribe((state, prev) => {
        // Propria scriere (achievements) nu redeclanșează evaluarea.
        if (state.achievements !== prev.achievements && state.questionStats === prev.questionStats && state.streak === prev.streak) return;
        schedule();
      }),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribers.forEach((off) => off());
    };
  }, []);
}
