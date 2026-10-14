import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, MessageSquare, Sparkles } from 'lucide-react';
import { useUIStore } from '../../../store/uiStore';
import type { Question } from '../../../types';
import type { AIAnalysisResult } from '../../../ai/types';
import type { Theme } from '../../../theme/themes';

interface ChatContinuePanelProps {
  theme: Theme;
  question: Question;
  analysisResult: AIAnalysisResult | null;
  studyFocusTopic: string | null;
  correctAnswerText: string;
  selectedAnswerText: string;
  wasWrong: boolean;
  wasPartial: boolean;
}

/** Post-reveal shortcuts that open the AI chat pre-loaded with this question's context. */
export default function ChatContinuePanel({
  theme, question, analysisResult, studyFocusTopic, correctAnswerText, selectedAnswerText, wasWrong, wasPartial,
}: ChatContinuePanelProps) {
  const setChatOpen = useUIStore((state) => state.setChatOpen);
  const openStudyChat = useCallback((
    mode: 'explain' | 'summarize' | 'test',
    prompt: string,
    quizContext?: {
      questionText: string;
      correctAnswerText: string;
      userAnswerText: string;
      studyFocus?: string;
    },
  ) => {
    setChatOpen(true);
    window.dispatchEvent(new CustomEvent('studyx:ai-prompt', {
      detail: {
        open: true,
        view: 'chat',
        mode,
        resetConversation: true,
        prompt,
        quizContext,
      },
    }));
  }, [setChatOpen]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="luxe-card mb-4 rounded-[var(--r-xl)] p-4"
      style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="citation-pill inline-flex items-center gap-1.5">
          <Sparkles size={12} />
          Continuă cu AI
        </span>
        {studyFocusTopic && (
          <span className="premium-chip rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: theme.text3 }}>
            Focus: {studyFocusTopic}
          </span>
        )}
        {wasWrong && (
          <span className="premium-chip rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: theme.danger }}>
            Necesită consolidare
          </span>
        )}
        {wasPartial && (
          <span className="premium-chip rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: theme.warning }}>
            Parțial corect — mai exersează
          </span>
        )}
      </div>

      <p className="mb-3 text-sm font-medium leading-relaxed" style={{ color: theme.text }}>
        Continuă imediat în chat cu contextul acestei întrebări, fără să pierzi ritmul sesiunii.
      </p>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <button
          onClick={() => openStudyChat(
            'explain',
            'Explică-mi această întrebare: de ce am greșit și de ce este corect răspunsul indicat? Adaugă și o schemă scurtă a raționamentului.',
            {
              questionText: question.text,
              correctAnswerText,
              userAnswerText: selectedAnswerText || "niciun răspuns",
              studyFocus: studyFocusTopic ?? undefined,
            }
          )}
          className="premium-card-hover press-feedback rounded-[var(--r-lg)] border px-4 py-3 text-left"
          style={{ background: theme.surface2, borderColor: theme.border, color: theme.text }}
        >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
            <MessageSquare size={14} style={{ color: theme.accent2 }} />
            Discută răspunsul
          </div>
          <div className="mt-1 text-xs opacity-65" style={{ color: theme.text }}>
            Deschide explicația completă în AI chat.
          </div>
        </button>

        <button
          onClick={() => openStudyChat(
            'test',
            `Testează-mă rapid pe acest subiect. Pune-mi 3 întrebări scurte, una câte una, ca să vezi dacă am înțeles.`,
            {
              questionText: question.text,
              correctAnswerText,
              userAnswerText: selectedAnswerText || "niciun răspuns",
              studyFocus: studyFocusTopic ?? undefined,
            }
          )}
          className="premium-card-hover press-feedback rounded-[var(--r-lg)] border px-4 py-3 text-left"
          style={{ background: theme.surface2, borderColor: theme.border, color: theme.text }}
        >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
            <Sparkles size={14} style={{ color: theme.accentText }} />
            Mini-test pe focus
          </div>
          <div className="mt-1 text-xs opacity-65" style={{ color: theme.text }}>
            Fixează imediat conceptul vulnerabil.
          </div>
        </button>

        <button
          onClick={() => openStudyChat(
            'summarize',
            `Te rog să îmi rezumi regula pentru examen, capcanele și diferențele-cheie referitoare la această grilă.`,
            {
              questionText: question.text,
              correctAnswerText,
              userAnswerText: selectedAnswerText || "niciun răspuns",
              studyFocus: analysisResult?.rule ?? studyFocusTopic ?? undefined,
            }
          )}
          className="premium-card-hover press-feedback rounded-[var(--r-lg)] border px-4 py-3 text-left"
          style={{ background: theme.surface2, borderColor: theme.border, color: theme.text }}
        >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
            <BookOpen size={14} style={{ color: theme.warning }} />
            Fixează regula
          </div>
          <div className="mt-1 text-xs opacity-65" style={{ color: theme.text }}>
            Comprimă ideea în format de examen.
          </div>
        </button>
      </div>
    </motion.div>
  );
}
