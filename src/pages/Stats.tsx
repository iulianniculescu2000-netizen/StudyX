import { plural } from '../lib/plural';
import { formatStudyTime } from '../lib/formatStudyTime';
import { motion } from 'framer-motion';
import ProgressBar from '../components/fx/ProgressBar';
import { lazy, Suspense, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trophy, Flame, Target, Clock, BookOpen, TrendingUp, Brain, Sparkles, Loader2, RefreshCw, Award, ArrowRight, BarChart3 } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore, accuracyByQuiz, countWeakStats, existingStatKeys } from '../store/statsStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import { useAIStore } from '../store/aiStore';
import { useUserStore } from '../store/userStore';
import AIRichText from '../components/ai-chat/AIRichText';
import FxPage from '../components/fx/FxPage';
import PageHeader from '../components/ui/PageHeader';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import { getStrongTopicsForProfile, loadUserProfile } from '../ai/UserProfile';
import { buildDueItems } from '../lib/dueItems';
import { effectiveStreak } from '../lib/gamificationProgress';
import { useAchievementWatcher, useStudyLevel } from '../store/achievementsStore';
import { localDateStr } from '../lib/studyPlan';
import { dur, ease } from '../theme/motion';

const ActivityBarChart = lazy(() => import('../components/stats/ActivityBarChart'));
const AccuracyTrendChart = lazy(() => import('../components/stats/AccuracyTrendChart'));
const CategoryRadarChart = lazy(() => import('../components/stats/CategoryRadarChart'));


interface CustomTooltipProps {
  active?: boolean;
  payload?: {
    name: string;
    value: number;
    color: string;
  }[];
  label?: string;
  theme: import('../theme/themes').Theme;
}

const CustomTooltip = ({ active, payload, label, theme }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-[var(--r-sm)] p-3 text-sm"
      style={{ boxShadow: 'var(--elev-3)' }}>
      <p className="font-semibold mb-1" style={{ color: theme.text }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}{p.name === 'acuratete' ? '%' : ''}</strong>
        </p>
      ))}
    </div>
  );
};

function ChartSkeleton({ height = 180 }: { height?: number }) {
  return <div className="w-full rounded-[var(--r-md)] skeleton-block" style={{ height }} />;
}

/** Card de sticlă cu intrare în cascadă (`index` = poziția, plafonată la 8 de CSS). */
function StatsCard({ index = 0, className = '', children, 'data-tutorial': tutorialAnchor }: { index?: number; className?: string; children: ReactNode; 'data-tutorial'?: string }) {
  const { calmMotion } = useAdaptiveMotion();
  return (
    <div
      data-tutorial={tutorialAnchor}
      className={`glass-panel rounded-[var(--r-lg)] p-5 ${calmMotion ? '' : 'fx-rise'} ${className}`}
      style={{ '--i': index } as CSSProperties}
    >
      {children}
    </div>
  );
}

