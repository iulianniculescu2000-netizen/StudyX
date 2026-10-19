import { useEffect, type PointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type SpringOptions } from 'framer-motion';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { spring } from '../../theme/motion';
import { FilmTime } from '../film/useTimeline';
import { usePlayback } from '../film/usePlayback';
import { pointerTilt, sway, type WhatsNewScene } from './stage3d';

/** După ultimul cadru, scena rămâne puțin pe rezultat, apoi pornește din nou (ca micro-demo-urile). */
const LOOP_HOLD_MS = 2200;
const TILT_SPRING = spring.panel as SpringOptions;

/**
 * Scena 3D a unui slide din „Ce e nou”: o lume în perspectivă, legănată lent din ceasul filmului, înclinată discret după
 * mouse (resort `spring.panel`) și luminată de o pată moale care urmează înclinarea. Cu mișcare redusă arată cadrul final,
 * fix, fără înclinare. Scena e inertă; povestea e în text, iar pauza și reluarea sunt butoane reale.
 */
export default function WhatsNewStage({ scene }: { scene: WhatsNewScene }) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const clock = usePlayback(!calmMotion, scene.durationMs, undefined, 1000 / 30);
  const elapsedMs = calmMotion ? scene.durationMs : clock.elapsedMs;

  const finished = !calmMotion && clock.elapsedMs >= scene.durationMs;
  const { reset, paused } = clock;
  useEffect(() => {
    if (!finished || paused) return undefined;
    const timer = window.setTimeout(reset, LOOP_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [finished, paused, reset]);

  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const tiltX = useSpring(targetX, TILT_SPRING);
  const tiltY = useSpring(targetY, TILT_SPRING);
  const sheen = theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)';
  const light = useTransform([tiltX, tiltY], ([x, y]: number[]) =>
    `radial-gradient(60% 70% at ${50 + x * 6}% ${30 - y * 6}%, ${sheen}, transparent 70%)`);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (calmMotion) return;
    const box = event.currentTarget.getBoundingClientRect();
    const tilt = pointerTilt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    targetX.set(tilt.x);
    targetY.set(tilt.y);
  };
  const onPointerLeave = () => { targetX.set(0); targetY.set(0); };

  const drift = sway(clock.elapsedMs, calmMotion);
  const stage = Math.max(0, scene.marks.filter((mark) => elapsedMs >= mark).length - 1);
  const control = 'press-feedback focus-ring flex h-7 w-7 items-center justify-center rounded-full';
  const { Scene } = scene;

  return (
    <figure aria-label={scene.label} className="m-0 mx-auto w-full max-w-[440px]">
      <div onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} data-testid="whats-new-stage">
        <div
          inert
          aria-hidden="true"
          className="relative h-[236px] overflow-hidden rounded-[var(--r-xl)] border"
          style={{
            perspective: 900,
            perspectiveOrigin: '50% 40%',
            borderColor: theme.border,
            background: theme.isDark
              ? 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))'
              : 'linear-gradient(160deg, rgba(255,255,255,0.95), rgba(240,244,255,0.75))',
            boxShadow: 'var(--elev-1)',
          }}
        >
          <div
            className="pointer-events-none absolute -bottom-16 left-[10%] right-[10%] h-[120px] rounded-full"
            style={{ background: theme.accent, opacity: 0.12, filter: 'blur(40px)' }}
          />
          <motion.div className="absolute inset-0" style={{ rotateX: tiltY, rotateY: tiltX, transformStyle: 'preserve-3d' }}>
            <div
              className="absolute inset-0"
              style={{ transform: `rotateX(${drift.y}deg) rotateY(${drift.x}deg)`, transformStyle: 'preserve-3d' }}
            >
              <FilmTime.Provider value={{ elapsedMs, calm: calmMotion }}>
                <Scene />
              </FilmTime.Provider>
            </div>
          </motion.div>
          <motion.div className="pointer-events-none absolute inset-0" style={{ background: light, mixBlendMode: 'soft-light' }} />
        </div>
      </div>
      <p className="sr-only">{scene.transcript}</p>
      <figcaption className="mt-2 flex items-center gap-2 text-left">
        <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: theme.text3 }}>{scene.captions[stage] ?? ''}</span>
        {!calmMotion && (
          <>
            <button type="button" onClick={clock.toggle} aria-label={clock.paused ? 'Pornește animația' : 'Oprește animația'} className={control} style={{ color: theme.text2 }}>
              {clock.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            </button>
            <button type="button" onClick={clock.reset} aria-label="Reia animația" className={control} style={{ color: theme.text2 }}>
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}
