import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Play, X } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { useTutorialStore } from '../../store/tutorialStore';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOverlayFlag } from '../../hooks/useOverlayFlag';
import { useScrollLock } from '../../hooks/useScrollLock';
import { WELCOME_FILM_OPEN_EVENT } from './filmEvents';
import { FILM_SCENES } from './scenes';
import { STAGE } from './stage';

const SCENE_HEIGHT = 330;

const GLOW: Record<string, string> = {
  intro: STAGE.blue,
  quiz: STAGE.blue,
  cards: STAGE.violet,
  ai: STAGE.blue,
  plan: STAGE.green,
  exam: STAGE.amber,
  finish: STAGE.blue,
};

/**
 * Filmul de bun venit: șapte scene animate (~40 de secunde) care arată ce poate StudyX.
 * La prima pornire se deschide singur, înaintea turului de bun venit (turul așteaptă să se termine);
 * din Setări poate fi revăzut oricând. Se poate sări peste el cu Esc sau „Sari peste”.
 */
export default function WelcomeFilm() {
  const { calmMotion } = useAdaptiveMotion();
  const titleId = useId();
  const profileId = useUserStore((state) => state.activeProfileId);
  const hydrated = useTutorialStore((state) => state._hasHydrated);
  const onboardingRunning = useTutorialStore((state) => state.activeTour === 'onboarding');
  const seen = useTutorialStore((state) => state.seen);
  const [replay, setReplay] = useState(false);
  const [index, setIndex] = useState(0);
  // Scenele sunt desenate pentru ~330 px înălțime; în ferestre scunde se micșorează în loc să iasă din cadru.
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  const firstRun = hydrated && !!profileId && onboardingRunning && !seen[profileId]?.welcomeFilm;
  const open = firstRun || replay;
  useOverlayFlag(open);
  useScrollLock(open);

  useEffect(() => {
    const handler = () => { setIndex(0); setReplay(true); };
    window.addEventListener(WELCOME_FILM_OPEN_EVENT, handler);
    return () => window.removeEventListener(WELCOME_FILM_OPEN_EVENT, handler);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setFit(Math.min(1, Math.max(0.55, el.clientHeight / SCENE_HEIGHT)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const close = useCallback(() => {
    setReplay(false);
    // Marcat ca văzut și când e sărit: nu îl mai cerem la fiecare pornire a turului. Abia după evenimentul curent:
    // turul de bun venit apare imediat ce filmul e marcat, iar același Esc l-ar închide și pe el.
    if (profileId) window.setTimeout(() => useTutorialStore.getState().markSeen(profileId, 'welcomeFilm'), 0);
  }, [profileId]);

  const scene = FILM_SCENES[index];
  const isLast = index === FILM_SCENES.length - 1;

  // Trece singur la scena următoare; ultima rămâne pe ecran, cu butonul de început.
  useEffect(() => {
    if (!open || isLast) return undefined;
    const timer = window.setTimeout(() => setIndex((current) => Math.min(FILM_SCENES.length - 1, current + 1)), calmMotion ? scene.durationMs + 1500 : scene.durationMs);
    return () => window.clearTimeout(timer);
  }, [calmMotion, isLast, open, scene.durationMs, index]);

  const go = useCallback((delta: number) => {
    setIndex((current) => Math.min(FILM_SCENES.length - 1, Math.max(0, current + delta)));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, open]);

  const dialogRef = useFocusTrap(open, close);
  const glow = GLOW[scene.id] ?? STAGE.blue;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: calmMotion ? 0 : 0.35 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 10012, background: 'rgba(3,4,8,0.9)', backdropFilter: 'blur(18px) saturate(120%)' }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: calmMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex w-full max-w-[880px] flex-col overflow-hidden rounded-[28px] border"
            style={{
              background: STAGE.bg,
              borderColor: STAGE.line,
              boxShadow: 'var(--elev-4)',
              maxHeight: '96vh',
            }}
          >
            {/* lumina scenei */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -top-40 left-1/2 h-[380px] w-[620px] -translate-x-1/2 rounded-full"
              animate={{ background: glow, opacity: 0.22 }}
              transition={{ duration: 1.2 }}
              style={{ filter: 'blur(110px)' }}
            />

            <div className="relative z-10 flex items-center justify-between px-6 pt-5">
              <span className="text-[10.5px] font-black uppercase tracking-[0.22em]" style={{ color: STAGE.text3 }}>
                Film de bun venit
              </span>
              <button
                type="button"
                onClick={close}
                className="press-feedback focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold"
                style={{ borderColor: STAGE.line, color: STAGE.text2, background: STAGE.panel }}
              >
                {isLast ? 'Închide' : 'Sari peste'} <X size={12} />
              </button>
            </div>

            <div ref={stageRef} className="relative z-10 flex-shrink-0 px-6" style={{ height: 'clamp(230px, 46vh, 350px)' }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene.id}
                  className="h-full"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.015 }}
                  transition={{ duration: calmMotion ? 0 : 0.4 }}
                >
                  <div className="flex h-full items-center justify-center">
                    <div className="flex w-full items-center justify-center" style={{ height: SCENE_HEIGHT, transform: `scale(${fit})`, flexShrink: 0 }}><scene.Visual /></div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative z-10 px-8 pb-2 pt-4 text-center" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: calmMotion ? 0 : 0.4 }}
                  className="min-h-[104px]"
                >
                  <div className="text-[10.5px] font-black uppercase tracking-[0.22em]" style={{ color: glow }}>{scene.kicker}</div>
                  <h2 id={titleId} className="display mt-1.5 text-[1.6rem] font-extrabold leading-tight tracking-tight" style={{ color: STAGE.text }}>
                    {scene.title}
                  </h2>
                  <p className="mx-auto mt-2 max-w-[520px] text-[13.5px] font-medium leading-relaxed" style={{ color: STAGE.text2 }}>{scene.text}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative z-10 flex items-center gap-4 px-6 pb-5 pt-1">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                aria-label="Scena anterioară"
                className="press-feedback focus-ring flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-30"
                style={{ borderColor: STAGE.line, color: STAGE.text2, background: STAGE.panel }}
              >
                <ArrowLeft size={15} />
              </button>
              <div className="flex flex-1 items-center gap-1.5" role="group" aria-label="Scenele filmului">
                {FILM_SCENES.map((entry, i) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Scena ${i + 1}: ${entry.kicker}`}
                    aria-current={i === index ? 'step' : undefined}
                    className="group relative h-4 flex-1"
                  >
                    <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full" style={{ background: STAGE.line }}>
                      <motion.span
                        key={i === index ? `run-${index}` : `done-${i < index}`}
                        className="block h-full rounded-full"
                        style={{ background: i === index ? glow : STAGE.text2 }}
                        initial={{ width: i < index ? '100%' : '0%' }}
                        animate={{ width: i < index ? '100%' : i === index ? '100%' : '0%' }}
                        transition={{ duration: i === index && !isLast && !calmMotion ? scene.durationMs / 1000 : 0.2, ease: 'linear' }}
                      />
                    </span>
                  </button>
                ))}
              </div>
              {isLast ? (
                <button
                  type="button"
                  onClick={close}
                  className="press-feedback focus-ring flex h-9 items-center gap-2 rounded-full px-5 text-[12.5px] font-bold text-white"
                  style={{ background: STAGE.blue, boxShadow: 'var(--elev-2)' }}
                  data-autofocus
                >
                  {firstRun ? 'Începe turul' : 'Gata'} <Play size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Scena următoare"
                  className="press-feedback focus-ring flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ background: STAGE.blue }}
                >
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
