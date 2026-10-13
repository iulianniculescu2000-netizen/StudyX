import { useState, memo } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Layers, AlertTriangle, Pencil, Pin, Play, PinOff } from 'lucide-react';
import type { Quiz } from '../types';
import { useQuizStore } from '../store/quizStore';
import { useTheme } from '../theme/ThemeContext';
import { CARD_COLOR_MAP } from '../theme/colorMaps';
import { isFlashcardDeck } from '../lib/deckKind';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { dur, ease } from '../theme/motion';

const FOCUS_RING = 'outline-none focus-visible:shadow-[var(--ring-focus)]';

interface Props {
  quiz: Quiz;
  index?: number;
  showDelete?: boolean;
}

/** Mini SVG score ring */
const ScoreRing = ({ score, theme }: { score: number; theme: import('../theme/themes').Theme }) => {
  const r = 13;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 90 ? theme.success : score >= 70 ? '#FFD60A' : score >= 50 ? theme.warning : theme.danger;
  return (
    <div className="relative w-9 h-9 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r={r} fill="none" stroke={`${color}28`} strokeWidth="3" />
        <circle cx="16" cy="16" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-black tracking-tighter" style={{ fontSize: 9, color }}>{score}%</span>
      </div>
    </div>
  );
};

const CATEGORY_COLOR_MAP: Record<string, string> = {
  'Dermatologie': 'pink',
  'Cardiologie': 'red',
  'Anatomie': 'purple',
  'Fiziologie': 'blue',
  'Biochimie': 'orange',
  'Farmacologie': 'teal',
  'Patologie': 'red',
  'Chirurgie': 'orange',
  'Medicină internă': 'blue',
  'Neurologie': 'purple',
  'Microbiologie': 'green',
};

