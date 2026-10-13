import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { Theme } from '../../theme/themes';

/**
 * Synaptic Neural AI Orb: The AI's cognitive visual identity in StudyX.
 * Emits dynamic resonance ripples, synaptic pulse, and floating cognitive sparks
 * while "thinking" or generating answers, and rests serene otherwise.
 */
export default function AIOrb({
  theme,
  size = 28,
  active = false,
  calm = false,
}: {
  theme: Theme;
  size?: number;
  /** Emit the cognitive pulsing rings and synapse sparks (e.g. while thinking/streaming). */
  active?: boolean;
  /** Respect reduced-motion: skip the pulse animation. */
  calm?: boolean;
}) {
  const iconSize = Math.max(11, Math.round(size * 0.48));

  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Outer Resonance Ripple */}
      {active && !calm && (
        <motion.span
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${theme.accent} 0%, transparent 70%)`,
          }}
          animate={{ scale: [0.95, 1.4, 0.95], opacity: [0.35, 0.08, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Intermediate Synaptic Ring */}
      {active && !calm && (
        <motion.span
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            border: `1.5px solid ${theme.accent}`,
            opacity: 0.35,
          }}
          animate={{ scale: [1, 1.22, 1], opacity: [0.4, 0.12, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
        />
      )}

      {/* Orbiting Synapse Sparks (for medium & large orbs) */}
      {active && !calm && size >= 24 && (
        <>
          <motion.span
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 3.5,
              height: 3.5,
              marginLeft: -1.75,
              marginTop: -1.75,
              borderRadius: '50%',
              background: '#ec4899',
              boxShadow: 'var(--glow-1)',
            }}
            animate={{
              x: [0, (size / 2) + 2, 0, -((size / 2) + 2), 0],
              y: [-((size / 2) + 2), 0, (size / 2) + 2, 0, -((size / 2) + 2)],
              opacity: [0.4, 0.9, 0.4, 0.9, 0.4],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 3,
              height: 3,
              marginLeft: -1.5,
              marginTop: -1.5,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: 'var(--glow-1)',
            }}
            animate={{
              x: [(size / 2) + 2, 0, -((size / 2) + 2), 0, (size / 2) + 2],
              y: [0, (size / 2) + 2, 0, -((size / 2) + 2), 0],
              opacity: [0.8, 0.3, 0.8, 0.3, 0.8],
            }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
          />
        </>
      )}

      {/* Living Neural Core */}
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: active
            ? `linear-gradient(135deg, ${theme.accent}, #ec4899)`
            : theme.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: active ? 'var(--glow-2)' : 'var(--elev-1)',
        }}
        animate={
          active && !calm
            ? { scale: [1, 1.05, 1], filter: ['brightness(1)', 'brightness(1.15)', 'brightness(1)'] }
            : undefined
        }
        transition={
          active && !calm
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : undefined
        }
      >
        <Sparkles size={iconSize} color="#fff" />
      </motion.div>
    </div>
  );
}
