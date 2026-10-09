import { useId } from 'react';
import { motion } from 'framer-motion';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Open book + EKG pulse. Everything but the pulse line/dot is neutral
 * white/gray — the violet→cyan gradient (Glass theme's accent/accent2,
 * hardcoded rather than theme-read so the mark stays consistent regardless
 * of the active UI 1.0/2.0 theme) is reserved for the pulse alone, per the
 * approved concept. The pulse "draws" in a loop and its peak dot breathes;
 * both collapse to a static frame under reduced-motion/low-power.
 */
export default function Logo({ size = 40, className = '' }: LogoProps) {
  const { calmMotion } = useAdaptiveMotion();
  const gradientId = `logo-pulse-${useId()}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="112" y1="76" x2="152" y2="134" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0A84FF" />
          <stop offset="100%" stopColor="#5E5CE6" />
        </linearGradient>
      </defs>

      <rect width="200" height="200" rx="52" fill="#0F0F12" style={{ stroke: 'var(--hairline)', strokeWidth: 3 }} />

      {/* Pages */}
      <path d="M40,56 Q40,50 46,50 L94,54 L94,150 L46,154 Q40,154 40,148 Z" fill="white" />
      <path d="M106,54 L154,50 Q160,50 160,56 L160,148 Q160,154 154,154 L106,150 Z" fill="white" />
      <line x1="100" y1="50" x2="100" y2="154" stroke="white" strokeWidth="1.5" opacity="0.3" />

      {/* Text hint lines */}
      <line x1="52" y1="82" x2="84" y2="82" stroke="black" strokeWidth="2.5" strokeLinecap="round" opacity="0.1" />
      <line x1="52" y1="93" x2="84" y2="93" stroke="black" strokeWidth="2.5" strokeLinecap="round" opacity="0.1" />
      <line x1="52" y1="104" x2="72" y2="104" stroke="black" strokeWidth="2.5" strokeLinecap="round" opacity="0.1" />

      {/* Pulse line — the only colored element */}
      <motion.path
        d="M112,108 L122,108 L125,95 L128,76 L131,134 L135,108 L152,108"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        // Se desenează o singură dată; doar punctul de vârf mai pulsează, încet, și numai fără mișcare redusă.
        transition={calmMotion ? { duration: 0 } : { duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.circle
        cx="128"
        cy="76"
        r="5"
        fill={`url(#${gradientId})`}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        animate={calmMotion ? {} : { scale: [1, 1.35, 1], opacity: [0.85, 1, 0.85] }}
        transition={calmMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}
