import type { FC } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

export type ProcessLoaderVariant = 'bio-orbit' | 'scanner' | 'vortex';
export type ProcessLoaderSize = 'sm' | 'md' | 'lg';

export interface ProcessLoaderProps {
  variant?: ProcessLoaderVariant;
  size?: ProcessLoaderSize;
  progress?: number;
  label?: string;
  sublabel?: string;
  inline?: boolean;
  className?: string;
}

export const ProcessLoader: FC<ProcessLoaderProps> = ({
  variant = 'bio-orbit',
  size = 'md',
  progress,
  label,
  sublabel,
  inline = false,
  className = '',
}) => {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();

  const dimensions = {
    sm: { box: 36, outerRing: 32, innerRing: 22, core: 10, icon: 12 },
    md: { box: 76, outerRing: 68, innerRing: 48, core: 18, icon: 16 },
    lg: { box: 110, outerRing: 100, innerRing: 70, core: 26, icon: 22 },
  }[size];

  const hasProgress = typeof progress === 'number' && !isNaN(progress);
  const clampedProgress = hasProgress ? Math.max(0, Math.min(100, Math.round(progress!))) : null;

  return (
    <div
      role="progressbar"
      aria-label={label ?? 'Se încarcă...'}
      aria-valuenow={clampedProgress ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`flex flex-col items-center justify-center text-center select-none ${
        inline ? 'inline-flex' : 'p-4'
      } ${className}`}
    >
      {/* ── VARIANT 1: BIO-ORBIT DNA (Signature Medical Mode) ── */}
      {variant === 'bio-orbit' && (
        <div
          className="relative flex items-center justify-center"
          style={{ width: dimensions.box, height: dimensions.box }}
        >
          {/* Ambient Glow */}
          {!calmMotion && (
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-30 animate-pulse pointer-events-none"
              style={{ background: theme.accent }}
            />
          )}

          {/* Outer Orbit Ring */}
          <motion.div
            className="absolute rounded-full border-2 border-transparent"
            style={{
              width: dimensions.outerRing,
              height: dimensions.outerRing,
              borderTopColor: theme.accent,
              borderRightColor: `${theme.accent}60`,
            }}
            animate={calmMotion ? undefined : { rotate: 360 }}
            transition={
              calmMotion
                ? undefined
                : { duration: 2.2, repeat: Infinity, ease: 'linear' }
            }
          />

          {/* Inner Counter-Orbit Ring */}
          <motion.div
            className="absolute rounded-full border-2 border-transparent"
            style={{
              width: dimensions.innerRing,
              height: dimensions.innerRing,
              borderBottomColor: theme.isDark ? '#38bdf8' : '#0284c7',
              borderLeftColor: theme.isDark ? '#a855f7' : '#9333ea',
            }}
            animate={calmMotion ? undefined : { rotate: -360 }}
            transition={
              calmMotion
                ? undefined
                : { duration: 3.2, repeat: Infinity, ease: 'linear' }
            }
          />

          {/* Kinetic Pulsing Core */}
          <motion.div
            className="rounded-full flex items-center justify-center shadow-lg"
            style={{
              width: dimensions.core,
              height: dimensions.core,
              background: `linear-gradient(135deg, ${theme.accent}, #38bdf8)`,
              boxShadow: `0 0 12px ${theme.accent}80`,
            }}
            animate={
              calmMotion
                ? undefined
                : { scale: [1, 1.25, 1], opacity: [0.85, 1, 0.85] }
            }
            transition={
              calmMotion
                ? undefined
                : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
            }
          />
        </div>
      )}

      {/* ── VARIANT 2: HOLOGRAPHIC SCANNER ── */}
      {variant === 'scanner' && (
        <div
          className="relative overflow-hidden rounded-xl border p-3 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-md"
          style={{
            width: size === 'sm' ? 120 : size === 'md' ? 180 : 240,
            borderColor: `${theme.accent}30`,
          }}
        >
          {/* Laser Sweep Bar */}
          {!calmMotion && (
            <motion.div
              className="absolute inset-x-0 h-[2px] shadow-md"
              style={{
                background: `linear-gradient(90deg, transparent, ${theme.accent}, #38bdf8, transparent)`,
                boxShadow: `0 0 10px ${theme.accent}`,
              }}
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          <div
            className="w-8 h-8 rounded-full border-2 border-dashed animate-spin flex items-center justify-center mb-1.5"
            style={{ borderColor: theme.accent, animationDuration: '3s' }}
          >
            <div className="w-3 h-3 rounded-full" style={{ background: theme.accent }} />
          </div>
        </div>
      )}

      {/* ── VARIANT 3: KINETIC VORTEX ── */}
      {variant === 'vortex' && (
        <div
          className="relative flex items-center justify-center"
          style={{ width: dimensions.box, height: dimensions.box }}
        >
          {[0, 1, 2].map((idx) => (
            <motion.span
              key={idx}
              className="absolute rounded-full shadow-md"
              style={{
                width: size === 'sm' ? 6 : 10,
                height: size === 'sm' ? 6 : 10,
                background: idx === 0 ? theme.accent : idx === 1 ? '#38bdf8' : '#a855f7',
                boxShadow: `0 0 8px ${theme.accent}`,
              }}
              animate={
                calmMotion
                  ? undefined
                  : {
                      rotate: 360,
                      scale: [0.8, 1.3, 0.8],
                    }
              }
              transition={
                calmMotion
                  ? undefined
                  : {
                      rotate: { duration: 1.8, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: idx * 0.4 },
                    }
              }
            />
          ))}
        </div>
      )}

      {/* ── ECG PULSE CARDIOGRAM BAR (Medical Signature, md and lg only) ── */}
      {variant === 'bio-orbit' && size !== 'sm' && !calmMotion && (
        <div className="w-28 h-1 bg-slate-800/60 rounded-full overflow-hidden relative my-2.5">
          <motion.div
            className="h-full w-1/2 absolute"
            style={{
              background: `linear-gradient(90deg, transparent, ${theme.accent}, #38bdf8, transparent)`,
            }}
            animate={{ left: ['-50%', '100%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* ── LABELS & PROGRESS BAR ── */}
      {(label || clampedProgress !== null) && (
        <div className="mt-2 flex flex-col items-center gap-1 max-w-xs">
          {label && (
            <p
              className={`font-bold tracking-tight ${
                size === 'sm' ? 'text-[11px]' : size === 'md' ? 'text-xs' : 'text-sm'
              }`}
              style={{ color: theme.text }}
            >
              {label}{' '}
              {clampedProgress !== null && (
                <span className="font-mono font-bold" style={{ color: theme.accentText }}>
                  {clampedProgress}%
                </span>
              )}
            </p>
          )}

          {sublabel && (
            <p className="text-[10px] font-medium opacity-70 truncate max-w-[220px]" style={{ color: theme.text2 }}>
              {sublabel}
            </p>
          )}

          {/* Quantified Progress Bar */}
          {clampedProgress !== null && (
            <div
              className="w-36 h-1.5 rounded-full overflow-hidden mt-1"
              style={{ background: `${theme.border}` }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${theme.accent}, #38bdf8)`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${clampedProgress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProcessLoader;
