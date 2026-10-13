import { plural } from '../lib/plural';
import { folderHref } from '../lib/rezidentiatRoutes';
import { useBack } from '../hooks/useBack';
import { motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState, useRef, useMemo, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Bot,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileText,
  GraduationCap,
  Layers,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Timer,
  Trophy,
} from 'lucide-react';
import QuizImage from '../components/QuizImage';
import { useAIStore } from '../store/aiStore';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { useStatsStore } from '../store/statsStore';
import PageSkeleton from '../components/ui/PageSkeleton';
import EmptyState from '../components/ui/EmptyState';
import BackPill from '../components/fx/BackPill';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { matchesQuery } from '../lib/searchText';
import { useUIStore } from '../store/uiStore';
import { HERO_COLOR_MAP } from '../theme/colorMaps';
import { useTheme } from '../theme/ThemeContext';
import { type Theme } from '../theme/themes';
import { isFlashcardDeck } from '../lib/deckKind';
import type { QuizImportData } from '../types';
import HelpTip from '../components/ui/HelpTip';

const QuizDetailChatDrawer = lazy(() => import('../components/quiz-detail/QuizDetailChatDrawer'));

const diffColor = (t: Theme) => ({ easy: t.success, medium: '#FF9F0A', hard: '#FF453A' });
const diffLabel = { easy: 'Ușor', medium: 'Mediu', hard: 'Dificil' };

/**
 * Normalize Romanian diacritics that lie outside Windows-1252 so jsPDF's
 * built-in Helvetica font renders them without fallback glyph issues.
 * a-circumflex and i-circumflex are already safe in Latin-1.
 */
function fixPdfText(text: string): string {
  return text
    .replace(/[\u0103]/g, 'a')
    .replace(/[\u0102]/g, 'A')
    .replace(/[\u0219\u015F]/g, 's')
    .replace(/[\u0218\u015E]/g, 'S')
    .replace(/[\u021B\u0163]/g, 't')
    .replace(/[\u021A\u0162]/g, 'T');
}

