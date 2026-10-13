import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore } from '../store/aiStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useStoresHydrated } from '../hooks/useStoresHydrated';
import { spring } from '../theme/motion';
import PageSkeleton from '../components/ui/PageSkeleton';
import { useViewportProfile } from '../hooks/useViewportProfile';
import { useFlashcardSession } from './flashcard-session/useFlashcardSession';
import { computeSessionLayout } from './flashcard-session/sessionLayout';
import { SessionSummary } from './flashcard-session/SessionSummary';
import { SessionEmptyState } from './flashcard-session/SessionEmptyState';
import { SessionTopBar } from './flashcard-session/SessionTopBar';
import { CardFront } from './flashcard-session/CardFront';
import { CardBack } from './flashcard-session/CardBack';
import { RatingDock } from './flashcard-session/RatingDock';

export default function FlashcardSession() {
  const theme = useTheme();
  const { t, calmMotion, performanceLite } = useAdaptiveMotion();
  const hydrated = useStoresHydrated('quiz', 'stats');
  const { crampedHeight, shortHeight, narrow, mobile, tablet, viewport, density, uiScale } = useViewportProfile();
  const hasKey = useAIStore((s) => s.hasKey);
  const {
    isDue, modeAll, dueSelection, toggleNewCards, goBack, exitSession,
    dueEmptyNew,
    cards, meta, currentIdx, flipped, setFlipped, ratings, sessionDone, cardKey, elapsed,
    aiExplanation, aiLoading, answerScrollRef, canUndoRating,
    handleContinue, handleRating, handleUndoLastRating, remainingDue, handleExplain,
  } = useFlashcardSession();

  if (sessionDone) {
    return (
      <SessionSummary
        theme={theme}
        calmMotion={calmMotion}
        t={t}
        isDue={isDue}
        cards={cards}
        ratings={ratings}
        elapsed={elapsed}
        mobile={mobile}
        remainingDue={remainingDue}
        handleContinue={handleContinue}
        goBack={goBack}
      />
    );
  }

  if (!hydrated) return <PageSkeleton blocks={2} />;


  if (cards.length === 0) {
    return (
      <SessionEmptyState
        isDue={isDue}
        dueEmptyNew={dueEmptyNew}
        includeNew={dueSelection.includeNew}
        toggleNewCards={toggleNewCards}
      />
    );
  }

  const current = cards[currentIdx];
  const progress = currentIdx / cards.length;
  const {
    correctAnswers, hasMedia, denseLayout, cardHeight, sessionPaddingClass, topBarPaddingClass, cardWidthClass,
    dockGridClass, frontCopyTone, titleStyle, frontUsesSplitMedia, imageFrameClass, frontContentWidthClass,
    frontImageMaxHeight, frontPanelPaddingClass, backPanelPaddingClass, answerCardPaddingClass, dockLabelTextClass,
    dockLabel, centerBackContent, faceTransition, faceInitial, faceAnimate, faceExit,
  } = computeSessionLayout({
    current, flipped, aiExplanation, calmMotion, isDue, density, crampedHeight, shortHeight, narrow, mobile, tablet, viewport, uiScale,
  });

  return (
    <div className="premium-shell h-full overflow-hidden">
      <div className={`grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 ${sessionPaddingClass}`}>
        <SessionTopBar
          theme={theme}
          cardWidthClass={cardWidthClass}
          topBarPaddingClass={topBarPaddingClass}
          mobile={mobile}
          denseLayout={denseLayout}
          titleStyle={titleStyle}
          isDue={isDue}
          modeAll={modeAll}
          current={current}
          progress={progress}
          meta={meta}
          cards={cards}
          currentIdx={currentIdx}
          canUndoRating={canUndoRating}
          includeNew={dueSelection.includeNew}
          onExit={exitSession}
          onUndo={handleUndoLastRating}
          toggleNewCards={toggleNewCards}
        />

        <div className="min-h-0">
          <div
            data-tutorial="fc-session-card"
            className={`relative flex h-full flex-col items-center justify-center ${denseLayout ? 'py-1' : crampedHeight ? 'py-2' : 'py-3'}`}
            style={{ perspective: performanceLite ? '900px' : '1200px' }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={cardKey}
                initial={calmMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
                animate={calmMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                exit={calmMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
                transition={calmMotion ? t.page : spring.panel}
                onClick={() => !flipped && setFlipped(true)}
                className={`relative w-full ${cardWidthClass} ${!flipped ? 'cursor-pointer' : 'cursor-default'}`}
                style={{ height: '100%', maxHeight: cardHeight, transformStyle: 'preserve-3d' }}
              >
                <AnimatePresence initial={false} mode="wait">
                  {!flipped && (
                    <CardFront
                      key="front"
                      theme={theme}
                      current={current}
                      frontPanelPaddingClass={frontPanelPaddingClass}
                      frontUsesSplitMedia={frontUsesSplitMedia}
                      frontCopyTone={frontCopyTone}
                      imageFrameClass={imageFrameClass}
                      frontImageMaxHeight={frontImageMaxHeight}
                      hasMedia={hasMedia}
                      frontContentWidthClass={frontContentWidthClass}
                      faceInitial={faceInitial}
                      faceAnimate={faceAnimate}
                      faceExit={faceExit}
                      faceTransition={faceTransition}
                    />
                  )}

                  {flipped && (
                    <CardBack
                      key="back"
                      theme={theme}
                      current={current}
                      hasKey={hasKey}
                      backPanelPaddingClass={backPanelPaddingClass}
                      answerCardPaddingClass={answerCardPaddingClass}
                      denseLayout={denseLayout}
                      centerBackContent={centerBackContent}
                      correctAnswers={correctAnswers}
                      aiExplanation={aiExplanation}
                      aiLoading={aiLoading}
                      answerScrollRef={answerScrollRef}
                      onExplain={handleExplain}
                      faceInitial={faceInitial}
                      faceAnimate={faceAnimate}
                      faceExit={faceExit}
                      faceTransition={faceTransition}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div data-tutorial="fc-session-rating">
        <RatingDock
          theme={theme}
          t={t}
          calmMotion={calmMotion}
          flipped={flipped}
          cardWidthClass={cardWidthClass}
          crampedHeight={crampedHeight}
          denseLayout={denseLayout}
          mobile={mobile}
          dockLabel={dockLabel}
          dockLabelTextClass={dockLabelTextClass}
          dockGridClass={dockGridClass}
          handleRating={handleRating}
        />
        </div>
      </div>
    </div>
  );
}
