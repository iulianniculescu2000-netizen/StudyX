import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { FilmTime } from '../film/useTimeline';
import { usePlayback } from '../film/usePlayback';
import { sway, useTilt } from '../depth/useTilt';

/** După ultimul cadru, demo-ul rămâne puțin pe rezultat, apoi pornește din nou. */
const LOOP_HOLD_MS = 2200;

export interface MicroDemoProps {
  /** Numele demo-ului, pentru cititoarele de ecran. */
  label: string;
  /** Tot ce se vede, spus în cuvinte: demo-ul în sine nu se citește (e inert). */
  transcript: string;
  durationMs: number;
  /** Momentele (ms) la care începe fiecare etapă; `captions[i]` se arată de la `marks[i]`. */
  marks: readonly number[];
  captions: readonly string[];
  height?: number;
  /** Cadrul se desenează din ceasul demo-ului (`useSceneTime`, `useCountTo`, `fraction`); fără cronometre proprii. */
  children: ReactNode;
}

/**
 * Micro-demo de câteva secunde, în buclă: același ceas și aceleași reguli ca filmul de bun venit (`usePlayback`, `FilmTime`).
 * Stă într-o scenă în perspectivă, ca „Ce e nou”: se leagănă lent din același ceas, se înclină discret după mouse și o lumină
 * fină urmează înclinarea. Cu mișcare redusă arată direct cadrul final, fix și drept. Conținutul e inert (nu primește focus și nu se poate apăsa), dar
 * există pauză și reluare, iar textul complet e în `transcript`.
 */
export default function MicroDemo({ label, transcript, durationMs, marks, captions, height = 156, children }: MicroDemoProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const clock = usePlayback(!calmMotion, durationMs, undefined, 1000 / 30);
  const elapsedMs = calmMotion ? durationMs : clock.elapsedMs;

  const finished = !calmMotion && clock.elapsedMs >= durationMs;
  const { reset, paused } = clock;
  useEffect(() => {
    if (!finished || paused) return undefined;
    const timer = window.setTimeout(reset, LOOP_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [finished, paused, reset]);

  const stage = Math.max(0, marks.filter((mark) => elapsedMs >= mark).length - 1);
  const caption = captions[stage] ?? '';
  const control = 'press-feedback focus-ring flex h-7 w-7 items-center justify-center rounded-full';
  const tilt = useTilt({ calm: calmMotion, isDark: theme.isDark, maxX: 4, maxY: 3 });
  const drift = sway(clock.elapsedMs, calmMotion, 0.5);

  return (
    <figure aria-label={label} className="m-0">
      <div onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave} style={{ perspective: 900 }}>
        <motion.div
          inert
          aria-hidden="true"
          className="relative overflow-hidden rounded-[var(--r-md)]"
          style={{
            height, background: theme.surface2, border: `1px solid ${theme.border}`, boxShadow: 'var(--elev-1)',
            rotateX: tilt.rotateX, rotateY: tilt.rotateY,
          }}
        >
          <div className="absolute inset-0" style={{ transform: `rotateX(${drift.y}deg) rotateY(${drift.x}deg)` }}>
            <FilmTime.Provider value={{ elapsedMs, calm: calmMotion }}>{children}</FilmTime.Provider>
          </div>
          <motion.div className="pointer-events-none absolute inset-0" style={{ background: tilt.light, mixBlendMode: 'soft-light' }} />
        </motion.div>
      </div>
      <p className="sr-only">{transcript}</p>
      <figcaption className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: theme.text3 }}>{caption}</span>
        {!calmMotion && (
          <>
            <button type="button" onClick={clock.toggle} aria-label={clock.paused ? 'Pornește demonstrația' : 'Oprește demonstrația'} className={control} style={{ color: theme.text2 }}>
              {clock.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            </button>
            <button type="button" onClick={clock.reset} aria-label="Reia demonstrația" className={control} style={{ color: theme.text2 }}>
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}
