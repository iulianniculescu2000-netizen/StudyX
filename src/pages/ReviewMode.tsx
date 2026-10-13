import { plural } from '../lib/plural';
import { motion, AnimatePresence } from 'framer-motion';
import ProgressBar from '../components/fx/ProgressBar';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Trophy, Keyboard, Layers, Zap, Target, Flame, RotateCw, GraduationCap, Sparkles, ThumbsUp, BookOpen, Lightbulb } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease, press } from '../theme/motion';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import QuizImage from '../components/QuizImage';
import { useQuizStore } from '../store/quizStore';
import { upsertGeneratedQuiz } from '../lib/generatedQuiz';
import { useStatsStore, calcNextReview, countWeakStats, existingStatKeys } from '../store/statsStore';
import { buildDueItems } from '../lib/dueItems';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import { cleanQuestionExplanation } from '../helpers/quizAi';
import { isFlashcardDeck } from '../lib/deckKind';
import { buildAdaptiveExamQuiz, buildWeaknessRecoveryQuiz } from '../lib/adaptiveStudy';
import ReviewActionCard from './review-mode/ReviewActionCard';
import type { Question, QuestionStat, Confidence } from '../types';

interface ReviewItem {
  stat: QuestionStat;
  question: Question;
  quizTitle: string;
}

function formatInterval(days: number) {
  if (days === 1) return '1 zi';
  if (days < 30) return plural(days, 'zi', 'zile');
  if (days < 365) return `${Math.round(days / 30)} luni`;
  return '1 an';
}

function AnkiButton({ label, interval, keyHint, color, isDefault, onClick }: {
  label: string;
  interval: number;
  keyHint: string;
  color: string;
  isDefault?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      {...press}
      onClick={onClick}
      className="flex flex-col items-center justify-center p-3.5 rounded-[var(--r-lg)] relative"
      style={{
        background: `${color}12`,
        color: color,
        border: `1px solid ${color}35`,
        boxShadow: isDefault ? `0 0 0 2px var(--background), 0 0 0 4px ${color}` : 'none',
      }}
    >
      <span className="text-[14px] font-bold tracking-wide">{label}</span>
      <span className="text-[11px] font-semibold opacity-70 mt-1">{formatInterval(interval)}</span>
      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-mono opacity-60" style={{ background: `${color}25` }}>{keyHint}</div>
    </motion.button>
  );
}

