import { useState } from 'react';
import ProgressBar from '../../../components/fx/ProgressBar';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { useBack } from '../../../hooks/useBack';
import { ChevronLeft, ChevronRight, Keyboard, Zap, Eye, GraduationCap } from 'lucide-react';
import type { Quiz } from '../../../types';
import type { Theme } from '../../../theme/themes';
import { dur, ease } from '../../../theme/motion';
import { HERO_COLOR_MAP } from '../../../theme/colorMaps';
import type { QuizPlayLayout } from '../layout';
import SegmentedProgressBar from '../SegmentedProgressBar';
import MetricsStrip from './MetricsStrip';

interface SessionHeroProps {
  quiz: Quiz;
  theme: Theme;
  layout: QuizPlayLayout;
  mobile: boolean;
  pageTransition: Transition;
  modeLabel: string;
  examMode: boolean;
  timedMode: boolean;
  examMinutes: number;
  examSecondsLeft: number;
  timeElapsed: number;
  questionTimer: number;
  autoAdvance: boolean;
  focusMode: boolean;
  revealed: boolean;
  isLast: boolean;
  isMultiple: boolean;
  currentIdx: number;
  total: number;
  answeredCount: number;
  progress: number;
  /** One entry per question, for the mobile segmented progress bar. */
  segments: Array<{ done: boolean; current: boolean }>;
  onToggleAuto: () => void;
  onToggleFocus: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

/** Gradient header: title, mode chips, metrics, progress and session controls. */
export default function SessionHero({
  quiz, theme, layout, mobile, pageTransition, modeLabel, examMode, timedMode, examMinutes, examSecondsLeft,
  timeElapsed, questionTimer, autoAdvance, focusMode, revealed, isLast, isMultiple, currentIdx, total, answeredCount,
  progress, segments, onToggleAuto, onToggleFocus, onPrevious, onSkip,
}: SessionHeroProps) {
  const [showKeys, setShowKeys] = useState(false);
  const goBack = useBack(`/quiz/${quiz.id}`);
  const { denseLayout, heroPaddingClass, heroTitleStyle, heroSubtitleClass, heroControlsWrapClass } = layout;
  const heroColors = HERO_COLOR_MAP[quiz.color] ?? HERO_COLOR_MAP.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={pageTransition}
      className={`editorial-hero luxe-card overflow-hidden ${denseLayout ? 'mb-4 rounded-[var(--r-xl)] sm:rounded-[var(--r-xl)]' : 'mb-6 rounded-[var(--r-xl)] sm:rounded-[38px]'} ${heroPaddingClass}`}
      style={{ background: heroColors.gradient, boxShadow: 'var(--elev-2)' }}
    >
      <div className={`relative z-10 flex flex-col ${denseLayout ? 'gap-4' : 'gap-6'}`}>
        <div className={`flex flex-col ${denseLayout ? 'gap-4' : 'gap-5'} xl:flex-row xl:items-start xl:justify-between`}>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={goBack}
              className={`inline-flex items-center gap-2 rounded-full font-black uppercase tracking-[0.18em] transition-[background-color,border-color,color,opacity,transform] ${denseLayout ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
              style={{ background: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.88)' }}
            >
              <ChevronLeft size={14} />
              Înapoi la detalii
            </button>

            <div className={`${denseLayout ? 'mt-3 gap-3' : 'mt-4 gap-4'} flex items-start`}>
              <div
                className={`flex shrink-0 items-center justify-center shadow-lg ${denseLayout ? 'h-11 w-11 rounded-[var(--r-md)] text-2xl sm:h-12 sm:w-12' : 'h-14 w-14 rounded-[var(--r-lg)] text-3xl'}`}
                style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)' }}
              >
                {quiz.emoji}
              </div>

              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/65">
                  Sesiune quiz
                </div>
                <h1 className={`page-title-compact mt-1 text-white ${denseLayout ? 'leading-tight' : ''}`} style={heroTitleStyle}>{quiz.title}</h1>
                <p className={heroSubtitleClass}>
                  {quiz.category} • {modeLabel}
                </p>
                <div className={`${denseLayout ? 'mt-2 gap-1.5' : 'mt-3 gap-2'} flex flex-wrap items-center`}>
                  <span className="rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/90">
                    Întrebarea {currentIdx + 1} din {total}
                  </span>
                  {isMultiple && (
                    <span className="rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/90">
                      Răspunsuri multiple
                    </span>
                  )}
                  {quiz.penaltyMode && (
                    <span className="rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/90">
                      Scor cu penalizare
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <MetricsStrip
            theme={theme}
            mobile={mobile}
            category={quiz.category}
            timedMode={timedMode}
            examMinutes={examMinutes}
            examSecondsLeft={examSecondsLeft}
            timeElapsed={timeElapsed}
            questionTimer={questionTimer}
            autoAdvance={autoAdvance}
            answeredCount={answeredCount}
            total={total}
          />
        </div>

        <div className={`grid ${denseLayout ? 'gap-3' : 'gap-4'} xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end`}>
          <div className={`rounded-[var(--r-lg)] border border-white/14 bg-black/12 ${denseLayout ? 'px-3 py-3' : 'px-4 py-4'}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">Progres sesiune</span>
              <span className="text-sm font-black text-white">{Math.round(progress)}%</span>
            </div>
            {/* One segment per question reads better than a continuous bar at this width — but stops being
                legible past ~24 questions (e.g. a combined "joacă tot folderul" session), so falls back to
                the same continuous bar desktop uses. */}
            {mobile && total > 1 && total <= 24 ? (
              <SegmentedProgressBar
                segments={segments}
              />
            ) : (
              <ProgressBar percent={progress} heightClass="h-2" track="rgb(255 255 255 / 0.16)"
                color="linear-gradient(90deg, rgba(255,255,255,0.98), rgba(255,255,255,0.62))"
                transition={{ duration: dur.base, ease: ease.standard }} label="Progres sesiune" />
            )}
          </div>

          <div className={heroControlsWrapClass}>
            {examMode && (
              <span className="rounded-full border border-white/18 bg-white/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/90">
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap size={12} />
                  Examen
                </span>
              </span>
            )}
            {!examMode && (
              <button
                onClick={onToggleAuto}
                title={autoAdvance ? 'Dezactivează auto-avansarea' : 'Activează auto-avansarea (2 secunde)'}
                className="press-feedback rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-opacity duration-200 hover:opacity-85"
                style={{
                  background: autoAdvance ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.10)',
                  borderColor: autoAdvance ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.14)',
                  color: '#FFFFFF',
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Zap size={12} fill={autoAdvance ? '#FFFFFF' : 'none'} />
                  Auto
                </span>
              </button>
            )}
            {currentIdx > 0 && (
              <button
                onClick={onPrevious}
                title="Revino la întrebarea anterioară pentru a revedea sau schimba răspunsul"
                className="press-feedback rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-opacity duration-200 hover:opacity-85"
                style={{
                  background: 'rgba(255,255,255,0.10)',
                  borderColor: 'rgba(255,255,255,0.14)',
                  color: '#FFFFFF',
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ChevronLeft size={12} />
                  Anterior
                </span>
              </button>
            )}
            {!examMode && !timedMode && !revealed && (
              <button
                onClick={onSkip}
                disabled={isLast || total <= 1}
                title="Sari peste această întrebare și revino la final"
                className="press-feedback rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-opacity duration-200 hover:opacity-85 disabled:opacity-45"
                style={{
                  background: 'rgba(255,255,255,0.10)',
                  borderColor: 'rgba(255,255,255,0.14)',
                  color: '#FFFFFF',
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ChevronRight size={12} />
                  Amână
                </span>
              </button>
            )}
            <button
              onClick={() => setShowKeys(!showKeys)}
              className="press-feedback rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-opacity duration-200 hover:opacity-85"
              style={{ background: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.14)', color: '#FFFFFF' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Keyboard size={12} />
                Taste
              </span>
            </button>
            <button
              onClick={onToggleFocus}
              title={focusMode ? 'Ieși din Modul Focus' : 'Intră în Modul Focus'}
              className="press-feedback rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-opacity duration-200 hover:opacity-85"
              style={{
                background: focusMode ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.10)',
                borderColor: focusMode ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.14)',
                color: '#FFFFFF',
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Eye size={12} />
                Focus
              </span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showKeys && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative z-10 mt-4 flex flex-wrap gap-2 overflow-hidden"
          >
            {['1-5 / A-E selectează opțiunea', 'Enter / Space confirmă sau continuă', '← revine la întrebarea anterioară', 'H deschide indiciul'].map((hint) => (
              <span
                key={hint}
                className="rounded-full border border-white/16 bg-white/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/82"
              >
                {hint}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
