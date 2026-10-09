import type { CardItem } from './sessionTypes';
import { getQuestionTone } from './sessionUtils';
import { dur, ease } from '../../theme/motion';

interface LayoutInput {
  current: CardItem;
  flipped: boolean;
  aiExplanation: string | null;
  calmMotion: boolean;
  isDue: boolean;
  density: string;
  crampedHeight: boolean;
  shortHeight: boolean;
  narrow: boolean;
  mobile: boolean;
  tablet: boolean;
  viewport: { width: number; height: number };
  uiScale: number;
}

/** Dimensiunile și clasele sesiunii, calculate din cardul curent și profilul ferestrei (fără efecte). */
export function computeSessionLayout({ current, flipped, aiExplanation, calmMotion, isDue, density, crampedHeight, shortHeight, narrow, mobile, tablet, viewport, uiScale }: LayoutInput) {
  const correctAnswers = current.question.options.filter((option) => option.isCorrect);
  const questionText = current.question.text.trim();
  const answerTextLength = correctAnswers.reduce((sum, option) => sum + option.text.trim().length, 0);
  const hasMedia = Boolean(current.question.imageUrl);
  const denseLayout = density === 'dense';
  const headerOffset = denseLayout ? 92 : crampedHeight ? 104 : 122;
  const dockOffset = flipped
    ? (denseLayout ? 156 : crampedHeight ? 174 : 198)
    : (denseLayout ? 42 : 52);
  const stageHeight = Math.max(
    denseLayout ? 340 : 390,
    Math.min(
      denseLayout ? 560 : crampedHeight ? 620 : 720,
      viewport.height - headerOffset - dockOffset,
    ),
  );
  const cardHeight = stageHeight;
  const sessionPaddingClass = denseLayout
    ? 'px-3 py-3 sm:px-4'
    : crampedHeight
      ? 'px-4 py-3 sm:px-5'
      : 'px-4 py-4 sm:px-6';
  const topBarPaddingClass = denseLayout ? 'px-3 py-2.5 sm:px-4' : crampedHeight ? 'px-4 py-3' : 'px-5 py-3.5';
  const cardWidthClass = mobile ? 'max-w-full' : narrow ? 'max-w-[54rem]' : tablet ? 'max-w-[62rem]' : hasMedia ? 'max-w-5xl' : 'max-w-4xl';
  const dockGridClass = mobile ? 'grid-cols-1' : shortHeight ? 'grid-cols-3' : 'grid-cols-3';
  const imageDominantFront = hasMedia && questionText.length <= 160;
  const frontCopyTone = imageDominantFront
    ? (denseLayout ? 'text-sm sm:text-base font-black leading-snug' : 'text-base sm:text-lg font-black leading-snug')
    : getQuestionTone(current.question.text, crampedHeight, denseLayout);
  const titleStyle = { fontSize: `clamp(${(0.95 * uiScale).toFixed(2)}rem, ${(1.5 * uiScale).toFixed(2)}vw, ${(1.2 * uiScale).toFixed(2)}rem)` };
  const frontUsesSplitMedia = hasMedia && !imageDominantFront && !mobile && !narrow && cardHeight >= 460 && current.question.text.length <= 220;
  const imageFrameClass = frontUsesSplitMedia
    ? 'min-h-0 w-full'
    : imageDominantFront
      ? 'mt-4 w-full max-w-[68rem]'
      : denseLayout
      ? 'mt-4 w-full max-w-[34rem]'
      : shortHeight
        ? 'mt-5 w-full max-w-[38rem]'
        : 'mt-6 w-full max-w-[44rem]';
  const frontContentWidthClass = imageDominantFront
    ? 'max-w-[70rem]'
    : denseLayout
      ? 'max-w-[34rem]'
      : 'max-w-3xl';
  const frontImageMaxHeight = Math.max(
    frontUsesSplitMedia ? 280 : imageDominantFront ? 240 : 150,
    Math.min(
      frontUsesSplitMedia
        ? Math.floor(cardHeight * 0.82)
        : imageDominantFront
          ? (denseLayout ? 360 : shortHeight ? 430 : 560)
          : denseLayout
            ? 240
            : shortHeight
              ? 280
              : 380,
      Math.floor(cardHeight * (frontUsesSplitMedia ? 0.82 : imageDominantFront ? 0.78 : current.question.text.length > 180 ? 0.34 : 0.48)),
    ),
  );
  const frontPanelPaddingClass = denseLayout ? 'p-4 sm:p-5' : crampedHeight ? 'p-5 sm:p-7' : 'p-6 sm:p-10';
  const backPanelPaddingClass = denseLayout ? 'p-3.5 sm:p-4' : crampedHeight ? 'p-4 sm:p-5' : 'p-5 sm:p-6';
  const answerCardPaddingClass = denseLayout ? 'px-3.5 py-3 sm:px-4 sm:py-3.5' : crampedHeight ? 'px-4 py-4' : 'px-5 py-4 sm:px-6';
  const dockLabelTextClass = denseLayout ? 'mt-1 text-[13px] font-semibold' : 'mt-1 text-sm font-semibold';
  const dockLabel = flipped ? 'Evaluează cardul' : (isDue ? (current.groupLabel ?? current.quiz.category) : current.quiz.category);

  const centerBackContent = correctAnswers.length <= 2 && answerTextLength < 260 && !current.question.explanation && !aiExplanation;
  // Întoarcere rapidă pe axa Y; în modul calm doar încrucișare de opacitate.
  const faceTransition = calmMotion
    ? { duration: dur.instant }
    : { duration: dur.base, ease: ease.emphasized };
  const faceInitial = calmMotion
    ? { opacity: 0 }
    : { opacity: 0, rotateY: flipped ? -72 : 72 };
  const faceAnimate = calmMotion
    ? { opacity: 1 }
    : { opacity: 1, rotateY: 0 };
  const faceExit = calmMotion
    ? { opacity: 0 }
    : { opacity: 0, rotateY: flipped ? 72 : -72 };

  return {
    correctAnswers, questionText, answerTextLength, hasMedia, denseLayout, cardHeight, sessionPaddingClass,
    topBarPaddingClass, cardWidthClass, dockGridClass, imageDominantFront, frontCopyTone, titleStyle,
    frontUsesSplitMedia, imageFrameClass, frontContentWidthClass, frontImageMaxHeight, frontPanelPaddingClass,
    backPanelPaddingClass, answerCardPaddingClass, dockLabelTextClass, dockLabel, centerBackContent,
    faceTransition, faceInitial, faceAnimate, faceExit,
  };
}
