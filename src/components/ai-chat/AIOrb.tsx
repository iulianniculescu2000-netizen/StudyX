import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { Theme } from '../../theme/themes';

/**
 * The AI's visual identity: an accent-colored orb that emits a pulsing ring while
 * it's "thinking" (active) and sits calm otherwise. Used in the chat header and
 * as a small avatar beside each assistant reply.
 */
export default function AIOrb({
  theme,
  size = 28,
  active = false,
  calm = false,
}: {
  theme: Theme;
  size?: number;
  /** Emit the pulsing ring (e.g. while a response is streaming). */
  active?: boolean;
  /** Respect reduced-motion: skip the pulse animation. */
  calm?: boolean;
}) {
  const iconSize = Math.max(11, Math.round(size * 0.5));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} aria-hidden="true">
      {active && !calm && (
        <motion.span
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: theme.accent }}
          animate={{ scale: [1, 1.22, 1], opacity: [0.16, 0.05, 0.16] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: theme.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={iconSize} color="#fff" />
      </div>
    </div>
  );
}
