import { cloneElement, isValidElement, useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import ProgressBar from '../components/fx/ProgressBar';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeContext';
import { useTutorialStore } from '../store/tutorialStore';
import { useViewportProfile } from '../hooks/useViewportProfile';
import { useOverlayFlag } from '../hooks/useOverlayFlag';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { TOURS, isSpotlightTour, type SpotlightTourId } from './registry';
import { useTourAutostart } from './useTourAutostart';
import { readTourContext, useTourContext } from './useTourContext';
import { useSpotlight } from './spotlight';
import { clipToViewport, computeCardLayout } from './placement';
import TooltipArrow from './TooltipArrow';
import { onFillText } from '../theme/contrastText';
import GlassIconStack from '../components/depth/GlassIconStack';
import TourHeroScene from '../components/depth/TourHeroScene';
import { useTilt } from '../components/depth/useTilt';
import type { TourContext, TourStep } from './types';
import { isTourRouteCurrent } from './navigation';

const resolveBody = (step: TourStep, ctx: TourContext) => (typeof step.body === 'function' ? step.body(ctx) : step.body);

/** Iconița unui pas, redesenată la altă mărime (pentru orbita din scena de început și final). */
const resized = (icon: ReactNode, size: number) => (isValidElement<{ size?: number }>(icon) ? cloneElement(icon, { size }) : icon);

/** How long a finished "do it yourself" step stays on screen before the tour moves on. */
const ACTION_DONE_DELAY_MS = 900;

/** How long an optional step waits for its target (the page may still be loading) before it is skipped. */
const OPTIONAL_STEP_WAIT_MS = 1300;

/**
 * Runs whichever tour the store says is active. The tours themselves are data (see `registry.ts`);
 * this is the one place that lights up elements, places the card, handles the keyboard and moves on.
 */
export default function TourEngine({ profileId }: { profileId: string }) {
  const activeTour = useTutorialStore((state) => state.activeTour);
  const filmPending = useTutorialStore((state) => state.activeTour === 'onboarding' && !state.seen[profileId]?.welcomeFilm);
  useTourAutostart(profileId);
  if (!activeTour || !isSpotlightTour(activeTour)) return null;
  // Filmul de bun venit rulează înaintea turului de bun venit; turul începe când filmul se termină sau e sărit.
  if (filmPending) return null;
  // A different profile or tour starts with fresh filtering and completion state.
  return <ActiveTour key={`${profileId}:${activeTour}`} tourId={activeTour} profileId={profileId} />;
}

function ActiveTour({ tourId, profileId }: { tourId: SpotlightTourId; profileId: string }) {
  const theme = useTheme();
  const { t, calmMotion } = useAdaptiveMotion();
  const navigate = useNavigate();
  const tilt = useTilt({ calm: calmMotion, isDark: theme.isDark, maxX: 3, maxY: 2.5 });
  // Cum intră cardul: din adâncime la deschidere (0), apoi întors ușor ca o filă înainte (1) sau înapoi (-1).
  const [turn, setTurn] = useState<0 | 1 | -1>(0);
  const { pathname, search } = useLocation();
  const currentStep = useTutorialStore((state) => state.currentStep);
  const { nextStep, prevStep, finishTour } = useTutorialStore.getState();
  useOverlayFlag(true);

  const tour = TOURS[tourId];
  // Which steps apply is decided once, when the tour opens: a step that depended on "no key yet"
  // must not vanish from under the user the moment they save one.
  const [steps] = useState(() => {
    const initial = readTourContext(pathname, search);
    return tour.steps.filter((entry) => !entry.when || entry.when(initial));
  });
  const total = steps.length;
  const index = Math.min(currentStep, total - 1);
  const step = steps[index];
  const isLast = index === total - 1;
  const isFirst = index === 0;

  const ctx = useTourContext();
  const rect = useSpotlight(step?.target, step?.targetPadding ?? 8);
  const accent = step?.accent ?? theme.accent;
  const { mobile, crampedHeight } = useViewportProfile();
  const compact = mobile || crampedHeight;

  // The context as the current step was shown, so a "do it yourself" step can tell what changed since.
  const [atEntry, setAtEntry] = useState<TourContext>(ctx);
  const close = useCallback(() => finishTour(profileId), [finishTour, profileId]);
  // Which way the user was last moving, so an optional step that gets skipped does not trap "Înapoi".
  const directionRef = useRef<1 | -1>(1);
  const advance = useCallback(() => {
    directionRef.current = 1;
    setTurn(1);
    setAtEntry(ctx);
    if (index >= total - 1) close();
    else nextStep(total);
  }, [close, ctx, index, nextStep, total]);
  const back = useCallback(() => {
    directionRef.current = -1;
    setTurn(-1);
    setAtEntry(ctx);
    prevStep();
  }, [ctx, prevStep]);
  const cardRef = useRef<HTMLDivElement>(null);

  // Only a new step opens its destination. Router updates and manual navigation do not reopen it.
  const openStepRoute = useEffectEvent((route: string) => {
    if (!isTourRouteCurrent(route, pathname, search)) navigate(route);
  });
  useEffect(() => {
    if (step?.route) openStepRoute(step.route);
  }, [step?.id, step?.route]);

  // An optional step whose target never shows up is skipped (in the direction the user was going).
  useEffect(() => {
    if (!step?.optional || !step.target) return undefined;
    const selector = step.target;
    const timer = window.setTimeout(() => {
      if (document.querySelector(selector)) return;
      if (directionRef.current === -1 && index > 0) back();
      else advance();
    }, OPTIONAL_STEP_WAIT_MS);
    return () => window.clearTimeout(timer);
    // Only when the step changes: re-arming on every context change would delay the skip forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // "Do it yourself" steps move on a moment after the thing is done, so the check mark is seen.
  const isDone = !!step?.completeWhen && step.completeWhen(ctx, atEntry);
  useEffect(() => {
    if (!isDone) return undefined;
    const timer = window.setTimeout(advance, ACTION_DONE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [advance, isDone]);

  // ← / → move through the tour, Esc closes it. Not while typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      // Informational steps block the page: keyboard focus must stay in their dialog too.
      // Action steps keep the highlighted control reachable so the requested task can be done.
      if (event.key === 'Tab' && !step?.completeWhen) {
        const card = cardRef.current;
        if (!card) return;
        const items = Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
          .filter((item) => !item.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(item).display !== 'none' && getComputedStyle(item).visibility !== 'hidden');
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) { event.preventDefault(); card.focus(); return; }
        const inside = card.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || !inside || document.activeElement === card)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !inside || document.activeElement === card)) {
          event.preventDefault(); first.focus();
        }
        return;
      }
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Enter' && !target?.closest('button, a, [role="button"]')) { event.preventDefault(); advance(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); advance(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, back, close, step?.completeWhen]);

  // Focus moves into the card so the keyboard and screen readers follow the tour, and goes back afterwards.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => { if (previous && document.contains(previous)) previous.focus?.(); };
  }, []);
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [step?.id]);

  // Visible viewport (follows browser zoom, Windows scaling and pinch zoom).
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const read = () => {
      const vv = window.visualViewport;
      setViewport((prev) => {
        const w = Math.round(vv?.width ?? window.innerWidth);
        const h = Math.round(vv?.height ?? window.innerHeight);
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    read();
    window.addEventListener('resize', read);
    window.visualViewport?.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('resize', read);
    };
  }, []);

  // The card's unconstrained height (content + footer), so the placement knows how much room it needs.
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [naturalH, setNaturalH] = useState(320);
  useEffect(() => {
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!content || !footer || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setNaturalH(Math.ceil(content.offsetHeight + footer.offsetHeight + 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    ro.observe(footer);
    return () => ro.disconnect();
  }, [step?.id]);

  if (!step) return null;
  const body = resolveBody(step, ctx);

  // The card's side is picked from the space actually left around the target (see placement.ts);
  // the highlight is clipped to the screen so an oversized target never paints outside it.
  const layout = computeCardLayout({ target: rect, vw: viewport.w, vh: viewport.h, preferred: step.placement ?? 'right', cardHeight: naturalH });
  const placement = layout.placement;
  const hole = rect ? clipToViewport(rect, viewport.w, viewport.h) : null;
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed', left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight,
  };
  const actionStepDone = isDone;
  const Extra = step.Extra;
  // Primul și ultimul pas fără țintă primesc scena 3D generată din iconițele turului (nu și pe ecrane mici sau lângă un demo).
  const hero = !step.target && !Extra && !compact && (isFirst || isLast);
  const enter = calmMotion
    ? { opacity: 0 }
    : turn === 0
      ? { opacity: 0, z: -140, rotateX: 10 }
      : { opacity: 0.2, rotateY: turn * 16, x: turn * 24 };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10008] pointer-events-none">
        {/* Swallows clicks on the dark area; only the buttons and keys move the tour, so a stray click cannot end it. */}
        {/* A "do it yourself" step lets clicks through: the user has to press the very thing it points at. */}
        {!step.completeWhen && <div className="absolute inset-0 pointer-events-auto" style={{ cursor: 'default' }} />}

        <motion.svg
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: t.modal }}
          exit={{ opacity: 0, transition: t.modalExit }}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        >
          {hole ? (
            <>
              <defs>
                <mask id="tour-spotlight-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <motion.rect
                    initial={false}
                    animate={{ x: hole.left, y: hole.top, width: hole.width, height: hole.height }}
                    transition={t.panel}
                    rx="14" ry="14" fill="black"
                  />
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#tour-spotlight-mask)" />
            </>
          ) : (
            <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.62)" />
          )}
        </motion.svg>

        {hole && (
          <motion.div
            key="spot"
            initial={{ opacity: 0, scale: 0.985, top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            animate={{ opacity: 1, scale: 1, top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            transition={t.panel}
            className="absolute pointer-events-none"
            style={{
              borderRadius: 'var(--r-md)',
              zIndex: 2,
              border: `2px solid ${accent}90`,
              boxShadow: `0 0 0 1px ${accent}40`,
            }}
          >
            {/* Spotul alunecă de la o țintă la alta, cu o strălucire moale în culoarea pasului. */}
            <span
              aria-hidden="true"
              className="absolute -inset-3.5 rounded-[var(--r-xl)]"
              style={{ background: `radial-gradient(closest-side, ${accent}4d, transparent)`, filter: 'blur(6px)', opacity: 0.7 }}
            />
          </motion.div>
        )}

        {/* Positioning lives on this plain div and the enter/exit animation on the one inside it:
            Framer Motion owns `transform` on animated elements and would overwrite the centering. */}
        <div
          ref={cardRef}
          key={`tooltip-pos-${step.id}`}
          role="dialog"
          aria-modal={!step.completeWhen} data-tour-keyboard-layer
          aria-label={step.title}
          tabIndex={-1}
          style={{
            ...tooltipStyle,
            zIndex: 10009,
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
            perspective: 1200,
          }}
          onPointerMove={tilt.onPointerMove}
          onPointerLeave={tilt.onPointerLeave}
        >
          {/* Intrarea (din adâncime sau ca o filă) și înclinarea după mouse stau pe straturi separate: fiecare are transformarea ei. */}
          <motion.div
            key={`tooltip-${step.id}`}
            initial={enter}
            animate={{ opacity: 1, x: 0, z: 0, rotateX: 0, rotateY: 0, transition: t.modal }}
            exit={{ opacity: 0, transition: t.modalExit }}
            style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0, flex: '1 1 auto', transformStyle: 'preserve-3d' }}
          >
          <motion.div
            className="relative overflow-hidden"
            style={{
              rotateX: tilt.rotateX,
              rotateY: tilt.rotateY,
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              minHeight: 0,
              flex: '1 1 auto',
              background: 'var(--glass-panel-strong)',
              backdropFilter: 'blur(var(--blur-2)) saturate(150%)',
              WebkitBackdropFilter: 'blur(var(--blur-2)) saturate(150%)',
              border: `1px solid ${accent}35`,
              borderRadius: compact ? 'var(--r-lg)' : 'var(--r-xl)',
              boxShadow: 'var(--elev-4)',
            }}
          >
            <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: tilt.light, mixBlendMode: 'soft-light' }} />
            <TooltipArrow position={placement} />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" tabIndex={-1}>
            <div ref={contentRef} className={`${compact ? 'px-5 pt-5' : 'px-6 pt-6'} pb-2`}>
              <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <GlassIconStack icon={resized(step.icon, compact ? 16 : 20)} color={accent} size={compact ? 32 : 40} />
                  <span className="truncate text-[11px] font-semibold tracking-wide" style={{ color: theme.text3 }}>
                    {tour.title} · {index + 1} din {total}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Închide turul"
                  className="flex-shrink-0 rounded-full p-2 transition-colors hover:bg-[var(--hover-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  style={{ color: theme.text3 }}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mb-4">
                <ProgressBar percent={((index + 1) / total) * 100} color={accent} transition={t.page} label="Progres tur" />
              </div>

              {hero && (
                <TourHeroScene
                  center={isLast ? <Check size={22} /> : resized(step.icon, 22)}
                  orbit={steps.map((entry) => resized(entry.icon, 13))}
                  kind={isLast && !isFirst ? 'gather' : 'orbit'}
                  color={accent}
                />
              )}

              <h3 className={`${compact ? 'text-base' : 'text-[19px]'} mb-2 font-semibold leading-tight tracking-tight`} style={{ color: theme.text }}>
                {step.title}
              </h3>
              <p className={`${compact ? 'text-[12.5px]' : 'text-[13.5px]'} whitespace-pre-line leading-relaxed ${Extra || step.actionHint ? 'mb-3' : compact ? 'mb-4' : 'mb-5'}`} style={{ color: theme.text2 }}>
                {body}
              </p>

              {Extra && <div className="mb-4"><Extra ctx={ctx} advance={advance} /></div>}

              {step.completeWhen && (
                <p
                  role="status"
                  className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold"
                  style={{ color: actionStepDone ? theme.success : theme.text3 }}
                >
                  {actionStepDone ? <><Check size={14} /> Gata, merg mai departe</> : step.actionHint}
                </p>
              )}
            </div>
            </div>

            <div
              ref={footerRef}
              className={`${compact ? 'px-5 pb-4' : 'px-6 pb-5'} flex-shrink-0 pt-2`}
              style={{ borderTop: '1px solid var(--hairline, rgba(128,128,128,0.15))' }}
            >
              <div className="flex items-center gap-2">
                {!isFirst && (
                  <button
                    type="button"
                    onClick={back}
                    className="press-feedback flex items-center gap-1 rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium"
                    style={{ background: 'var(--fill-subtle)', color: theme.text2 }}
                  >
                    <ChevronLeft size={14} /> Înapoi
                  </button>
                )}
                <button
                  type="button"
                  onClick={advance}
                  className="press-feedback flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r-md)] py-2.5 text-[13.5px] font-semibold"
                  style={{ background: accent, color: onFillText(accent) }}
                >
                  {isLast
                    ? <><Check size={15} /> Gata</>
                    : step.completeWhen
                      ? 'Sari peste'
                      : <>{isFirst ? 'Hai să începem' : 'Continuă'} <ChevronRight size={15} /></>}
                </button>
              </div>

              {!isLast && (
                <button
                  type="button"
                  onClick={close}
                  className="mt-3 w-full text-center text-[12px] font-medium transition-opacity hover:opacity-80"
                  style={{ color: theme.text3 }}
                >
                  Închide turul
                </button>
              )}
            </div>
          </motion.div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
