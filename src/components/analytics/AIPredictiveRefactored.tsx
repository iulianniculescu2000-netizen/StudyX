import { useMemo, useState } from 'react';
import AIPredictiveForecast from './AIPredictiveForecast';
import AIPredictiveHeader from './AIPredictiveHeader';
import AIPredictiveKnowledgeGaps from './AIPredictiveKnowledgeGaps';
import AIPredictiveReadiness from './AIPredictiveReadiness';
import FxPage from '../fx/FxPage';
import PageSkeleton from '../ui/PageSkeleton';
import { loadUserProfile } from '../../ai/UserProfile';
import { askAiAboutTopic, quizHrefForTopic } from '../../lib/analyticsActions';
import {
  DEFAULT_PERIOD,
  MIN_TOPIC_N,
  analyticsTopicStats,
  buildGaps,
  classifyTopics,
  dailyPace,
  distinctQuestionIds,
  loggedWindow,
  mistakesInWindow,
  neededPerDay,
  readLoggedDays,
  readiness,
  studyDaysInWindow,
  topicTrend,
  windowStats,
  type PeriodDays,
} from '../../lib/analyticsStats';
import { buildScoreForecast } from '../../lib/analyticsForecast';
import { buildDueItems } from '../../lib/dueItems';
import { useExamDate } from '../../lib/examDateHook';
import { useFolderStore } from '../../store/folderStore';
import { EMPTY_PLAN, useOrganizareStore } from '../../store/organizareStore';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { useUserStore } from '../../store/userStore';

interface AIPredictiveAnalyticsProps {
  userId: string;
  currentLevel: number;
  /** Păstrat pentru compatibilitate cu App.tsx; nu se mai folosește. */
  subjects?: string[];
}

export default function AIPredictiveAnalyticsRefactored({ userId, currentLevel }: AIPredictiveAnalyticsProps) {
  const [period, setPeriod] = useState<PeriodDays>(DEFAULT_PERIOD);
  const [now] = useState(() => Date.now());

  const hydrated = useQuizStore((state) => state._hasHydrated);
  const quizzes = useQuizStore((state) => state.quizzes);
  const sessions = useQuizStore((state) => state.sessions);
  const questionStats = useStatsStore((state) => state.questionStats);
  const studyDates = useStatsStore((state) => state.streak.studyDates);
  const totalStudyTime = useStatsStore((state) => state.totalStudyTime);
  const folders = useFolderStore((state) => state.folders);
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const plan = useOrganizareStore((state) => state.byProfile[profileId] ?? EMPTY_PLAN);
  const exam = useExamDate();

  const folderNameById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);
  // loadUserProfile poate scrie în localStorage (repară un profil corupt) și poate afișa un toast: îl rulăm o dată
  // pe set de răspunsuri, nu la fiecare randare. Un profil care nu se poate citi nu strică pagina, doar lipsesc trendurile.
  // Răspunsurile noi pot schimba profilul (topicAccuracy), deci questionStats este o dependență intenționată.
  const profile = useMemo(() => {
    try {
      return loadUserProfile(userId);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, questionStats]);
  // Aceeași listă ca în /daily-review: fără flashcarduri, seturi șterse sau întrebări dispărute.
  const dueCount = useMemo(() => buildDueItems(questionStats, quizzes).length, [questionStats, quizzes]);

  const knownIds = useMemo(() => distinctQuestionIds(quizzes), [quizzes]);
  const ready = useMemo(() => readiness(questionStats, knownIds), [questionStats, knownIds]);
  const topics = useMemo(() => analyticsTopicStats(quizzes, questionStats, folderNameById), [quizzes, questionStats, folderNameById]);
  const buckets = useMemo(() => classifyTopics(topics), [topics]);
  const gaps = useMemo(
    () => buildGaps(topics, (topic) => topicTrend(profile?.topicAccuracy?.[topic]?.recent)),
    [topics, profile],
  );

  const forecast = useMemo(
    () => buildScoreForecast({ quizzes, questionStats, sessions, folders, now }),
    [quizzes, questionStats, sessions, folders, now],
  );

  const win = useMemo(() => windowStats(sessions, now, period), [sessions, now, period]);
  const pace = useMemo(() => dailyPace(sessions, now, 14), [sessions, now]);
  const studyDays = useMemo(() => studyDaysInWindow(studyDates, now, period), [studyDates, now, period]);
  const logged = useMemo(() => loggedWindow(readLoggedDays(plan.state), now, period), [plan.state, now, period]);
  const mistakes = useMemo(() => mistakesInWindow(profile?.recentMistakes ?? [], now, period), [profile, now, period]);

  const primary = exam.primary;
  const needed = primary && !primary.passed ? neededPerDay(ready.total - ready.answered, primary.daysLeft) : null;
  const evaluated = topics.filter((topic) => topic.total >= MIN_TOPIC_N).length;
  const hasAnyData = ready.answered > 0 || sessions.length > 0;

  // Înainte ca profilul să se încarce, listele sunt goale: „nicio dată” ar fi fals.
  if (!hydrated) return <PageSkeleton />;

  return (
    <FxPage className="px-4 pb-6 pt-6 sm:px-8 sm:pt-10">
      <div className="mx-auto max-w-3xl space-y-7">
        <AIPredictiveHeader currentLevel={currentLevel} period={period} onPeriodChange={setPeriod} />
        <AIPredictiveForecast forecast={forecast} />
        <AIPredictiveReadiness
          exam={exam}
          ready={ready}
          hasAnyData={hasAnyData}
          dueCount={dueCount}
          needed={needed}
          pace={pace}
          period={period}
          win={win}
          studyDays={studyDays}
          logged={logged}
          mistakes={mistakes}
          totalStudyTime={totalStudyTime}
          buckets={buckets}
        />
        <AIPredictiveKnowledgeGaps
          gaps={gaps}
          evaluated={evaluated}
          quizHref={(topic) => quizHrefForTopic(topic, quizzes, questionStats, folderNameById)}
          onAskAi={askAiAboutTopic}
          dueCount={dueCount}
          plan={plan.summary}
          now={now}
        />
      </div>
    </FxPage>
  );
}
