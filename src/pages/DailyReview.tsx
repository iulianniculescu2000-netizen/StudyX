/**
 * DailyReview.tsx
 *
 * SM-2 daily spaced-repetition queue.
 * Shows all questions whose nextReview <= now, one by one.
 * Records answers back into statsStore so the SM-2 algorithm advances.
 */
import ProgressBar from '../components/fx/ProgressBar';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ChevronRight, Check, X, RotateCcw, Home, Sparkles, Trophy, LogOut, BookOpen, Lightbulb, Flag, CalendarCheck, Library } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import { isFlashcardDeck } from '../lib/deckKind';
import { dur, ease, press, pressLarge } from '../theme/motion';
import PageHeader from '../components/ui/PageHeader';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import { cleanQuestionExplanation } from '../helpers/quizAi';
import { buildDueItems, planDailySession, type DueItem } from '../lib/dueItems';

export default function DailyReview() {
  const theme = useTheme();
  const { t, calmMotion } = useAdaptiveMotion();
  const hydrated = useStoresHydrated('quiz', 'stats');
  const { quizzes } = useQuizStore();
  const { questionStats, recordAnswer, recordStudySession } = useStatsStore();
  const profileId = useUserStore((state) => state.activeProfileId) ?? 'default';
  const hasPlan = useOrganizareStore((state) => !!state.byProfile[profileId]?.summary);

  const [phase, setPhase] = useState<'ready' | 'session' | 'done'>('ready');
  const dueItems = useMemo(() => buildDueItems(questionStats, quizzes), [questionStats, quizzes]);
  // Lista sesiunii se îngheață la „Începe”; altfel s-ar micșora după fiecare răspuns și indexul ar sări întrebări.
  const [sessionItems, setSessionItems] = useState<DueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  // Pornește la „Începe” (nu la montare), ca timpul de pe ecranul de start să nu intre în statistici.
  const startedAtRef = useRef(0);

  // Sesiunea zilnică are plafon; restul rămân scadente și apar în sesiunea următoare.
  const { today: todayItems, remaining: remainingDue } = useMemo(() => planDailySession(dueItems), [dueItems]);
  const items = phase === 'ready' ? todayItems : sessionItems;
  const current = items[currentIdx];
  const isMultiple = current?.question.multipleCorrect ?? false;
  const correctIds = useMemo(() => current?.question.options.filter(o => o.isCorrect).map(o => o.id) ?? [], [current]);
  const progress = items.length > 0 ? (currentIdx + (revealed ? 1 : 0)) / items.length : 0;

  const revealAnswer = useCallback((sel: string[]) => {
    if (!current) return;
    const isCorrect = sel.length === correctIds.length && correctIds.every((id: string) => sel.includes(id));
    setRevealed(true);
    setResults(prev => [...prev, isCorrect]);
    recordAnswer(current.quizId, current.question.id, isCorrect);
  }, [correctIds, current, recordAnswer]);

  const handleSelect = (optId: string) => {
    if (revealed) return;
    if (isMultiple) {
      setSelected(prev => prev.includes(optId) ? prev.filter(i => i !== optId) : [...prev, optId]);
    } else {
      setSelected([optId]);
      revealAnswer([optId]);
    }
  };

  const handleNext = () => {
    if (currentIdx + 1 >= items.length) {
      recordStudySession(Math.floor((Date.now() - startedAtRef.current) / 1000));
      setPhase('done');
    } else {
      setCurrentIdx(i => i + 1);
      setSelected([]);
      setRevealed(false);
    }
  };

  const correctCount = results.filter(Boolean).length;
  const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  if (!hydrated) return <PageSkeleton blocks={2} />;

  // ── Stări goale (doar înainte de sesiune) ────────────────────────────────────
  if (phase === 'ready' && items.length === 0) {
    const hasQuestions = quizzes.some((quiz) => !isFlashcardDeck(quiz) && quiz.questions.length > 0);
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-6 sm:px-6">
          <PageHeader title="Sesiune zilnică" subtitle="Repetare spațiată SM-2" tour={{ id: 'daily', label: 'Ghid pentru sesiunea zilnică' }} />
          {hasQuestions ? (
            <EmptyState
              icon={CalendarCheck}
              title="Ești la zi!"
              body="Ai recapitulat tot ce era programat pentru azi. Revino mâine pentru sesiunea următoare."
              primary={hasPlan ? { label: 'Vezi planul în Organizare', to: '/rezidentiat/organizare' } : { label: 'Flashcarduri', to: '/flashcards' }}
              secondary={hasPlan ? { label: 'Flashcarduri', to: '/flashcards' } : { label: 'Înapoi la Panou', to: '/' }}
            />
          ) : (
            <EmptyState
              icon={Library}
              title="Încă nu ai grile"
              body="Recapitularea zilnică se construiește din grilele la care răspunzi. Adaugă sau generează un set și revino aici."
              primary={{ label: 'Deschide grilele', to: '/quizzes' }}
              secondary={{ label: 'Biblioteca AI', to: '/vault' }}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Ready screen ─────────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-6 sm:px-6">
          <PageHeader
            eyebrow="Repetare spațiată SM-2"
            title="Sesiune zilnică"
            tour={{ id: 'daily', label: 'Ghid pentru sesiunea zilnică' }}
            subtitle={`${items.length} ${items.length === 1 ? 'întrebare' : 'întrebări'} de recapitulat azi`}
          />

          <div data-tutorial="daily-summary" className="mb-5 grid grid-cols-2 gap-3">
            <div className={`glass-panel rounded-[var(--r-lg)] p-4 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 1 } as React.CSSProperties}>
              <p className="text-2xl font-bold" style={{ color: theme.accentText }}>{items.length}</p>
              <p className="mt-0.5 text-xs" style={{ color: theme.text3 }}>Întrebări de azi</p>
            </div>
            <div className={`glass-panel rounded-[var(--r-lg)] p-4 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 2 } as React.CSSProperties}>
              <p className="text-2xl font-bold" style={{ color: theme.accent2 }}>
                {Math.ceil(items.length / 2)}
                <span className="ml-0.5 text-sm font-medium">min</span>
              </p>
              <p className="mt-0.5 text-xs" style={{ color: theme.text3 }}>Timp estimat (~30s/întrebare)</p>
            </div>
          </div>

          {remainingDue > 0 && (
            <p className="mb-5 text-center text-xs" style={{ color: theme.text3 }}>
              Rămân {remainingDue} {remainingDue === 1 ? 'întrebare' : 'întrebări'} pentru mâine. Rămân scadente până le recapitulezi.
            </p>
          )}

          <motion.button
            data-tutorial="daily-start"
            {...pressLarge}
            onClick={() => {
              setSessionItems(todayItems);
              setCurrentIdx(0);
              setSelected([]);
              setRevealed(false);
              setResults([]);
              startedAtRef.current = Date.now();
              setPhase('session');
            }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-[var(--r-lg)] py-4 font-semibold text-white"
            style={{ background: theme.accent, boxShadow: 'var(--elev-1)' }}>
            <Sparkles size={16} />Începe sesiunea
          </motion.button>
          <div className="text-center">
            <Link to="/" className="text-sm" style={{ color: theme.text3 }}>Înapoi la Panou</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const grade = accuracy >= 90 ? 'Excelent!' : accuracy >= 70 ? 'Bine!' : accuracy >= 50 ? 'Continuă!' : 'Mai exersează!';
    return (
      <div className="h-full overflow-y-auto px-6 py-10 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={t.page}
          className="max-w-sm w-full text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[var(--r-xl)]"
            style={{ background: theme.accent, boxShadow: 'var(--elev-2)' }}>
            <Trophy size={36} className="text-white" />
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: theme.text }}>{grade}</h2>
          <p className="text-sm mb-6" style={{ color: theme.text3 }}>Sesiune SM-2 completă</p>

          {/* Score ring */}
          <div className="relative w-28 h-28 mx-auto mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke={theme.surface2} strokeWidth="10" />
              <motion.circle
                cx="50" cy="50" r="42" fill="none"
                stroke={accuracy >= 70 ? theme.success : accuracy >= 40 ? theme.warning : theme.danger}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - accuracy / 100) }}
                transition={calmMotion ? t.page : { duration: dur.slow * 2, ease: ease.emphasized }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: theme.text }}>{accuracy}%</span>
              <span className="text-xs" style={{ color: theme.text3 }}>acuratețe</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className={`glass-panel rounded-[var(--r-lg)] p-4 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 1 } as React.CSSProperties}>
              <p className="text-xl font-bold" style={{ color: theme.success }}>{correctCount}</p>
              <p className="text-xs" style={{ color: theme.text3 }}>Corecte</p>
            </div>
            <div className={`glass-panel rounded-[var(--r-lg)] p-4 ${calmMotion ? '' : 'fx-rise'}`} style={{ '--i': 2 } as React.CSSProperties}>
              <p className="text-xl font-bold" style={{ color: theme.danger }}>{results.length - correctCount}</p>
              <p className="text-xs" style={{ color: theme.text3 }}>Greșite</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { setPhase('ready'); setCurrentIdx(0); setSelected([]); setRevealed(false); setResults([]); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[var(--r-lg)] font-semibold text-white press-feedback"
              style={{ background: theme.accent }}>
              <RotateCcw size={14} />Repetă sesiunea
            </button>
            <Link to="/"
              className="fine-chip press-feedback w-full flex items-center justify-center gap-2 py-3 rounded-[var(--r-md)] text-sm font-medium"
              style={{ color: theme.text2 }}>
              <Home size={14} />Acasă
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Session screen ────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain size={15} style={{ color: theme.accentText }} />
              <span className="text-xs font-semibold" style={{ color: theme.accentText }}>Sesiune zilnică</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: theme.text3 }}>
                {currentIdx + 1} / {items.length}
              </span>
              <button
                onClick={() => {
                  recordStudySession(Math.floor((Date.now() - startedAtRef.current) / 1000));
                  setPhase('done');
                }}
                className="fine-chip press-feedback flex items-center gap-1 px-2 py-1 rounded-[var(--r-sm)] text-[10px] font-semibold"
                style={{ color: theme.text3 }}
                title="Ieși din sesiune"
              >
                <LogOut size={11} />
                Ieși
              </button>
            </div>
          </div>
          <ProgressBar percent={progress * 100} heightClass="h-1.5" track={theme.surface2} color={theme.accent}
            transition={{ duration: dur.base, ease: ease.standard }} label="Progres recapitulare zilnică" />
        </div>

        <AnimatePresence>
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: calmMotion ? 0 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: calmMotion ? 0 : -12 }}
            transition={t.page}
          >
            {/* Question card */}
            <div className="glass-panel rounded-[var(--r-lg)] p-5 mb-4">
              <p className="text-xs font-medium mb-3 flex items-center gap-1.5 min-w-0" style={{ color: theme.text3 }}>
                <BookOpen size={12} className="shrink-0" />
                <span className="truncate">{current.quizTitle}</span>
              </p>
              <p className="text-lg font-semibold leading-snug" style={{ color: theme.text }}>
                {current.question.text}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2.5 mb-4">
              {current.question.options.map((opt) => {
                const isSelected = selected.includes(opt.id);
                const isCorrect = opt.isCorrect;
                let bg = theme.surface;
                let border = theme.border;
                let color = theme.text2;

                if (revealed) {
                  if (isCorrect) { bg = `${theme.success}14`; border = `${theme.success}45`; color = theme.success; }
                  else if (isSelected) { bg = `${theme.danger}12`; border = `${theme.danger}40`; color = theme.danger; }
                } else if (isSelected) {
                  bg = `${theme.accent}14`; border = `${theme.accent}45`; color = theme.accent;
                }

                return (
                  <motion.button
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    {...(!revealed ? press : {})}
                    className={`w-full flex items-center gap-3 p-4 rounded-[var(--r-md)] text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ${!revealed ? 'fx-lift' : ''} ${isSelected || (revealed && isCorrect) ? 'elev-1' : ''}`}
                    style={{ background: bg, border: `1px solid ${border}`, color, cursor: revealed ? 'default' : 'pointer' }}
                  >
                    <span className="w-6 h-6 rounded-[var(--r-sm)] flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{
                        background: revealed && isCorrect
                          ? `${theme.success}25`
                          : revealed && isSelected && !isCorrect
                            ? `${theme.danger}20`
                            : isSelected ? `${theme.accent}22` : theme.surface2,
                        color: revealed && isCorrect ? theme.success : revealed && isSelected && !isCorrect ? theme.danger : isSelected ? theme.accentText : theme.text3,
                      }}>
                      {revealed && isCorrect ? <Check size={12} /> : revealed && isSelected && !isCorrect ? <X size={12} /> : opt.id.toUpperCase()}
                    </span>
                    <span className="text-sm">{opt.text}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Confirm multi-select */}
            <AnimatePresence>
              {isMultiple && !revealed && selected.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => revealAnswer(selected)}
                  className="w-full py-3.5 rounded-[var(--r-lg)] font-semibold text-white mb-4"
                  style={{ background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent})` }}>
                  Confirmă selecția
                </motion.button>
              )}
            </AnimatePresence>

            {/* Explanation */}
            <AnimatePresence>
              {revealed && cleanQuestionExplanation(current.question.explanation) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  data-active="true"
                  className="fine-chip mb-4 p-5 rounded-[var(--r-lg)] overflow-hidden">
                  <p className="text-sm" style={{ color: theme.text2, lineHeight: '1.7', fontSize: '15px' }}>
                    <span className="font-black uppercase tracking-widest text-[10px] flex items-center gap-1.5 mb-2" style={{ color: theme.accentText }}><Lightbulb size={12} /> Explicație</span>
                    {cleanQuestionExplanation(current.question.explanation)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Next button */}
            <AnimatePresence>
              {revealed && (
                <motion.button
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={handleNext}
                  className="w-full py-4 rounded-[var(--r-lg)] font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: theme.accent }}
                  {...press}>
                  {currentIdx + 1 >= items.length ? (<><Flag size={16} /> Vezi rezultatele</>) : (<>Următor <ChevronRight size={16} /></>)}
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