export default function ReviewMode() {
  const theme = useTheme();
  const { t, calmMotion } = useAdaptiveMotion();
  const navigate = useNavigate();
  const quizzes = useQuizStore((state) => state.quizzes);
  // Contează doar grilele (nu pachetele de flashcarduri) — exact ce pornește și sesiunea de mai jos.
  // Selectorul întoarce statisticile (stabile), nu o listă nouă la fiecare citire: altfel React intră în buclă infinită.
  const questionStats = useStatsStore((state) => state.questionStats);
  // Numere exacte (fără plafon), pe aceleași surse ca bara laterală și /daily-review: doar grile existente, fără intrări retrase.
  const { dueCount, weakCount } = useMemo(() => ({
    dueCount: buildDueItems(questionStats, quizzes).length,
    weakCount: countWeakStats(questionStats, existingStatKeys(quizzes.filter((quiz) => !isFlashcardDeck(quiz)))),
  }), [questionStats, quizzes]);
  const recordAnswer = useStatsStore((state) => state.recordAnswer);
  const recordStudySession = useStatsStore((state) => state.recordStudySession);
  const activeProfileId = useUserStore((state) => state.activeProfileId);
  const hasPlan = useOrganizareStore((state) => !!state.byProfile[activeProfileId ?? 'default']?.summary);

  const createQuizFromMistakes = () => {
    const weak = useStatsStore.getState().getWeakQuestions(20);
    const items = weak.flatMap((stat) => {
      const quiz = quizzes.find(q => q.id === stat.quizId);
      const question = quiz?.questions.find(q => q.id === stat.questionId);
      if (!quiz || !question || isFlashcardDeck(quiz)) return [];
      return [question];
    });
    if (items.length === 0) return;
    // Un singur „Quiz din greșeli" pe profil: se reîmprospătează întrebările, nu se adaugă un set nou la fiecare apăsare.
    const id = upsertGeneratedQuiz({
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      title: 'Quiz din greșeli',
      description: `${plural(items.length, 'întrebare', 'întrebări')} la care ai greșit cel mai des`,
      emoji: '🔥',
      color: 'red',
      category: 'Altele',
      folderId: null,
      shuffleQuestions: true,
      shuffleAnswers: true,
      tags: ['greșeli', 'recapitulare'],
      questions: items,
      createdAt: Date.now(),
    });
    navigate(`/play/${id}`);
  };

  const [mode, setMode] = useState<'pick' | 'review' | 'done'>('pick');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [startedAt] = useState(() => Date.now());
  const [showKeys, setShowKeys] = useState(false);

  const buildItems = (stats: QuestionStat[]): ReviewItem[] => {
    return stats.flatMap(stat => {
      const quiz = quizzes.find(q => q.id === stat.quizId);
      const question = quiz?.questions.find(q => q.id === stat.questionId);
      if (!quiz || !question || isFlashcardDeck(quiz)) return [];
      return [{ stat, question, quizTitle: quiz.title }];
    });
  };

  const startDue = () => {
    // Aceeași listă ca insigna: fără dubluri din sesiuni combinate, întrebări ascunse sau intrări retrase.
    const live = useStatsStore.getState().questionStats;
    const due = buildDueItems(live, quizzes).flatMap((item) => {
      const stat = live[`${item.quizId}:${item.question.id}`];
      return stat ? [stat] : [];
    });
    setItems(buildItems(due));
    setMode('review');
  };

  const startWeak = () => {
    const weak = useStatsStore.getState().getWeakQuestions(10);
    setItems(buildItems(weak));
    setMode('review');
  };

  const startRecoverySession = () => {
    if (!activeProfileId) return;
    const quiz = buildWeaknessRecoveryQuiz(activeProfileId, quizzes, useStatsStore.getState().questionStats);
    if (!quiz) return;
    navigate(`/play/${upsertGeneratedQuiz(quiz)}`);
  };

  const startAdaptiveExam = () => {
    if (!activeProfileId) return;
    const quiz = buildAdaptiveExamQuiz(activeProfileId, quizzes, useStatsStore.getState().questionStats);
    if (!quiz) return;
    navigate(`/play/${upsertGeneratedQuiz(quiz)}`, { state: { mode: 'exam' } });
  };

  const current = items[currentIdx];
  const isMultiple = current?.question.multipleCorrect ?? false;
  const correctIds = useMemo(() => current?.question.options.filter(o => o.isCorrect).map(o => o.id) ?? [], [current]);

  const isCorrectOutcome = useMemo(() => {
    if (!current) return false;
    return selected.length === correctIds.length && correctIds.every(id => selected.includes(id));
  }, [current, selected, correctIds]);

  const handleSelect = useCallback((optId: string) => {
    if (revealed) return;
    if (isMultiple) {
      setSelected(prev => prev.includes(optId) ? prev.filter(i => i !== optId) : [...prev, optId]);
    } else {
      setSelected([optId]);
      setRevealed(true);
    }
  }, [isMultiple, revealed]);

  const handleNext = useCallback(() => {
    if (currentIdx + 1 >= items.length) {
      recordStudySession(Math.floor((Date.now() - startedAt) / 1000));
      setMode('done');
    } else {
      setCurrentIdx(i => i + 1);
      setSelected([]);
      setRevealed(false);
    }
  }, [currentIdx, items.length, recordStudySession, startedAt]);

  const handleGrade = useCallback((wantCorrect: boolean, confidence?: Confidence) => {
    if (!current) return;
    // Răspunsul ales rămâne sursa adevărului: "Greu/Bine/Ușor" după o alegere greșită
    // nu poate număra ca răspuns corect.
    const correct = wantCorrect && isCorrectOutcome;
    recordAnswer(current.stat.quizId, current.stat.questionId, correct, correct ? confidence : "blackout");
    setResults(prev => [...prev, correct]);
    handleNext();
  }, [current, isCorrectOutcome, recordAnswer, handleNext]);

  // Ieșirea din sesiune după ce răspunsul a fost dezvăluit, dar înainte de notare, nu
  // trebuie să piardă răspunsul: îl înregistrăm cu rezultatul real.
  const pendingRef = useRef<{ quizId: string; questionId: string; correct: boolean } | null>(null);
  useEffect(() => {
    pendingRef.current = revealed && current
      ? { quizId: current.stat.quizId, questionId: current.stat.questionId, correct: isCorrectOutcome }
      : null;
  }, [revealed, current, isCorrectOutcome]);
  useEffect(() => () => {
    const p = pendingRef.current;
    if (p) useStatsStore.getState().recordAnswer(p.quizId, p.questionId, p.correct, p.correct ? undefined : "blackout");
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return; // tasta ținută apăsată ar nota automat cardurile următoare
      if (mode !== 'review') return;
      
      if (!revealed) {
        const keyMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4 };
        const idx = keyMap[e.key.toLowerCase()];
        if (idx !== undefined && current?.question.options[idx]) handleSelect(current.question.options[idx].id);
        if ((e.key === 'Enter' || e.key === ' ') && isMultiple && selected.length > 0) {
            e.preventDefault();
            setRevealed(true);
        }
      } else {
        if (e.key === '1') { e.preventDefault(); handleGrade(false, 'blackout'); }
        if (e.key === '2') { e.preventDefault(); handleGrade(true, 'guess'); }
        if (e.key === '3') { e.preventDefault(); handleGrade(true, undefined); }
        if (e.key === '4') { e.preventDefault(); handleGrade(true, 'confident'); }
        if (e.key === 'Enter' || e.key === ' ') {
           e.preventDefault();
           if (isCorrectOutcome) handleGrade(true, undefined);
           else handleGrade(false, 'blackout');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, current, revealed, selected, isMultiple, isCorrectOutcome, handleGrade, handleSelect]);

  const intervals = useMemo(() => {
    if (!current) return { again: 1, hard: 1, good: 1, easy: 1 };
    return {
      again: calcNextReview(current.stat, false, 'blackout').interval,
      hard:  calcNextReview(current.stat, true, 'guess').interval,
      good:  calcNextReview(current.stat, true, undefined).interval,
      easy:  calcNextReview(current.stat, true, 'confident').interval,
    };
  }, [current]);

  const reviewActions = [
    {
      id: 'due',
      title: 'Repetare Spațiată',
      subtitle: 'Algoritm SM-2',
      description: 'Întrebări selectate automat pentru a preveni uitarea. Cel mai eficient flux pentru consolidare constantă.',
      icon: Zap,
      accent: theme.warning,
      badge: dueCount,
      ctaLabel: 'Începe acum',
      disabled: dueCount === 0,
      onClick: startDue,
    },
    {
      id: 'weak',
      title: 'Puncte Slabe',
      subtitle: 'Analiză erori',
      description: 'Concentrează-te pe subiectele unde ai întâmpinat dificultăți și transformă minusurile în plusuri reale.',
      icon: Target,
      accent: theme.danger,
      badge: weakCount,
      ctaLabel: 'Consolidează',
      disabled: weakCount === 0,
      onClick: startWeak,
    },
    {
      id: 'error-notebook',
      title: 'Caiet de erori',
      subtitle: 'Greșelile tale',
      description: 'Toate întrebările la care ai greșit, pe discipline, cu explicații și grile similare generate de AI.',
      icon: BookOpen,
      accent: theme.danger,
      badge: weakCount,
      ctaLabel: 'Deschide caietul',
      disabled: weakCount === 0,
      onClick: () => navigate('/erori'),
    },
    {
      id: 'mistakes',
      title: 'Quiz din Greșeli',
      subtitle: 'Generator automat',
      description: 'Generează o grilă nouă direct din istoricul tău de erori pentru o sesiune rapidă și foarte țintită.',
      icon: Flame,
      accent: theme.accent,
      ctaLabel: 'Generează quiz',
      disabled: weakCount === 0,
      onClick: createQuizFromMistakes,
    },
    {
      id: 'recovery',
      title: 'Recuperarea punctelor slabe',
      subtitle: 'Recuperare țintită',
      description: 'O sesiune scurtă, ghidată de topicurile unde ai cea mai mare nevoie de consolidare.',
      icon: RotateCw,
      accent: theme.success,
      ctaLabel: 'Recuperează',
      disabled: !activeProfileId || weakCount === 0,
      onClick: startRecoverySession,
    },
    {
      id: 'exam-simulation',
      title: 'Simulare de examen',
      subtitle: 'Cronometrată',
      description: 'Până la 200 de grile din băncile tale, cu timp total, punctaj cu penalizare și rezultat pe discipline.',
      icon: GraduationCap,
      accent: theme.accent,
      ctaLabel: 'Alege simularea',
      disabled: quizzes.length === 0,
      onClick: () => navigate('/simulare'),
    },
    {
      id: 'adaptive-exam',
      title: 'Examen adaptiv',
      subtitle: 'Simulare dinamică',
      description: 'Simulare de examen cu dificultate calibrată după istoricul tău, pentru antrenament realist și progres măsurabil.',
      icon: GraduationCap,
      accent: theme.accent2,
      ctaLabel: 'Simulează examenul',
      disabled: !activeProfileId || quizzes.length === 0,
      onClick: startAdaptiveExam,
      wide: true,
    },
  ] as const;

  if (mode === 'pick') {
    return (
      <div className="premium-shell min-h-full px-4 py-6 sm:px-6 sm:pb-[calc(var(--float-clearance)+1.5rem)] lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <PageHeader
            eyebrow="Recapitulare"
            title="Recapitulare inteligentă"
            tour={{ id: 'review', label: 'Ghid pentru recapitulare' }}
            subtitle="Alege modul potrivit pentru ritmul tău. Totul este orientat spre retenție, claritate și antrenament inteligent."
            actions={(
              <>
                <span className="fine-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
                  {plural(dueCount, 'item scadent', 'itemi scadenți')}
                </span>
                <span className="fine-chip rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: theme.text3 }}>
                  {weakCount} puncte slabe active
                </span>
              </>
            )}
          />

          <div data-tutorial="review-actions" className="grid gap-4 md:grid-cols-2 xl:gap-5">
            {reviewActions.map((action) => (
              <ReviewActionCard
                key={action.id}
                {...(action.id === 'due' ? { 'data-tutorial': 'review-due' }
                  : action.id === 'weak' ? { 'data-tutorial': 'review-weak' }
                  : action.id === 'adaptive-exam' ? { 'data-tutorial': 'review-adaptive-exam' }
                  : {})}
                {...action}
                theme={theme}
              />
            ))}
          </div>

          {dueCount === 0 && weakCount === 0 && (
            <div className="mt-8">
              <EmptyState
                icon={Sparkles}
                title="Ești la zi!"
                body={hasPlan
                  ? 'Nu ai întrebări restante. Planifică următorii pași în Organizare sau alege o disciplină din Rezidențiat.'
                  : 'Nu ai întrebări restante. Alege o disciplină din Rezidențiat sau repetă flashcarduri.'}
                primary={hasPlan ? { label: 'Deschide Organizare', to: '/rezidentiat/organizare' } : { label: 'Rezidențiat', to: '/rezidentiat' }}
                secondary={hasPlan ? { label: 'Rezidențiat', to: '/rezidentiat' } : { label: 'Flashcarduri', to: '/flashcards' }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'done') {
    const correct = results.filter(Boolean).length;
    const pct = Math.round((correct / results.length) * 100);
    return (
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={t.page}
          className="glass-panel elev-3 text-center max-w-md rounded-[var(--r-xl)] px-8 py-10">
          <div className="h-[60px] mb-4 flex items-center justify-center" style={{ color: theme.accent }}>
            {pct >= 80 ? <Trophy size={56} strokeWidth={1.5} /> : pct >= 50 ? <ThumbsUp size={56} strokeWidth={1.5} /> : <BookOpen size={56} strokeWidth={1.5} />}
          </div>
          <h2 className="text-3xl font-bold mb-2" style={{ color: theme.text }}>
            {pct >= 80 ? 'Excelent!' : pct >= 50 ? 'Bine!' : 'Continuă!'}
          </h2>
          <p className="mb-6" style={{ color: theme.text2 }}>
            {correct}/{results.length} corecte ({pct}%)
          </p>
          <div className="mb-6 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: theme.text3 }}>
            Recapitulare finalizată
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setMode('pick'); setCurrentIdx(0); setResults([]); setSelected([]); setRevealed(false); }}
              className="fine-chip fx-lift press-feedback flex items-center gap-2 px-5 py-3 rounded-[var(--r-lg)] font-medium text-sm"
              style={{ color: theme.text2 }}>
              <RefreshCw size={14} />Altă sesiune
            </button>
            <Link to="/"
              className="flex items-center gap-2 px-5 py-3 rounded-[var(--r-lg)] font-semibold text-white text-sm press-feedback"
              style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}>
              <Trophy size={14} />Panou
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!current) return null;

  const progress = currentIdx / items.length;

  const getOptStyle = (optId: string): React.CSSProperties => {
    const isSel = selected.includes(optId);
    if (!revealed) return isSel
      ? { background: `${theme.accent}18`, border: `1px solid ${theme.accent}50` }
      : { background: theme.surface, border: `1px solid ${theme.border}` };
    if (correctIds.includes(optId)) return { background: `${theme.success}14`, border: `1px solid ${theme.success}50` };
    if (isSel) return { background: `${theme.danger}12`, border: `1px solid ${theme.danger}50` };
    return { background: theme.surface, border: `1px solid ${theme.border}`, opacity: 0.4 };
  };

  return (
    <div className="premium-shell min-h-full flex flex-col px-4 py-6 sm:px-6 lg:px-8 overflow-x-hidden">
      {/* Progress */}
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-3">
          <span className="text-sm font-medium" style={{ color: theme.text3 }}>{currentIdx + 1}/{items.length}</span>
          <div className="flex-1">
            <ProgressBar percent={progress * 100} heightClass="h-1.5" track={theme.surface2} color={theme.accent}
              transition={{ duration: dur.base, ease: ease.emphasized }} label="Progres recapitulare" />
          </div>
          <button onClick={() => setShowKeys(k => !k)}
            className="fine-row press-feedback p-1.5"
            data-active={showKeys}
            aria-pressed={showKeys}
            style={{ color: showKeys ? theme.accent : theme.text3 }}>
            <Keyboard size={14} />
          </button>
        </div>
        {/* Keyboard hint */}
        <AnimatePresence>
          {showKeys && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={t.modal}
              className="fine-chip mb-3 px-3 py-2 rounded-[var(--r-md)] text-xs flex flex-wrap gap-3 overflow-hidden"
              style={{ color: theme.text3 }}>
              {['1-5 / A-E: alege', 'Enter: confirmă', 'După răspuns:', '1=Din nou', '2=Greu', '3=Bine', '4=Ușor', 'Enter=Implicit'].map((h, idx) => (
                <span key={idx} className="font-mono opacity-80">{h}</span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto mt-3 relative">
        <AnimatePresence mode="wait">
          <motion.div key={currentIdx}
            initial={{ opacity: 0, x: calmMotion ? 0 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: calmMotion ? 0 : -12 }}
            transition={t.page}
            className="flex-1 flex flex-col w-full h-full">

            <div className={`glass-panel rounded-[var(--r-xl)] p-6 mb-5 ${calmMotion ? '' : 'fx-rise'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: theme.accentText }}>
                  Recapitulare
                </span>
                {current.question.multipleCorrect && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ background: `${theme.accent2}18`, color: theme.accent2 }}>
                    <Layers size={10} />Multi-select
                  </span>
                )}
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full truncate max-w-[140px]"
                  style={{ background: theme.surface2, color: theme.text3 }}>
                  {current.quizTitle}
                </span>
              </div>
              <p className="text-xl font-semibold" style={{ color: theme.text }}>{current.question.text}</p>
              {current.question.imageUrl && (
                <div className="mt-4">
                  <QuizImage src={current.question.imageUrl} maxHeight={224} />
                </div>
              )}
              {isMultiple && !revealed && (
                <p className="text-sm mt-2" style={{ color: theme.text3 }}>Selectează toate răspunsurile corecte</p>
              )}
            </div>

            <div className="space-y-2.5 mb-4">
              {current.question.options.map((opt, i) => (
                <motion.button key={opt.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={calmMotion ? t.page : { delay: Math.min(i, 7) * 0.04, duration: dur.base, ease: ease.emphasized }}
                  onClick={() => handleSelect(opt.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-[var(--r-md)] text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ${!revealed ? 'fx-lift' : ''} ${selected.includes(opt.id) || (revealed && correctIds.includes(opt.id)) ? 'elev-1' : ''}`}
                  style={getOptStyle(opt.id)}
                  {...(!revealed ? press : {})}>
                  <div className="w-7 h-7 rounded-[var(--r-sm)] flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 transition-colors"
                    style={{
                      borderColor: selected.includes(opt.id) ? (revealed ? (correctIds.includes(opt.id) ? theme.success : theme.danger) : theme.accent) : theme.border2,
                      background: selected.includes(opt.id) ? (revealed ? (correctIds.includes(opt.id) ? `${theme.success}20` : `${theme.danger}20`) : `${theme.accent}20`) : 'transparent',
                      color: revealed ? (correctIds.includes(opt.id) ? theme.success : selected.includes(opt.id) ? theme.danger : theme.text3) : selected.includes(opt.id) ? theme.accent : theme.text2,
                    }}>
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span className="text-sm font-medium transition-colors" style={{ color: revealed ? (correctIds.includes(opt.id) ? theme.success : selected.includes(opt.id) ? theme.danger : theme.text3) : theme.text }}>
                    {opt.text}
                  </span>
                  <span className="ml-auto text-xs font-mono rounded px-1.5 py-0.5 opacity-50" style={{ background: theme.surface2, color: theme.text3 }}>{i + 1}</span>
                </motion.button>
              ))}
            </div>

            {isMultiple && !revealed && selected.length > 0 && (
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                onClick={() => setRevealed(true)}
                className="w-full py-4 rounded-[var(--r-lg)] font-bold text-white mb-3 press-feedback"
                style={{ background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent})`, boxShadow: 'var(--elev-1)' }}>
                Confirmă ({selected.length} selectate)
              </motion.button>
            )}

            <AnimatePresence>
              {revealed && cleanQuestionExplanation(current.question.explanation) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  transition={t.modal}
                  data-active="true"
                  className="fine-chip mb-4 p-5 rounded-[var(--r-lg)] overflow-hidden">
                  <p className="text-sm leading-relaxed" style={{ color: theme.text2 }}>
                    <Lightbulb size={18} className="mr-2 inline-block align-text-bottom" style={{ color: theme.accentText }} />
                    {cleanQuestionExplanation(current.question.explanation)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {revealed && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                  transition={calmMotion ? t.page : { duration: dur.base, ease: ease.emphasized, delay: 0.1 }}
                  className="mt-auto grid grid-cols-4 gap-2.5 pb-4 pt-2">
                  <AnkiButton label="Din nou" interval={intervals.again} keyHint="1" color={theme.danger} isDefault={!isCorrectOutcome} onClick={() => handleGrade(false, 'blackout')} />
                  <AnkiButton label="Greu" interval={intervals.hard} keyHint="2" color={theme.warning} onClick={() => handleGrade(true, 'guess')} />
                  <AnkiButton label="Bine" interval={intervals.good} keyHint="3" color={theme.success} isDefault={isCorrectOutcome} onClick={() => handleGrade(true, undefined)} />
                  <AnkiButton label="Ușor" interval={intervals.easy} keyHint="4" color={theme.accent} onClick={() => handleGrade(true, 'confident')} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