const QuizCard = memo(function QuizCard({ quiz, index = 0, showDelete = false }: Props) {
  const deleteQuiz = useQuizStore((s) => s.deleteQuiz);
  const togglePin = useQuizStore((s) => s.togglePin);
  // Primitive selector: re-renders only when this quiz's best score changes.
  const bestScore = useQuizStore((s) => s.getBestScore(quiz.id));
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const navigate = useNavigate();
  const colorId = quiz.color || CATEGORY_COLOR_MAP[quiz.category] || 'blue';
  const colors = CARD_COLOR_MAP[colorId] ?? CARD_COLOR_MAP.blue;
  const multipleCount = quiz.questions.filter(q => q.multipleCorrect).length;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  // Pin / edit / delete / play used to exist only while the mouse hovered the card, so they were
  // unreachable by keyboard and on touch screens. Keyboard focus and touch devices show them too.
  const [touchOnly] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches);
  const showActions = hovered || focusWithin || touchOnly;
  const [dragging, setDragging] = useState(false);
  const isFlashcard = isFlashcardDeck(quiz);
  const quizPath = isFlashcard ? `/flashcards/session/${quiz.id}` : `/quiz/${quiz.id}`;
  const playPath = isFlashcard ? `/flashcards/session/${quiz.id}` : `/play/${quiz.id}`;

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    setDragging(true);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-studyx-quiz-id', quiz.id);
    event.dataTransfer.setData('text/plain', quiz.id);
  };

  const handleDragEnd = () => {
    setDragging(false);
  };

  return (
    <motion.div
      data-testid="quiz-card"
      data-quiz-id={quiz.id}
      {...(index === 0 ? { 'data-tutorial': 'quiz-card' } : {})}
      draggable
      onDragStartCapture={handleDragStart}
      onDragEndCapture={handleDragEnd}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false); }}
      // overflow-clip, nu hidden: un card hidden poate fi derulat intern când confirmarea primește focus (decalaj de ~65 px).
      className={`relative group rounded-[var(--r-xl)] overflow-clip glass-panel elev-hover-2 fine-card ${calmMotion ? '' : 'fx-rise'}`}
      style={{
        '--i': Math.min(index, 8),
        background: hovered
          ? `linear-gradient(135deg, ${colors.from}26 0%, ${colors.to}26 100%)`
          : `linear-gradient(135deg, ${colors.from}12 0%, ${colors.to}12 100%)`,
        border: `1px solid ${hovered ? colors.badge + '60' : 'var(--hairline)'}`,
        opacity: dragging ? 0.55 : 1,
      } as CSSProperties}
    >
      {/* Ambient glow orb - foarte lent */}
      <div
        className="absolute -top-20 -right-20 w-44 h-44 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${colors.badge}90, transparent 70%)`,
          opacity: hovered ? 0.4 : 0.08,
          transition: `opacity ${dur.slow}s var(--ease-standard)`,
        }}
      />

      <Link to={quizPath} className="block p-6 flex flex-col h-full relative z-10 rounded-[var(--r-xl)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]">
        <div className="flex items-start justify-between mb-5">
          {/* Emoji cu respirație ușoară */}
          <div className="text-5xl select-none">
            {quiz.emoji}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {multipleCount > 0 && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--r-sm)] text-[9px] font-black uppercase tracking-widest"
                style={{ background: `${theme.accent}18`, color: theme.accentText, border: `1px solid ${theme.accent}35` }}
              >
                <Layers size={10} />Multi
              </div>
            )}
            {bestScore !== null && (
              <div>
                <ScoreRing score={bestScore} theme={theme} />
              </div>
            )}
          </div>
        </div>

        <h3 className="font-black text-xl leading-tight mb-2 flex items-start gap-2" style={{ color: theme.text }}>
          <span className="line-clamp-2">{quiz.title}</span>
          {quiz.pinned && (
            <span>
              <Pin size={16} fill={colors.badge} color={colors.badge} className="flex-shrink-0 mt-1" />
            </span>
          )}
        </h3>
        <p className="text-sm mb-6 line-clamp-2 font-medium opacity-60" style={{ color: theme.text }}>{quiz.description}</p>

        <div className="mt-auto flex items-end justify-between">
          <div>
            {/* Badge categorie expansiune lentă */}
            <div
              className="px-3 py-1.5 rounded-[var(--r-sm)] text-[10px] font-black uppercase tracking-[0.2em] text-white inline-block mb-2"
              style={{ background: colors.badge, boxShadow: 'var(--elev-1)' }}
            >
              {quiz.category}
            </div>
            <p className="text-xs font-bold opacity-60 uppercase tracking-widest" style={{ color: theme.text }}>
              {quiz.questions.length} {isFlashcard ? (quiz.questions.length === 1 ? 'card' : 'carduri') : (quiz.questions.length === 1 ? 'întrebare' : 'întrebări')}
            </p>
          </div>
        </div>
      </Link>

      {/* Floating Action Bar (Edit / Delete / Pin) - fade + catifea */}
      <AnimatePresence>
        {showActions && !confirmDelete && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: calmMotion ? dur.instant : dur.fast, ease: ease.standard }}
            className="absolute top-5 right-5 flex items-center gap-1 p-1.5 rounded-[var(--r-md)] z-20"
            // Opaque tint instead of .glass-panel: that class sets position: relative outside any layer (the bar joined the
            // card's flow and made it 44px taller on hover) and its blur would nest inside the card's own backdrop-filter.
            style={{ background: 'var(--glass-panel-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--elev-3), inset 0 1px 0 var(--glass-highlight)' }}
          >
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(quiz.id); }}
              className={`p-2 rounded-[var(--r-sm)] transition-colors hover:bg-[var(--hover-fill)] press-feedback ${FOCUS_RING}`}
              style={{ color: quiz.pinned ? '#FFD60A' : theme.text2 }}
              title={quiz.pinned ? 'Scoate Pin' : 'Fixează (Pin)'}>
              {quiz.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>

            {showDelete && (
              <>
                <div className="w-px h-4 mx-1" style={{ background: theme.border }} />
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/create?edit=${quiz.id}`); }}
                  className={`p-2 rounded-[var(--r-sm)] transition-colors hover:bg-blue-500/15 press-feedback ${FOCUS_RING}`}
                  style={{ color: theme.accentText }}
                  title="Editează">
                  <Pencil size={15} />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(true); }}
                  className={`p-2 rounded-[var(--r-sm)] transition-colors hover:bg-red-500/15 press-feedback ${FOCUS_RING}`}
                  style={{ color: theme.danger }}
                  title="Șterge">
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Play button — lift luxos */}
      <AnimatePresence>
        {showActions && !confirmDelete && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: calmMotion ? dur.instant : dur.fast, ease: ease.standard }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(playPath); }}
            className={`press-feedback absolute bottom-6 right-6 flex items-center gap-1.5 px-5 py-2.5 rounded-[var(--r-md)] text-[11px] font-black uppercase tracking-widest ${FOCUS_RING}`}
            style={{
              background: colors.badge,
              color: '#FFFFFF',
              boxShadow: 'var(--elev-2), inset 0 1px 0 var(--glass-highlight)',
            }}
          >
            <Play size={13} fill="white" /> {isFlashcard ? 'Studiază' : 'Joacă'}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Inline delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: calmMotion ? dur.instant : dur.fast, ease: ease.standard }}
            onClick={(e) => e.preventDefault()}
            className="absolute inset-0 z-30 rounded-[var(--r-xl)] flex flex-col items-center justify-center gap-4 p-4 [backdrop-filter:blur(var(--blur-1))]"
            style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
            <div className="w-14 h-14 rounded-[var(--r-lg)] flex items-center justify-center" style={{ background: `${theme.danger}26`, border: `1px solid ${theme.danger}4D` }}>
              <AlertTriangle size={26} style={{ color: theme.danger }} />
            </div>
            <p className="text-base font-bold text-center" style={{ color: theme.text }}>Sigur vrei să ștergi această grilă?</p>
            <div className="flex gap-3 w-full max-w-[220px]">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(false); }}
                className={`flex-1 py-3 rounded-[var(--r-md)] text-xs font-bold uppercase tracking-wider hover:brightness-95 press-feedback ${FOCUS_RING}`}
                style={{ background: theme.surface2, color: theme.text2 }}>
                Anulează
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteQuiz(quiz.id); }}
                className={`flex-1 py-3 rounded-[var(--r-md)] text-xs font-bold uppercase tracking-wider text-white hover:opacity-90 press-feedback ${FOCUS_RING}`}
                style={{ background: theme.danger, boxShadow: 'var(--elev-1)' }}>
                Șterge
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default QuizCard;
