import { motion, type TargetAndTransition, type Transition } from 'framer-motion';
import { Check, Loader2, Bot } from 'lucide-react';
import { cleanQuestionExplanation } from '../../helpers/quizAi';
import { cleanFlashcardText } from '../../lib/flashcardText';
import AIRichText from '../../components/ai-chat/AIRichText';
import type { Question } from '../../types';
import type { RefObject } from 'react';
import type { Theme } from '../../theme/themes';
import type { CardItem } from './sessionTypes';
import { getAnswerTone } from './sessionUtils';


interface CardBackProps {
  theme: Theme; current: CardItem; hasKey: boolean; backPanelPaddingClass: string; answerCardPaddingClass: string;
  denseLayout: boolean; centerBackContent: boolean; correctAnswers: Question['options'];
  aiExplanation: string | null; aiLoading: boolean; answerScrollRef: RefObject<HTMLDivElement | null>; onExplain: () => void | Promise<void>;
  faceInitial: TargetAndTransition; faceAnimate: TargetAndTransition; faceExit: TargetAndTransition; faceTransition: Transition;
}

/** Spatele cardului: răspunsul corect, explicația din grilă și clarificarea AI. */
export function CardBack({ theme, current, hasKey, backPanelPaddingClass, answerCardPaddingClass, denseLayout, centerBackContent, correctAnswers, aiExplanation, aiLoading, answerScrollRef, onExplain, faceInitial, faceAnimate, faceExit, faceTransition }: CardBackProps) {
  return (
        <motion.div
          key="back"
          initial={faceInitial}
          animate={faceAnimate}
          exit={faceExit}
          transition={faceTransition}
          className={`absolute inset-0 rounded-[var(--r-xl)] border border-[var(--hairline)] ${backPanelPaddingClass} text-center elev-2 glass-panel flex flex-col overflow-hidden`}
          style={{ position: 'absolute', background: theme.surface, backfaceVisibility: 'hidden' }}
        >
      <div className="mx-auto mb-3 flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--fill-subtle)] px-3 py-1.5">
        <Check size={14} style={{ color: theme.success }} />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-60" style={{ color: theme.text }}>
          Răspuns corect
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={answerScrollRef}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-1 pr-1 sm:px-2"
        >
          <div className={`mx-auto flex min-h-full w-full max-w-[44rem] flex-col ${centerBackContent ? 'justify-center' : 'justify-start'} gap-3 py-1`}>
            {correctAnswers.map((option, index) => (
              <div
                key={`${option.id}-${index}`}
                className={`rounded-[var(--r-lg)] border text-left ${answerCardPaddingClass}`}
                style={{
                  background: 'var(--fill-subtle)',
                  borderColor: 'var(--hairline)',
                  boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--elev-1)',
                }}
              >
                <p
                  className="mb-2 text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: theme.text3 }}
                >
                  Răspunsul de reținut
                </p>
                <p
                  className={`${getAnswerTone(option.text, denseLayout)} whitespace-pre-wrap break-words`}
                  style={{ color: theme.text }}
                >
                  {cleanFlashcardText(option.text)}
                </p>
              </div>
            ))}
          </div>

          {cleanQuestionExplanation(current.question.explanation) && (
            <div
              className="rounded-[var(--r-lg)] border p-4 text-left"
              style={{
                background: 'var(--fill-subtle)',
                borderColor: 'var(--hairline)',
              }}
            >
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: theme.text3 }}>
                Explicația din grilă
              </p>
              <p className="text-sm leading-relaxed" style={{ color: theme.text2 }}>{cleanFlashcardText(cleanQuestionExplanation(current.question.explanation))}</p>
            </div>
          )}

          {aiExplanation && (
            <div
              className="rounded-[var(--r-lg)] border p-4 text-left sm:p-5"
              style={{
                background: `linear-gradient(180deg, ${theme.accent}14, ${theme.accent2}0A)`,
                border: `1px solid ${theme.accent}26`,
                boxShadow: 'var(--elev-1)',
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Bot size={15} style={{ color: theme.accentText }} />
                  <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: theme.accentText }}>
                    {hasKey ? 'Clarificare AI' : 'Clarificare ghidată'}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                  style={{
                    background: `${theme.accent}16`,
                    color: theme.accentText,
                    border: `1px solid ${theme.accent}22`,
                  }}
                >
                  Simplu și clar
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: theme.text3 }}>
                Explicație reformulată pe scurt, într-un ton mai ușor de reținut.
              </p>
              <div className="mt-4 text-sm leading-7 sm:text-[15px]" style={{ color: theme.text2 }}>
                <AIRichText text={aiExplanation} />
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          <div className="flex min-h-[36px] items-center justify-center">
            {!aiExplanation && !aiLoading && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void onExplain();
                }}
                className="press-feedback inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em]"
                style={{
                  color: theme.accentText,
                  border: `1px solid ${theme.accent}22`,
                  background: `${theme.accent}10`,
                }}
              >
                <Bot size={14} /> {hasKey ? 'Cere clarificarea AI' : 'Cere clarificare smart'}
              </button>
            )}

            {aiLoading && (
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-70" style={{ color: theme.accentText }}>
                <Loader2 size={14} className="animate-spin" /> Se analizează...
              </div>
            )}
          </div>
        </div>
      </div>
        </motion.div>
  );
}
