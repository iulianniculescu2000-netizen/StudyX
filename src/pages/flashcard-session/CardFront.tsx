import { motion, type TargetAndTransition, type Transition } from 'framer-motion';
import { cleanFlashcardText } from '../../lib/flashcardText';
import QuizImage from '../../components/QuizImage';
import type { Theme } from '../../theme/themes';
import type { CardItem } from './sessionTypes';


interface CardFrontProps {
  theme: Theme; current: CardItem; frontPanelPaddingClass: string; frontUsesSplitMedia: boolean; frontCopyTone: string;
  imageFrameClass: string; frontImageMaxHeight: number; hasMedia: boolean; frontContentWidthClass: string;
  faceInitial: TargetAndTransition; faceAnimate: TargetAndTransition; faceExit: TargetAndTransition; faceTransition: Transition;
}

/** Fața cardului: întrebarea (și imaginea, când există). */
export function CardFront({ theme, current, frontPanelPaddingClass, frontUsesSplitMedia, frontCopyTone, imageFrameClass, frontImageMaxHeight, hasMedia, frontContentWidthClass, faceInitial, faceAnimate, faceExit, faceTransition }: CardFrontProps) {
  return (
        <motion.div
          key="front"
          initial={faceInitial}
          animate={faceAnimate}
          exit={faceExit}
          transition={faceTransition}
          className={`absolute inset-0 overflow-hidden rounded-[var(--r-xl)] border border-[var(--hairline)] ${frontPanelPaddingClass} text-center elev-2 glass-panel flex flex-col items-center justify-center`}
          style={{ position: 'absolute', background: theme.surface, backfaceVisibility: 'hidden' }}
        >
      {frontUsesSplitMedia && current.question.imageUrl ? (
        <div className="grid h-full w-full grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] items-center gap-7">
          <div className="custom-scrollbar min-h-0 overflow-y-auto pr-1 text-left">
            <h2 className={`${frontCopyTone} whitespace-pre-wrap break-words`} style={{ color: theme.text }}>
              {cleanFlashcardText(current.question.text)}
            </h2>
          </div>
          <div className={`${imageFrameClass} flex items-center justify-center`}>
            <QuizImage
              src={current.question.imageUrl}
              maxHeight={frontImageMaxHeight}
              variant="flashcard"
            />
          </div>
        </div>
      ) : (
        <div className={`custom-scrollbar mx-auto flex max-h-full ${hasMedia ? 'w-full' : ''} ${frontContentWidthClass} flex-col items-center justify-center overflow-y-auto px-1`}>
          <h2 className={`${frontCopyTone} whitespace-pre-wrap break-words`} style={{ color: theme.text }}>
            {cleanFlashcardText(current.question.text)}
          </h2>

          {current.question.imageUrl && (
            <div className={`${imageFrameClass} flex items-center justify-center`}>
              <QuizImage
                src={current.question.imageUrl}
                maxHeight={frontImageMaxHeight}
                variant="flashcard"
              />
            </div>
          )}
        </div>
      )}
        </motion.div>
  );
}