export default function QuizDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = useBack('/quizzes');
  const quizzes = useQuizStore((s) => s.quizzes);
  const duplicateQuiz = useQuizStore((s) => s.duplicateQuiz);
  const toggleArchive = useQuizStore((s) => s.toggleArchive);
  // Primitive selectors: stay reactive to sessions without subscribing to the whole store.
  const sessionCount = useQuizStore((s) => (id ? s.getSessionsForQuiz(id).length : 0));
  const bestScore = useQuizStore((s) => (id ? s.getBestScore(id) : null));
  const questionStats = useStatsStore((s) => s.questionStats);
  const hasKey = useAIStore((s) => s.hasKey);
  const theme = useTheme();
  const hydrated = useStoresHydrated('quiz');
  const { t } = useAdaptiveMotion();

  const [qSearch, setQSearch] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [quickCount, setQuickCount] = useState(20);

  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const lockFloatingUI = useUIStore((state) => state.lockFloatingUI);
  const unlockFloatingUI = useUIStore((state) => state.unlockFloatingUI);

  const quiz = quizzes.find((candidate) => candidate.id === id);
  const folders = useFolderStore((state) => state.folders);
  // "Back" goes to wherever this quiz actually lives, not always the flat
  // list — a quiz opened from deep in a nested folder (Rezidențiat and its
  // subfolders, or any user-made subfolder) used to always bounce to "Toate
  // grilele", losing the user's place in the tree.
  const backFolder = quiz?.folderId ? folders.find((f) => f.id === quiz.folderId) : null;
  const backHref = backFolder ? folderHref(backFolder.id, folders) : '/quizzes';
  const backLabel = backFolder ? backFolder.name : 'Toate grilele';

  // A flashcard deck must always study as flashcards — if one is opened via the
  // quiz-detail route (old links, search), send it to its real session.
  useEffect(() => {
    if (quiz && isFlashcardDeck(quiz)) {
      navigate(`/flashcards/session/${quiz.id}?mode=all`, { replace: true });
    }
  }, [quiz, navigate]);

  useEffect(() => {
    if (!showChat) return;

    setChatOpen(false);
    lockFloatingUI('quiz-detail-chat');

    return () => {
      unlockFloatingUI('quiz-detail-chat');
    };
  }, [lockFloatingUI, setChatOpen, showChat, unlockFloatingUI]);

  const questionsParentRef = useRef<HTMLDivElement>(null);
  const filteredQuestions = useMemo(() => {
    if (!quiz) return [];
    return quiz.questions
      .map((question, actualIndex) => ({ question, actualIndex }))
      .filter(({ question }) => !qSearch.trim() || matchesQuery(question.text, qSearch));
  }, [quiz, qSearch]);

  const questionsVirtualizer = useVirtualizer({
    count: filteredQuestions.length,
    getScrollElement: () => questionsParentRef.current,
    estimateSize: () => 88,
    overscan: 4,
    initialRect: { width: 600, height: 400 },
    getItemKey: (index) => filteredQuestions[index]?.question.id ?? index,
    measureElement: (element, entry, instance) => {
      if (entry?.borderBoxSize?.[0]?.blockSize) {
        return Math.round(entry.borderBoxSize[0].blockSize);
      }
      const measured = element.getBoundingClientRect().height || (element instanceof HTMLElement ? element.offsetHeight : 0);
      if (measured > 0) return measured;
      const index = instance.indexFromElement(element);
      return instance.options.estimateSize(index);
    },
    observeElementRect: (instance, cb) => {
      const element = instance.scrollElement;
      if (!element) return;
      const targetWindow = instance.targetWindow;
      const handler = () => {
        const rect = element.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : 600;
        const height = rect.height > 0 ? rect.height : 400;
        cb({ width, height });
      };
      handler();
      let ro: ResizeObserver | null = null;
      if (typeof targetWindow !== 'undefined' && targetWindow?.ResizeObserver) {
        ro = new targetWindow.ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry?.borderBoxSize?.[0]) {
            const box = entry.borderBoxSize[0];
            const width = box.inlineSize > 0 ? Math.round(box.inlineSize) : 600;
            const height = box.blockSize > 0 ? Math.round(box.blockSize) : 400;
            cb({ width, height });
          } else {
            handler();
          }
        });
        ro.observe(element, { box: 'border-box' });
      }
      targetWindow?.addEventListener('resize', handler, { passive: true });
      return () => {
        ro?.disconnect();
        targetWindow?.removeEventListener('resize', handler);
      };
    },
  });

  useEffect(() => {
    if (questionsParentRef.current) {
      questionsParentRef.current.scrollTop = 0;
    }
    questionsVirtualizer.scrollToOffset(0);
  }, [qSearch]);

  if (!hydrated) return <PageSkeleton blocks={3} />;

  if (!quiz) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto px-4 py-8">
        <div className="w-full max-w-md">
          <EmptyState
            icon={BookOpen}
            title="Grila nu a fost găsită"
            body="Poate a fost ștearsă sau linkul nu mai este valid."
            primary={{ label: 'Toate grilele', to: '/quizzes' }}
            secondary={{ label: 'Înapoi', onClick: goBack }}
          />
        </div>
      </div>
    );
  }

  const colors = HERO_COLOR_MAP[quiz.color] ?? HERO_COLOR_MAP.blue;
  const estimatedTime = quiz.questions.length * 30;
  const multipleCount = quiz.questions.filter((question) => question.multipleCorrect).length;
  const wrongCount = Object.entries(questionStats)
    .filter(([key, stats]) => key.startsWith(`${quiz.id}:`) && stats.timesWrong > 0)
    .length;
  const quickPracticeOptions = [10, 20, 40, 60, 100].filter((count) => count <= quiz.questions.length);
  const effectiveQuickCount = Math.min(quickCount, quiz.questions.length);

  const formatTime = (seconds: number) => (seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)} min`);

  const handleDuplicate = () => {
    const newId = duplicateQuiz(quiz.id);
    if (newId) {
      navigate(`/quiz/${newId}`);
    }
  };

  const exportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addLine = (
      text: string,
      size: number,
      bold = false,
      color: [number, number, number] = [30, 30, 30],
    ) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(fixPdfText(text), contentWidth);

      lines.forEach((line: string) => {
        if (y > 277) {
          doc.addPage();
          y = margin;
        }

        doc.text(line, margin, y);
        y += size * 0.45;
      });

      y += 1;
    };

    addLine(`${quiz.emoji} ${quiz.title}`, 18, true, [10, 100, 255]);
    addLine(quiz.description, 11, false, [80, 80, 80]);
    addLine(`Categorie: ${quiz.category} · ${plural(quiz.questions.length, 'întrebare', 'întrebări')}`, 10, false, [120, 120, 120]);
    y += 4;

    quiz.questions.forEach((question, questionIndex) => {
      if (y > 260) {
        doc.addPage();
        y = margin;
      }

      addLine(`${questionIndex + 1}. ${question.text}`, 12, true);

      if (question.imageUrl) {
        try {
          const imageFormat = question.imageUrl.includes('image/png') ? 'PNG' : 'JPEG';
          const imageProps = doc.getImageProperties(question.imageUrl);
          const maxWidth = contentWidth * 0.5;
          const ratio = imageProps.height / imageProps.width;
          const imageHeight = Math.min(maxWidth * ratio, 50);
          const imageWidth = imageHeight / ratio;

          if (y + imageHeight > 277) {
            doc.addPage();
            y = margin;
          }

          doc.addImage(question.imageUrl, imageFormat, margin, y, imageWidth, imageHeight);
          y += imageHeight + 3;
        } catch (error) {
          console.error('[QuizDetail] PDF image error:', error);
        }
      }

      question.options.forEach((option, optionIndex) => {
        const letter = String.fromCharCode(65 + optionIndex);
        const color: [number, number, number] = option.isCorrect ? [30, 160, 80] : [60, 60, 60];
        addLine(`   ${letter}. ${option.text}${option.isCorrect ? ' [corect]' : ''}`, 10, option.isCorrect, color);
      });

      if (question.explanation) {
        addLine(`   Explicație: ${question.explanation}`, 9, false, [100, 100, 150]);
      }

      y += 3;
    });

    doc.save(`${quiz.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  const exportQuiz = () => {
    const data: QuizImportData = {
      title: quiz.title,
      description: quiz.description,
      emoji: quiz.emoji,
      category: quiz.category,
      color: quiz.color,
      shuffleQuestions: quiz.shuffleQuestions,
      shuffleAnswers: quiz.shuffleAnswers,
      questions: quiz.questions.map((question) => ({
        text: question.text,
        multipleCorrect: question.multipleCorrect,
        explanation: question.explanation,
        difficulty: question.difficulty,
        options: question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${quiz.title.replace(/\s+/g, '-').toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportAnki = async () => {
    const rows = quiz.questions.flatMap((question) => {
      const correct = question.options.find((option) => option.isCorrect);
      if (!correct) return [];

      const wrongs = question.options
        .filter((option) => !option.isCorrect)
        .map((option) => option.text)
        .join(' | ');

      const front = question.text.replace(/"/g, '""');
      const back = [
        `Răspuns corect: ${correct.text}`,
        question.explanation ? `Explicație: ${question.explanation}` : '',
        wrongs ? `Variante greșite: ${wrongs}` : '',
      ]
        .filter(Boolean)
        .join('<br>');

      return [`"${front}";"${back.replace(/"/g, '""')}"`];
    });

    const csv = ['#separator:Semicolon', '#html:true', ...rows].join('\n');

    if (window.electronAPI?.saveCsvFile) {
      await window.electronAPI.saveCsvFile({
        defaultPath: `${quiz.title}-anki.csv`,
        content: csv,
      });
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${quiz.title}-anki.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const searchWrapperStyle = {
    background: theme.surface2,
    border: `1px solid ${theme.border2}`,
    ['--ring-color' as string]: `${theme.accent}33`,
  } as CSSProperties;

  return (
    <>
      <div className="h-full overflow-y-auto px-8 py-8">
        <div className="max-w-2xl mx-auto">
          <BackPill to={backHref} label={backLabel} className="mb-5" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t.hero}
            className="rounded-[var(--r-xl)] p-8 mb-8 relative overflow-hidden"
            style={{
              background: colors.gradient,
              boxShadow: 'var(--elev-2)',
            }}
          >
            <div
              className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            />

            <div className="relative z-10">
              <div className="text-6xl mb-6 drop-shadow-lg">{quiz.emoji}</div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(10px)' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {quiz.category}
              </div>
              <h1 className="text-4xl font-black text-white mb-3 tracking-tight leading-tight">{quiz.title}</h1>
              <p className="text-white/80 mb-8 max-w-lg font-medium leading-relaxed">{quiz.description}</p>

              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2 text-white/90 text-xs font-bold uppercase tracking-wider">
                  <Clock size={16} className="opacity-70" />
                  {formatTime(estimatedTime)}
                </div>
                <div className="flex items-center gap-2 text-white/90 text-xs font-bold uppercase tracking-wider">
                  <BookOpen size={16} className="opacity-70" />
                  {plural(quiz.questions.length, 'întrebare', 'întrebări')}
                </div>
                {multipleCount > 0 && (
                  <div className="flex items-center gap-2 text-white/90 text-xs font-bold uppercase tracking-wider">
                    <Layers size={16} className="opacity-70" />
                    {multipleCount} multi
                  </div>
                )}
                {bestScore !== null && (
                  <div
                    className="flex items-center gap-2 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl"
                    style={{
                      background: 'rgba(255,214,10,0.25)',
                      color: '#FFD60A',
                      border: '1px solid rgba(255,214,10,0.3)',
                    }}
                  >
                    <Trophy size={14} fill="#FFD60A" />
                    Record: {bestScore}%
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          <motion.div
            data-tutorial="quiz-session-controls"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t.page}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"
          >
            <Link
              to={`/play/${quiz.id}`}
              className="press-feedback accent-shadow-hover flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-white text-lg shadow-lg"
              style={{ background: colors.gradient, boxShadow: 'var(--elev-2)' }}
            >
              <Play size={22} fill="white" />
              {sessionCount > 0 ? 'Reia Studiul' : 'Începe Grila'}
            </Link>
            <Link
              to={`/play/${quiz.id}`}
              state={{ mode: 'exam' }}
              className="glass-panel fx-lift press-feedback flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-lg"
              style={{ color: theme.text }}
            >
              <GraduationCap size={22} />
              Simulare Examen
            </Link>
          </motion.div>

          {quiz.questions.length > 20 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t.page}
              className="glass-panel rounded-3xl p-5 mb-8"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black" style={{ color: theme.text }}>Quick pe bucăți</p>
                  <p className="text-xs mt-1" style={{ color: theme.text3 }}>
                    Alege o sesiune mică acum; restul rămâne pentru următorul bloc.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {quickPracticeOptions.map((count) => (
                    <button
                      key={count}
                      onClick={() => setQuickCount(count)}
                      data-active={effectiveQuickCount === count}
                      className="fine-chip press-feedback rounded-xl px-3 py-2 text-xs font-black"
                      style={effectiveQuickCount === count ? undefined : { color: theme.text2 }}
                    >
                      {count}
                    </button>
                  ))}
                  <Link
                    to={`/play/${quiz.id}`}
                    state={{ practiceCount: effectiveQuickCount }}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black text-white transition-[background-color,border-color,color,opacity,transform] hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: theme.accent }}
                  >
                    <Play size={14} fill="white" />
                    Pornește {effectiveQuickCount}
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={t.page}
            className="flex gap-3 mb-8 overflow-x-auto pb-2 scrollbar-none"
          >
            <Link
              to={`/play/${quiz.id}`}
              state={{ mode: 'timed' }}
              className="glass-panel fx-lift press-feedback focus-ring flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm outline-none"
              style={{ color: theme.text2 }}
            >
              <Timer size={16} />
              Cronometrat
            </Link>
            <Link
              to={`/flashcards/session/${quiz.id}?mode=all`}
              className="glass-panel fx-lift press-feedback focus-ring flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm outline-none"
              style={{ color: theme.text2 }}
            >
              <CreditCard size={16} />
              Flashcarduri
            </Link>
            <button
              onClick={() => {
                const wrongQuestionIds = Object.entries(questionStats)
                  .filter(([key, stats]) => key.startsWith(`${quiz.id}:`) && stats.timesWrong > 0)
                  .map(([key]) => key.split(':')[1]);

                if (wrongQuestionIds.length === 0) return;
                navigate(`/play/${quiz.id}`, { state: { wrongQuestionsOnly: wrongQuestionIds } });
              }}
              disabled={wrongCount === 0}
              className={`glass-panel focus-ring flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm outline-none disabled:opacity-30 ${wrongCount > 0 ? 'fx-lift press-feedback' : ''}`}
              style={{ color: wrongCount > 0 ? theme.danger : theme.text3 }}
            >
              <RotateCcw size={16} />
              Greșeli ({wrongCount})
            </button>
            <HelpTip id="quiz-modes" size={20} />
          </motion.div>

              {hasKey ? (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t.page}
              onClick={() => {
                setShowChat(true);
              }}
              className="w-full flex items-center justify-between gap-4 p-4 rounded-2xl mb-8 group transition-[background-color,border-color,color,opacity,transform]"
              style={{
                background: `linear-gradient(135deg, ${theme.accent}12, ${theme.accent2}08)`,
                border: `1px solid ${theme.accent}30`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform"
                  style={{ background: theme.accent }}
                >
                  <Bot size={20} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black" style={{ color: theme.text }}>Asistent AI personal</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-50" style={{ color: theme.text }}>
                    Discută despre conceptele din această grilă
                  </p>
                </div>
              </div>
              <div
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-[background-color,border-color,color,opacity,transform] group-hover:translate-x-1"
                style={{ background: `${theme.accent}20`, color: theme.accentText }}
              >
                Deschide chat
              </div>
            </motion.button>
          ) : (
            <div
              className="glass-panel w-full flex items-center gap-3 p-4 rounded-2xl mb-8"
            >
              <Bot size={18} style={{ color: theme.text3 }} />
              <span className="text-xs font-medium flex-1" style={{ color: theme.text3 }}>
                Activează AI din Setări pentru tutorat personalizat.
              </span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('studyx:open-ai-settings'))}
                className="press-feedback text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg"
                style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.accentText }}
              >
                Configurare
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-8 sm:grid-cols-6">
            {[
              { label: 'Editează', icon: Pencil, action: () => navigate(`/create?edit=${quiz.id}`), color: theme.accentText },
              { label: 'Copiază', icon: Copy, action: handleDuplicate, color: theme.text2 },
              { label: 'JSON', icon: Download, action: exportQuiz, color: theme.text2 },
              { label: 'PDF', icon: FileText, action: exportPDF, color: theme.text2 },
              { label: 'Anki', icon: Download, action: exportAnki, color: theme.text2 },
              {
                label: quiz.archived ? 'Restaurează' : 'Arhivează',
                icon: quiz.archived ? ArchiveRestore : Archive,
                action: () => toggleArchive(quiz.id),
                color: quiz.archived ? theme.warning : theme.text3,
              },
            ].map((button) => (
              <button
                key={button.label}
                onClick={button.action}
                className="glass-panel fx-lift press-feedback focus-ring flex flex-col items-center gap-1.5 py-3 rounded-2xl"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)]" style={{ background: 'var(--accent-soft)' }}>
                  <button.icon size={16} style={{ color: button.color }} />
                </span>
                <span className="text-[10px] font-black uppercase tracking-tighter opacity-60" style={{ color: theme.text }}>
                  {button.label}
                </span>
              </button>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t.page}
            className="glass-panel rounded-3xl p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-base font-black tracking-tight" style={{ color: theme.text }}>Conținut grilă</h2>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-50" style={{ color: theme.text }}>
                  {plural(quiz.questions.length, 'întrebare totală', 'întrebări totale')}
                </p>
              </div>
              {quiz.questions.length > 5 && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl flex-1 max-w-[220px] transition-[background-color,border-color,color,opacity,transform] focus-within:ring-2"
                  style={searchWrapperStyle}
                >
                  <Search size={14} style={{ color: theme.text3 }} />
                  <input
                    type="text"
                    placeholder="Caută în întrebări..."
                    value={qSearch}
                    onChange={(event) => setQSearch(event.target.value)}
                    className="input-bare min-w-0 flex-1 text-xs font-medium"
                    style={{ color: theme.text, outline: 'none', border: 'none' }}
                  />
                </div>
              )}
            </div>

            <div ref={questionsParentRef} tabIndex={0} role="region" aria-label="Lista întrebărilor" className="max-h-[min(400px,50vh)] overflow-y-auto pr-2 custom-scrollbar">
              {filteredQuestions.length === 0 ? (
                <p className="py-8 text-center text-xs" style={{ color: theme.text3 }}>Nicio întrebare nu corespunde căutării.</p>
              ) : (
                <div
                  style={{
                    height: `${questionsVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {questionsVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = filteredQuestions[virtualRow.index];
                    if (!item) return null;
                    const { question, actualIndex } = item;

                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={questionsVirtualizer.measureElement}
                        className="pb-3"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          className="glass-panel p-4 rounded-2xl transition-[background-color,border-color,color,opacity,transform] hover:bg-[var(--hover-fill)] border border-transparent hover:border-[var(--border2)]"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-[10px] font-black opacity-30 mt-1" style={{ color: theme.text }}>
                              {String(actualIndex + 1).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-relaxed" style={{ color: theme.text2 }}>
                                {question.text}
                              </p>
                              {question.imageUrl && (
                                <div className="mt-3 rounded-xl overflow-hidden shadow-md">
                                  <QuizImage src={question.imageUrl} maxHeight={120} />
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-3">
                                {question.multipleCorrect && (
                                  <span
                                    data-active="true"
                                    className="fine-chip text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg"
                                  >
                                    Multi
                                  </span>
                                )}
                                {question.difficulty && (
                                  <span
                                    className="fine-chip text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg"
                                    style={{ color: diffColor(theme)[question.difficulty] }}
                                  >
                                    {diffLabel[question.difficulty]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <Suspense fallback={null}>
        <QuizDetailChatDrawer
          open={showChat}
          quiz={quiz}
          onClose={() => {
            setShowChat(false);
          }}
        />
      </Suspense>
    </>
  );
}
