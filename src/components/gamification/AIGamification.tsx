import { useMemo, useState } from 'react';
import FxPage from '../fx/FxPage';
import AIGamificationAchievements from './AIGamificationAchievements';
import AIGamificationChallenges from './AIGamificationChallenges';
import AIGamificationHeader from './AIGamificationHeader';
import AIGamificationSelfComparison from './AIGamificationSelfComparison';
import AIGamificationStats from './AIGamificationStats';
import AIGamificationTabs from './AIGamificationTabs';
import { applyEarned, buildAchievements, buildChallenges, type GamificationTab } from './gamificationCatalog';
import { useAchievementWatcher, useAchievementsState } from '../../store/achievementsStore';
import { permanentLevelInput } from '../../lib/gamificationAchievements';
import { buildGamificationMetrics } from '../../lib/gamificationMetrics';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import {
  LEVEL_STEP,
  MIN_QUESTIONS_FOR_RHYTHM,
  PERFECT_MIN_QUESTIONS,
  SESSION_MINUTES_CAP,
  POINT_WEIGHTS,
  activityPoints,
  buildSelfComparison,
  computeStudyLevel,
  overallAccuracy,
} from '../../lib/gamificationProgress';
import { useTheme } from '../../theme/ThemeContext';

interface AIGamificationProps {
  /** Kept for the existing route; the page reads the active profile's stores directly. */
  userId?: string;
  username: string;
}

export default function AIGamification({ username }: AIGamificationProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<GamificationTab>('achievements');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Captured once so the day-bucketed figures stay pure across renders.
  const [nowTs] = useState(() => Date.now());

  const quizzes = useQuizStore((state) => state.quizzes);
  const sessions = useQuizStore((state) => state.sessions);
  const streak = useStatsStore((state) => state.streak);
  const questionStats = useStatsStore((state) => state.questionStats);

  const achievementsState = useAchievementsState();
  useAchievementWatcher();

  const model = useMemo(() => {
    const metrics = buildGamificationMetrics({ quizzes, sessions, streak, questionStats }, nowTs);
    const perfectSessions = metrics.perfectSessions;
    const comparison = buildSelfComparison(sessions, nowTs);
    const studyDays = streak.studyDates?.length ?? 0;
    const achievements = applyEarned(buildAchievements(metrics), achievementsState.earned);

    return {
      achievements,
      challenges: buildChallenges(metrics),
      stats: {
        points: activityPoints({
          quizCount: metrics.quizCount,
          sessionCount: sessions.length,
          perfectSessions,
          studyDays,
        }),
        // Own sets (not every deck in the library: chapter decks and the built-in bank are not "sets you made"),
        // and never below the best values reached, so deleting or splitting a set cannot lower the level.
        level: computeStudyLevel(permanentLevelInput(
          { quizCount: metrics.quizCount, sessionCount: sessions.length, longestStreak: streak.longestStreak },
          achievementsState.marks,
        )),
        streak: metrics.liveStreak,
        achievementsDone: achievements.filter((item) => item.done).length,
        achievementsTotal: achievements.length,
        accuracy: overallAccuracy(questionStats).accuracy,
        // The same 7 calendar days as the "Tu vs. tine" chart.
        weeklyQuestions: comparison.week.questions,
      },
      comparison,
    };
  }, [nowTs, quizzes, sessions, streak, questionStats, achievementsState]);

  return (
    <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <AIGamificationHeader username={username} />
        <AIGamificationStats stats={model.stats} />
        <AIGamificationTabs activeTab={activeTab} setActiveTab={setActiveTab} />

        <div role="tabpanel" id={`gamification-panel-${activeTab}`} aria-labelledby={`gamification-tab-${activeTab}`}>
          {activeTab === 'achievements' && (
            <AIGamificationAchievements
              achievements={model.achievements}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {activeTab === 'challenges' && <AIGamificationChallenges challenges={model.challenges} />}
          {activeTab === 'self' && <AIGamificationSelfComparison comparison={model.comparison} />}
        </div>

        <details className="glass-panel rounded-2xl px-4 py-3 text-[12.5px]" style={{ color: theme.text3 }}>
          <summary className="cursor-pointer select-none font-medium" style={{ color: theme.text2 }}>Cum se calculează</summary>
          <ul className="mt-3 space-y-2 leading-relaxed">
            <li>
              <span style={{ color: theme.text2 }}>Nivel:</span>{' '}
              (seturi din bibliotecă + sesiuni + cea mai lungă serie) ÷ {LEVEL_STEP}, rotunjit în jos, plus 1.
            </li>
            <li>
              <span style={{ color: theme.text2 }}>Puncte:</span>{' '}
              {POINT_WEIGHTS.set} × seturi + {POINT_WEIGHTS.session} × sesiuni + {POINT_WEIGHTS.perfectSession} × sesiuni impecabile + {POINT_WEIGHTS.studyDay} × zile de studiu. Seturile sunt cele create sau importate de tine; zilele de studiu sunt cele păstrate în istoric, cel mult ultimele 365.
            </li>
            <li>
              <span style={{ color: theme.text2 }}>Sesiune impecabilă:</span>{' '}
              toate răspunsurile corecte, cu cel puțin {PERFECT_MIN_QUESTIONS} întrebări.
            </li>
            <li>
              <span style={{ color: theme.text2 }}>Provocări:</span>{' '}
              contează doar sesiunile de grile încheiate în ultimele 7 zile calendaristice (azi inclus); ritmul cere minim {MIN_QUESTIONS_FOR_RHYTHM} întrebări pe sesiune, iar maratonul numără cel mult {SESSION_MINUTES_CAP} de minute dintr-o sesiune.
            </li>
            <li>
              <span style={{ color: theme.text2 }}>Stare:</span>{' '}
              provocările se recalculează din datele curente. O realizare îndeplinită se salvează cu data câștigării și rămâne a ta chiar dacă ștergi, arhivezi sau împarți seturile; la fel nivelul, care nu scade sub cea mai mare valoare atinsă.
            </li>
            <li>
              <span style={{ color: theme.text2 }}>Serie:</span>{' '}
              zile consecutive de studiu; dacă sari o zi, seria curentă revine la 0.
            </li>
          </ul>
        </details>
      </div>
    </FxPage>
  );
}