export default function Stats() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion } = useAdaptiveMotion();
  const hydrated = useStoresHydrated('quiz', 'stats');
  const quizzes = useQuizStore((s) => s.quizzes);
  const sessions = useQuizStore((s) => s.sessions);
  const streak = useStatsStore((s) => s.streak);
  const totalStudyTime = useStatsStore((s) => s.totalStudyTime);
  const questionStats = useStatsStore((s) => s.questionStats);
  const getWeakQuestions = useStatsStore((s) => s.getWeakQuestions);
  const accuracy = useStatsStore((s) => s.getAccuracy());

  // eslint-disable-next-line react-hooks/exhaustive-deps -- getWeakQuestions citește din store; recalculăm când se schimbă statisticile
  const weakQuestions = useMemo(() => getWeakQuestions(5, existingStatKeys(useQuizStore.getState().quizzes)), [getWeakQuestions, questionStats]);
  const quizAccuracy = useMemo(() => accuracyByQuiz(questionStats), [questionStats]);
  const studyTimeLabel = formatStudyTime(totalStudyTime);

  // "Ce nu știu?" AI report
  const hasKey = useAIStore((s) => s.hasKey);
  const activeProfileId = useUserStore(s => s.activeProfileId);
  const [aiReport, setAiReport] = useState('');
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  const handleGenerateReport = async () => {
    if (aiReportLoading) {
      aiAbortRef.current?.abort();
      return;
    }
    setAiReport('');
    setAiReportLoading(true);
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    try {
      const { generateWeakSpotReport } = await import('../lib/groq');
      // Compute weak categories merged by category name
      const weakCategories = quizzes
        .map(q => ({ name: q.category || 'Altele', accuracy: quizAccuracy.get(q.id) ?? 0, quizCount: sessions.filter(s => s.quizId === q.id).length }))
        .filter(c => c.quizCount > 0)
        .reduce((acc: { name: string; accuracy: number; quizCount: number }[], cur) => {
          const existing = acc.find(a => a.name === cur.name);
          if (existing) { existing.accuracy = Math.round((existing.accuracy + cur.accuracy) / 2); existing.quizCount += cur.quizCount; }
          else acc.push({ ...cur });
          return acc;
        }, [])
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 6);
      const totalAnswered = Object.values(questionStats).reduce((s, q) => (q.retired ? s : s + q.timesCorrect + q.timesWrong), 0);
      // Load AI profile from localStorage for recentMistakes
      const aiProfile = activeProfileId ? loadUserProfile(activeProfileId) : null;
      const recentMistakeTopics = (aiProfile?.recentMistakes ?? []).map(m => m.topic).filter(Boolean).slice(0, 6);
      await generateWeakSpotReport(
        { weakCategories, totalAccuracy: accuracy, streak: effectiveStreak(streak, localDateStr()), totalAnswered, recentMistakeTopics },
        (chunk) => setAiReport(prev => prev + chunk),
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setAiReport('Eroare la generarea raportului. Verifică cheia API în setări.');
      }
    } finally {
      setAiReportLoading(false);
    }
  };
  // The profile has tracked strong topics since the personalization rewrite, but
  // nothing ever displayed them — the data was computed and stored on every quiz
  // and then went nowhere.
  const strongTopics = useMemo(
    () => (activeProfileId ? getStrongTopicsForProfile(activeProfileId).slice(0, 6) : []),
    // questionStats re-triggers the read: the profile store is not a reactive dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfileId, questionStats],
  );

  const sessionsByDay = useMemo(() => {
    const grouped = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const key = new Date(session.startedAt).toISOString().split('T')[0];
      const daySessions = grouped.get(key);
      if (daySessions) daySessions.push(session);
      else grouped.set(key, [session]);
    }
    return grouped;
  }, [sessions]);

  const sessionCountByQuiz = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      counts.set(session.quizId, (counts.get(session.quizId) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  // Heatmap: last 90 days
  const heatmapWeeks = useMemo(() => {
    const today = new Date();
    const cells: { date: string; count: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const count = sessionsByDay.get(key)?.length ?? 0;
      cells.push({ date: key, count });
    }
    // Pad to fill complete weeks
    while (cells.length % 7 !== 0) cells.push({ date: '', count: 0 });
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [sessionsByDay]);

  // Sessions per day (last 14 days)
  const last14Days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().split('T')[0];
    const dayStr = d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
    const daySessions = sessionsByDay.get(key) ?? [];
    const count = daySessions.length;
    const dayAccuracy = daySessions.reduce((acc, s) => acc + s.score / s.total, 0);
    const avg = count > 0 ? Math.round((dayAccuracy / count) * 100) : 0;
    return { day: dayStr, sesiuni: count, acuratete: avg };
  }), [sessionsByDay]);

  // Accuracy per quiz
  const quizAccuracyData = useMemo(() => quizzes
    .map(q => ({
      name: q.title.length > 15 ? q.title.substring(0, 15) + '...' : q.title,
      acuratete: quizAccuracy.get(q.id) ?? 0,
      sesiuni: sessionCountByQuiz.get(q.id) ?? 0,
    }))
    .filter(d => d.sesiuni > 0)
    .sort((a, b) => b.acuratete - a.acuratete),
  [quizzes, sessionCountByQuiz, quizAccuracy]);


  const bestScore = sessions.length > 0
    ? Math.max(...sessions.map(s => Math.round((s.score / s.total) * 100)))
    : 0;

  // Radar chart: accuracy per category
  const radarData = useMemo(() => {
    const CATEGORIES = ['Dermatologie', 'Anatomie', 'Fiziologie', 'Biochimie', 'Farmacologie', 'Patologie', 'Chirurgie', 'Medicină internă', 'Neurologie', 'Microbiologie'];
    return CATEGORIES.map(cat => {
      const catQuizzes = quizzes.filter(q => q.category === cat);
      if (catQuizzes.length === 0) return null;
      const acc = catQuizzes.reduce((sum, q) => sum + (quizAccuracy.get(q.id) ?? 0), 0) / catQuizzes.length;
      return { subject: cat.slice(0, 8), acuratete: Math.round(acc), fullMark: 100 };
    }).filter(Boolean) as { subject: string; acuratete: number; fullMark: number }[];
  }, [quizzes, quizAccuracy]);

  // Real figures only (no composite "exam score"): recent accuracy, weak questions and what is overdue.
  const readiness = useMemo(() => {
    const recent = [...sessions].filter(s => s.total > 0).sort((a, b) => b.startedAt - a.startedAt).slice(0, 10);
    const recentAcc = recent.length > 0
      ? Math.round((recent.reduce((sum, s) => sum + s.score / s.total, 0) / recent.length) * 100)
      : null;
    // Aceeași definiție ca /review: greșită măcar o dată și nestabilizată, doar din întrebări existente.
    const weakCount = countWeakStats(questionStats ?? {}, existingStatKeys(quizzes));
    const dueCount = buildDueItems(questionStats ?? {}, quizzes).length;
    return { recentAcc, weakCount, dueCount };
  }, [sessions, quizzes, questionStats]);

  const level = useStudyLevel();
  useAchievementWatcher();

  if (!hydrated) {
    return (
      <FxPage>
        <PageSkeleton blocks={4} />
      </FxPage>
    );
  }

  const liveStreak = effectiveStreak(streak, localDateStr());
  const barTransition = calmMotion ? { duration: dur.instant } : { duration: dur.slow, ease: ease.emphasized };

  return (
    <FxPage className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="Statistici"
          title="Performanță"
          subtitle="Progresul tău în timp: ritm, acuratețe și punctele care cer atenție."
          tour={{ id: 'stats', label: 'Ghid pentru statistici' }}
        />
        <div data-tutorial="stats-summary" className={`mb-6 flex flex-wrap gap-2 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 1 } as CSSProperties}>
          <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
            {plural(sessions.length, 'sesiune', 'sesiuni')}
          </span>
          <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
            {accuracy}% acuratețe globală
          </span>
          <span className="premium-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
            {studyTimeLabel} studiu
          </span>
        </div>

        <div className="space-y-5">
        {/* ── "Ce nu știu?" AI Report ── */}
        {hasKey && (
          <StatsCard index={2} className="sm:p-6" data-tutorial="stats-ai-report">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[var(--r-sm)] flex items-center justify-center flex-shrink-0"
                  style={{ background: theme.accent }}>
                  <Brain size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: theme.text }}>Ce nu știu?</p>
                  <p className="text-xs" style={{ color: theme.text3 }}>Raport personalizat AI pe punctele tale slabe</p>
                </div>
              </div>
              <div className="flex gap-2">
                {aiReport && !aiReportLoading && (
                  <button
                    onClick={() => { setAiReport(''); handleGenerateReport(); }}
                    className="fine-chip press-feedback focus-ring flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-sm)] text-xs font-medium"
                    style={{ color: theme.text3 }}
                  >
                    <RefreshCw size={11} />
                    Regenerează
                  </button>
                )}
                {!aiReport && (
                  <button
                    onClick={handleGenerateReport}
                    disabled={aiReportLoading}
                    className="press-feedback focus-ring flex items-center gap-1.5 px-4 py-2 rounded-[var(--r-sm)] text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: theme.accent }}
                  >
                    {aiReportLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {aiReportLoading ? 'Analizez...' : 'Analizează'}
                  </button>
                )}
              </div>
            </div>

            {aiReport && (
              <motion.div
                initial={{ opacity: 0, y: calmMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: calmMotion ? dur.instant : dur.base, ease: ease.standard }}
                className="rounded-[var(--r-md)] px-4 py-3.5 text-sm leading-relaxed"
                style={{ background: `${theme.accent}08`, border: `1px solid ${theme.accent}18`, color: theme.text2 }}
              >
                <AIRichText text={aiReport} />
                {aiReportLoading && (
                  <span className={`inline-block w-0.5 h-4 ml-0.5 align-text-bottom rounded-sm ${calmMotion ? '' : 'animate-pulse'}`}
                    style={{ background: theme.accent }} />
                )}
              </motion.div>
            )}

            {!aiReport && !aiReportLoading && (
              <p className="text-xs text-center py-2" style={{ color: theme.text3 }}>
                AI-ul analizează greșelile, categoriile slabe și seria ta pentru a-ți da o direcție clară.
              </p>
            )}
          </StatsCard>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Nicio sesiune înregistrată"
            body="Rezolvă câteva grile pentru a-ți genera profilul de performanță."
            primary={{ label: 'Începe acum', to: '/quizzes' }}
          />
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {[
                { label: 'Sesiuni Totale', value: sessions.length, icon: <BookOpen size={18} />, color: theme.accentText },
                { label: 'Acuratețe Medie', value: `${accuracy}%`, icon: <Target size={18} />, color: theme.success },
                { label: 'Scor Maxim', value: `${bestScore}%`, icon: <Trophy size={18} />, color: theme.warning },
                { label: 'Serie curentă', value: plural(liveStreak, 'zi', 'zile'), icon: <Flame size={18} />, color: theme.warning },
                { label: 'Cea mai lungă serie', value: plural(streak.longestStreak, 'zi', 'zile'), icon: <TrendingUp size={18} />, color: theme.accent2 },
                { label: 'Timp Studiu', value: studyTimeLabel, icon: <Clock size={18} />, color: theme.text2 },
              ].map((stat, i) => (
                <div key={stat.label}
                  className={`glass-panel rounded-[var(--r-lg)] p-4 relative ${calmMotion ? '' : 'fx-rise'}`}
                  style={{ '--i': i + 3 } as CSSProperties}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-[var(--r-sm)] flex items-center justify-center flex-shrink-0"
                      style={{ background: `${stat.color}15`, color: stat.color }}>
                      {stat.icon}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: theme.text }}>{stat.label}</span>
                  </div>
                  <div className="metric-value" style={{ color: theme.text }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Realizări: summary only, the full list lives on the Realizări page */}
            <StatsCard index={4}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center flex-shrink-0"
                  style={{ background: `${theme.warning}22`, color: theme.warning }}>
                  <Trophy size={20} />
                </div>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <h2 className="text-[15px] font-semibold" style={{ color: theme.text }}>Realizări · nivelul {level.level}</h2>
                  <p className="text-xs" style={{ color: theme.text3 }}>
                    Încă {level.toNext} {level.toNext === 1 ? 'activitate' : 'activități'} până la nivelul {level.level + 1}
                  </p>
                  <div className="mt-2">
                    <ProgressBar percent={level.progress} heightClass="h-1.5" track={theme.surface2} color={theme.accent}
                      transition={{ duration: dur.slow, ease: ease.emphasized }} label="Progres către nivelul următor" />
                  </div>
                </div>
                <Link to="/gamification" className="press-feedback focus-ring glass-panel inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ color: theme.accentText }}>
                  Vezi realizările <ArrowRight size={14} />
                </Link>
              </div>
            </StatsCard>

            {/* Heatmap calendar */}
            <StatsCard index={5} data-tutorial="stats-activity">
              <h2 className="font-semibold mb-4" style={{ color: theme.text }}>Activitate (90 zile)</h2>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {heatmapWeeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-1">
                    {week.map((day, di) => {
                      const opacity = day.count === 0 ? 0 : day.count === 1 ? 0.35 : day.count === 2 ? 0.6 : 1;
                      return (
                        <div key={di}
                          title={day.date ? `${day.date}: ${plural(day.count, 'sesiune', 'sesiuni')}` : ''}
                          className="w-3 h-3 rounded-sm"
                          style={{
                            background: day.date
                              ? day.count === 0 ? theme.surface2 : theme.accent
                              : 'transparent',
                            opacity: day.date ? (day.count === 0 ? 1 : opacity) : 0,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-xs" style={{ color: theme.text3 }}>Mai puțin</span>
                {[0, 0.35, 0.6, 1].map((op, i) => (
                  <div key={i} className="w-3 h-3 rounded-sm"
                    style={{ background: i === 0 ? theme.surface2 : theme.accent, opacity: i === 0 ? 1 : op }} />
                ))}
                <span className="text-xs" style={{ color: theme.text3 }}>Mai mult</span>
              </div>
            </StatsCard>

            {/* Activity chart */}
            <StatsCard index={6}>
              <h2 className="font-semibold mb-4" style={{ color: theme.text }}>Activitate (ultimele 14 zile)</h2>
              <Suspense fallback={<ChartSkeleton />}>
                <ActivityBarChart data={last14Days} theme={theme} tooltip={<CustomTooltip theme={theme} />} />
              </Suspense>
            </StatsCard>

            {/* Accuracy trend */}
            {last14Days.some(d => d.acuratete > 0) && (
              <StatsCard index={7}>
                <h2 className="font-semibold mb-4" style={{ color: theme.text }}>Tendință acuratețe (%)</h2>
                <Suspense fallback={<ChartSkeleton height={160} />}>
                  <AccuracyTrendChart data={last14Days.filter(d => d.acuratete > 0)} theme={theme} tooltip={<CustomTooltip theme={theme} />} />
                </Suspense>
              </StatsCard>
            )}

            {/* Per quiz accuracy */}
            {quizAccuracyData.length > 0 && (
              <StatsCard index={8}>
                <h2 className="font-semibold mb-4" style={{ color: theme.text }}>Acuratețe per grilă</h2>
                <div className="space-y-3">
                  {quizAccuracyData.map(q => (
                    <div key={q.name} className="flex items-center gap-3">
                      <span className="text-sm w-36 truncate flex-shrink-0" style={{ color: theme.text2 }}>{q.name}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: theme.surface2 }}>
                        <motion.div className="h-full w-full origin-left rounded-full"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: q.acuratete / 100 }}
                          transition={barTransition}
                          style={{
                            background: q.acuratete >= 70
                              ? `linear-gradient(90deg, ${theme.success}, ${theme.accent2})`
                              : q.acuratete >= 50
                              ? `linear-gradient(90deg, ${theme.warning}, ${theme.accent})`
                              : `linear-gradient(90deg, ${theme.danger}, color-mix(in srgb, ${theme.danger} 60%, transparent))`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-12 text-right flex-shrink-0"
                        style={{ color: q.acuratete >= 70 ? theme.success : q.acuratete >= 50 ? theme.warning : theme.danger }}>
                        {q.acuratete}%
                      </span>
                    </div>
                  ))}
                </div>
              </StatsCard>
            )}

            {/* Radar chart — category progress */}
            {radarData.length >= 3 && (
              <StatsCard index={8}>
                <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                  <Brain size={16} style={{ color: theme.accent2 }} />
                  Progres pe categorii
                </h2>
                <Suspense fallback={<ChartSkeleton height={240} />}>
                  <CategoryRadarChart data={radarData} theme={theme} />
                </Suspense>
              </StatsCard>
            )}

            {/* Pregătire: only measured numbers, the estimates live in Perspective AI */}
            <StatsCard index={8}>
              <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                <TrendingUp size={16} style={{ color: theme.accentText }} />
                Pregătire acum
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Acuratețe recentă', value: readiness.recentAcc === null ? '-' : `${readiness.recentAcc}%`, hint: 'ultimele 10 sesiuni', color: theme.text },
                  { label: 'Întrebări slabe', value: String(readiness.weakCount), hint: 'greșite recent', color: readiness.weakCount > 5 ? theme.danger : theme.success },
                  { label: 'Restante', value: String(readiness.dueCount), hint: 'de recapitulat', color: readiness.dueCount > 0 ? theme.warning : theme.success },
                ].map((item) => (
                  <div key={item.label} className="rounded-[var(--r-md)] p-3" style={{ background: theme.surface2 }}>
                    <div className="text-xl font-bold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                    <div className="mt-0.5 text-xs font-medium" style={{ color: theme.text }}>{item.label}</div>
                    <div className="text-[11px]" style={{ color: theme.text3 }}>{item.hint}</div>
                  </div>
                ))}
              </div>
              <Link
                to="/analytics"
                className="glass-panel fx-lift press-feedback focus-ring mt-4 flex items-center justify-between gap-3 rounded-[var(--r-md)] px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-semibold" style={{ color: theme.text }}>Vezi pregătirea în Perspective AI</span>
                  <span className="block text-xs" style={{ color: theme.text3 }}>Estimări și ritmul necesar, calculate din activitatea ta</span>
                </span>
                <ArrowRight size={16} style={{ color: theme.accentText }} />
              </Link>
            </StatsCard>

            {strongTopics.length > 0 && (
              <StatsCard index={8}>
                <h2 className="font-semibold mb-1 flex items-center gap-2" style={{ color: theme.text }}>
                  <Award size={16} style={{ color: theme.success }} />
                  Puncte forte
                </h2>
                <p className="mb-4 text-xs" style={{ color: theme.text3 }}>
                  Subiecte pe care le stăpânești — bune de păstrat prin recapitulări rare.
                </p>
                <div className="space-y-2">
                  {strongTopics.map((topic, ti) => (
                    <div key={topic.topic} className={`fine-row flex items-center gap-3 rounded-[var(--r-sm)] p-3 ${calmMotion ? '' : 'fx-rise'}`}
                      style={{ '--i': Math.min(ti, 8) } as CSSProperties}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: theme.text }}>{topic.topic}</p>
                        <p className="mt-0.5 text-xs" style={{ color: theme.text3 }}>
                          {plural(topic.total, 'întrebare', 'întrebări')}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-bold" style={{ color: theme.success }}>
                        {Math.round(topic.accuracy)}%
                      </span>
                    </div>
                  ))}
                </div>
              </StatsCard>
            )}

            {weakQuestions.length > 0 && (
              <StatsCard index={8}>
                <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                  <Target size={16} style={{ color: theme.danger }} />
                  Întrebări slabe (necesită atenție)
                </h2>
                <div className="space-y-2">
                  {weakQuestions.map((ws, wi) => {
                    const quiz = quizzes.find(q => q.id === ws.quizId);
                    const question = quiz?.questions.find(q => q.id === ws.questionId);
                    if (!question || !quiz) return null;
                    const acc = Math.round(ws.timesCorrect / (ws.timesCorrect + ws.timesWrong) * 100);
                    return (
                      <button
                        key={ws.questionId}
                        onClick={() => navigate(`/play/${quiz.id}`, { state: { wrongQuestionsOnly: [ws.questionId] } })}
                        title="Exersează doar această întrebare"
                        className={`fine-row press-feedback focus-ring flex w-full items-start gap-3 rounded-[var(--r-sm)] p-3 text-left ${calmMotion ? '' : 'fx-rise'}`}
                        style={{ '--i': Math.min(wi, 8) } as CSSProperties}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{question.text}</p>
                          <p className="text-xs mt-0.5" style={{ color: theme.text3 }}>
                            {quiz.title} · {ws.timesCorrect}/{ws.timesCorrect + ws.timesWrong} corecte
                          </p>
                        </div>
                        <span className="flex flex-shrink-0 items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: theme.danger }}>{acc}%</span>
                          <ArrowRight size={14} style={{ color: theme.text3 }} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </StatsCard>
            )}
          </>
        )}
        </div>
      </div>
    </FxPage>
  );
}
