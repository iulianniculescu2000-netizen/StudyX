import { localDateStr } from '../../lib/studyPlan';
import { isFlashcardDeck } from '../../lib/deckKind';
import { CARD_COLOR_MAP } from '../../theme/colorMaps';
import type { Quiz } from '../../types';
import type { useStatsStore } from '../../store/statsStore';

type QuestionStats = ReturnType<typeof useStatsStore.getState>['questionStats'];
type StreakState = ReturnType<typeof useStatsStore.getState>['streak'];

/** Un rând per pachet de flashcarduri nearhivat: totaluri, scadente, stăpânite, culoarea accentului. */
export function buildDeckSummaries(quizzes: Quiz[], questionStats: QuestionStats, now: number = Date.now()) {
  return quizzes
    .filter((quiz) => !quiz.archived && quiz.questions.length > 0)
    .filter((quiz) => isFlashcardDeck(quiz))
    .map((quiz) => {
      const total = quiz.questions.length;
      const stats = quiz.questions.map((question) => questionStats[`${quiz.id}:${question.id}`]);
      const seen = stats.filter(Boolean).length;
      const due = stats.filter((stat) => stat && stat.nextReview > 0 && stat.nextReview <= now).length;
      const mastered = stats.filter((stat) => (
        stat
        && stat.timesCorrect >= 3
        && stat.timesCorrect / (stat.timesCorrect + stat.timesWrong) >= 0.8
      )).length;
      const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      const accentColor = (CARD_COLOR_MAP[quiz.color] ?? CARD_COLOR_MAP.blue).badge;

      return { quiz, total, seen, due, mastered, masteryPct, accentColor };
    })
    .sort((left, right) => right.due - left.due || right.quiz.questions.length - left.quiz.questions.length);
}

/**
 * currentStreak is only recomputed when a session ends, so a streak that was
 * not continued yesterday or today must read as 0 here.
 */
export function computeActiveStreak(streak: Pick<StreakState, 'currentStreak' | 'lastStudyDate'>): number {
  if (streak.currentStreak <= 0) return 0;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const last = streak.lastStudyDate;
  return last === localDateStr() || last === localDateStr(yesterday) ? streak.currentStreak : 0;
}
